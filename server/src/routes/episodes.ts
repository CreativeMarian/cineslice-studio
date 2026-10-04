// 剧集详情 / 剧本 / 分镜 / 关键帧 路由（薄路由层）
// 业务逻辑已下沉至 services/episodeProductionService.ts
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import fs from 'fs';
import * as path from 'path';
import {
  NovelEpisodeDAO,
  ProjectDAO,
  ShotDAO,
  ShotKeyframeDAO,
  ShotVideoIntervalDAO,
  UserPreferenceDAO,
} from '../models';
import { createError, asyncHandler } from '../middleware/errorHandler';
import { ErrorCodes } from '../errors';
import { validateBody } from '../middleware/validate';
import { projectStorage } from '../services/projectStorage';
import { assertProjectWritable } from '../services/autoPipeline/taskStore';
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
  calculateAllShotsReadiness,
} from '../services/shotConsistencyService';
import { dubVideo } from '../services/dubbingService';
import { exportEpisodeProductionPack } from '../services/exportProductionService';
import { episodeEnrichService } from '../services/episodeEnrichService';
import { consistencyCheckService } from '../services/consistencyCheckService';
import {
  getCharacterExtractPrompt,
  getSceneExtractPrompt,
  getShotGenerationPrompt,
  getKeyframePrompt,
  getVideoPrompt,
  getAudioPrompt,
} from '../services/promptPreviewService';
import {
  aggregateSegments,
  getSegmentsByEpisode,
  generateSegmentVideo,
  retrySegment,
  composeEpisodeFromSegments,
} from '../services/segmentService';
import type { Database } from '../types';

const router = Router();

function getDb(req: Request): Database {
  return req.app.locals.db as Database;
}

/** P2修复(IDOR): 剧集归属校验——剧集不存在或不属于当前用户时抛 404 */
function assertEpisodeOwner(db: Database, episodeId: string, userId: string): void {
  const episode = NovelEpisodeDAO.getByIdAndUser(db, episodeId, userId);
  if (!episode) throw createError(404, ErrorCodes.NOT_FOUND, '剧集不存在');
}

/** P2修复(IDOR): 镜头归属校验——镜头不存在或不属于当前用户时抛 404 */
function assertShotOwner(db: Database, shotId: string, userId: string): void {
  const shot = ShotDAO.getByIdAndUser(db, shotId, userId);
  if (!shot) throw createError(404, ErrorCodes.NOT_FOUND, '镜头不存在');
}

const updateEpisodeSchema = z.object({
  title: z.string().optional(),
  // P1-24: 剧本长度上限（防超大剧本撑爆上下文/存储）
  script_content: z.string().max(200000).optional(),
  status: z.enum(['draft', 'generated', 'edited']).optional(),
});

const regenerateSchema = z.object({
  provider: z.string(),
  modelName: z.string(),
});

const generateShotsSchema = z.object({
  textProvider: z.string().optional(),
  textModel: z.string().optional(),
  imageProvider: z.string().optional(),
  imageModel: z.string().optional(),
  shotDensity: z.enum(['sparse', 'normal', 'dense']).optional(),
  includeDialogue: z.boolean().optional(),
  // 自定义分镜生成提示词：有值时代替系统自动构建
  custom_prompt: z.string().optional(),
});

const generateKeyframesSchema = z.object({
  provider: z.string(),
  modelName: z.string(),
  frameTypes: z.array(z.enum(['first', 'last', 'middle'])).optional(),
  referenceCharacterIds: z.array(z.string()).optional(),
  referenceSceneId: z.string().optional(),
  // 自定义关键帧提示词：有值时代替系统自动构建并落库（'' = 清除已存自定义提示词）
  custom_prompt: z.string().optional(),
});

// ============ 剧集详情与剧本 ============

// 剧集详情（含剧本）
router.get('/episodes/:id', asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const episode = NovelEpisodeDAO.getByIdAndUser(db, req.params.id, req.user.id);
  if (!episode) throw createError(404, ErrorCodes.NOT_FOUND, '剧集不存在');
  res.json({ success: true, data: episode });
}));

