// 音频合成服务
// v1.0
// 使用 ffmpeg 将配音 + 音效 + BGM 合成为一条音轨
// 音量平衡：配音最响 > 音效 > BGM 最底，淡入淡出

import { execFile } from 'child_process';
import path from 'path';
import fs from 'fs';
import { promisify } from 'util';
import { projectStorage } from './projectStorage';

const execFileAsync = promisify(execFile);

export interface AudioTrack {
  path: string;       // 本地文件路径
  type: 'voice' | 'sfx' | 'bgm';
  volume: number;     // 0-1
  startAt?: number;   // 从第几秒开始（用于对齐分镜）
  duration?: number;  // 持续时长（秒），不填则用文件实际时长
  fadeIn?: number;    // 淡入时长（秒）
  fadeOut?: number;   // 淡出时长（秒）
}

export interface AudioComposeResult {
  success: boolean;
  outputPath?: string;
  outputUrl?: string;
  durationSeconds?: number;
  error?: string;
}

/** 获取 ffmpeg 路径 */
function getFfmpegPath(): string {
  try {
    // ffmpeg-static 为可选依赖，缺失时降级到系统 ffmpeg
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ffmpegStatic = require('ffmpeg-static');
    if (ffmpegStatic && typeof ffmpegStatic === 'string' && fs.existsSync(ffmpegStatic)) {
      return ffmpegStatic;
    }
  } catch {
    // ffmpeg-static 未安装
  }
  return 'ffmpeg';
}

/** 检查 ffmpeg 是否可用 */
export async function checkFfmpegAvailable(): Promise<boolean> {
  try {
    await execFileAsync(getFfmpegPath(), ['-version']);
    return true;
  } catch {
    return false;
  }
}

/**
 * 获取音频文件时长（秒），通过解析 ffmpeg -i 的 stderr 输出
 */
async function getAudioDuration(ffmpeg: string, audioPath: string): Promise<number> {
  try {
    await execFileAsync(ffmpeg, ['-i', audioPath], { timeout: 10000 });
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
  return 0;
}

/**
 * 合成多条音轨为一条 mp3
 * 音量层级：voice(1.0) > sfx(0.6) > bgm(0.3)
 * 支持淡入淡出
 */
export async function composeAudio(
  projectId: string,
  tracks: AudioTrack[],
  outputFileName?: string,
): Promise<AudioComposeResult> {
  if (tracks.length === 0) {
    return { success: false, error: '没有音轨需要合成' };
  }

  const ffmpeg = getFfmpegPath();
  const audioDir = projectStorage.getAudioDir(projectId);
  projectStorage.ensureDir(audioDir);
  const outName = outputFileName || `mixed_${Date.now()}.mp3`;
  const outputPath = path.resolve(audioDir, outName);

  // 预探测有 fadeOut 的音轨时长（用于计算淡出起始时间）
  const trackDurations: number[] = [];
  for (const track of tracks) {
    if (track.fadeOut && track.fadeOut > 0) {
      trackDurations.push(await getAudioDuration(ffmpeg, track.path));
    } else {
      trackDurations.push(0);
    }
  }

  // 构建 ffmpeg 复杂滤镜
  const inputs: string[] = [];
  const filters: string[] = [];
  const mixLabels: string[] = [];

  tracks.forEach((track, i) => {
    inputs.push('-i', track.path);

    const vol = track.volume;
    const parts: string[] = [];

    // 音量调整
    parts.push(`volume=${vol}`);

    // 淡入
    if (track.fadeIn && track.fadeIn > 0) {
      parts.push(`afade=t=in:st=0:d=${track.fadeIn}`);
    }

    // 淡出（需要知道音轨时长才能计算起始时间）
    if (track.fadeOut && track.fadeOut > 0 && trackDurations[i] > track.fadeOut) {
      const fadeStart = trackDurations[i] - track.fadeOut;
      parts.push(`afade=t=out:st=${fadeStart.toFixed(3)}:d=${track.fadeOut}`);
    }

    // 延迟（对齐分镜时间轴）
    if (track.startAt && track.startAt > 0) {
      parts.push(`adelay=${Math.round(track.startAt * 1000)}|${Math.round(track.startAt * 1000)}`);
    }

    const filterStr = `[${i}:a]${parts.join(',')}[a${i}]`;
    filters.push(filterStr);
    mixLabels.push(`[a${i}]`);
  });

  // 混合所有音轨
  const mixFilter = `${mixLabels.join('')}amix=inputs=${tracks.length}:duration=longest:dropout_transition=0[out]`;
  filters.push(mixFilter);

  const args = [
    ...inputs,
    '-filter_complex', filters.join(';'),
    '-map', '[out]',
    '-acodec', 'libmp3lame',
    '-b:a', '192k',
    '-ar', '44100',
    '-ac', '2',
    '-y',
    outputPath,
  ];

  try {
    await execFileAsync(ffmpeg, args, { timeout: 120000 });

    if (!fs.existsSync(outputPath)) {
      return { success: false, error: '合成输出文件未生成' };
    }

    const outputUrl = projectStorage.toUrlPath(outputPath);
    return { success: true, outputPath, outputUrl };
  } catch (err: any) {
    return { success: false, error: err.message || 'ffmpeg 合成失败' };
  }
}

/**
 * 将音频轨与视频合并
 * @param videoPath 视频文件路径
 * @param audioPath 音频文件路径
 * @param outputPath 输出路径
 */
export async function mergeVideoAudio(
  videoPath: string,
  audioPath: string,
  outputPath: string,
): Promise<{ success: boolean; error?: string }> {
  const ffmpeg = getFfmpegPath();
  const args = [
    '-i', videoPath,
    '-i', audioPath,
    '-c:v', 'copy',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-shortest',
    '-y',
    outputPath,
  ];

  try {
    await execFileAsync(ffmpeg, args, { timeout: 180000 });
    return { success: fs.existsSync(outputPath) };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * 预设 BGM 音量配置
 */
export const BGM_PRESETS = {
  tense: { name: '紧张', volume: 0.25, fadeIn: 1, fadeOut: 2 },
  emotional: { name: '抒情', volume: 0.2, fadeIn: 2, fadeOut: 3 },
  cheerful: { name: '欢快', volume: 0.3, fadeIn: 0.5, fadeOut: 1 },
  suspense: { name: '悬疑', volume: 0.22, fadeIn: 1.5, fadeOut: 2 },
} as const;

export type BgmPreset = keyof typeof BGM_PRESETS;

/**
 * 根据分镜动作推荐音效类型
 */
export function recommendSfx(actionDescription: string): string[] {
  const desc = actionDescription.toLowerCase();
  const sfx: string[] = [];
  if (desc.match(/打|拳|踢|攻击|战斗|打斗|fight|punch|kick/)) sfx.push('打斗声');
  if (desc.match(/跑|追|rush|run/)) sfx.push('脚步声');
  if (desc.match(/门|door/)) sfx.push('开门声');
  if (desc.match(/雨|rain/)) sfx.push('雨声');
  if (desc.match(/风|wind/)) sfx.push('风声');
  if (desc.match(/爆炸|explosion|boom/)) sfx.push('爆炸声');
  if (desc.match(/枪|gun|shot/)) sfx.push('枪声');
  if (desc.match(/哭|cry|tear/)) sfx.push('哭泣声');
  if (desc.match(/笑|laugh/)) sfx.push('笑声');
  if (sfx.length === 0) sfx.push('环境音');
  return sfx;
}
