// 视频合成服务
// v1.0
// 使用 ffmpeg 将多个分镜视频片段合成为完整剧集视频

import { execFile } from 'child_process';
import path from 'path';
import fs from 'fs';
import { promisify } from 'util';
import type { Database } from '../types';
import {
  NovelEpisodeDAO,
  ShotDAO,
  ShotVideoIntervalDAO,
} from '../models';
import { projectStorage } from './projectStorage';
import { getConfig } from '../config/env';
import { createError as createHttpError } from '../middleware/errorHandler';
import { sanitizeFileName } from '../utils/filename';

const execFileAsync = promisify(execFile);

export interface ComposeOptions {
  transition?: 'none' | 'fade' | 'crossfade';
  transitionDuration?: number; // 秒
  outputResolution?: string; // 如 '1920x1080'
  fps?: number;
  bgmPath?: string; // 背景音乐本地路径
  bgmVolume?: number; // 0-1
}

export interface ComposeResult {
  taskId: string;
  status: 'processing' | 'completed' | 'failed';
  /** 到达终态的时间（用于内存任务表的 TTL 清理） */
  completedAt?: string;
  outputUrl?: string;
  outputPath?: string;
  progress?: number;
  error?: string;
  totalClips: number;
  completedClips: number;
}

// 内存中的合成任务状态
const composeTasks = new Map<string, ComposeResult>();

/**
 * 获取 ffmpeg 可执行文件路径
 * 优先使用 ffmpeg-static，其次使用系统 PATH 中的 ffmpeg
 */
function getFfmpegPath(): string {
  try {
    // 尝试 ffmpeg-static（可选依赖，缺失时降级到系统 ffmpeg）
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ffmpegStatic = require('ffmpeg-static');
    if (ffmpegStatic && typeof ffmpegStatic === 'string' && fs.existsSync(ffmpegStatic)) {
      return ffmpegStatic;
    }
  } catch {
    // ffmpeg-static 未安装，继续尝试系统 ffmpeg
  }
  return 'ffmpeg'; // 依赖系统 PATH
}

/**
 * 检查 ffmpeg 是否可用
 */