// 更新剧集剧本
router.put('/episodes/:id', validateBody(updateEpisodeSchema), asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const episode = NovelEpisodeDAO.getByIdAndUser(db, req.params.id, req.user.id);
  if (!episode) throw createError(404, ErrorCodes.NOT_FOUND, '剧集不存在');
  // P3: 剧本内容更新走 updateScript（script_version + 1 / script_updated_at 刷新，供前端判断下游资产过期）
  const updated = req.body.script_content !== undefined
    ? NovelEpisodeDAO.updateScript(db, req.params.id, req.body)
    : NovelEpisodeDAO.update(db, req.params.id, req.body);
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
  if (!episode) throw createError(404, ErrorCodes.NOT_FOUND, '剧集不存在');
  NovelEpisodeDAO.deleteCascade(db, req.params.id);
  res.json({ success: true, data: { message: '剧集已删除' } });
}));

// ============ 分镜投产包导出（novel-storyboard export） ============

// 一键导出 H3 / Seedance 投产包 ZIP（manifest.json + script.md + characters/ + scenes/ + segments/）
router.get('/projects/:projectId/episodes/:episodeId/export', asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const project = ProjectDAO.getByIdAndUser(db, req.params.projectId, req.user.id);
  if (!project) throw createError(404, ErrorCodes.NOT_FOUND, '项目不存在');
  const episode = NovelEpisodeDAO.getByIdAndUser(db, req.params.episodeId, req.user.id);
  if (!episode || episode.project_id !== project.id) throw createError(404, ErrorCodes.NOT_FOUND, '剧集不存在');

  const epLabel = String(episode.episode_number).padStart(2, '0');
  const zipPath = path.resolve(process.cwd(), 'outputs', `production-pack-${epLabel}.zip`);
  const result = await exportEpisodeProductionPack(db, project.id, episode.id, zipPath);
  res.download(result.zipPath, path.basename(result.zipPath));
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
    customPrompt: req.body.custom_prompt,
  });
  res.json({ success: true, data: created });
}));

// 镜头列表
router.get('/episodes/:id/shots', asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  // P2修复(IDOR): 校验剧集归属
  assertEpisodeOwner(db, req.params.id, req.user.id);
  const shots = ShotDAO.listByEpisode(db, req.params.id);
  res.json({ success: true, data: shots });
}));

// P1-2: 镜头就绪状态（批量计算每个镜头的参考完整性）
router.get('/episodes/:id/shots/readiness', asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  // P2修复(IDOR): 校验剧集归属
  assertEpisodeOwner(db, req.params.id, req.user.id);
  const readiness = calculateAllShotsReadiness(db, req.params.id);
  res.json({ success: true, data: readiness });
}));

// P1-1: 一致性评分报告
router.get('/episodes/:id/consistency-report', asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  // P2修复(IDOR): 校验剧集归属
  assertEpisodeOwner(db, req.params.id, req.user.id);
  const report = await consistencyCheckService.generateEpisodeConsistencyReport(db, req.user.id, req.params.id);
  res.json({ success: true, data: report });
}));

// 镜头详情
router.get('/shots/:id', asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const shot = ShotDAO.getByIdAndUser(db, req.params.id, req.user.id);
  if (!shot) throw createError(404, ErrorCodes.NOT_FOUND, '镜头不存在');
  res.json({ success: true, data: shot });
}));

// 删除镜头
router.delete('/shots/:id', asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const shot = ShotDAO.getByIdAndUser(db, req.params.id, req.user.id);
  if (!shot) throw createError(404, ErrorCodes.NOT_FOUND, '镜头不存在');
  // P1-16: 项目级写锁——全自动流水线运行中禁止删除分镜（返回 409）
  const episode = NovelEpisodeDAO.getById(db, shot.episode_id);
  if (episode) assertProjectWritable(db, episode.project_id);
  ShotDAO.delete(db, req.params.id);
  res.json({ success: true, data: { message: '镜头已删除' } });
}));

// 批量删除该集所有镜头（事务内一次性删除，含级联的关键帧/视频/音频）
router.delete('/episodes/:id/shots', asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const episode = NovelEpisodeDAO.getByIdAndUser(db, req.params.id, req.user.id);
  if (!episode) throw createError(404, ErrorCodes.NOT_FOUND, '剧集不存在');
  const shots = ShotDAO.listByEpisode(db, episode.id);
  const count = shots.length;
  db.transaction(() => {
    for (const s of shots) ShotDAO.delete(db, s.id);
  })();
  res.json({ success: true, data: { message: `已删除 ${count} 个镜头`, deleted: count } });
}));

