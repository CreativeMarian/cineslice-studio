// 音频合成路由
// v1.0
// TTS 配音生成、音频合成（配音+音效+BGM）、获取合成音频

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import { createError, asyncHandler } from '../middleware/errorHandler';
import { validateBody } from '../middleware/validate';
import { aiProxy } from '../services/aiProxy';
import { projectStorage } from '../services/projectStorage';
import { sanitizeFileName } from '../utils/filename';
import { composeAudio, mergeVideoAudio, recommendSfx, BGM_PRESETS, type BgmPreset } from '../services/audioComposer';
import { NovelEpisodeDAO, ShotDAO } from '../models';
import type { Database } from '../types';

const router = Router();

function getDb(req: Request): Database {
  return req.app.locals.db as Database;
}

// 按分镜生成配音（TTS）
const ttsShotSchema = z.object({
  provider: z.string(),
  modelName: z.string(),
  voice: z.string().optional(),
  speed: z.number().min(0.25).max(4).optional(),
  shotIds: z.array(z.string()).optional(), // 不填则为整集所有有对话的镜头
});

router.post('/episodes/:id/tts', validateBody(ttsShotSchema), asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const episode = NovelEpisodeDAO.getByIdAndUser(db, req.params.id, req.user.id);
  if (!episode) throw createError(404, 'NOT_FOUND', '剧集不存在');

  const { provider, modelName, voice, speed, shotIds } = req.body;
  const shots = ShotDAO.listByEpisode(db, episode.id);
  const targetShots = shotIds && shotIds.length > 0
    ? shots.filter(s => shotIds.includes(s.id))
    : shots.filter(s => s.dialogue && s.dialogue.trim().length > 0);

  if (targetShots.length === 0) {
    throw createError(400, 'NO_DIALOGUE', '没有可生成配音的镜头（请确保分镜包含对话）');
  }

  const audioDir = projectStorage.getAudioDir(episode.project_id);
  projectStorage.ensureDir(audioDir);

  // 并发控制：限制同时最多 4 个 TTS 请求
  const CONCURRENCY = 4;
  const results: Array<Record<string, unknown>> = [];
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < targetShots.length) {
      const idx = nextIndex++;
      const shot = targetShots[idx];
      if (!shot.dialogue || shot.dialogue.trim().length === 0) continue;
      try {
        const result = await aiProxy.generateAudio({
          db,
          userId: req.user.id,
          provider,
          modelName,
          text: shot.dialogue,
          voice,
          speed,
        });
        const fileName = `tts_shot_${shot.shot_number}_${Date.now()}.mp3`;
        const localPath = path.resolve(audioDir, fileName);
        const base64Data = result.audioUrl.includes(',') ? result.audioUrl.split(',')[1] : result.audioUrl;
        fs.writeFileSync(localPath, Buffer.from(base64Data, 'base64'));
        results[idx] = {
          shotId: shot.id,
          shotNumber: shot.shot_number,
          audioUrl: projectStorage.toUrlPath(localPath),
          fileName,
          voice: result.voice,
          durationSeconds: result.durationSeconds,
        };
      } catch (err: any) {
        results[idx] = {
          shotId: shot.id,
          shotNumber: shot.shot_number,
          error: err.message || 'TTS 生成失败',
        };
      }
    }
  }

  const workers = Array.from({ length: Math.min(CONCURRENCY, targetShots.length) }, () => worker());
  await Promise.all(workers);

  res.json({ success: true, data: results.filter(Boolean) });
}));

// 音频合成：配音 + 音效 + BGM
const composeSchema = z.object({
  voiceTracks: z.array(z.object({
    fileName: z.string(),
    shotNumber: z.number(),
    volume: z.number().min(0).max(1).optional(),
  })).optional(),
  sfxTracks: z.array(z.object({
    fileName: z.string(),
    startAt: z.number().min(0).optional(),
    volume: z.number().min(0).max(1).optional(),
  })).optional(),
  bgmFileName: z.string().optional(),
  bgmPreset: z.enum(['tense', 'emotional', 'cheerful', 'suspense']).optional(),
  bgmVolume: z.number().min(0).max(1).optional(),
  outputFileName: z.string().optional(),
});

