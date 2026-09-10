// 剧集详情 / 剧本 / 分镜 / 关键帧 路由（薄路由层）
// 业务逻辑已下沉至 services/episodeProductionService.ts
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import fs from 'fs';
import * as path from 'path';
import {
  NovelEpisodeDAO,
  ShotDAO,
  ShotKeyframeDAO,
  ShotVideoIntervalDAO,
} from '../models';
import { createError, asyncHandler } from '../middleware/errorHandler';
import { validateBody } from '../middleware/validate';
import { projectStorage } from '../services/projectStorage';
import {
  regenerateEpisodeScript,
  polishEpisodeScript,
  generateShotsForEpisode,
  generateKeyframesForShot,
  regenerateKeyframe,
  generateVideoForShot,
  getVideoStatus,
  batchGenerateKeyframes,
  batchGenerateVideos,
  getEpisodeSubtitles,
} from '../services/episodeProductionService';
import {
  generateKeyframeCandidates,
  selectCandidateAsFirst,
  generateEndFrameForShot,
  collectShotReferenceImages,
} from '../services/shotConsistencyService';
import { dubVideo } from '../services/dubbingService';
import type { Database } from '../types';

const router = Router();

function getDb(req: Request): Database {
  return req.app.locals.db as Database;
}

const updateEpisodeSchema = z.object({
  title: z.string().optional(),
  script_content: z.string().optional(),
  status: z.enum(['draft', 'generated', 'edited']).optional(),
});

const regenerateSchema = z.object({
  provider: z.string(),
  modelName: z.string(),
});

const generateShotsSchema = z.object({
  textProvider: z.string(),
  textModel: z.string(),
  imageProvider: z.string().optional(),
  imageModel: z.string().optional(),
  shotDensity: z.enum(['sparse', 'normal', 'dense']).optional(),
  includeDialogue: z.boolean().optional(),
});

const generateKeyframesSchema = z.object({
  provider: z.string(),
  modelName: z.string(),
  frameTypes: z.array(z.enum(['first', 'last', 'middle'])).optional(),
  referenceCharacterIds: z.array(z.string()).optional(),
  referenceSceneId: z.string().optional(),
});

// ============ 剧集详情与剧本 ============

// 剧集详情（含剧本）
router.get('/episodes/:id', asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const episode = NovelEpisodeDAO.getByIdAndUser(db, req.params.id, req.user.id);
  if (!episode) throw createError(404, 'NOT_FOUND', '剧集不存在');
  res.json({ success: true, data: episode });
}));

// 更新剧集剧本
router.put('/episodes/:id', validateBody(updateEpisodeSchema), asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const episode = NovelEpisodeDAO.getByIdAndUser(db, req.params.id, req.user.id);
  if (!episode) throw createError(404, 'NOT_FOUND', '剧集不存在');
  const updated = NovelEpisodeDAO.update(db, req.params.id, req.body);
  res.json({ success: true, data: updated });
}));

// 重新生成某集剧本
router.post('/episodes/:id/regenerate', validateBody(regenerateSchema), asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const updated = await regenerateEpisodeScript(db, req.user.id, req.params.id, req.body.provider, req.body.modelName);
  res.json({ success: true, data: updated });
}));

// 润色某集剧本（不改变剧情，只优化文字）
const polishSchema = z.object({
  provider: z.string(),
  modelName: z.string(),
});
router.post('/episodes/:id/polish', validateBody(polishSchema), asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const updated = await polishEpisodeScript(db, req.user.id, req.params.id, req.body.provider, req.body.modelName);
  res.json({ success: true, data: updated });
}));

// 删除剧集
router.delete('/episodes/:id', asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const episode = NovelEpisodeDAO.getByIdAndUser(db, req.params.id, req.user.id);
  if (!episode) throw createError(404, 'NOT_FOUND', '剧集不存在');
  NovelEpisodeDAO.delete(db, req.params.id);
  res.json({ success: true, data: { message: '剧集已删除' } });
}));

// ============ 分镜 ============

// 生成分镜
router.post('/episodes/:id/shots/generate', validateBody(generateShotsSchema), asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const created = await generateShotsForEpisode(db, req.user.id, req.params.id, {
    textProvider: req.body.textProvider,
    textModel: req.body.textModel,
    shotDensity: req.body.shotDensity,
    includeDialogue: req.body.includeDialogue,
  });
  res.json({ success: true, data: created });
}));

