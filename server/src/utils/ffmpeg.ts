// 共享 ffmpeg 工具（P3-6 去重）
// 统一封装 getFfmpegPath / checkFfmpegAvailable / resolveVideoPathFromUrl，
// 此前在 segmentService / videoComposer / audioComposer / videoQualityGate 中各自实现了一份。
// 注意：normalizeClip（归一化片段）在 segmentService（letterbox 补边）与
// videoComposer（-s 硬裁）中缩放策略不同，保留各自实现，不强行合并。

import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { projectStorage } from '../services/projectStorage';
import { getConfig } from '../config/env';

const execFileAsync = promisify(execFile);

/**
 * 获取 ffmpeg 可执行文件路径
 * 优先使用 ffmpeg-static（可选依赖），缺失时降级到系统 PATH 中的 ffmpeg
 * @returns ffmpeg 可执行文件路径字符串
 */
export function getFfmpegPath(): string {
  try {
    // ffmpeg-static 为可选依赖，缺失时降级到系统 ffmpeg
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ffmpegStatic = require('ffmpeg-static');
    if (ffmpegStatic && typeof ffmpegStatic === 'string' && fs.existsSync(ffmpegStatic)) {
      return ffmpegStatic;
    }
  } catch {
    // ffmpeg-static 未安装，继续尝试系统 ffmpeg
  }
  return 'ffmpeg';
}

/**
 * 检查 ffmpeg 是否可用（执行 `ffmpeg -version` 探测）
 * @returns true=可用；false=不可用或执行失败
 */
export async function checkFfmpegAvailable(): Promise<boolean> {
  try {
    await execFileAsync(getFfmpegPath(), ['-version'], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * 从视频/音频 URL 解析本地路径
 * - /data/ 前缀 → projectStorage 数据目录
 * - /uploads/ 前缀 → env.uploadDir 上传目录
 * - 绝对路径 → 直接校验存在性
 * @param videoUrl 相对 URL（/data/...、/uploads/...）或本地绝对路径
 * @returns 本地绝对路径；无法解析或文件不存在时返回 null
 */
export function resolveVideoPathFromUrl(videoUrl: string): string | null {
  if (!videoUrl) return null;
  try {
    if (videoUrl.startsWith('/data/')) {
      const local = projectStorage.toLocalPath(videoUrl);
      return fs.existsSync(local) ? local : null;
    }
    if (videoUrl.startsWith('/uploads/')) {
      const cfg = getConfig();
      const local = path.resolve(cfg.uploadDir, videoUrl.replace(/^\/uploads\//, ''));
      return fs.existsSync(local) ? local : null;
    }
    if (path.isAbsolute(videoUrl) && fs.existsSync(videoUrl)) {
      return videoUrl;
    }
  } catch {
    // ignore
  }
  return null;
}
