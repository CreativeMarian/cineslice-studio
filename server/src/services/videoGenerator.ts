// 视频生成服务（P3-9 拆分自 episodeProductionService.ts）
// 视频生成/状态查询/批量视频/字幕 相关逻辑
// 由 episodeProductionService.ts 作为 index 统一重新导出

import fs from 'fs';
import path from 'path';
import {
  NovelEpisodeDAO,
  ShotDAO,
  ShotKeyframeDAO,
  ShotVideoIntervalDAO,
  ScriptCharacterDAO,
  ScriptSceneDAO,
  ProjectDAO,
} from '../models';
import { createError } from '../middleware/errorHandler';
import { ErrorCodes } from '../errors';
import { COMFY_LOCAL_VIDEO_TASK_TIMEOUT_MS, VIDEO_TASK_TIMEOUT_MS } from '../constants';
import { aiProxy } from './aiProxy';
import { buildVideoPrompt, type VideoPromptInput } from './prompts/video';
import { projectStorage } from './projectStorage';
import { downloadToFile } from '../utils/download';
import {
  parseShotCharacterIds,
  resolveLastFrameForShot,
  resolvePreviousShotTailFrame,
  resolvePreviousShotVideoUrl,
  collectShotReferenceImages,
} from './shotConsistencyService';
import { parseSpeaker, stripSpeakerPrefix } from './voiceAssignment';
import { buildFullVideoPrompt } from './promptBuilder';
import { assessVideoClip } from './videoQualityGate';
import type { Database, ScriptCharacter, ScriptScene, Shot } from '../types';

// ============ 共享工具 ============

/** 解析项目风格描述（极简系统：用户一句话存在 project.style_description，无则返回 null） */
function resolveStyleDescription(db: Database, projectId: string | undefined): string | null {
  try {
    if (projectId) {
      const project = ProjectDAO.getById(db, projectId);
      if (project?.style_description && project.style_description.trim()) {
        return project.style_description.trim();
      }
    }
  } catch {
    // 获取风格描述失败，返回 null
  }
  return null;
}

/** 将本地相对路径图片转换为 base64 data URL（视频模型 API 需要可访问的图片） */
function imageToDataUrl(imageUrl: string): string {
  try {
    if (imageUrl.startsWith('/')) {
      const localPath = projectStorage.toLocalPath(imageUrl);
      if (fs.existsSync(localPath)) {
        const imageBuffer = fs.readFileSync(localPath);
        const ext = path.extname(localPath).slice(1) || 'png';
        const mimeType = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
        return `data:${mimeType};base64,${imageBuffer.toString('base64')}`;
      }
    }
  } catch (err) {
    console.error('[EpisodeService] failed to convert image to base64:', err);
  }
  return imageUrl;
}

/** 获取镜头的首帧关键帧（指定 keyframeId 或自动取第一个首帧） */
function resolveFirstFrame(db: Database, userId: string, shotId: string, keyframeId?: string, allowNoKeyframe?: boolean): {
  firstFrameUrl: string;
  startFrameId: string;
} {
  if (keyframeId) {
    const kf = ShotKeyframeDAO.getByIdAndUser(db, keyframeId, userId);
    if (!kf) throw createError(404, ErrorCodes.NOT_FOUND, '关键帧不存在');
    if (kf.image_url) {
      return { firstFrameUrl: kf.image_url, startFrameId: kf.id };
    }
  } else {
    const keyframes = ShotKeyframeDAO.listByShot(db, shotId);
    const firstFrame = keyframes.find(k => k.frame_type === 'first') || keyframes[0];
    if (firstFrame?.image_url) {
      return { firstFrameUrl: firstFrame.image_url, startFrameId: firstFrame.id };
    }
  }
  if (allowNoKeyframe) return { firstFrameUrl: '', startFrameId: '' };
  throw createError(400, ErrorCodes.NO_KEYFRAME, '请先生成首帧关键帧，再生成视频');
}

// ============ 视频生成 ============