router.post('/episodes/:id/audio-compose', validateBody(composeSchema), asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const episode = NovelEpisodeDAO.getByIdAndUser(db, req.params.id, req.user.id);
  if (!episode) throw createError(404, 'NOT_FOUND', '剧集不存在');

  const audioDir = projectStorage.getAudioDir(episode.project_id);
  const shots = ShotDAO.listByEpisode(db, episode.id);

  // 计算每个镜头的起始时间（用于配音对齐）
  const shotStartTimes: Record<number, number> = {};
  let cumulative = 0;
  for (const shot of shots) {
    shotStartTimes[shot.shot_number] = cumulative;
    cumulative += shot.duration_seconds;
  }

  const tracks = [];

  // 配音轨
  if (req.body.voiceTracks && req.body.voiceTracks.length > 0) {
    for (const vt of req.body.voiceTracks) {
      const safeName = sanitizeFileName(vt.fileName);
      const filePath = safeName ? path.resolve(audioDir, safeName) : '';
      if (filePath && fs.existsSync(filePath)) {
        tracks.push({
          path: filePath,
          type: 'voice' as const,
          volume: vt.volume ?? 1.0,
          startAt: shotStartTimes[vt.shotNumber] ?? 0,
          fadeIn: 0.1,
          fadeOut: 0.2,
        });
      }
    }
  }

  // 音效轨
  if (req.body.sfxTracks && req.body.sfxTracks.length > 0) {
    for (const st of req.body.sfxTracks) {
      const safeName = sanitizeFileName(st.fileName);
      const filePath = safeName ? path.resolve(audioDir, safeName) : '';
      if (filePath && fs.existsSync(filePath)) {
        tracks.push({
          path: filePath,
          type: 'sfx' as const,
          volume: st.volume ?? 0.6,
          startAt: st.startAt ?? 0,
        });
      }
    }
  }

  // BGM 轨
  if (req.body.bgmFileName) {
    const safeBgm = sanitizeFileName(req.body.bgmFileName);
    const bgmPath = safeBgm ? path.resolve(audioDir, safeBgm) : '';
    if (bgmPath && fs.existsSync(bgmPath)) {
      const preset = req.body.bgmPreset ? BGM_PRESETS[req.body.bgmPreset as BgmPreset] : null;
      tracks.push({
        path: bgmPath,
        type: 'bgm' as const,
        volume: req.body.bgmVolume ?? preset?.volume ?? 0.25,
        fadeIn: preset?.fadeIn ?? 1,
        fadeOut: preset?.fadeOut ?? 2,
      });
    }
  }

  if (tracks.length === 0) {
    throw createError(400, 'NO_TRACKS', '没有可合成的音轨，请先生成配音或上传 BGM/音效');
  }

  const safeOutput = (req.body.outputFileName ? sanitizeFileName(req.body.outputFileName) : null) ?? undefined;
  const result = await composeAudio(episode.project_id, tracks, safeOutput);
  if (!result.success) {
    throw createError(500, 'COMPOSE_FAILED', result.error || '音频合成失败');
  }

  res.json({
    success: true,
    data: {
      audioUrl: result.outputUrl,
      outputPath: result.outputPath,
      totalDuration: cumulative,
      trackCount: tracks.length,
    },
  });
}));

// 获取剧集已合成的音频列表
router.get('/episodes/:id/audio', asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const episode = NovelEpisodeDAO.getByIdAndUser(db, req.params.id, req.user.id);
  if (!episode) throw createError(404, 'NOT_FOUND', '剧集不存在');

  const audioDir = projectStorage.getAudioDir(episode.project_id);
  const files: Array<{ name: string; url: string; size: number; createdAt: string }> = [];

  if (fs.existsSync(audioDir)) {
    const items = fs.readdirSync(audioDir);
    for (const name of items) {
      if (/\.(mp3|wav|ogg|m4a)$/i.test(name)) {
        const filePath = path.resolve(audioDir, name);
        const stat = fs.statSync(filePath);
        files.push({
          name,
          url: projectStorage.toUrlPath(filePath),
          size: stat.size,
          createdAt: stat.birthtime.toISOString(),
        });
      }
    }
    files.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  res.json({ success: true, data: files });
}));

// 根据分镜推荐音效
router.get('/episodes/:id/sfx-recommendations', asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const episode = NovelEpisodeDAO.getByIdAndUser(db, req.params.id, req.user.id);
  if (!episode) throw createError(404, 'NOT_FOUND', '剧集不存在');

  const shots = ShotDAO.listByEpisode(db, episode.id);
  const recommendations = shots.map(shot => ({
    shotId: shot.id,
    shotNumber: shot.shot_number,
    sfx: recommendSfx(shot.action_description || ''),
  }));

  res.json({ success: true, data: recommendations });
}));

// 音视频合并（将合成音频与视频轨合并）
const mergeSchema = z.object({
  videoFileName: z.string(),
  audioFileName: z.string(),
  outputFileName: z.string().optional(),
});

router.post('/episodes/:id/merge-audio-video', validateBody(mergeSchema), asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const episode = NovelEpisodeDAO.getByIdAndUser(db, req.params.id, req.user.id);
  if (!episode) throw createError(404, 'NOT_FOUND', '剧集不存在');

  const dataDir = projectStorage.getDataDir(episode.project_id);
  const safeVideo = sanitizeFileName(req.body.videoFileName);
  const safeAudio = sanitizeFileName(req.body.audioFileName);
  if (!safeVideo || !safeAudio) throw createError(400, 'VALIDATION_ERROR', '文件名不合法');

  const videoPath = path.resolve(dataDir, 'videos', safeVideo);
  const audioPath = path.resolve(dataDir, 'audio', safeAudio);

  if (!fs.existsSync(videoPath)) throw createError(404, 'VIDEO_NOT_FOUND', '视频文件不存在');
  if (!fs.existsSync(audioPath)) throw createError(404, 'AUDIO_NOT_FOUND', '音频文件不存在');

  const outName = (req.body.outputFileName ? sanitizeFileName(req.body.outputFileName) : null) || `final_${Date.now()}.mp4`;
  const outputPath = path.resolve(dataDir, 'videos', outName);

  const result = await mergeVideoAudio(videoPath, audioPath, outputPath);
  if (!result.success) {
    throw createError(500, 'MERGE_FAILED', result.error || '音视频合并失败');
  }

  res.json({
    success: true,
    data: {
      outputUrl: projectStorage.toUrlPath(outputPath),
      outputPath,
    },
  });
}));

export default router;