// 镜头列表
router.get('/episodes/:id/shots', asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const shots = ShotDAO.listByEpisode(db, req.params.id);
  res.json({ success: true, data: shots });
}));

// 镜头详情
router.get('/shots/:id', asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const shot = ShotDAO.getByIdAndUser(db, req.params.id, req.user.id);
  if (!shot) throw createError(404, 'NOT_FOUND', '镜头不存在');
  res.json({ success: true, data: shot });
}));

// 删除镜头
router.delete('/shots/:id', asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const shot = ShotDAO.getByIdAndUser(db, req.params.id, req.user.id);
  if (!shot) throw createError(404, 'NOT_FOUND', '镜头不存在');
  ShotDAO.delete(db, req.params.id);
  res.json({ success: true, data: { message: '镜头已删除' } });
}));

// ============ 关键帧 ============

// 生成关键帧
router.post('/shots/:id/keyframes/generate', validateBody(generateKeyframesSchema), asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const results = await generateKeyframesForShot(db, req.user.id, req.params.id, {
    provider: req.body.provider,
    modelName: req.body.modelName,
    frameTypes: req.body.frameTypes,
    referenceCharacterIds: req.body.referenceCharacterIds,
    referenceSceneId: req.body.referenceSceneId,
  });
  res.json({ success: true, data: results });
}));

// 关键帧列表
router.get('/shots/:id/keyframes', asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const keyframes = ShotKeyframeDAO.listByShot(db, req.params.id);
  res.json({ success: true, data: keyframes });
}));

// 重新生成单帧
router.post('/keyframes/:id/regenerate', validateBody(regenerateSchema), asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const updated = await regenerateKeyframe(db, req.user.id, req.params.id, {
    provider: req.body.provider,
    modelName: req.body.modelName,
    optimizePrompt: req.body.optimizePrompt,
  });
  res.json({ success: true, data: updated });
}));

// 生成九宫格候选关键帧（BigBanana 方案：多视角候选选首帧）
const candidatesSchema = z.object({
  provider: z.string(),
  modelName: z.string(),
  count: z.number().min(1).max(9).optional(),
});
router.post('/shots/:id/keyframes/candidates', validateBody(candidatesSchema), asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const shot = ShotDAO.getByIdAndUser(db, req.params.id, req.user.id);
  if (!shot) throw createError(404, 'NOT_FOUND', '镜头不存在');
  const candidates = await generateKeyframeCandidates(db, req.user.id, shot, {
    provider: req.body.provider,
    modelName: req.body.modelName,
    count: req.body.count,
    referenceImages: collectShotReferenceImages(db, shot),
  });
  res.json({ success: true, data: candidates });
}));

// 选择候选帧升级为首帧（旧首帧自动降级为候选保留对照）
router.post('/keyframes/:id/select', asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const updated = selectCandidateAsFirst(db, req.user.id, req.params.id);
  if (!updated) throw createError(404, 'NOT_FOUND', '关键帧不存在');
  res.json({ success: true, data: updated });
}));

// 生成显式尾帧（frame_type='end'，配合首帧做首尾帧插值，动作/情绪转折镜头推荐）
router.post('/shots/:id/keyframes/endframe', validateBody(regenerateSchema), asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const shot = ShotDAO.getByIdAndUser(db, req.params.id, req.user.id);
  if (!shot) throw createError(404, 'NOT_FOUND', '镜头不存在');
  const kf = await generateEndFrameForShot(db, req.user.id, shot, {
    provider: req.body.provider,
    modelName: req.body.modelName,
    referenceImages: collectShotReferenceImages(db, shot),
  });
  res.json({ success: true, data: kf });
}));

