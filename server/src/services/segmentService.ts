// 分段（Segment）服务 — P2-2
// 一个 segment = 8-15秒 = 2-4个镜头
//   - aggregateSegments      — 调用 SegmentDAO.autoAggregate 聚合
//   - getSegmentsByEpisode   — 按集查询（读取时刷新段状态）
//   - generateSegmentVideo   — 按 segment 提交视频生成（聚合该段所有镜头的视频任务）
//   - retrySegment           — 单独重试某段（清理失败任务后重新提交）
//   - composeEpisodeFromSegments — 按 segment 顺序 concat 所有段视频为最终成片

import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

import type { Database, Segment, Shot, ShotVideoInterval } from '../types';
import {
  SegmentDAO,
  ShotDAO,
  ShotVideoIntervalDAO,
  NovelEpisodeDAO,
  UserPreferenceDAO,
} from '../models';
import { createError } from '../middleware/errorHandler';
import { ErrorCodes } from '../errors';
import { generateVideoForShot } from './episodeProductionService';
import { projectStorage } from './projectStorage';
import { getFfmpegPath, resolveVideoPathFromUrl } from '../utils/ffmpeg';

const execFileAsync = promisify(execFile);

export interface SegmentVideoOptions {
  provider: string;
  modelName: string;
  duration?: number;
  ratio?: '16:9' | '9:16' | '1:1' | '4:3' | '3:4' | '21:9';
  resolution?: '720p' | '1080p' | '2k' | '4k';
  subtitles?: boolean;
}

// ============ ffmpeg 工具（getFfmpegPath / resolveVideoPathFromUrl 已抽取至 utils/ffmpeg.ts） ============

/** 归一化片段：无音轨补静音轨，统一编码 + 统一分辨率/帧率（保证 concat demuxer 兼容） */
async function normalizeClipForConcat(ffmpeg: string, clip: string, outPath: string): Promise<void> {
  let hasAudio = false;
  try {
    await execFileAsync(ffmpeg, ['-v', 'error', '-i', clip, '-map', '0:a', '-f', 'null', '-'], { timeout: 60000 });
    hasAudio = true;
  } catch { hasAudio = false; }

  const args = [
    '-i', clip,
    '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo',
    '-map', '0:v',
    '-map', hasAudio ? '0:a' : '1:a',
    // P1-20: concat 前统一分辨率/帧率——1080p 30fps（缩放+补边居中，避免各段分辨率/帧率不一致导致 concat 报错或画面抖动）
    '-vf', 'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '23',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '192k', '-ar', '44100', '-ac', '2',
    '-shortest',
    '-y', outPath,
  ];
  await execFileAsync(ffmpeg, args, { timeout: 300000, maxBuffer: 1024 * 1024 * 50 });
}

// ============ 段内镜头 ============

/** 获取某段覆盖的镜头（shots.segment_id 存的是 segment_number，按镜头号升序） */
function getShotsForSegment(db: Database, segment: Segment): Shot[] {
  const shots = ShotDAO.listByEpisode(db, segment.episode_id);
  return shots
    .filter(s => s.segment_id === segment.segment_number)
    .sort((a, b) => a.shot_number - b.shot_number);
}

/** 计算段状态更新（纯函数）：全部镜头有完成视频 → completed；有失败 → failed；有处理中 → generating；无变化返回 null */
function computeSegmentStatusUpdate(segment: Segment, shots: Shot[], allVideos: ShotVideoInterval[]): Partial<Segment> | null {
  if (shots.length === 0) return null;

  // P1-8: 完成判定改为"每镜头至少一条 completed 视频"（按镜头去重），
  // 避免"单镜头有多条完成视频"时用条数比较误判
  const completedShotIds = new Set(
    allVideos.filter(v => v.status === 'completed' && v.video_url).map(v => v.shot_id)
  );
  const allCompleted = shots.every(s => completedShotIds.has(s.id));
  if (allCompleted) {
    if (segment.status !== 'completed') {
      return { status: 'completed', error_message: null };
    }
    return null;
  }

  const failedVideos = allVideos.filter(v => v.status === 'failed');
  if (failedVideos.length > 0) {
    if (segment.status !== 'failed') {
      return {
        status: 'failed',
        error_message: failedVideos[0]?.error_message || '段内有镜头视频生成失败',
      };
    }
    return null;
  }

  const processingCount = allVideos.filter(v => v.status === 'processing' || v.status === 'pending').length;
  if (processingCount > 0 && segment.status !== 'generating') {
    return { status: 'generating' };
  }
  return null;
}

