// 阶段9：视频批量生成（异步任务+轮询，支持并发）
import fs from 'fs';
import path from 'path';
import type { Database } from '../../../types';
import {
  NovelEpisodeDAO,
  ShotDAO,
  ShotKeyframeDAO,
  ShotVideoIntervalDAO,
} from '../../../models';
import { aiProxy } from '../../aiProxy';
import { downloadToFile } from '../../../utils/download';
import { projectStorage } from '../../projectStorage';
import { directorPromptService } from '../../directorPromptService';
import { aiPromptOptimizerService, type ScriptContextForAI } from '../../aiPromptOptimizerService';
import {
  resolveLastFrameForShot,
  collectShotReferenceImages,
  imageToDataUrl,
} from '../../shotConsistencyService';
import type { ScriptAnalysisResult } from '../../scriptAnalysisService';
import type { AutoPipelineTask } from '../types';
import { getFirstModel, getOrCreateScriptAnalysis, getProjectStylePreset, buildDirectorShotContext } from '../helpers';
import { saveTask } from '../taskStore';

export async function stageVideo(db: Database, task: AutoPipelineTask): Promise<void> {
  const episodes = NovelEpisodeDAO.listByProject(db, task.projectId);
  const first = episodes[0];
  if (!first) throw new Error('无可用剧集');

  const shots = ShotDAO.listByEpisode(db, first.id);
  if (shots.length === 0) throw new Error('无可用分镜');

  const model = getFirstModel(db, task.userId, 'video');
  if (!model) throw new Error('请先配置视频模型');

  // 并发数：默认2个，可通过环境变量 VIDEO_CONCURRENCY 调整
  const baseConcurrency = Math.max(1, parseInt(process.env.VIDEO_CONCURRENCY || '2', 10));

  let generated = 0;
  let skipped = 0;
  let failed = 0;

  // 第一步：筛选需要生成的镜头
  const shotsToGenerate: typeof shots = [];
  for (const shot of shots) {
    // 检查是否已有完成的视频
    const intervals = ShotVideoIntervalDAO.listByShot(db, shot.id);
    const hasCompleted = intervals.some(v => v.status === 'completed' && v.video_url);
    if (hasCompleted) {
      skipped++;
      continue;
    }
    // 检查是否有关键帧
    const keyframes = ShotKeyframeDAO.listByShot(db, shot.id);
    const firstFrame = keyframes.find(k => k.frame_type === 'first') || keyframes[0];
    if (!firstFrame || !firstFrame.image_url) {
      failed++;
      console.error(`[AutoPipeline] video shot=${shot.id} no keyframe, skip`);
      continue;
    }
    shotsToGenerate.push(shot);
  }

  const totalToGenerate = shotsToGenerate.length;
  if (totalToGenerate === 0) {
    task.stageProgress['video'] = `跳过 ${skipped} 个，无需生成`;
    return;
  }

  // 动态调整并发数：根据待生成数量调整，最大3个避免 API 限流
  const dynamicConcurrency = totalToGenerate < 5 ? 1 : totalToGenerate < 20 ? 2 : 3;
  const concurrency = Math.min(Math.max(baseConcurrency, dynamicConcurrency), 3);
  console.log(`[AutoPipeline] video 并发数: ${concurrency}（待生成${totalToGenerate}个，基础${baseConcurrency}，动态${dynamicConcurrency}）`);

  // 第二步：并发池生成视频
  let nextIndex = 0;
  const updateProgress = () => {
    task.stageProgress['video'] = `生成中 ${generated}/${totalToGenerate}（并发${concurrency}，失败${failed}）`;
    saveTask(db, task);
  };

  // 从项目风格预设获取统一风格（保证全片画风一致）
  const stylePreset = getProjectStylePreset(db, task.projectId);
  console.log(`[AutoPipeline] video 使用风格预设: ${stylePreset.presetName}`);

  // 剧本分析（在视频生成之前分析剧情、场景、角色、情绪，用于提示词优化）
  const episodesForAnalysis = NovelEpisodeDAO.listByProject(db, task.projectId);
  const firstEpisodeForAnalysis = episodesForAnalysis[0];
  let scriptAnalysis: ScriptAnalysisResult | null = null;
  if (firstEpisodeForAnalysis) {
    scriptAnalysis = await getOrCreateScriptAnalysis(db, task.projectId, task.userId, firstEpisodeForAnalysis.id);
    if (scriptAnalysis) {
      console.log(`[AutoPipeline] video 使用剧本分析结果优化提示词`);
    }
  }

  // 构建 AI 深度优化用的剧本上下文（包含整个剧本的剧情、角色、场景、情绪曲线）
  const scriptContextForAI: ScriptContextForAI = scriptAnalysis
    ? aiPromptOptimizerService.buildScriptContextFromAnalysis(scriptAnalysis)
    : { characters: [], scenes: [] };

  const processShot = async (shot: typeof shots[0]): Promise<void> => {
    if (task.cancelled) return;

    const keyframes = ShotKeyframeDAO.listByShot(db, shot.id);
    const firstFrame = keyframes.find(k => k.frame_type === 'first') || keyframes[0];
    if (!firstFrame || !firstFrame.image_url) {
      failed++;
      updateProgress();
      return;
    }

    try {
      // 首帧转 base64
      let firstFrameImageForApi = firstFrame.image_url;
      if (firstFrame.image_url.startsWith('/')) {
        const localPath = projectStorage.toLocalPath(firstFrame.image_url);
        if (fs.existsSync(localPath)) {
          const imageBuffer = fs.readFileSync(localPath);
          const ext = path.extname(localPath).slice(1) || 'png';
          const mimeType = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
          firstFrameImageForApi = `data:${mimeType};base64,${imageBuffer.toString('base64')}`;
        }
      }

      // ═══════════════════════════════════════════════════════════
      // 首尾帧衔接（低抽卡核心）：下一镜首帧作尾帧（VideoClaw 方案）
      // 尾帧硬锁定 → 视频模型只做中间插值，起止落点可控，镜头间不连戏问题缓解
      // ═══════════════════════════════════════════════════════════
      let lastFrameImageForApi: string | undefined;
      let resolvedEndFrameId: string | null = null;
      try {
        const lastFrame = resolveLastFrameForShot(db, shot, shots);
        if (lastFrame) {
          lastFrameImageForApi = imageToDataUrl(lastFrame.imageUrl);
          resolvedEndFrameId = lastFrame.keyframeId;
        }
      } catch { /* 尾帧解析失败，退化为单首帧生成 */ }

      // 一致性参考图（角色定妆照/场景/道具），注入视频生成防漂移
      const shotReferenceImages = collectShotReferenceImages(db, shot)
        .map(imageToDataUrl);

      // ═══════════════════════════════════════════════════════════
      // 导演级提示词生成（v2.0）
      // 包含：时序控制、动作分解、表情细节、心理活动、环境交互、连贯性、真实性校验
      // 解决：打电话点屏幕、无厘头耳光、角色突然消失、剧情不连贯等问题
      // ═══════════════════════════════════════════════════════════
      const directorContext = buildDirectorShotContext(
        db,
        shot,
        shots,
        first.id,
        shots.length
      );

      const directorResult = directorPromptService.generateVideoPrompt(
        directorContext,
        scriptAnalysis || undefined
      );

      // ═══════════════════════════════════════════════════════════
      // AI 深度优化（让 AI 关联剧本上下文，深度分析后生成优化提示词）
      // 这是核心优化：不是模板化，而是真正的 AI 理解和分析
      // ═══════════════════════════════════════════════════════════
      let finalPrompt = directorResult.prompt;
      let finalNegativePrompt = directorResult.negativePrompt;

      try {
        const aiOptimized = await aiPromptOptimizerService.optimizeVideoPrompt(
          db,
          task.userId,
          directorContext,
          scriptContextForAI
        );
        if (aiOptimized.prompt && aiOptimized.prompt.length > 50) {
          finalPrompt = aiOptimized.prompt;
          finalNegativePrompt = aiOptimized.negativePrompt || directorResult.negativePrompt;
          console.log(`[AutoPipeline] video shot=${shot.shot_number} AI深度优化成功: ${aiOptimized.actionBreakdown.length}个动作分解`);
        }
      } catch (aiErr) {
        console.warn(`[AutoPipeline] video shot=${shot.shot_number} AI深度优化失败，使用导演级提示词:`, (aiErr as Error).message);
      }

      // 合并正面提示词和负面提示词（视频模型通常不支持独立的负面提示词参数）
      const videoMotionPrompt = `${finalPrompt}\n\n【负面提示词·绝对避免】${finalNegativePrompt}`;

      console.log(`[AutoPipeline] video shot=${shot.shot_number} 提示词生成完成`);

      // ═══════════════════════════════════════════════════════════
      // 视频生成自动重试机制：最多重试2次（总共3次尝试），指数退避
      // 解决：API临时故障、网络波动、模型限流等导致的偶发失败
      // ═══════════════════════════════════════════════════════════
      const MAX_ATTEMPTS = 3;
      let shotSuccess = false;
      let lastError = '';

      for (let attempt = 1; attempt <= MAX_ATTEMPTS && !shotSuccess && !task.cancelled; attempt++) {
        if (attempt > 1) {
          // 指数退避：第2次等待3秒，第3次等待6秒
          const waitTime = 3000 * Math.pow(2, attempt - 2);
          console.log(`[AutoPipeline] video shot=${shot.shot_number} 第${attempt}次重试，等待${waitTime}ms...`);
          await new Promise(r => setTimeout(r, waitTime));
        }

        // 提升作用域：catch 中需要把该行标记为 failed
        let videoIntervalId: string | null = null;
        try {
          // 创建视频片段记录（每次重试创建新记录）
          const videoInterval = ShotVideoIntervalDAO.create(db, {
            user_id: task.userId,
            shot_id: shot.id,
            start_frame_id: firstFrame.id,
            end_frame_id: resolvedEndFrameId || undefined,
            duration_seconds: shot.duration_seconds || 5,
            motion_prompt: videoMotionPrompt,
            video_model_used: `${model.provider}/${model.modelName}`,
          });

          // 调用 AI 生成视频（返回异步任务 ID）
          const result = await aiProxy.generateVideo({
            db, userId: task.userId, projectId: task.projectId,
            provider: model.provider, modelName: model.modelName,
            firstFrameImageUrl: firstFrameImageForApi,
            lastFrameImageUrl: lastFrameImageForApi,
            referenceImages: shotReferenceImages.length > 0 ? shotReferenceImages : undefined,
            motion: videoMotionPrompt,
            duration: shot.duration_seconds || 5,
            ratio: '16:9',
            resolution: '1080p',
          });

          videoIntervalId = videoInterval.id;
          ShotVideoIntervalDAO.update(db, videoInterval.id, {
            external_task_id: result.taskId,
            status: 'processing',
          });

          // 轮询任务状态（最多 10 分钟）
          const maxWait = 600000;
          const interval = 5000;
          const startTime = Date.now();
          let completed = false;

          while (Date.now() - startTime < maxWait && !task.cancelled) {
            await new Promise(r => setTimeout(r, interval));
            try {
              const taskResult = await aiProxy.getVideoTask({
                db, userId: task.userId,
                provider: model.provider, modelName: model.modelName,
                taskId: result.taskId,
              });

              if (taskResult.status === 'completed' && taskResult.videoUrl) {
                // 下载视频到本地
                const saveDir = path.resolve(projectStorage.getDataDir(task.projectId), 'videos');
                projectStorage.ensureDir(saveDir);
                const fileName = `video_shot_${shot.shot_number}_${Date.now()}.mp4`;
                const localPath = path.resolve(saveDir, fileName);
                // 流式下载：带超时与状态校验，避免把错误响应体当视频落盘
                await downloadToFile(taskResult.videoUrl, localPath, { timeoutMs: 180_000 });
                const localUrl = projectStorage.toUrlPath(localPath);

                ShotVideoIntervalDAO.update(db, videoInterval.id, {
                  status: 'completed',
                  video_url: localUrl,
                  completed_at: new Date().toISOString(),
                });
                generated++;
                completed = true;
                shotSuccess = true;
                updateProgress();
                console.log(`[AutoPipeline] video shot=${shot.shot_number} 生成成功（第${attempt}次尝试）`);
                break;
              } else if (taskResult.status === 'failed') {
                lastError = taskResult.error || '视频生成失败';
                ShotVideoIntervalDAO.updateStatus(db, videoInterval.id, 'failed', lastError);
                console.warn(`[AutoPipeline] video shot=${shot.shot_number} 第${attempt}次失败: ${lastError}`);
                break;
              }
            } catch (pollErr: any) {
              console.error(`[AutoPipeline] video poll shot=${shot.id} error:`, pollErr.message);
            }
          }

          if (!completed && !task.cancelled) {
            lastError = '生成超时';
            ShotVideoIntervalDAO.updateStatus(db, videoInterval.id, 'failed', lastError);
            console.warn(`[AutoPipeline] video shot=${shot.shot_number} 第${attempt}次超时`);
          }
        } catch (err: any) {
          lastError = err.message || '未知错误';
          // 尝试失败时同步把 interval 行标记为 failed，避免残留 pending/processing 孤儿行
          if (videoIntervalId) {
            try {
              ShotVideoIntervalDAO.updateStatus(db, videoIntervalId, 'failed', lastError);
            } catch { /* 状态更新失败不影响主流程 */ }
          }
          console.error(`[AutoPipeline] video shot=${shot.id} 第${attempt}次失败:`, err.message);
        }
      }

      if (!shotSuccess && !task.cancelled) {
        failed++;
        updateProgress();
        console.error(`[AutoPipeline] video shot=${shot.shot_number} 全部${MAX_ATTEMPTS}次尝试失败: ${lastError}`);
      }
    } catch (err: any) {
      console.error(`[AutoPipeline] video shot=${shot.id} process error:`, err.message);
      if (!task.cancelled) {
        failed++;
        updateProgress();
      }
    }
  };

  // 并发池：启动 concurrency 个 worker
  const workers = Array.from({ length: Math.min(concurrency, totalToGenerate) }, async () => {
    while (nextIndex < totalToGenerate && !task.cancelled) {
      const idx = nextIndex++;
      await processShot(shotsToGenerate[idx]);
    }
  });

  await Promise.all(workers);

  if (generated === 0 && skipped === 0) {
    throw new Error('视频生成全部失败');
  }
  task.stageProgress['video'] = `生成 ${generated} 个，跳过 ${skipped} 个，失败 ${failed} 个`;
}
