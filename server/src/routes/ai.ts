// AI 生成代理入口路由
// v1.0 - 提供通用的 AI 文本/图像生成接口

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { aiProxy } from '../services/aiProxy';
import { asyncHandler } from '../middleware/errorHandler';
import { validateBody } from '../middleware/validate';
import type { Database } from '../types';

const router = Router();

function getDb(req: Request): Database {
  return req.app.locals.db as Database;
}

const textSchema = z.object({
  provider: z.string(),
  modelName: z.string(),
  prompt: z.string(),
  systemPrompt: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(1).max(32768).optional(),
  topP: z.number().min(0).max(1).optional(),
  responseFormat: z.enum(['text', 'json']).optional(),
});

const imageSchema = z.object({
  projectId: z.string(),
  provider: z.string(),
  modelName: z.string(),
  prompt: z.string(),
  negativePrompt: z.string().optional(),
  size: z.enum(['512x512', '1024x1024', '1024x1792', '1792x1024', '2048x2048', '2048x1152', '2560x1440', '1440x2560']).optional(),
  count: z.number().int().min(1).max(4).optional(),
  referenceImages: z.array(z.string()).optional(),
  style: z.string().optional(),
});

const audioSchema = z.object({
  provider: z.string(),
  modelName: z.string(),
  text: z.string().min(1),
  voice: z.string().optional(),
  speed: z.number().min(0.25).max(4).optional(),
});

// 通用文本生成
router.post('/text', validateBody(textSchema), asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const result = await aiProxy.generateText({
    db,
    userId: req.user.id,
    ...req.body,
  });
  res.json({ success: true, data: result });
}));

// 通用图像生成
router.post('/image', validateBody(imageSchema), asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const result = await aiProxy.generateImage({
    db,
    userId: req.user.id,
    ...req.body,
  });
  res.json({ success: true, data: result });
}));

// 通用音频生成（TTS）
router.post('/audio', validateBody(audioSchema), asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const result = await aiProxy.generateAudio({
    db,
    userId: req.user.id,
    ...req.body,
  });
  res.json({ success: true, data: result });
}));

export default router;