// ============ 提示词预览（不调用AI，基于当前数据库数据构建提示词字符串） ============

// 角色提取提示词预览
router.get('/episodes/:id/preview-character-prompt', asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  assertEpisodeOwner(db, req.params.id, req.user.id);
  const data = await getCharacterExtractPrompt(db, req.params.id);
  res.json({ success: true, data });
}));

// 场景提取提示词预览
router.get('/episodes/:id/preview-scene-prompt', asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  assertEpisodeOwner(db, req.params.id, req.user.id);
  const data = await getSceneExtractPrompt(db, req.params.id);
  res.json({ success: true, data });
}));

// 分镜生成提示词预览（query: shot_density? / include_dialogue?）
router.get('/episodes/:id/preview-shot-prompt', asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  assertEpisodeOwner(db, req.params.id, req.user.id);
  const shotDensity = typeof req.query.shot_density === 'string' ? req.query.shot_density : undefined;
  let includeDialogue: boolean | undefined;
  if (typeof req.query.include_dialogue === 'string') {
    includeDialogue = req.query.include_dialogue === 'true' || req.query.include_dialogue === '1';
  }
  const data = await getShotGenerationPrompt(db, req.params.id, { shot_density: shotDensity, include_dialogue: includeDialogue });
  res.json({ success: true, data });
}));

// 关键帧提示词预览
router.get('/shots/:id/preview-keyframe-prompt', asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  assertShotOwner(db, req.params.id, req.user.id);
  const data = await getKeyframePrompt(db, req.params.id);
  res.json({ success: true, data });
}));

// 视频提示词预览
router.get('/shots/:id/preview-video-prompt', asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  assertShotOwner(db, req.params.id, req.user.id);
  const data = await getVideoPrompt(db, req.params.id);
  res.json({ success: true, data });
}));

// 配音提示词预览
router.get('/shots/:id/preview-audio-prompt', asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  assertShotOwner(db, req.params.id, req.user.id);
  const data = await getAudioPrompt(db, req.params.id);
  res.json({ success: true, data });
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
    customPrompt: req.body.custom_prompt,
  });
  res.json({ success: true, data: results });
}));

// 关键帧列表
router.get('/shots/:id/keyframes', asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  // P2修复(IDOR): 校验镜头归属
  assertShotOwner(db, req.params.id, req.user.id);
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
  if (!shot) throw createError(404, ErrorCodes.NOT_FOUND, '镜头不存在');
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
  if (!updated) throw createError(404, ErrorCodes.NOT_FOUND, '关键帧不存在');
  res.json({ success: true, data: updated });
}));

// 生成显式尾帧（frame_type='end'，配合首帧做首尾帧插值，动作/情绪转折镜头推荐）
router.post('/shots/:id/keyframes/endframe', validateBody(regenerateSchema), asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const shot = ShotDAO.getByIdAndUser(db, req.params.id, req.user.id);
  if (!shot) throw createError(404, ErrorCodes.NOT_FOUND, '镜头不存在');
  const kf = await generateEndFrameForShot(db, req.user.id, shot, {
    provider: req.body.provider,
    modelName: req.body.modelName,
    referenceImages: collectShotReferenceImages(db, shot),
  });
  res.json({ success: true, data: kf });
}));