// ============ 对外 API ============

/**
 * 聚合某集的 segments（幂等：重建）
 * 先校验剧集归属，再调用 SegmentDAO.autoAggregate
 */
export function aggregateSegments(db: Database, episodeId: string, userId: string, projectId?: string): Segment[] {
  const episode = NovelEpisodeDAO.getByIdAndUser(db, episodeId, userId);
  if (!episode) throw createError(404, ErrorCodes.NOT_FOUND, '剧集不存在');
  const segments = SegmentDAO.autoAggregate(db, episodeId, userId, projectId || episode.project_id);
  console.log(`[${new Date().toISOString()}] [Segment] 聚合完成，段数=${segments.length}`);
  return segments;
}

/** 获取某集所有 segments（按段号升序；读取时刷新段状态） */
export function getSegmentsByEpisode(db: Database, episodeId: string): Segment[] {
  const segments = SegmentDAO.listByEpisode(db, episodeId);
  if (segments.length === 0) return segments;

  // P1-21: 修复 N+1 —— 一次性加载该集全部镜头与视频区间，内存中按段分组刷新状态
  //        （原实现每段都全量加载整集镜头 + 每镜头查询视频区间）
  const allShots = ShotDAO.listByEpisode(db, episodeId);
  const allVideos = ShotVideoIntervalDAO.listByEpisode(db, episodeId);

  let changed = false;
  for (const seg of segments) {
    const segShots = allShots
      .filter(s => s.segment_id === seg.segment_number)
      .sort((a, b) => a.shot_number - b.shot_number);
    if (segShots.length === 0) continue;
    const segVideos = allVideos.filter(v => segShots.some(s => s.id === v.shot_id));
    const update = computeSegmentStatusUpdate(seg, segShots, segVideos);
    if (update) {
      SegmentDAO.update(db, seg.id, update);
      changed = true;
    }
  }
  return changed ? SegmentDAO.listByEpisode(db, episodeId) : segments;
}

/**
 * 按 segment 提交视频生成：为该段所有镜头创建视频任务（已有完成/处理中视频的镜头跳过）
 * @param db 数据库实例
 * @param userId 当前用户 ID（校验段归属）
 * @param segmentId 段 ID
 * @param options 视频模型与参数（provider/modelName 必填，其余可选）
 * @returns 更新后的 Segment（status=generating，video_model_used 已记录；全部创建失败时标记 failed）
 * @sideEffects 创建/清理 shot_video_intervals 记录，更新 segment 状态；输出提交结果日志
 */
export async function generateSegmentVideo(
  db: Database,
  userId: string,
  segmentId: string,
  options: SegmentVideoOptions,
): Promise<Segment> {
  const segment = SegmentDAO.getById(db, segmentId);
  if (!segment || segment.user_id !== userId) throw createError(404, ErrorCodes.NOT_FOUND, '段不存在');

  // P1-6: 并发护栏 —— 该段已在生成中时拒绝重复提交，避免并发触发重复视频任务
  if (segment.status === 'generating') {
    throw createError(409, ErrorCodes.CONFLICT, '该段视频正在生成中，请等待完成或先重试');
  }

  const { provider, modelName } = options;
  const shots = getShotsForSegment(db, segment);
  if (shots.length === 0) throw createError(400, ErrorCodes.VALIDATION_ERROR, '该段没有镜头，请先重新聚合');

  // 置为生成中并记录模型
  SegmentDAO.update(db, segment.id, {
    status: 'generating',
    video_model_used: `${provider}/${modelName}`,
    error_message: null,
  });

  const created: Array<{ shotId: string; videoId: string; taskId: string }> = [];
  const skipped: Array<{ shotId: string; reason: string }> = [];

  for (const shot of shots) {
    const videos = ShotVideoIntervalDAO.listByShot(db, shot.id);
    if (videos.some(v => v.status === 'processing' || v.status === 'pending')) {
      skipped.push({ shotId: shot.id, reason: '已有处理中视频' });
      continue;
    }
    if (videos.some(v => v.status === 'completed' && v.video_url)) {
      skipped.push({ shotId: shot.id, reason: '已有完成视频' });
      continue;
    }
    // 清理失败记录，避免堆积
    for (const v of videos) {
      if (v.status === 'failed') ShotVideoIntervalDAO.delete(db, v.id);
    }
    try {
      const result = await generateVideoForShot(db, userId, shot.id, {
        provider,
        modelName,
        duration: options.duration,
        ratio: options.ratio,
        resolution: options.resolution,
        subtitles: options.subtitles,
      });
      created.push({ shotId: shot.id, videoId: result.id, taskId: result.external_task_id || '' });
    } catch (err) {
      skipped.push({ shotId: shot.id, reason: (err as Error).message || '视频创建失败' });
      console.error(`[SegmentVideo] 镜头 ${shot.id} 视频创建失败:`, (err as Error).message);
    }
  }

  console.log(`[SegmentVideo] 段 ${segment.name}（${segment.segment_number}）提交完成：创建 ${created.length} 个任务，跳过 ${skipped.length} 个镜头`);

  // P1-7: 全部镜头创建失败时不再停留在 generating 状态，标记为 failed 并记录首个错误
  if (created.length === 0) {
    const firstError = skipped.length > 0 ? skipped[0].reason : '所有镜头视频创建失败';
    SegmentDAO.update(db, segment.id, { status: 'failed', error_message: firstError });
  }

  const updated = SegmentDAO.getById(db, segment.id);
  if (!updated) throw createError(404, ErrorCodes.NOT_FOUND, '段不存在');
  return updated;
}