/** 镜头运动英文枚举 → 中文标签（buildVideoPrompt 的 cameraMovement 段，生成自然中文提示词） */
const CAMERA_MOVEMENT_LABEL: Record<string, string> = {
  static: '固定', push_in: '缓慢推近', pull_out: '缓慢拉远', pan: '水平摇移', tilt: '垂直摇移',
  truck: '横向移动', crane: '升降运镜', handheld: '手持跟拍', zoom: '变焦', dolly: '推拉运镜',
  steadicam: '稳定器跟拍', long: '固定', full: '固定',
};

/** 极简视频提示词构建：风格描述 + 动作 + 角色定妆 + 场景（一致性主要靠参考图） */
function buildMinimalVideoPrompt(db: Database, shot: any, styleDescription: string | null): string {
  const characters: Array<{ name: string; appearance: string }> = [];
  try {
    const charRefs = parseShotCharacterIds(shot);
    for (const ref of charRefs) {
      let c = ScriptCharacterDAO.getById(db, ref);
      if (!c) {
        const epChars = ScriptCharacterDAO.listByEpisode(db, shot.episode_id);
        c = epChars.find((x: any) => x.name === ref) || null;
      }
      if (c && (c.visual_prompt || c.visual_description || c.description)) {
        const appearance = (c.visual_prompt || c.visual_description || c.description || '').slice(0, 120);
        characters.push({ name: c.name, appearance });
      }
    }
  } catch (err) {
    console.warn('[Video] 角色信息解析失败:', (err as Error).message);
  }

  let scene: { name: string; environment: string } | undefined;
  try {
    if (shot.scene_id) {
      const sc = ScriptSceneDAO.getById(db, shot.scene_id);
      if (sc) {
        const environment = (sc.visual_prompt || sc.description || sc.atmosphere || '').slice(0, 150);
        scene = { name: sc.name, environment };
      }
    }
  } catch (err) {
    console.warn('[Video] 场景信息解析失败:', (err as Error).message);
  }

  const input: VideoPromptInput = {
    styleDescription: styleDescription || undefined,
    action: shot.action_description || '',
    characters: characters.length > 0 ? characters : undefined,
    scene,
    // shuohao novel-storyboard：注入镜头情绪基调与运镜（英文枚举转中文标签）
    mood: shot.mood || undefined,
    cameraMovement: shot.camera_movement ? (CAMERA_MOVEMENT_LABEL[shot.camera_movement] || shot.camera_movement) : undefined,
  };
  return buildVideoPrompt(input);
}

/**
 * P0-1: 使用 promptBuilder 构建视频提示词（身份锁 + 场景块 + 动作 + 禁令行，≤300字）
 * 失败或旧数据（无 project/角色）时回退到 buildMinimalVideoPrompt 原有逻辑
 */
function buildPromptBuilderVideoPrompt(db: Database, shot: any): string {
  try {
    const episode = NovelEpisodeDAO.getById(db, shot.episode_id);
    const project = episode ? (ProjectDAO.getById(db, episode.project_id) || null) : null;
    const characters: ScriptCharacter[] = [];
    const charRefs = parseShotCharacterIds(shot);
    for (const ref of charRefs) {
      let c = ScriptCharacterDAO.getById(db, ref);
      if (!c) {
        c = ScriptCharacterDAO.listByEpisode(db, shot.episode_id).find((x: any) => x.name === ref) || null;
      }
      if (c) characters.push(c);
    }
    let scene: ScriptScene | null = null;
    if (shot.scene_id) {
      const sc = ScriptSceneDAO.getById(db, shot.scene_id);
      if (sc) scene = sc;
    }
    const prompt = buildFullVideoPrompt(shot as Shot, characters, scene, project);
    if (prompt && prompt.trim()) return prompt;
  } catch (err) {
    console.warn('[Video] promptBuilder 构建失败，回退旧逻辑:', (err as Error).message);
  }
  // 回退：旧逻辑（风格 + 动作 + 角色 + 场景）
  let styleDescription: string | null = null;
  try {
    const episode = NovelEpisodeDAO.getById(db, shot.episode_id);
    styleDescription = resolveStyleDescription(db, episode?.project_id);
  } catch { /* 忽略 */ }
  return buildMinimalVideoPrompt(db, shot, styleDescription);
}