// 更新镜头（如：首尾帧衔接开关 use_next_first_frame）
// P0-1：去掉 .passthrough()，显式声明全部可写字段（含 blocking 等新字段），拒绝未知列名注入
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
  notes: z.string().nullable().optional(),
  lighting: z.string().nullable().optional(),
  mood: z.string().nullable().optional(),
  transition: z.string().nullable().optional(),
  pace: z.string().nullable().optional(),
  character_outfits: z.string().nullable().optional(),
  blocking: z.string().nullable().optional(),
  first_frame_description: z.string().nullable().optional(),
  last_frame_description: z.string().nullable().optional(),
});
router.put('/shots/:id', validateBody(updateShotSchema), asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const shot = ShotDAO.getByIdAndUser(db, req.params.id, req.user.id);
  if (!shot) throw createError(404, ErrorCodes.NOT_FOUND, '镜头不存在');
  // P1-16: 项目级写锁——全自动流水线运行中禁止人工修改分镜（返回 409）
  const episode = NovelEpisodeDAO.getById(db, shot.episode_id);
  if (episode) assertProjectWritable(db, episode.project_id);
  const updated = ShotDAO.update(db, req.params.id, req.body);
  res.json({ success: true, data: updated });
}));

// 删除关键帧
router.delete('/keyframes/:id', asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const keyframe = ShotKeyframeDAO.getByIdAndUser(db, req.params.id, req.user.id);
  if (!keyframe) throw createError(404, ErrorCodes.NOT_FOUND, '关键帧不存在');
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
  // 自定义视频提示词：有值时代替系统自动构建并落库（'' = 清除已存自定义提示词）
  custom_prompt: z.string().optional(),
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
    customPrompt: req.body.custom_prompt,
  });
  res.json({ success: true, data: result });
}));

// 配音 + 字幕烧录（edge-tts 免费语音 + ffmpeg 烧录）
router.post('/shots/:id/dub', asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const shot = ShotDAO.getById(db, req.params.id);
  if (!shot || shot.user_id !== req.user.id) {
    throw createError(404, ErrorCodes.NOT_FOUND, '分镜不存在');
  }
  const videos = ShotVideoIntervalDAO.listByShot(db, req.params.id)
    .filter((v: any) => v.status === 'completed' && v.video_url)
    .sort((a: any, b: any) => new Date(b.completed_at || 0).getTime() - new Date(a.completed_at || 0).getTime());
  if (!videos.length) {
    throw createError(409, ErrorCodes.CONFLICT, '该镜头暂无已完成视频，请先生成视频');
  }
  const localPath = projectStorage.toLocalPath(videos[0].video_url || '');
  const projectDir = path.dirname(localPath);
  const result = await dubVideo(localPath, shot.dialogue, projectDir);
  if (!result) {
    throw createError(409, ErrorCodes.CONFLICT, '该镜头没有台词，无需配音');
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
  // P2修复(IDOR): 校验镜头归属
  assertShotOwner(db, req.params.id, req.user.id);
  const videos = ShotVideoIntervalDAO.listByShot(db, req.params.id);
  res.json({ success: true, data: videos });
}));

// 删除视频
router.delete('/videos/:id', asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const video = ShotVideoIntervalDAO.getById(db, req.params.id);
  if (!video || video.user_id !== req.user.id) {
    throw createError(404, ErrorCodes.NOT_FOUND, '视频不存在');
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

// ============ 加料重构（按集触发：规范前置 + 只加血肉不动骨架 + 五层护栏） ============

const enrichSchema = z.object({
  provider: z.string().optional(),
  modelName: z.string().optional(),
  forceRefresh: z.boolean().optional(),
});

// 加料重构：生成（预览态 pending/manual，通过后 approved）
router.post('/episodes/:id/enrich', validateBody(enrichSchema), asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const result = await episodeEnrichService.enrichEpisode(db, req.user.id, req.params.id, {
    provider: req.body.provider,
    modelName: req.body.modelName,
    forceRefresh: req.body.forceRefresh,
  });
  res.json({ success: true, data: result });
}));

// 获取已落库的加料重构结果
router.get('/episodes/:id/enrich', asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const episode = NovelEpisodeDAO.getByIdAndUser(db, req.params.id, req.user.id);
  if (!episode) throw createError(404, ErrorCodes.NOT_FOUND, '剧集不存在');
  const result = episodeEnrichService.parseStored(episode);
  res.json({ success: true, data: { result, status: episode.enrich_status, skill: episode.enriched_skill, model: episode.enriched_model, at: episode.enriched_at, feedback: episode.enrich_feedback, rejectCount: episode.enrich_reject_count } });
}));

