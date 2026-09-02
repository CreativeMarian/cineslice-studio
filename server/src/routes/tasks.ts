// 异步任务路由（P1）
// v1.0

import { Router, Request, Response } from 'express';
import { GenerationTaskDAO } from '../models';
import { createError, asyncHandler } from '../middleware/errorHandler';
import type { Database } from '../types';

const router = Router();

function getDb(req: Request): Database {
  return req.app.locals.db as Database;
}

// 任务列表
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const status = req.query.status as string | undefined;
  const projectId = req.query.projectId as string | undefined;

  const result = GenerationTaskDAO.list(db, req.user.id, { status, projectId, page, limit });
  res.json({ success: true, data: { items: result.items, total: result.total, page, limit } });
}));

// 任务详情
router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const task = GenerationTaskDAO.getByIdAndUser(db, req.params.id, req.user.id);
  if (!task) throw createError(404, 'NOT_FOUND', '任务不存在');
  res.json({ success: true, data: task });
}));

// 取消任务
router.post('/:id/cancel', asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const task = GenerationTaskDAO.getByIdAndUser(db, req.params.id, req.user.id);
  if (!task) throw createError(404, 'NOT_FOUND', '任务不存在');
  if (task.status === 'completed' || task.status === 'failed') {
    throw createError(400, 'VALIDATION_ERROR', '任务已结束，无法取消');
  }
  GenerationTaskDAO.cancel(db, task.id);
  res.json({ success: true, data: { message: '任务已取消' } });
}));

export default router;