/**
 * 生成单个镜头的视频（异步任务，返回处理中的记录）。
 * @param db 数据库实例
 * @param userId 当前用户 ID（校验镜头归属）
 * @param shotId 镜头 ID
 * @param opts 生成选项（provider/modelName 必填；首尾帧/参考图/时长/比例等可选）
 * @returns 处理中的视频记录（含 external_task_id）
 * @sideEffects 创建 shot_video_intervals 记录，调用视频模型提交异步任务；失败时标记 failed
 */
export async function generateVideoForShot(
  db: Database,
  userId: string,
  shotId: string,
  opts: {
    provider: string;
    modelName: string;
    keyframeId?: string;
    motionPrompt?: string;
    duration?: number;
    ratio?: '16:9' | '9:16' | '1:1' | '4:3' | '3:4' | '21:9';
    resolution?: '720p' | '1080p' | '2k' | '4k';
    subtitles?: boolean;
    endFrameId?: string;       // 显式指定尾帧关键帧
    firstFrameImageUrl?: string; // 显式覆盖首帧（上一镜尾帧继承等）
    referenceImages?: string[]; // 一致性参考图（角色/场景/道具），未传则自动收集
    customPrompt?: string;     // 自定义视频提示词：undefined=未传（回退已存 custom_video_prompt），''=清空并自动构建
  }
) {
  const shot = ShotDAO.getByIdAndUser(db, shotId, userId);
  if (!shot) throw createError(404, ErrorCodes.NOT_FOUND, '镜头不存在');

  // P3: 自定义提示词解析（优先级：本次传入 > 已保存 custom_video_prompt > 自动构建）
  // 显式传入时落库（'' = 清除），供预览接口与下次生成默认使用
  let finalCustomPrompt: string | null = null;
  if (opts.customPrompt !== undefined) {
    finalCustomPrompt = opts.customPrompt.trim() ? opts.customPrompt.trim() : null;
    ShotDAO.update(db, shot.id, { custom_video_prompt: finalCustomPrompt });
  } else if (shot.custom_video_prompt && shot.custom_video_prompt.trim()) {
    finalCustomPrompt = shot.custom_video_prompt.trim();
  }
  if (finalCustomPrompt) {
    console.log(`[Video] 使用自定义视频提示词（custom_video_prompt），长度=${finalCustomPrompt.length}`);
  }

  // P1-14: 入口检查——该镜头已有 processing 状态的视频任务时不重复创建（返回现有任务，避免并发重复提交）
  const existingIntervals = ShotVideoIntervalDAO.listByShot(db, shot.id);
  const inFlight = existingIntervals.find(v => v.status === 'processing');
  if (inFlight) {
    console.log(`[Video] shot=${shot.id} 已有处理中的视频任务 ${inFlight.id}，返回现有任务（不重复创建）`);
    return inFlight;
  }

  const { provider, modelName, keyframeId, motionPrompt, duration, ratio, resolution, subtitles, endFrameId, referenceImages, firstFrameImageUrl: explicitFirstFrame } = opts;

  // 获取剧集信息（用于提示词优化和项目ID）
  const episode = NovelEpisodeDAO.getById(db, shot.episode_id);

  // 获取首帧
  const { firstFrameUrl, startFrameId } = resolveFirstFrame(db, userId, shot.id, keyframeId, provider === 'comfyui');

  // ═══════════════════════════════════════════════════════════
  // 首尾帧衔接（低抽卡核心）：显式尾帧 > 下一镜首帧（use_next_first_frame=1）
  // 尾帧硬锁定 → 视频模型只做中间插值，起止落点完全可控
  // ═══════════════════════════════════════════════════════════
  let lastFrameImageUrl: string | undefined;
  let resolvedEndFrameId: string | null = null;
  try {
    if (endFrameId) {
      const kf = ShotKeyframeDAO.getById(db, endFrameId);
      if (kf?.image_url) {
        lastFrameImageUrl = imageToDataUrl(kf.image_url);
        resolvedEndFrameId = kf.id;
      }
    } else {
      const allShots = ShotDAO.listByEpisode(db, shot.episode_id);
      const lastFrame = resolveLastFrameForShot(db, shot, allShots);
      if (lastFrame) {
        lastFrameImageUrl = imageToDataUrl(lastFrame.imageUrl);
        resolvedEndFrameId = lastFrame.keyframeId;
      }
    }
  } catch (err) {
    console.warn('[Video] 尾帧解析失败，退化为单首帧生成:', (err as Error).message);
  }

  // 一致性参考图（未显式传入时自动收集角色/场景/道具图）
  let shotReferenceImages = referenceImages && referenceImages.length > 0
    ? referenceImages
    : collectShotReferenceImages(db, shot);

  // 首帧来源：显式覆盖 > 上一镜尾帧继承 > 关键帧
  // 首尾帧模式（flf2v）下禁用"上一镜尾帧继承"：本镜 first/last 均由资产管线按分镜起止画面生成，
  // 首帧直接用本镜 first 关键帧，避免继承上一镜视频尾帧（可能携带旧方案场景漂移）
  const isFlf2vMode = String(modelName).includes('flf2v');
  let inheritedFirstFrameUrl: string | null = null;
  if (!explicitFirstFrame && !isFlf2vMode) {
    inheritedFirstFrameUrl = resolvePreviousShotTailFrame(db, shot);
  }
  const sourceFirstFrame = explicitFirstFrame || inheritedFirstFrameUrl || firstFrameUrl;

  // 将相对路径的首帧图片转换为 base64 data URL（豆包 API 需要可访问的图片）
  const firstFrameImageForApi = imageToDataUrl(sourceFirstFrame);
  if (firstFrameImageForApi !== firstFrameUrl) {
    console.log('[Video] first frame converted to base64, length:', firstFrameImageForApi.length);
  }
  // 使用继承帧时，本镜关键帧降为参考图首位，维持角色/场景/道具锚定
  if (sourceFirstFrame !== firstFrameUrl) {
    shotReferenceImages = [imageToDataUrl(firstFrameUrl), ...shotReferenceImages];
  }

  // 极简视频提示词：未传入 motionPrompt 且未启用自定义提示词时用 promptBuilder 构建（身份锁+场景+动作+禁令）
  // P3: 自定义提示词（custom_video_prompt）优先于 motionPrompt 与自动构建
  let finalMotionPrompt = finalCustomPrompt || motionPrompt;
  if (!finalMotionPrompt) {
    try {
      finalMotionPrompt = buildPromptBuilderVideoPrompt(db, shot);
    } catch (err) {
      console.error('[Video] 提示词构建失败（使用原始动作描述）:', (err as Error).message);
      finalMotionPrompt = shot.action_description || '';
    }
  }

  // 创建视频片段记录
  const videoInterval = ShotVideoIntervalDAO.create(db, {
    user_id: userId,
    shot_id: shot.id,
    start_frame_id: startFrameId,
    end_frame_id: resolvedEndFrameId || undefined,
    duration_seconds: duration || shot.duration_seconds || 5,
    motion_prompt: finalMotionPrompt,
    video_model_used: `${provider}/${modelName}`,
  });

  try {
    // 获取 project_id
    const projectId = episode?.project_id || '';

    // 调用 AI 生成视频（异步任务）
    const result = await aiProxy.generateVideo({
      db,
      userId,
      projectId,
      provider,
      modelName,
      firstFrameImageUrl: firstFrameImageForApi,
      lastFrameImageUrl,
      referenceImages: shotReferenceImages.length > 0 ? shotReferenceImages : undefined,
      referenceVideos: (() => { const u = resolvePreviousShotVideoUrl(db, shot); return u ? [u] : undefined; })(),
      motion: finalMotionPrompt || shot.action_description || '',
      duration: duration || shot.duration_seconds || 5,
      ratio,
      resolution,
      subtitles,
    });

    // 更新任务 ID
    ShotVideoIntervalDAO.update(db, videoInterval.id, {
      external_task_id: result.taskId,
      status: 'processing',
    });

    return { ...videoInterval, external_task_id: result.taskId, status: 'processing' };
  } catch (err) {
    ShotVideoIntervalDAO.updateStatus(db, videoInterval.id, 'failed', (err as Error).message);
    throw err;
  }
}