// 通过加料结果（后续分镜/视频优先使用加料后剧本）
router.post('/episodes/:id/enrich/approve', asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  episodeEnrichService.approve(db, req.user.id, req.params.id);
  res.json({ success: true, data: { message: '加料结果已通过，后续分镜将使用加料后剧本' } });
}));

// 打回重改（携带不满意反馈，重新加料时针对性改进）
router.post('/episodes/:id/enrich/reject', asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const feedback = typeof req.body?.feedback === 'string' ? req.body.feedback : undefined;
  episodeEnrichService.reject(db, req.user.id, req.params.id, feedback);
  res.json({ success: true, data: { message: '已打回，重新加料时将携带反馈针对性改进' } });
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
  // P2修复(IDOR): 校验剧集归属
  assertEpisodeOwner(db, req.params.id, req.user.id);
  const shots = ShotDAO.listByEpisode(db, req.params.id) as Array<{ id: string }>;
  let completed = 0;
  for (const s of shots) {
    completed += ShotVideoIntervalDAO.listByShot(db, s.id)
      .filter((v: any) => v.status === 'completed' && v.video_url).length;
  }
  res.json({ success: true, data: { count: completed, totalShots: shots.length } });
}));

// ============ 分段（Segment）— P2-2：聚合 / 生成 / 重试 / 按段合成 ============

// 段列表（GET 聚合查询：读取时刷新每段状态）
router.get('/episodes/:id/segments', asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  // P2-3: 归属校验——剧集不属于当前用户则抛 404（参考 POST /episodes/:id/segments 写法）
  const episode = NovelEpisodeDAO.getByIdAndUser(db, req.params.id, req.user.id);
  if (!episode) throw createError(404, ErrorCodes.NOT_FOUND, '剧集不存在');
  const segments = getSegmentsByEpisode(db, req.params.id);
  res.json({ success: true, data: segments });
}));

// 重新聚合（POST：幂等重建该集所有段）
router.post('/episodes/:id/segments', asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const episode = NovelEpisodeDAO.getByIdAndUser(db, req.params.id, req.user.id);
  if (!episode) throw createError(404, ErrorCodes.NOT_FOUND, '剧集不存在');
  const segments = aggregateSegments(db, req.params.id, req.user.id, episode.project_id);
  res.json({ success: true, data: segments });
}));

// 按段生成视频（聚合该段所有镜头的视频任务，可单独重试）
const segmentVideoSchema = z.object({
  provider: z.string().optional(),
  modelName: z.string().optional(),
  duration: z.number().min(1).max(15).optional(),
  ratio: z.enum(['16:9', '9:16', '1:1', '4:3', '3:4', '21:9']).optional(),
  resolution: z.enum(['720p', '1080p', '2k', '4k']).optional(),
  subtitles: z.boolean().optional(),
});
router.post('/segments/:id/video', validateBody(segmentVideoSchema), asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  let provider = req.body.provider;
  let modelName = req.body.modelName;
  // 未指定模型时回退到用户默认视频模型
  if (!provider || !modelName) {
    try {
      const pref = UserPreferenceDAO.getByUser(db, req.user.id);
      const key = pref?.default_video_model;
      if (key && key.includes(':')) {
        [provider, modelName] = key.split(':');
      }
    } catch { /* 忽略，交由 service 校验 */ }
  }
  if (!provider || !modelName) {
    throw createError(400, ErrorCodes.MODEL_NOT_CONFIGURED, '请先配置默认视频模型，或在请求中指定 provider 和 modelName');
  }
  const segment = await generateSegmentVideo(db, req.user.id, req.params.id, {
    provider,
    modelName,
    duration: req.body.duration,
    ratio: req.body.ratio,
    resolution: req.body.resolution,
    subtitles: req.body.subtitles,
  });
  res.json({ success: true, data: segment });
}));

// 重试段视频生成（清理该段失败任务后重新提交；模型取段记录或用户默认）
router.post('/segments/:id/retry', asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const segment = await retrySegment(db, req.user.id, req.params.id);
  res.json({ success: true, data: segment });
}));

// 按段顺序 concat 所有段视频为最终成片
router.post('/episodes/:id/compose-from-segments', asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const url = await composeEpisodeFromSegments(db, req.user.id, req.params.id);
  res.json({ success: true, data: { video_url: url } });
}));

export default router;