// 更新镜头（如：首尾帧衔接开关 use_next_first_frame）
const updateShotSchema = z.object({
  shot_number: z.number().int().min(1).optional(),
  scene_id: z.string().nullable().optional(),
  scene_name: z.string().nullable().optional(),
  subject: z.string().nullable().optional(),
  action_description: z.string().nullable().optional(),
  dialogue: z.string().nullable().optional(),
  camera_movement: z.string().nullable().optional(),
  shot_size: z.string().nullable().optional(),
  duration_seconds: z.number().positive().optional(),
  characters_in_shot: z.array(z.string()).optional(),
  props_in_shot: z.array(z.string()).optional(),
  use_next_first_frame: z.number().int().min(0).max(1).optional(),
}).passthrough();
router.put('/shots/:id', validateBody(updateShotSchema), asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const shot = ShotDAO.getByIdAndUser(db, req.params.id, req.user.id);
  if (!shot) throw createError(404, 'NOT_FOUND', '镜头不存在');
  const updated = ShotDAO.update(db, req.params.id, req.body);
  res.json({ success: true, data: updated });
}));

// 删除关键帧
router.delete('/keyframes/:id', asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const keyframe = ShotKeyframeDAO.getByIdAndUser(db, req.params.id, req.user.id);
  if (!keyframe) throw createError(404, 'NOT_FOUND', '关键帧不存在');
  ShotKeyframeDAO.delete(db, req.params.id);
  res.json({ success: true, data: { message: '关键帧已删除' } });
}));

// ============ 视频生成 ============

const generateVideoSchema = z.object({
  provider: z.string(),
  modelName: z.string(),
  keyframeId: z.string().optional(),
  motionPrompt: z.string().optional(),
  duration: z.number().min(1).max(15).optional(),
  ratio: z.enum(['16:9', '9:16', '1:1', '4:3', '3:4', '21:9']).optional(),
  resolution: z.enum(['720p', '1080p', '2k', '4k']).optional(),
  subtitles: z.boolean().optional(),
  endFrameId: z.string().optional(),       // 显式指定尾帧关键帧（首尾帧插值）
  referenceImages: z.array(z.string()).optional(), // 一致性参考图，未传则自动收集
  firstFrameImageUrl: z.string().optional(), // 显式覆盖首帧（上一镜尾帧继承等）
});

// 生成视频
router.post('/shots/:id/video/generate', validateBody(generateVideoSchema), asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const result = await generateVideoForShot(db, req.user.id, req.params.id, {
    provider: req.body.provider,
    modelName: req.body.modelName,
    keyframeId: req.body.keyframeId,
    motionPrompt: req.body.motionPrompt,
    duration: req.body.duration,
    ratio: req.body.ratio,
    resolution: req.body.resolution,
    subtitles: req.body.subtitles,
    endFrameId: req.body.endFrameId,
    referenceImages: req.body.referenceImages,
    firstFrameImageUrl: req.body.firstFrameImageUrl,
  });
  res.json({ success: true, data: result });
}));

// 配音 + 字幕烧录（edge-tts 免费语音 + ffmpeg 烧录）
router.post('/shots/:id/dub', asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const shot = ShotDAO.getById(db, req.params.id);
  if (!shot || shot.user_id !== req.user.id) {
    throw createError(404, 'NOT_FOUND', '分镜不存在');
  }
  const videos = ShotVideoIntervalDAO.listByShot(db, req.params.id)
    .filter((v: any) => v.status === 'completed' && v.video_url)
    .sort((a: any, b: any) => new Date(b.completed_at || 0).getTime() - new Date(a.completed_at || 0).getTime());
  if (!videos.length) {
    throw createError(409, 'CONFLICT', '该镜头暂无已完成视频，请先生成视频');
  }
  const localPath = projectStorage.toLocalPath(videos[0].video_url || '');
  const projectDir = path.dirname(localPath);
  const result = await dubVideo(localPath, shot.dialogue, projectDir);
  if (!result) {
    throw createError(409, 'CONFLICT', '该镜头没有台词，无需配音');
  }
  res.json({ success: true, data: result });
}));

// 查询视频任务状态
router.get('/videos/:id/status', asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const data = await getVideoStatus(db, req.user.id, req.params.id);
  res.json({ success: true, data });
}));

// 获取镜头的视频列表
router.get('/shots/:id/videos', asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const videos = ShotVideoIntervalDAO.listByShot(db, req.params.id);
  res.json({ success: true, data: videos });
}));