/**
 * 单独重试某段视频生成：清理该段失败/超时视频后重新提交。
 * 模型来源：段记录 video_model_used > 用户默认视频模型；均无则报错提示走 /video 指定模型
 */
export async function retrySegment(db: Database, userId: string, segmentId: string): Promise<Segment> {
  const segment = SegmentDAO.getById(db, segmentId);
  if (!segment || segment.user_id !== userId) throw createError(404, ErrorCodes.NOT_FOUND, '段不存在');

  let provider: string | null = null;
  let modelName: string | null = null;
  if (segment.video_model_used && segment.video_model_used.includes('/')) {
    [provider, modelName] = segment.video_model_used.split('/');
  } else {
    try {
      const pref = UserPreferenceDAO.getByUser(db, userId);
      const key = pref?.default_video_model;
      if (key && key.includes(':')) {
        [provider, modelName] = key.split(':');
      }
    } catch { /* 忽略 */ }
  }
  if (!provider || !modelName) {
    throw createError(400, ErrorCodes.MODEL_NOT_CONFIGURED, '该段未记录视频模型且未配置默认视频模型，请通过 /segments/:id/video 指定模型后重试');
  }

  // P2修复: 卡在 generating 的段重置为 pending，让用户可以重试卡住的段
  //         （generateSegmentVideo 的 generating 409 护栏不再误拦）
  const stuckGenerating = segment.status === 'generating';
  if (stuckGenerating) {
    SegmentDAO.update(db, segment.id, { status: 'pending', error_message: null });
  }

  // 清理该段失败/超时的视频记录（保留完成/处理中的）
  const shots = getShotsForSegment(db, segment);
  for (const shot of shots) {
    const videos = ShotVideoIntervalDAO.listByShot(db, shot.id);
    for (const v of videos) {
      if (v.status === 'failed') ShotVideoIntervalDAO.delete(db, v.id);
      // P2修复: 卡在 generating 的段，其 processing/pending 视频视为悬挂任务一并清理，让重试能重新提交
      if (stuckGenerating && (v.status === 'processing' || v.status === 'pending')) {
        ShotVideoIntervalDAO.delete(db, v.id);
      }
    }
  }

  return generateSegmentVideo(db, userId, segmentId, { provider, modelName });
}

/**
 * 按 segment 顺序 concat 所有段视频为最终成片
 * 每段取其镜头最新完成的视频（跳过缺视频的镜头），用 ffmpeg concat 合成
 * @param db 数据库实例
 * @param userId 当前用户 ID（校验剧集归属）
 * @param episodeId 剧集 ID
 * @returns 输出视频 URL（/data/...）
 * @throws 缺视频镜头时抛 MISSING_VIDEO；无可拼接片段时抛 NO_VIDEO_CLIPS
 * @sideEffects 无 segments 时自动聚合；写入视频文件并清理临时目录；输出合成日志
 */
