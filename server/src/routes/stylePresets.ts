// 预设风格路由
// v1.0

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { StylePresetDAO, ProjectDAO } from '../models';
import { createError, asyncHandler } from '../middleware/errorHandler';
import { validateBody } from '../middleware/validate';
import type { Database } from '../types';

const router = Router();

function getDb(req: Request): Database {
  return req.app.locals.db as Database;
}

const presetSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  category: z.string().optional(),
  visual_style: z.string(),
  camera_language: z.string().optional(),
  color_palette: z.string().optional(),
  shot_rhythm: z.string().optional(),
  video_params: z.string().optional(),
});

// 列表（内置 + 自定义）
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const presets = StylePresetDAO.listAll(db);
  res.json({ success: true, data: presets });
}));

// 内置预设列表
router.get('/builtin', asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const presets = StylePresetDAO.listBuiltin(db);
  res.json({ success: true, data: presets });
}));

// 详情
router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const preset = StylePresetDAO.getById(db, req.params.id);
  if (!preset) throw createError(404, 'NOT_FOUND', '风格预设不存在');
  res.json({ success: true, data: preset });
}));

// 创建自定义预设
router.post('/', validateBody(presetSchema), asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const preset = StylePresetDAO.create(db, req.body);
  res.json({ success: true, data: preset });
}));

// 更新自定义预设
router.put('/:id', validateBody(presetSchema.partial()), asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const existing = StylePresetDAO.getById(db, req.params.id);
  if (!existing) throw createError(404, 'NOT_FOUND', '风格预设不存在');
  if (existing.is_builtin === 1) throw createError(403, 'FORBIDDEN', '内置预设不可修改');
  const updated = StylePresetDAO.update(db, req.params.id, req.body);
  res.json({ success: true, data: updated });
}));

// 删除自定义预设
router.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const existing = StylePresetDAO.getById(db, req.params.id);
  if (!existing) throw createError(404, 'NOT_FOUND', '风格预设不存在');
  if (existing.is_builtin === 1) throw createError(403, 'FORBIDDEN', '内置预设不可删除');
  StylePresetDAO.delete(db, req.params.id);
  res.json({ success: true, data: { message: '风格预设已删除' } });
}));

// 应用预设到项目
router.post('/:id/apply-to-project/:projectId', asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const preset = StylePresetDAO.getById(db, req.params.id);
  if (!preset) throw createError(404, 'NOT_FOUND', '风格预设不存在');
  const project = ProjectDAO.getByIdAndUser(db, req.params.projectId, req.user.id);
  if (!project) throw createError(404, 'NOT_FOUND', '项目不存在');

  ProjectDAO.update(db, req.params.projectId, {
    style_preset_id: preset.id,
  } as any);

  res.json({ success: true, data: { message: '风格已应用', preset } });
}));

export default router;