/**
 * 查询视频任务状态（含超时清理与外部状态同步、视频下载）。
 * @param db 数据库实例
 * @param userId 当前用户 ID（校验视频归属）
 * @param videoId 视频记录 ID
 * @returns 更新后的视频记录（completed 时含本地 video_url 与质量门结果）
 * @sideEffects 超时任务标记 failed；外部完成时下载视频到本地并执行质量门评估
 */
export async function getVideoStatus(db: Database, userId: string, videoId: string) {
  const video = ShotVideoIntervalDAO.getById(db, videoId);
  if (!video || video.user_id !== userId) {
    throw createError(404, ErrorCodes.NOT_FOUND, '视频不存在');
  }

  // 超时清理：云端供应商通常 1-10 分钟出片；ComfyUI 本地渲染（MiniMaxH3 等）可长达 30 分钟以上，
  // 按 provider 区分超时窗口，避免把健康任务误判失败
  if ((video.status === 'pending' || video.status === 'processing') && video.created_at) {
    const createdTime = new Date(video.created_at).getTime();
    const isLocalComfy = (video.video_model_used || '').startsWith('comfyui');
    // ComfyUI 本地任务由队列顺序渲染，排队时间计入等待，不设主动超时；
    // 真正失败由轮询 /history 的 status_str=error 捕获，避免排队任务被误判超时
    const timeoutMs = isLocalComfy ? COMFY_LOCAL_VIDEO_TASK_TIMEOUT_MS : VIDEO_TASK_TIMEOUT_MS;
    if (Date.now() - createdTime > timeoutMs) {
      const msg = isLocalComfy ? '任务超时（ComfyUI本地渲染超过24小时）' : '任务超时（超过10分钟）';
      ShotVideoIntervalDAO.update(db, video.id, { status: 'failed', error_message: msg });
      return { ...video, status: 'failed', error_message: msg };
    }
  }

  // 如果还在处理中，查询外部任务状态
  if ((video.status === 'pending' || video.status === 'processing') && video.external_task_id && video.video_model_used) {
    const [provider, modelName] = video.video_model_used.split('/');
    try {
      const taskResult = await aiProxy.getVideoTask({
        db,
        userId,
        provider,
        modelName,
        taskId: video.external_task_id,
      });

      if (taskResult.status === 'completed' && taskResult.videoUrl) {
        const shot = ShotDAO.getById(db, video.shot_id);

        // P0-3: 视频实际时长回写分镜理论时长。
        // 适配器（如豆包 r2v）会把请求时长修正为模型支持的档位（7s→5s、8s→10s），
        // 完成后用适配器返回的实际时长回写 shot.duration_seconds，
        // 使 SRT 生成、segment 聚合、导出字幕全部按实际时长对齐，避免台词配音与画面错位。
        const actualDuration = (taskResult as { durationSeconds?: number }).durationSeconds;
        if (shot && typeof actualDuration === 'number' && actualDuration > 0 && shot.duration_seconds !== actualDuration) {
          ShotDAO.update(db, shot.id, { duration_seconds: actualDuration });
          console.log(`[VideoStatus] 镜头 ${shot.shot_number} 视频实际时长 ${actualDuration}s 回写分镜（原 ${shot.duration_seconds}s）`);
        }

        // 下载视频到本地
        try {
          const episode = shot ? NovelEpisodeDAO.getById(db, shot.episode_id) : null;
          const projectId = episode?.project_id || '';
          const saveDir = path.resolve(projectStorage.getDataDir(projectId), 'videos');
          projectStorage.ensureDir(saveDir);
          const fileName = projectStorage.generateFileName('mp4');
          const localPath = path.resolve(saveDir, fileName);
          // 流式下载：带超时与状态校验
          await downloadToFile(taskResult.videoUrl, localPath, { timeoutMs: 180_000 });
          const localUrl = projectStorage.toUrlPath(localPath);

          ShotVideoIntervalDAO.update(db, video.id, {
            status: 'completed',
            video_url: localUrl,
            completed_at: new Date().toISOString(),
            progress: 100,
          });

          // VLM 视频质量门：抽帧 + 视觉模型打分（主体漂移/幻觉/字幕残留）
          // 不合格 → 标记 failed 并给出具体原因，前端可直接重生成该镜头
          // （未配置视觉模型或调用失败时静默放行，不阻断生产）
          try {
            if (shot) {
              const quality = await assessVideoClip({
                db,
                userId,
                videoPath: localPath,
                shot,
              });
              if (!quality.skipped && !quality.passed) {
                const qMsg = `[质量门] score=${quality.score}：${quality.issues.join('；') || '主体一致性/画面异常'}`;
                ShotVideoIntervalDAO.updateStatus(db, video.id, 'failed', qMsg);
                console.warn(`[VideoStatus] 镜头 ${shot.shot_number} ${qMsg}`);
                return { ...video, status: 'failed', error_message: qMsg };
              }
              if (!quality.skipped) {
                // 质量门结果落库（quality_check 列）
                ShotVideoIntervalDAO.update(db, video.id, {
                  quality_check: quality.passed ? 'passed' : 'failed',
                  quality_score: quality.score,
                  quality_issues: quality.issues.slice(0, 5).join('；'),
                });
                console.log(`[VideoStatus] 镜头 ${shot.shot_number} 质量门通过 score=${quality.score}`);
              }
            }
          } catch (qErr) {
            console.warn('[VideoStatus] 质量门执行失败（跳过）:', (qErr as Error).message);
          }

          return { ...video, status: 'completed', video_url: localUrl };
        } catch {
          // 下载失败，保留远程 URL
          ShotVideoIntervalDAO.update(db, video.id, {
            status: 'completed',
            video_url: taskResult.videoUrl,
            completed_at: new Date().toISOString(),
            progress: 100,
          });
          return { ...video, status: 'completed', video_url: taskResult.videoUrl };
        }
      } else if (taskResult.status === 'failed') {
        ShotVideoIntervalDAO.update(db, video.id, { status: 'failed', error_message: '视频生成失败', progress: 0 });
        return { ...video, status: 'failed', error_message: '视频生成失败', progress: 0 };
      } else {
        // 处理中：同步真实渲染进度（ComfyUI /progress），前端进度条使用真实数据而非估算
        if (typeof taskResult.progress === 'number' && taskResult.progress >= 0) {
          ShotVideoIntervalDAO.update(db, video.id, { progress: taskResult.progress });
          return { ...video, status: taskResult.status, progress: taskResult.progress };
        }
        return { ...video, status: taskResult.status };
      }
    } catch (err) {
      // 查询失败，记录错误并返回本地状态
      console.error('[VideoStatus] 查询外部任务状态失败:', {
        videoId: video.id,
        provider,
        modelName,
        externalTaskId: video.external_task_id,
        error: (err as Error).message,
        stack: (err as Error).stack,
      });
      return video;
    }
  }

  return video;
}