export async function composeEpisodeFromSegments(db: Database, userId: string, episodeId: string): Promise<string> {
  const episode = NovelEpisodeDAO.getByIdAndUser(db, episodeId, userId);
  if (!episode) throw createError(404, ErrorCodes.NOT_FOUND, '剧集不存在');

  // 确保 segments 存在（无则自动聚合）
  let segments = SegmentDAO.listByEpisode(db, episodeId);
  if (segments.length === 0) {
    segments = aggregateSegments(db, episodeId, userId, episode.project_id);
  }

  // P1-18: 校验该集镜头是否全部已聚合——存在 segment_id=NULL 的镜头（如分镜重建后）时先重新聚合，避免漏镜
  const allEpisodeShots = ShotDAO.listByEpisode(db, episodeId);
  const unsegmentedCount = allEpisodeShots.filter(s => !s.segment_id).length;
  if (unsegmentedCount > 0) {
    console.log(`[ComposeFromSegments] 发现 ${unsegmentedCount} 个镜头未聚合（segment_id=NULL），先重新聚合`);
    segments = aggregateSegments(db, episodeId, userId, episode.project_id);
  }

  // 按段顺序收集已完成镜头视频（每镜取最新完成的一条，去重）
  // P1-9: 缺视频的镜头不再静默跳过，遍历结束后统一抛错
  const clips: string[] = [];
  const seenShots = new Set<string>();
  const missingShots: string[] = [];
  for (const seg of segments) {
    const shots = getShotsForSegment(db, seg);
    for (const shot of shots) {
      if (seenShots.has(shot.id)) continue;
      seenShots.add(shot.id);
      const videos = ShotVideoIntervalDAO.listByShot(db, shot.id)
        .filter(v => v.status === 'completed' && v.video_url)
        .sort((a, b) => new Date(b.completed_at || 0).getTime() - new Date(a.completed_at || 0).getTime());
      const video = videos[0];
      if (video) {
        const localPath = resolveVideoPathFromUrl(video.video_url || '');
        if (localPath) {
          clips.push(localPath);
        } else {
          missingShots.push(`镜头${shot.shot_number}`);
        }
      } else {
        missingShots.push(`镜头${shot.shot_number}`);
      }
    }
  }

  if (missingShots.length > 0) {
    throw createError(400, ErrorCodes.MISSING_VIDEO, `以下镜头尚未生成视频：${missingShots.join(', ')}`);
  }

  if (clips.length === 0) {
    throw createError(400, ErrorCodes.NO_VIDEO_CLIPS, '没有可用的视频片段，请先按段生成视频');
  }

  const videosDir = projectStorage.getVideosDir(episode.project_id);
  projectStorage.ensureDir(videosDir);
  const outputFileName = `episode_${episode.episode_number}_segments_${Date.now()}.mp4`;
  const outputPath = path.resolve(videosDir, outputFileName);

  const ffmpeg = getFfmpegPath();
  const tempDir = path.resolve(videosDir, `temp_seg_${Date.now()}`);
  projectStorage.ensureDir(tempDir);
  try {
    // 先逐段归一化（无音轨补静音轨，统一编码），再 concat
    const normalized: string[] = [];
    for (let i = 0; i < clips.length; i++) {
      const normPath = path.resolve(tempDir, `norm_${i}.mp4`);
      await normalizeClipForConcat(ffmpeg, clips[i], normPath);
      normalized.push(normPath);
    }
    const listFile = path.resolve(tempDir, 'concat.txt');
    // P1-10: concat list 路径转正斜杠并对单引号转义（Windows 反斜杠在 ffmpeg concat demuxer 中会被当作转义符）
    const listContent = normalized.map(p => {
      const safePath = p.replace(/\\/g, '/').replace(/'/g, "'\\''");
      return `file '${safePath}'`;
    }).join('\n');
    fs.writeFileSync(listFile, listContent, 'utf-8');

    const args = [
      '-f', 'concat',
      '-safe', '0',
      '-i', listFile,
      '-c:v', 'libx264',
      '-preset', 'medium',
      '-crf', '23',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-ar', '44100',
      '-ac', '2',
      '-y', outputPath,
    ];
    await execFileAsync(ffmpeg, args, { timeout: 600000, maxBuffer: 1024 * 1024 * 100 });
  } finally {
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }

  console.log(`[ComposeFromSegments] 剧集 ${episode.episode_number} 按 ${segments.length} 段拼接完成: ${outputPath}（${clips.length} 个镜头）`);
  return projectStorage.toUrlPath(outputPath);
}
