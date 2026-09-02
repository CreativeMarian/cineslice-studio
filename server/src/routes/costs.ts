// 成本统计路由
// v1.0

import { Router, Request, Response } from 'express';
import { CostRecordDAO } from '../models';
import { asyncHandler } from '../middleware/errorHandler';
import type { Database } from '../types';

const router = Router();

function getDb(req: Request): Database {
  return req.app.locals.db as Database;
}

// 成本汇总（可选 days 天数窗口，默认 30 天；days=0 表示全部）
router.get('/summary', asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const days = parseInt(req.query.days as string, 10);
  let since: string | undefined;
  if (days && days > 0) {
    const d = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    since = d.toISOString();
  }
  const summary = CostRecordDAO.getSummary(db, req.user.id, since);
  res.json({ success: true, data: summary });
}));

// 最近成本记录明细
router.get('/records', asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const limit = Math.min(parseInt(req.query.limit as string, 10) || 100, 500);
  const records = CostRecordDAO.listByUser(db, req.user.id, limit);
  res.json({ success: true, data: records });
}));

export default router;
