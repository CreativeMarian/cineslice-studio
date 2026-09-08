// 项目文件路径管理
// v1.0

import path from 'path';
import fs from 'fs';
import { getConfig } from '../config/env';

const config = getConfig();

export const projectStorage = {
  getDataDir(projectId: string): string {
    return path.resolve(config.dataDir, projectId);
  },

  getCharactersDir(projectId: string): string {
    return path.resolve(config.dataDir, projectId, 'characters');
  },

  getScenesDir(projectId: string): string {
    return path.resolve(config.dataDir, projectId, 'scenes');
  },

  getKeyframesDir(projectId: string): string {
    return path.resolve(config.dataDir, projectId, 'keyframes');
  },

  getVideosDir(projectId: string): string {
    return path.resolve(config.dataDir, projectId, 'videos');
  },

  getAudioDir(projectId: string): string {
    return path.resolve(config.dataDir, projectId, 'audio');
  },

  getUploadsDir(projectId: string): string {
    return path.resolve(config.uploadDir, projectId);
  },

  ensureDir(dir: string): void {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  },

  // 生成唯一文件名
  generateFileName(extension = 'png'): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 10);
    return `${timestamp}_${random}.${extension}`;
  },

  // 本地路径转 URL 路径
  toUrlPath(localPath: string): string {
    const relative = path.relative(config.dataDir, localPath);
    return `/data/${relative.replace(/\\/g, '/')}`;
  },

  // URL 路径转本地路径
  toLocalPath(urlPath: string): string {
    const clean = urlPath.replace(/^\/data\//, '');
    // 防目录穿越：拒绝 .. 片段（DB 中异常/恶意 URL 不得逃出数据目录）
    if (!clean || clean.includes('..')) return '';
    return path.resolve(config.dataDir, clean);
  },
};
