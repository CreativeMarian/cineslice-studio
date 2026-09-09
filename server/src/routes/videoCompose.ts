// 视频合成路由
// v1.0

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { createError, asyncHandler } from '../middleware/errorHandler';
import { validateBody } from '../middleware/validate';
import { composeEpisode, composePhase, getComposeStatus, getLatestCompose, checkFfmpegAvailable } from '../services/videoComposer';
import type { Database } from '../types';

const router = Router();

function getDb(req: Request): Database {
  return req.app.locals.db as Database;
}

const composeSchema = z.object({
  transition: z.enum(['none', 'fade', 'crossfade']).optional(),
  transitionDuration: z.number().min(0.1).max(3).optional(),
  outputResolution: z.string().optional(),
  fps: z.number().int().min(12).max(60).optional(),
  bgmPath: z.string().max(255).optional(), // BGM 文件名（仅限项目音频目录内的基础文件名）
  bgmVolume: z.number().min(0).max(1).optional(),
  byPhase: z.boolean().optional(), // true=两级合成（阶段视频→整集）
  phase: z.number().int().min(1).max(4).optional(), // 只合成指定阶段
  skipMissingClips: z.boolean().optional(), // true=跳过无视频镜头，不生成黑屏占位
});

// 检查 ffmpeg 可用性
router.get('/ffmpeg/status', asyncHandler(async (_req: Request, res: Response) => {
  const available = await checkFfmpegAvailable();
  res.json({ success: true, data: { available } });
}));

// 合成某集视频
router.post('/episodes/:id/compose', validateBody(composeSchema), asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const result = req.body.phase !== undefined
    ? await composePhase(db, req.params.id, req.user.id, req.body.phase, req.body)
    : await composeEpisode(db, req.params.id, req.user.id, req.body);
  res.json({ success: result.status !== 'failed', data: result });
}));

// 查询合成任务状态
router.get('/compose/:taskId', asyncHandler(async (req: Request, res: Response) => {
  const result = getComposeStatus(req.params.taskId);
  if (!result) throw createError(404, 'NOT_FOUND', '合成任务不存在');
  res.json({ success: true, data: result });
}));

// 查询某集最近一次合成结果（持久化记录优先，跨重启可恢复）
router.get('/episodes/:id/latest-compose', asyncHandler(async (req: Request, res: Response) => {
  const db = req.app.locals.db as Database;
  const result = getLatestCompose(db, req.params.id);
  res.json({ success: true, data: result });
}));

export default router;
