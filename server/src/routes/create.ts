// 自由创作工作台 API（不绑定小说/剧集项目）
// 提供：文生图 / 图生图 / 文生视频 / 图生视频 / 参考图上传 / 视频任务查询
// 产物统一存入 creative_<userId> 空间，与流水线项目完全隔离

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { aiProxy } from '../services/aiProxy';
import { imageToDataUrl } from '../services/shotConsistencyService';
import { createError, asyncHandler } from '../middleware/errorHandler';
import { validateBody } from '../middleware/validate';
import { getConfig } from '../config/env';
import type { Database } from '../types';

const config = getConfig();
const router = Router();

function getDb(req: Request): Database {
  return req.app.locals.db as Database;
}

function creativeProjectId(userId: string): string {
  return `creative_${userId}`;
}

/** 参考图 URL → 适配器可读格式：http(s) 直传；/data、/uploads 本地路径转 base64 */
function referenceToDataUrl(url: string): string {
  if (/^https?:\/\//.test(url) || /^data:/.test(url)) return url;
  if (url.startsWith('/data/')) return imageToDataUrl(url);
  if (url.startsWith('/uploads/')) {
    try {
      const localPath = path.resolve(config.uploadDir, url.replace(/^\/uploads\//, ''));
      if (fs.existsSync(localPath)) {
        const buffer = fs.readFileSync(localPath);
        const ext = path.extname(localPath).slice(1) || 'png';
        const mimeType = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
        return `data:${mimeType};base64,${buffer.toString('base64')}`;
      }
    } catch { /* 回退原 URL */ }
  }
  return url;
}

// ============ 参考图上传 ============

const creativeUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = path.resolve(config.uploadDir, 'creative');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const originalName = (file.originalname || 'reference').replace(/[^\w.\-\u4e00-\u9fa5]/g, '_');
      cb(null, `${Date.now()}_${originalName}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext) || file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(createError(400, 'VALIDATION_ERROR', '仅支持图片文件') as any, false);
    }
  },
});

// 上传创作参考图（图生图 / 图生视频用）
router.post('/upload', creativeUpload.single('file'), asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) throw createError(400, 'VALIDATION_ERROR', '请上传图片');
  const urlPath = `/uploads/creative/${req.file.filename}`;
  res.json({ success: true, data: { url: urlPath, name: req.file.originalname } });
}));

// ============ 图片 ============

const IMAGE_SIZES = ['512x512', '1024x1024', '1024x1792', '1792x1024', '2048x2048', '2048x1152', '2560x1440', '1440x2560'] as const;

const imageGenSchema = z.object({
  provider: z.string(),
  modelName: z.string(),
  prompt: z.string().min(1),
  negativePrompt: z.string().optional(),
  size: z.enum(IMAGE_SIZES).optional(),
  count: z.number().int().min(1).max(4).optional(),
  style: z.string().optional(),
});

// 文生图
router.post('/image', validateBody(imageGenSchema), asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const result = await aiProxy.generateImage({
    db,
    userId: req.user.id,
    projectId: creativeProjectId(req.user.id),
    provider: req.body.provider,
    modelName: req.body.modelName,
    prompt: req.body.prompt,
    negativePrompt: req.body.negativePrompt,
    size: req.body.size,
    count: req.body.count,
    style: req.body.style,
    saveSubDir: 'images',
  });
  res.json({ success: true, data: result });
}));

// 图生图（至少 1 张参考图）
const imageEditSchema = imageGenSchema.extend({
  referenceImages: z.array(z.string()).min(1, '图生图需要至少 1 张参考图'),
});
router.post('/image-edit', validateBody(imageEditSchema), asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const result = await aiProxy.generateImage({
    db,
    userId: req.user.id,
    projectId: creativeProjectId(req.user.id),
    provider: req.body.provider,
    modelName: req.body.modelName,
    prompt: req.body.prompt,
    negativePrompt: req.body.negativePrompt,
    size: req.body.size,
    count: req.body.count,
    style: req.body.style,
    referenceImages: req.body.referenceImages.map(referenceToDataUrl),
    saveSubDir: 'images',
  });
  res.json({ success: true, data: result });
}));

// ============ 视频 ============

const VIDEO_RATIOS = ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'] as const;
const VIDEO_RESOLUTIONS = ['720p', '1080p', '2k', '4k'] as const;

const videoGenSchema = z.object({
  provider: z.string(),
  modelName: z.string(),
  prompt: z.string().optional(),
  duration: z.number().min(1).max(30).optional(),
  ratio: z.enum(VIDEO_RATIOS).optional(),
  resolution: z.enum(VIDEO_RESOLUTIONS).optional(),
  subtitles: z.boolean().optional(),
});

// 文生视频
router.post('/video', validateBody(videoGenSchema), asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const result = await aiProxy.generateVideo({
    db,
    userId: req.user.id,
    projectId: creativeProjectId(req.user.id),
    provider: req.body.provider,
    modelName: req.body.modelName,
    prompt: req.body.prompt,
    duration: req.body.duration,
    ratio: req.body.ratio,
    resolution: req.body.resolution,
    subtitles: req.body.subtitles,
  });
  res.json({ success: true, data: result });
}));

// 图生视频（首帧必传，尾帧/参考图可选，支持首尾帧插值）
const videoFromImageSchema = videoGenSchema.extend({
  firstFrameImageUrl: z.string().min(1, '图生视频需要首帧图片'),
  lastFrameImageUrl: z.string().optional(),
  referenceImages: z.array(z.string()).optional(),
});
router.post('/video-from-image', validateBody(videoFromImageSchema), asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const result = await aiProxy.generateVideo({
    db,
    userId: req.user.id,
    projectId: creativeProjectId(req.user.id),
    provider: req.body.provider,
    modelName: req.body.modelName,
    prompt: req.body.prompt,
    duration: req.body.duration,
    ratio: req.body.ratio,
    resolution: req.body.resolution,
    subtitles: req.body.subtitles,
    firstFrameImageUrl: referenceToDataUrl(req.body.firstFrameImageUrl),
    lastFrameImageUrl: req.body.lastFrameImageUrl ? referenceToDataUrl(req.body.lastFrameImageUrl) : undefined,
    referenceImages: req.body.referenceImages && req.body.referenceImages.length > 0
      ? req.body.referenceImages.map(referenceToDataUrl)
      : undefined,
  });
  res.json({ success: true, data: result });
}));

// 查询视频任务状态（轮询）
const videoStatusSchema = z.object({
  provider: z.string(),
  modelName: z.string(),
  taskId: z.string(),
});
router.post('/video/status', validateBody(videoStatusSchema), asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const result = await aiProxy.getVideoTask({
    db,
    userId: req.user.id,
    provider: req.body.provider,
    modelName: req.body.modelName,
    taskId: req.body.taskId,
  });
  res.json({ success: true, data: result });
}));

export default router;
