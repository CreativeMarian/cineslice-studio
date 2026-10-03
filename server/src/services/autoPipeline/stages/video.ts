// 阶段9：视频批量生成（异步任务+轮询，支持并发）
import fs from 'fs';
import path from 'path';
import type { Database } from '../../../types';
import {
  NovelEpisodeDAO,
  ShotDAO,
  ShotKeyframeDAO,
  ShotVideoIntervalDAO,
  SubtitleDAO,
  ScriptCharacterDAO,
  ScriptSceneDAO,
} from '../../../models';
import { aiProxy } from '../../aiProxy';
import { downloadToFile } from '../../../utils/download';
import { projectStorage } from '../../projectStorage';
import { buildVideoPrompt, type VideoPromptInput } from '../../prompts/video';
import {
  resolveLastFrameForShot,
  collectShotReferenceImages,
  collectExpressionReferenceImages,
  imageToDataUrl,
} from '../../shotConsistencyService';
import type { AutoPipelineTask } from '../types';
import { getFirstModel, getProjectStyleDescription } from '../helpers';
import { saveTask } from '../taskStore';
import { assessVideoClip } from '../../videoQualityGate';
import { parseCharactersInShot } from '../../../models/shot';
import { projectMemoryService } from '../../projectMemoryService';
import { visualMemoryService } from '../../visualMemoryService';


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
  // P1-3: 首尾帧衔接强化 — 强制顺序生成（并发=1），确保前镜尾帧可作为后镜首帧参考
  // P1-3: 强制顺序生成（并发=1），保证前镜尾帧可作为后镜首帧参考
  // 如需提速可设置环境变量 VIDEO_CONCURRENCY，但会降低首尾帧衔接质量
  const concurrency = Math.min(baseConcurrency, 1);
  console.log(`[AutoPipeline] video 并发数: ${concurrency}（强制顺序生成保证首尾帧衔接，待生成${totalToGenerate}个）`);

  // 第二步：并发池生成视频
  let nextIndex = 0;
  const updateProgress = () => {
    task.stageProgress['video'] = `生成中 ${generated}/${totalToGenerate}（并发${concurrency}，失败${failed}）`;
    saveTask(db, task);
  };

  // 从项目风格描述获取统一风格（极简系统：一句话风格拼在提示词开头）
  const styleDescription = getProjectStyleDescription(db, task.projectId);

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

      // P1-6: 角色表情图参考（根据镜头情绪自动匹配，确保表情一致性）
      const expressionReferenceImages = collectExpressionReferenceImages(db, shot)
        .map(imageToDataUrl);

      // ═══════════════════════════════════════════════════════════════
      // P0-2: 视觉记忆库检索（历史关键帧自动作为参考）
      // 检索同角色/同场景的近期历史帧 + 前序镜头首帧，增强跨镜头一致性
      // ═══════════════════════════════════════════════════════════════
      let visualMemoryRefs: string[] = [];
      let visualMemoryContext = '';
      try {
        const memoryRefs = visualMemoryService.retrieveReferenceImages(
          db, task.projectId, first.id, shot
        );
        visualMemoryRefs = memoryRefs.allDataUrls;
        visualMemoryContext = memoryRefs.contextText;
        if (visualMemoryRefs.length > 0) {
          console.log(`[AutoPipeline] video shot=${shot.shot_number} 视觉记忆检索到 ${visualMemoryRefs.length} 张历史参考图`);
        }
      } catch (memErr) {
        console.warn(`[AutoPipeline] video shot=${shot.shot_number} 视觉记忆检索失败:`, (memErr as Error).message);
      }

      // 合并资产参考图 + 视觉记忆历史帧 + 角色表情图（去重）
      const allReferenceImages = [...new Set([...shotReferenceImages, ...visualMemoryRefs, ...expressionReferenceImages])];

      // ═══════════════════════════════════════════════════════════
      // 极简视频提示词（v3.0）：风格 + 动作 + 角色定妆 + 场景
      // 一致性主要靠参考图（collectShotReferenceImages/视觉记忆/表情图），不再做导演级/AI深度优化
      // ═══════════════════════════════════════════════════════════
      const promptInput: VideoPromptInput = {
        styleDescription: styleDescription || undefined,
        action: shot.action_description || '',
      };
      // 镜头角色定妆信息（buildVideoPrompt 的 characters 段）
      try {
        const charRefs = parseCharactersInShot(shot.characters_in_shot);
        const characters: Array<{ name: string; appearance: string }> = [];
        for (const ref of charRefs) {
          let c = ScriptCharacterDAO.getById(db, ref);
          if (!c) {
            const epChars = ScriptCharacterDAO.listByEpisode(db, shot.episode_id);
            c = epChars.find((x: any) => x.name === ref) || null;
          }
          if (c && (c.visual_description || c.description)) {
            characters.push({ name: c.name, appearance: (c.visual_description || c.description || '').slice(0, 120) });
          }
        }
        if (characters.length > 0) promptInput.characters = characters;
      } catch (charErr) {
        console.warn(`[AutoPipeline] video shot=${shot.shot_number} 角色信息解析失败:`, (charErr as Error).message);
      }
      // 场景描述（buildVideoPrompt 的 scene 段）
      try {
        if (shot.scene_id) {
          const sc = ScriptSceneDAO.getById(db, shot.scene_id);
          if (sc) {
            promptInput.scene = { name: sc.name, environment: (sc.description || sc.atmosphere || '').slice(0, 150) };
          }
        }
      } catch (sceneErr) {
        console.warn(`[AutoPipeline] video shot=${shot.shot_number} 场景信息解析失败:`, (sceneErr as Error).message);
      }
      let videoMotionPrompt = buildVideoPrompt(promptInput);
      console.log(`[AutoPipeline] video shot=${shot.shot_number} 提示词生成完成`);

      // ═══════════════════════════════════════════════════════════════
      // P0-1: 项目级长期记忆注入（角色圣经/世界观/剧情摘要）
      // 在视频生成前注入，确保视频画面符合全项目角色设定和世界观
      // ═══════════════════════════════════════════════════════════════
      const memoryInjection = projectMemoryService.buildMemoryInjection(db, task.projectId);
      if (memoryInjection.characterBible) {
        videoMotionPrompt = videoMotionPrompt + '\n\n【角色视觉一致性·强制锚点】\n' + memoryInjection.characterBible;
      }
      if (memoryInjection.worldSetting) {
        videoMotionPrompt = videoMotionPrompt + '\n\n【世界观一致性·强制参考】\n' + memoryInjection.worldSetting;
      }
      // P0-2: 视觉记忆上下文（历史帧参考说明）
      if (visualMemoryContext) {
        videoMotionPrompt = videoMotionPrompt + '\n\n【视觉记忆·历史帧参考】\n' + visualMemoryContext;
      }

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
            referenceImages: allReferenceImages.length > 0 ? allReferenceImages : undefined,
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

          // 轮询任务状态（默认最多 10 分钟，可用 VIDEO_MAX_WAIT_MS 调整）
          // v1.1：ComfyUI 本地渲染（MiniMaxH3 等）单镜 20-40 分钟且按队列顺序渲染，
          // 云端 10 分钟超时会把健康任务误判失败（shot1/2 反复超时的根因）——本地任务放宽到 24h 兜底
          const isLocalComfy = String(model.provider).includes('comfy');
          const maxWait = isLocalComfy
            ? 24 * 60 * 60 * 1000
            : (Number(process.env.VIDEO_MAX_WAIT_MS) || 600000);
          const interval = Number(process.env.VIDEO_POLL_INTERVAL_MS) || 5000;
          const startTime = Date.now();
          let completed = false;
          let pollErrors = 0;

          while (Date.now() - startTime < maxWait && !task.cancelled) {
            await new Promise(r => setTimeout(r, interval));
            try {
              const taskResult = await aiProxy.getVideoTask({
                db, userId: task.userId,
                provider: model.provider, modelName: model.modelName,
                taskId: result.taskId,
              });
              pollErrors = 0; // 单次成功即清零连续错误计数

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

                // ═══════════════════════════════════════════════════════
                // VLM 视频质量门（Story Claw/Continuum 方案）：
                // 抽首/中/尾帧 + 角色参考图，交给视觉模型打分；
                // 主体漂移/幻觉多脸/字幕残留 → 不合格，自动重渲染
                // （未配置视觉模型或调用失败时静默放行，不阻断生产）
                // ═══════════════════════════════════════════════════════
                try {
                  const quality = await assessVideoClip({
                    db,
                    userId: task.userId,
                    videoPath: localPath,
                    shot,
                  });
                  if (!quality.skipped && !quality.passed) {
                    lastError = `质量门未通过(score=${quality.score}): ${quality.issues.join('；') || '主体一致性/画面异常'}`;
                    ShotVideoIntervalDAO.updateStatus(db, videoInterval.id, 'failed', lastError);
                    console.warn(`[AutoPipeline] video shot=${shot.shot_number} ${lastError}，进入第${attempt + 1}次重试`);
                    completed = true; // 本轮结束，交给外层 attempt 循环重试
                    break;
                  }
                  if (!quality.skipped) {
                    // 质量门结果落库（quality_check 列）
                    ShotVideoIntervalDAO.update(db, videoInterval.id, {
                      quality_check: quality.passed ? 'passed' : 'failed',
                      quality_score: quality.score,
                      quality_issues: quality.issues.slice(0, 5).join('；'),
                    });
                    console.log(`[AutoPipeline] video shot=${shot.shot_number} 质量门通过 score=${quality.score}`);
                  }
                } catch (qErr) {
                  console.warn('[AutoPipeline] 质量门执行失败（跳过）:', (qErr as Error).message);
                }

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
              pollErrors++;
              console.error(`[AutoPipeline] video poll shot=${shot.id} error:`, pollErr.message);
              // 连续 6 次轮询失败（约 30 秒）视为查询链路故障，提前终止本轮尝试，避免本地 24h 超时白等
              if (pollErrors >= 6) {
                lastError = `轮询连续失败: ${pollErr.message}`;
                ShotVideoIntervalDAO.updateStatus(db, videoInterval.id, 'failed', lastError);
                console.warn(`[AutoPipeline] video shot=${shot.shot_number} 第${attempt}次轮询连续失败，终止本轮`);
                completed = true;
                break;
              }
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

  // ═══════════════════════════════════════════════════════════════
  // P0-1: 视频阶段完成后自动更新项目记忆
  // 更新剧情摘要、识别新伏笔、刷新角色圣经
  // ═══════════════════════════════════════════════════════════════
  try {
    console.log('[AutoPipeline] 视频阶段完成，开始更新项目记忆...');
    // 1. 为角色生成标准化视觉锚点
    await projectMemoryService.generateCharacterAnchors(db, task.userId, task.projectId, first.id);
    // 2. 更新剧情摘要
    await projectMemoryService.updateStorySummary(db, task.userId, task.projectId, first.id);
    // 3. 识别新伏笔
    const newForeshadows = await projectMemoryService.detectForeshadows(db, task.userId, task.projectId, first.id);
    // 4. 刷新角色圣经（跨剧集汇总）
    await projectMemoryService.generateCharacterBible(db, task.userId, task.projectId);
    // 5. 刷新世界观
    await projectMemoryService.generateWorldSetting(db, task.userId, task.projectId);
    console.log(`[AutoPipeline] 项目记忆更新完成：新伏笔 ${newForeshadows.length} 个`);
  } catch (memErr) {
    console.warn('[AutoPipeline] 项目记忆更新失败（不影响主流程）:', (memErr as Error).message);
  }

  // 字幕生成：从分镜 dialogue 提取字幕，计算时间轴，生成 SRT
  try {
    const allShots = ShotDAO.listByEpisode(db, first.id);
    const existingSubs = SubtitleDAO.listByEpisode(db, first.id);
    if (existingSubs.length === 0 && allShots.length > 0) {
      let currentTime = 0;
      let subtitleCount = 0;
      for (const shot of allShots) {
        const duration = shot.duration_seconds && shot.duration_seconds > 0 ? shot.duration_seconds : 3;
        if (shot.dialogue && shot.dialogue.trim()) {
          // 对话可能包含"角色名：台词"格式，提取说话人和台词
          let speaker: string | undefined;
          let text = shot.dialogue.trim();
          const match = text.match(/^([^：:]{1,20})[：:](.+)$/);
          if (match) {
            speaker = match[1].trim();
            text = match[2].trim();
          }
          SubtitleDAO.create(db, {
            user_id: task.userId,
            episode_id: first.id,
            shot_id: shot.id,
            start_time: currentTime,
            end_time: currentTime + duration,
            text,
            speaker,
          });
          subtitleCount++;
        }
        currentTime += duration;
      }

      // 生成 SRT 文件
      if (subtitleCount > 0) {
        const subs = SubtitleDAO.listByEpisode(db, first.id);
        const srtContent = SubtitleDAO.toSRT(subs);
        const saveDir = path.resolve(projectStorage.getDataDir(task.projectId), 'subtitles');
        projectStorage.ensureDir(saveDir);
        const srtPath = path.resolve(saveDir, `episode_${first.id}.srt`);
        fs.writeFileSync(srtPath, srtContent, 'utf8');
        console.log(`[AutoPipeline] 字幕生成完成: ${subtitleCount} 条，SRT 已保存`);
        task.stageProgress['video'] += `，字幕 ${subtitleCount} 条`;
      }
    }
  } catch (subErr: any) {
    console.error('[AutoPipeline] 字幕生成失败:', subErr.message);
  }
}