// ============ 批量生成 ============

/**
 * 批量生成视频（为每个有首帧的镜头创建视频任务，限速间隔避免限流）。
 * @param db 数据库实例
 * @param userId 当前用户 ID（校验剧集归属）
 * @param episodeId 剧集 ID
 * @param opts 生成选项（provider/modelName 必填；shotIds/duration/ratio/resolution 可选）
 * @param onProgress 进度回调（可选）
 * @returns 生成结果汇总（total/created/skipped + 明细）
 * @sideEffects 逐镜创建视频任务并轮询至完成（含重试/超时/质量门）；完成后自动聚合 segments 并更新项目记忆、生成字幕
 */
export async function batchGenerateVideos(
  db: Database,
  userId: string,
  episodeId: string,
  opts: {
    provider: string;
    modelName: string;
    shotIds?: string[];
    duration?: number;
    ratio?: '16:9' | '9:16' | '1:1' | '4:3' | '3:4' | '21:9';
    resolution?: '720p' | '1080p' | '2k' | '4k';
  },
  onProgress?: (p: { index: number; total: number; shotId: string; status: 'created' | 'skipped' | 'failed' }) => void
) {
  const episode = NovelEpisodeDAO.getByIdAndUser(db, episodeId, userId);
  if (!episode) throw createError(404, ErrorCodes.NOT_FOUND, '剧集不存在');

  const { provider, modelName, shotIds, duration, ratio, resolution } = opts;
  let shots = ShotDAO.listByEpisode(db, episode.id);
  if (shotIds && shotIds.length > 0) {
    shots = shots.filter(s => shotIds.includes(s.id));
  }

  const created: any[] = [];
  const skipped: any[] = [];

  for (const shot of shots) {
    // 检查是否有首帧
    const keyframes = ShotKeyframeDAO.listByShot(db, shot.id);
    const firstFrame = keyframes.find(k => k.frame_type === 'first' && k.image_url) || keyframes[0];
    if (!firstFrame || !firstFrame.image_url) {
      skipped.push({ shotId: shot.id, reason: '无首帧关键帧' });
      onProgress?.({ index: skipped.length + created.length, total: shots.length, shotId: shot.id, status: 'skipped' });
      continue;
    }

    // ═══════════════════════════════════════════════════════════
    // 首尾帧衔接（低抽卡核心）：下一镜首帧作尾帧（VideoClaw 方案）
    // + 一致性参考图注入（角色/场景/道具，防漂移）
    // ═══════════════════════════════════════════════════════════
    let lastFrameImageUrl: string | undefined;
    let resolvedEndFrameId: string | null = null;
    try {
      const lastFrame = resolveLastFrameForShot(db, shot, shots);
      if (lastFrame) {
        lastFrameImageUrl = imageToDataUrl(lastFrame.imageUrl);
        resolvedEndFrameId = lastFrame.keyframeId;
      }
    } catch { /* 尾帧解析失败，退化为单首帧生成 */ }
    const shotReferenceImages = collectShotReferenceImages(db, shot);

    // 检查是否已有处理中的视频（超时清理）
    // ⚠️ 注意：ComfyUI 本地渲染（MiniMaxH3 等）单镜头可达 30 分钟以上，且队列按序渲染。
    // 之前按"超过2分钟即失败"清理，会把排队/渲染中的本地任务误杀，重复点击批量生成时
    // 更是直接作废正在跑的任务（用户反馈"只有前几秒后面空白/只剩一个视频"的重要成因之一）。
    // 修复：ComfyUI 任务不设短超时（24h 兜底，与 getVideoStatus 一致）；云端任务保留 10 分钟超时。
    const existingVideos = ShotVideoIntervalDAO.listByShot(db, shot.id);
    const now = Date.now();
    for (const v of existingVideos) {
      if ((v.status === 'processing' || v.status === 'pending') && v.created_at) {
        const createdTime = new Date(v.created_at).getTime();
        const isLocalComfy = (v.video_model_used || '').startsWith('comfyui');
        const timeoutMs = isLocalComfy ? COMFY_LOCAL_VIDEO_TASK_TIMEOUT_MS : VIDEO_TASK_TIMEOUT_MS;
        if (now - createdTime > timeoutMs) {
          // 超时任务标记为失败
          ShotVideoIntervalDAO.update(db, v.id, { status: 'failed', error_message: isLocalComfy ? '任务超时（ComfyUI本地渲染超过24小时）' : '任务超时（超过10分钟）' });
        }
      }
    }
    // 重新获取更新后的视频列表
    const updatedVideos = ShotVideoIntervalDAO.listByShot(db, shot.id);
    if (updatedVideos.some(v => v.status === 'processing' || v.status === 'pending')) {
      skipped.push({ shotId: shot.id, reason: '已有处理中视频' });
      onProgress?.({ index: skipped.length + created.length, total: shots.length, shotId: shot.id, status: 'skipped' });
      continue;
    }

    try {
      // 转换首帧为 base64
      const firstFrameImageForApi = imageToDataUrl(firstFrame.image_url);

      // P0-1: promptBuilder 构建视频提示词（身份锁+场景+动作+禁令，≤300字）
      let finalMotionPrompt = '';
      try {
        finalMotionPrompt = buildPromptBuilderVideoPrompt(db, shot);
      } catch (err) {
        console.error('[BatchVideo] 提示词构建失败:', (err as Error).message);
        finalMotionPrompt = shot.action_description || '';
      }

      const videoInterval = ShotVideoIntervalDAO.create(db, {
        user_id: userId,
        shot_id: shot.id,
        start_frame_id: firstFrame.id,
        end_frame_id: resolvedEndFrameId || undefined,
        duration_seconds: duration || shot.duration_seconds || 5,
        motion_prompt: finalMotionPrompt,
        video_model_used: `${provider}/${modelName}`,
      });

      const result = await aiProxy.generateVideo({
        db, userId, projectId: episode.project_id,
        provider, modelName,
        firstFrameImageUrl: firstFrameImageForApi,
        lastFrameImageUrl,
        referenceImages: shotReferenceImages.length > 0 ? shotReferenceImages : undefined,
        motion: finalMotionPrompt,
        duration: duration || shot.duration_seconds || 5,
        ratio, resolution,
        subtitles: false, // 对齐文档：生视频阶段不要字幕
      });

      ShotVideoIntervalDAO.update(db, videoInterval.id, {
        external_task_id: result.taskId,
        status: 'processing',
      });

      created.push({ shotId: shot.id, videoId: videoInterval.id, taskId: result.taskId });
      onProgress?.({ index: skipped.length + created.length, total: shots.length, shotId: shot.id, status: 'created' });
    } catch (err: any) {
      const errorMsg = err.message || '创建失败';
      skipped.push({ shotId: shot.id, reason: errorMsg });
      onProgress?.({ index: skipped.length + created.length, total: shots.length, shotId: shot.id, status: 'failed' });
      // 如果是速率限制，多等一会儿再继续
      if (errorMsg.includes('rate limit') || errorMsg.includes('限流') || err.code === 'AI_RATE_LIMITED') {
        await new Promise(resolve => setTimeout(resolve, 10000));
      }
    }

    // 请求间隔：避免速率限制（Agnes AI 等模型有每分钟请求数限制），可用环境变量 BATCH_VIDEO_INTERVAL_MS 调整
    await new Promise(resolve => setTimeout(resolve, Number(process.env.BATCH_VIDEO_INTERVAL_MS) || 5000));
  }

  return {
    total: shots.length,
    created: created.length,
    skipped: skipped.length,
    createdVideos: created,
    skippedShots: skipped,
  };
}

