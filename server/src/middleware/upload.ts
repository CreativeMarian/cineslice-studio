// multer 上传配置（单文件 10MB，存储到 uploads/）
// v1.0

import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { createError } from './errorHandler';
import { getConfig } from '../config/env';
import { decodeFilename } from '../utils/filename';

const config = getConfig();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // 路由参数为 :id（如 /api/projects/:id/novel/upload），兼容 projectId
    const projectId = req.params.id || req.params.projectId || 'general';
    const dir = path.resolve(config.uploadDir, projectId);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    // 修复 Windows 下中文文件名编码问题（multer 以 latin1 解析文件名）
    const originalName = decodeFilename(file.originalname);
    const safeName = originalName.replace(/[^\w.\-\u4e00-\u9fa5]/g, '_');
    cb(null, `${Date.now()}_${safeName}`);
  },
});

// 小说文件上传（.txt, .md）
export const novelUpload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.txt', '.md'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext) || file.mimetype === 'text/plain' || file.mimetype === 'text/markdown') {
      cb(null, true);
    } else {
      cb(createError(400, 'VALIDATION_ERROR', '仅支持 .txt 和 .md 文件') as any, false);
    }
  },
});

// 参考图上传（图片）
export const imageUpload = multer({
  storage,
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

// ZIP 导入上传
export const zipUpload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.zip' || file.mimetype === 'application/zip' || file.mimetype === 'application/x-zip-compressed') {
      cb(null, true);
    } else {
      cb(createError(400, 'VALIDATION_ERROR', '仅支持 .zip 文件') as any, false);
    }
  },
});
