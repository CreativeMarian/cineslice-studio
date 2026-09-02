// 视觉风格路由（P1）
// v1.0

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { VisualStyleDAO } from '../models';
import { createError, asyncHandler } from '../middleware/errorHandler';
import { validateBody } from '../middleware/validate';
import type { Database } from '../types';

const router = Router();

function getDb(req: Request): Database {
  return req.app.locals.db as Database;
}

const styleSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  style_prompt: z.string(),
  negative_prompt: z.string().optional(),
  thumbnail_url: z.string().url().optional(),
  is_global: z.boolean().optional(),
});

// 列表
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const styles = VisualStyleDAO.listByUser(db, req.user.id);
  res.json({ success: true, data: styles });
}));

// 创建
router.post('/', validateBody(styleSchema), asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const style = VisualStyleDAO.create(db, { user_id: req.user.id, ...req.body });
  res.json({ success: true, data: style });
}));

// 更新
router.put('/:id', validateBody(styleSchema.partial()), asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const style = VisualStyleDAO.getById(db, req.params.id);
  if (!style || style.user_id !== req.user.id) throw createError(404, 'NOT_FOUND', '视觉风格不存在');
  const updated = VisualStyleDAO.update(db, req.params.id, req.body);
  res.json({ success: true, data: updated });
}));

// 删除
router.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const style = VisualStyleDAO.getById(db, req.params.id);
  if (!style || style.user_id !== req.user.id) throw createError(404, 'NOT_FOUND', '视觉风格不存在');
  VisualStyleDAO.delete(db, req.params.id);
  res.json({ success: true, data: { message: '视觉风格已删除' } });
}));

export default router;
