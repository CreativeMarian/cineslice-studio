// 用户偏好路由
// v1.0

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { UserPreferenceDAO } from '../models';
import { asyncHandler } from '../middleware/errorHandler';
import { validateBody } from '../middleware/validate';
import type { Database } from '../types';

const router = Router();

function getDb(req: Request): Database {
  return req.app.locals.db as Database;
}

const preferenceSchema = z.object({
  theme: z.enum(['light', 'dark', 'system']).optional(),
  onboarding_completed: z.boolean().optional(),
  default_text_model: z.string().optional(),
  default_image_model: z.string().optional(),
  default_video_model: z.string().optional(),
  default_audio_model: z.string().optional(),
  preferences: z.string().optional(),
});

// 获取偏好
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const pref = UserPreferenceDAO.getOrCreate(db, req.user.id);
  res.json({ success: true, data: pref });
}));

// 更新偏好
router.put('/', validateBody(preferenceSchema), asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const data: any = { ...req.body };
  if (typeof data.onboarding_completed === 'boolean') {
    data.onboarding_completed = data.onboarding_completed ? 1 : 0;
  }
  const pref = UserPreferenceDAO.update(db, req.user.id, data);
  res.json({ success: true, data: pref });
}));

export default router;