export async function checkFfmpegAvailable(): Promise<boolean> {
  try {
    const ffmpeg = getFfmpegPath();
    await execFileAsync(ffmpeg, ['-version'], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}


/**
 * 收集某集所有已完成的视频片段
 */
function collectVideoClips(db: Database, episodeId: string): Array<{ shotId: string; shotNumber: number; videoPath: string | null; duration: number }> {
  const shots = ShotDAO.listByEpisode(db, episodeId);
  const clips: Array<{ shotId: string; shotNumber: number; videoPath: string | null; duration: number }> = [];

  for (const shot of shots) {
    const intervals = ShotVideoIntervalDAO.listByShot(db, shot.id);
    // 取最新的已完成视频
    const completed = intervals
      .filter(v => v.status === 'completed' && v.video_url)
      .sort((a, b) => new Date(b.completed_at || 0).getTime() - new Date(a.completed_at || 0).getTime())[0];

    if (completed && completed.video_url) {
      const localPath = resolveVideoPathFromUrl(completed.video_url);
      clips.push({
        shotId: shot.id,
        shotNumber: shot.shot_number,
        videoPath: localPath,
        duration: completed.duration_seconds || shot.duration_seconds || 5,
      });
    } else {
      clips.push({
        shotId: shot.id,
        shotNumber: shot.shot_number,
        videoPath: null,
        duration: shot.duration_seconds || 5,
      });
    }
  }

  return clips;
}

/**
 * 从 URL 解析本地路径（使用项目存储配置）
 */
function resolveVideoPathFromUrl(videoUrl: string): string | null {
  if (!videoUrl) return null;
  try {
    if (videoUrl.startsWith('/data/')) {
      const local = projectStorage.toLocalPath(videoUrl);
      return fs.existsSync(local) ? local : null;
    }
    if (videoUrl.startsWith('/uploads/')) {
      // uploads 目录从 env 获取
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

/**
 * 生成黑色占位视频（用于没有视频片段的镜头）
 */
async function generatePlaceholder(outputPath: string, duration: number, resolution: string): Promise<void> {
  const ffmpeg = getFfmpegPath();
  const [width, height] = resolution.split('x').map(Number);
  await execFileAsync(ffmpeg, [
    '-f', 'lavfi',
    '-i', `color=c=black:s=${width}x${height}:d=${duration}`,
    '-c:v', 'libx264',
    '-t', String(duration),
    '-y',
    outputPath,
  ], { timeout: 30000 });
}

/**
 * 获取视频时长（秒），通过解析 ffmpeg -i 输出
 */
async function getVideoDuration(ffmpeg: string, videoPath: string): Promise<number> {
  try {
    await execFileAsync(ffmpeg, ['-i', videoPath], { timeout: 15000 });
  } catch (err: any) {
    const stderr: string = (err.stderr || err.message || '') as string;
    const match = stderr.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/);
    if (match) {
      const h = parseInt(match[1], 10);
      const m = parseInt(match[2], 10);
      const s = parseFloat(match[3]);
      return h * 3600 + m * 60 + s;
    }
  }
  return 5; // fallback 默认 5 秒
}

/**
 * 使用 xfade 滤镜实现带淡入淡出转场的视频合成
 */
async function composeWithXfade(
  ffmpeg: string,
  clips: string[],
  outputPath: string,
  transitionDur: number,
  resolution: string,
  fps: number,
  tempDir: string,
): Promise<void> {
  // 1. 统一所有片段编码参数（确保 xfade 兼容）
  const normalized: string[] = [];
  for (let i = 0; i < clips.length; i++) {
    const normPath = path.resolve(tempDir, `norm_${i}.mp4`);
    await execFileAsync(ffmpeg, [
      '-i', clips[i],
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '23',
      '-pix_fmt', 'yuv420p', '-r', String(fps), '-s', resolution,
      '-c:a', 'aac', '-b:a', '192k', '-ar', '44100', '-ac', '2',
      '-y', normPath,
    ], { timeout: 300000, maxBuffer: 1024 * 1024 * 50 });
    normalized.push(normPath);
  }

  // 2. 获取每个片段时长
  const durations: number[] = [];
  for (const clip of normalized) {
    durations.push(await getVideoDuration(ffmpeg, clip));
  }

  // 3. 构建链式 xfade filter_complex
  const inputs: string[] = [];
  for (let i = 0; i < normalized.length; i++) {
    inputs.push('-i', normalized[i]);
  }

  const filterParts: string[] = [];
  let prevLabel = '[0:v]';
  let cumulative = durations[0];

  for (let i = 1; i < normalized.length; i++) {
    const offset = Math.max(0, cumulative - transitionDur);
    const outLabel = i === normalized.length - 1 ? '[vout]' : `[v${i}]`;
    filterParts.push(`${prevLabel}[${i}:v]xfade=transition=fade:duration=${transitionDur}:offset=${offset}${outLabel}`);
    prevLabel = outLabel;
    cumulative = cumulative + durations[i] - transitionDur;
  }

  const filterComplex = filterParts.join(';');

  // 4. 构建音频合并 filter（acrossfade 实现音频淡入淡出）
  const audioFilterParts: string[] = [];
  let prevAudioLabel = '[0:a]';
  let audioCumulative = durations[0];

  for (let i = 1; i < normalized.length; i++) {
    const outLabel = i === normalized.length - 1 ? '[aout]' : `[a${i}]`;
    audioFilterParts.push(`${prevAudioLabel}[${i}:a]acrossfade=d=${transitionDur}:c1=tri:c2=tri${outLabel}`);
    prevAudioLabel = outLabel;
    audioCumulative = audioCumulative + durations[i] - transitionDur;
  }

  const fullFilterComplex = audioFilterParts.length > 0
    ? `${filterComplex};${audioFilterParts.join(';')}`
    : filterComplex;

  // 5. 执行合成（视频+音频）
  const args = [
    ...inputs,
    '-filter_complex', fullFilterComplex,
    '-map', '[vout]',
    '-map', audioFilterParts.length > 0 ? '[aout]' : '[0:a]',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '23',
    '-pix_fmt', 'yuv420p', '-r', String(fps),
    '-c:a', 'aac', '-b:a', '192k', '-ar', '44100', '-ac', '2',
    '-shortest',
    '-y', outputPath,
  ];

  await execFileAsync(ffmpeg, args, { timeout: 600000, maxBuffer: 1024 * 1024 * 100 });
}

/**
 * 执行视频合成
 */
export async function composeEpisode(
  db: Database,
  episodeId: string,
  userId: string,
  options: ComposeOptions = {}
): Promise<ComposeResult> {
  const taskId = `compose_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const episode = NovelEpisodeDAO.getByIdAndUser(db, episodeId, userId);
  if (!episode) {
    throw createHttpError(404, 'NOT_FOUND', '剧集不存在');
  }

  // bgmPath 只允许项目音频目录内的基础文件名，阻断任意本地文件读取
  if (options.bgmPath) {
    const safeBgm = sanitizeFileName(options.bgmPath);
    if (!safeBgm) {
      throw createHttpError(400, 'VALIDATION_ERROR', 'BGM 文件名不合法');
    }
    options.bgmPath = path.resolve(projectStorage.getAudioDir(episode.project_id), safeBgm);
  }

  const ffmpegAvailable = await checkFfmpegAvailable();
  if (!ffmpegAvailable) {
    const result: ComposeResult = {
      taskId,
      status: 'failed',
      error: 'ffmpeg 未安装，请安装 ffmpeg 或 ffmpeg-static 后重试',
      totalClips: 0,
      completedClips: 0,
    };
    composeTasks.set(taskId, result);
    return result;
  }

  const clips = collectVideoClips(db, episodeId);
  const validClips = clips.filter(c => c.videoPath);

  if (validClips.length === 0) {
    const result: ComposeResult = {
      taskId,
      status: 'failed',
      error: '没有可用的视频片段，请先生成分镜视频',
      totalClips: clips.length,
      completedClips: 0,
    };
    composeTasks.set(taskId, result);
    return result;
  }

  // 初始化任务状态
  const taskResult: ComposeResult = {
    taskId,
    status: 'processing',
    totalClips: clips.length,
    completedClips: 0,
    progress: 0,
  };
  composeTasks.set(taskId, taskResult);

  // 异步执行合成
  (async () => {
    // tempDir 提升到 try 外：失败清理路径需要引用它
    let tempDir: string | null = null;
    try {
      const projectId = episode.project_id;
      const videosDir = projectStorage.getVideosDir(projectId);
      projectStorage.ensureDir(videosDir);

      const outputFileName = `episode_${episode.episode_number}_${Date.now()}.mp4`;
      const outputPath = path.resolve(videosDir, outputFileName);
      const outputUrl = projectStorage.toUrlPath(outputPath);

      const resolution = options.outputResolution || '1920x1080';
      const fps = options.fps || 24;
      const transition = options.transition || 'none';
      const transitionDur = options.transitionDuration || 0.5;

      // 为没有视频的镜头生成占位
      tempDir = path.resolve(videosDir, `temp_${taskId}`);
      projectStorage.ensureDir(tempDir);

      const finalClips: string[] = [];
      for (let i = 0; i < clips.length; i++) {
        const clip = clips[i];
        if (clip.videoPath) {
          finalClips.push(clip.videoPath);
        } else {
          const placeholderPath = path.resolve(tempDir, `placeholder_${i}.mp4`);
          await generatePlaceholder(placeholderPath, clip.duration, resolution);
          finalClips.push(placeholderPath);
        }
        taskResult.completedClips = i + 1;
        taskResult.progress = Math.round(((i + 1) / clips.length) * 30);
      }

      // 生成 concat 列表文件
      const listFile = path.resolve(tempDir, 'concat.txt');
      const listContent = finalClips.map(p => `file '${p.replace(/'/g, "'\\''")}'`).join('\n');
      fs.writeFileSync(listFile, listContent, 'utf-8');

      taskResult.progress = 40;

      const ffmpeg = getFfmpegPath();

      if (transition === 'none' || finalClips.length <= 1) {
        // 简单拼接（重新编码以保证兼容性）
        const args = [
          '-f', 'concat',
          '-safe', '0',
          '-i', listFile,
          '-c:v', 'libx264',
          '-preset', 'medium',
          '-crf', '23',
          '-pix_fmt', 'yuv420p',
          '-r', String(fps),
          '-s', resolution,
        ];

        // 背景音乐
        if (options.bgmPath && fs.existsSync(options.bgmPath)) {
          args.push('-i', options.bgmPath);
          args.push('-c:a', 'aac');
          args.push('-b:a', '192k');
          args.push('-shortest');
          if (options.bgmVolume !== undefined) {
            args.push('-filter:a', `volume=${options.bgmVolume}`);
          }
        } else {
          // 保留原始视频音频
          args.push('-c:a', 'aac');
          args.push('-b:a', '192k');
          args.push('-ar', '44100');
          args.push('-ac', '2');
        }

        args.push('-y', outputPath);

        await execFileAsync(ffmpeg, args, { timeout: 600000, maxBuffer: 1024 * 1024 * 100 });
      } else {
        // 带转场的复杂合成：使用 xfade 滤镜实现淡入淡出
        await composeWithXfade(ffmpeg, finalClips, outputPath, transitionDur, resolution, fps, tempDir);
      }

      taskResult.progress = 100;
      taskResult.status = 'completed';
      taskResult.completedAt = new Date().toISOString();
      taskResult.outputPath = outputPath;
      taskResult.outputUrl = outputUrl;

      // 清理临时文件
      try {
        if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // ignore cleanup errors
      }
    } catch (err) {
      taskResult.status = 'failed';
      taskResult.completedAt = new Date().toISOString();
      taskResult.error = (err as Error).message;
      // 失败路径同样清理临时目录：归一化片段是全分辨率重编码产物，一次失败可能泄漏数百 MB
      try {
        if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // ignore cleanup errors
      }
    }
  })();

  // composeTasks 只增不删会随进程生命周期无限膨胀，且状态查询接口会把
  // 任意历史任务的绝对路径暴露出去 —— 终态任务保留 30 分钟后移除
  const TERMINAL_TTL_MS = 30 * 60 * 1000;
  const nowMs = Date.now();
  for (const [id, t] of composeTasks) {
    if ((t.status === 'completed' || t.status === 'failed') && t.completedAt) {
      if (nowMs - new Date(t.completedAt).getTime() > TERMINAL_TTL_MS) {
        composeTasks.delete(id);
      }
    }
  }

  return taskResult;
}

/**
 * 查询合成任务状态
 */
export function getComposeStatus(taskId: string): ComposeResult | null {
  return composeTasks.get(taskId) || null;
}

/**
 * 获取某集最近的合成结果
 */
export function getLatestCompose(_episodeId: string): ComposeResult | null {
  // 简单实现：返回所有已完成的任务中最新的
  let latest: ComposeResult | null = null;
  for (const task of composeTasks.values()) {
    if (task.status === 'completed' && task.outputUrl) {
      if (!latest || task.taskId > latest.taskId) {
        latest = task;
      }
    }
  }
  return latest;
}