// ============ 字幕 ============

function formatSrtTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

/**
 * 从分镜台词生成 SRT 字幕。
 * @param db 数据库实例
 * @param userId 当前用户 ID（校验剧集归属）
 * @param episodeId 剧集 ID
 * @returns { subtitles, srtContent, count } —— 字幕条目列表 + SRT 文本 + 条数
 * @sideEffects 无（纯计算，不落库）
 */
export function getEpisodeSubtitles(db: Database, userId: string, episodeId: string) {
  const episode = NovelEpisodeDAO.getByIdAndUser(db, episodeId, userId);
  if (!episode) throw createError(404, ErrorCodes.NOT_FOUND, '剧集不存在');

  const shots = ShotDAO.listByEpisode(db, episode.id);
  const subtitles: Array<{ index: number; start: string; end: string; text: string; speaker?: string }> = [];
  let currentTime = 0;

  shots.forEach((shot, idx) => {
    if (shot.dialogue && shot.dialogue.trim()) {
      const duration = shot.duration_seconds || 3;
      const startSeconds = currentTime;
      const endSeconds = currentTime + duration;
      subtitles.push({
        index: idx + 1,
        start: formatSrtTime(startSeconds),
        end: formatSrtTime(endSeconds),
        text: stripSpeakerPrefix(shot.dialogue),
        speaker: shot.subject || parseSpeaker(shot.dialogue) || undefined,
      });
    }
    currentTime += shot.duration_seconds || 3;
  });

  // 生成 SRT 内容
  const srtContent = subtitles.map(s =>
    `${s.index}\n${s.start} --> ${s.end}\n${s.speaker ? s.speaker + ': ' : ''}${s.text}\n`
  ).join('\n');

  return {
    subtitles,
    srtContent,
    count: subtitles.length,
  };
}