// 删除视频
router.delete('/videos/:id', asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const video = ShotVideoIntervalDAO.getById(db, req.params.id);
  if (!video || video.user_id !== req.user.id) {
    throw createError(404, 'NOT_FOUND', '视频不存在');
  }
  // 删除本地视频文件（如果存在）
  if (video.video_url && video.video_url.startsWith('/')) {
    try {
      const localPath = projectStorage.toLocalPath(video.video_url);
      if (fs.existsSync(localPath)) {
        fs.unlinkSync(localPath);
      }
    } catch (err) {
      console.error('[DeleteVideo] 删除本地视频文件失败:', err);
    }
  }
  ShotVideoIntervalDAO.delete(db, req.params.id);
  res.json({ success: true, data: { message: '视频已删除' } });
}));

// ============ 批量生成（对齐文档：一键批量生成关键帧/视频） ============

const batchKeyframesSchema = z.object({
  provider: z.string(),
  modelName: z.string(),
  shotIds: z.array(z.string()).optional(), // 不传则全部
  candidatesPerShot: z.number().min(1).max(9).optional(), // >1 时生成九宫格候选（不选首帧，待用户挑选）
  frameTypes: z.array(z.enum(['first', 'last', 'middle'])).optional(), // 默认 ['first']；首尾帧链路传 ['first','last']
  stream: z.boolean().optional(), // true 时以 NDJSON 逐镜推送真实进度
});

// 批量生成首帧关键帧（stream: true 时以 NDJSON 逐镜推送真实进度）
router.post('/episodes/:id/keyframes/batch', validateBody(batchKeyframesSchema), asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const opts = {
    provider: req.body.provider,
    modelName: req.body.modelName,
    shotIds: req.body.shotIds,
    candidatesPerShot: req.body.candidatesPerShot,
    frameTypes: req.body.frameTypes,
  };
  if (req.body.stream === true) {
    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Cache-Control', 'no-cache');
    res.flushHeaders?.();
    const data = await batchGenerateKeyframes(db, req.user.id, req.params.id, opts, (p) => {
      res.write(JSON.stringify(p) + '\n');
    });
    res.write(JSON.stringify({ done: true, data }) + '\n');
    res.end();
    return;
  }
  const data = await batchGenerateKeyframes(db, req.user.id, req.params.id, opts);
  res.json({ success: true, data });
}));

const batchVideoSchema = z.object({
  provider: z.string(),
  modelName: z.string(),
  shotIds: z.array(z.string()).optional(),
  duration: z.number().min(1).max(15).optional(),
  ratio: z.enum(['16:9', '9:16', '1:1', '4:3', '3:4', '21:9']).optional(),
  resolution: z.enum(['720p', '1080p', '2k', '4k']).optional(),
  stream: z.boolean().optional(), // true 时以 NDJSON 逐镜推送真实进度
});

// 批量生成视频（为每个有首帧的镜头创建视频任务；stream: true 时 NDJSON 逐镜推送真实进度）
router.post('/episodes/:id/videos/batch', validateBody(batchVideoSchema), asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const opts = {
    provider: req.body.provider,
    modelName: req.body.modelName,
    shotIds: req.body.shotIds,
    duration: req.body.duration,
    ratio: req.body.ratio,
    resolution: req.body.resolution,
  };
  if (req.body.stream === true) {
    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Cache-Control', 'no-cache');
    res.flushHeaders?.();
    const data = await batchGenerateVideos(db, req.user.id, req.params.id, opts, (p) => {
      res.write(JSON.stringify(p) + '\n');
    });
    res.write(JSON.stringify({ done: true, data }) + '\n');
    res.end();
    return;
  }
  const data = await batchGenerateVideos(db, req.user.id, req.params.id, opts);
  res.json({ success: true, data });
}));

// ============ 字幕生成（对齐文档第五步：剪辑阶段添加字幕） ============

// 从分镜台词生成 SRT 字幕
router.get('/episodes/:id/subtitles', asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const data = getEpisodeSubtitles(db, req.user.id, req.params.id);
  res.json({ success: true, data });
}));

// 获取剧集已完成视频片段数（导出页合成前检测用，真实数据）
router.get('/episodes/:id/videos/count', asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const shots = ShotDAO.listByEpisode(db, req.params.id) as Array<{ id: string }>;
  let completed = 0;
  for (const s of shots) {
    completed += ShotVideoIntervalDAO.listByShot(db, s.id)
      .filter((v: any) => v.status === 'completed' && v.video_url).length;
  }
  res.json({ success: true, data: { count: completed, totalShots: shots.length } });
}));

export default router;
