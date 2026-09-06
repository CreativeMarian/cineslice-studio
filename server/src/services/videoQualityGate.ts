// VLM 视频质量门 + 一致性 Critic（Story Claw / Continuum 方案）
// 功能：
// 1) 视频生成完成后，抽取首/中/尾帧 + 角色参考图，交给视觉模型（VLM）打分
// 2) 评分维度：首尾帧主体一致性、与角色参考图相似度、幻觉（多脸/畸形/乱码）、字幕残留
// 3) 不合格标记（passed=false + score + issues），由调用方自动重渲染
// 设计：无 vision 模型配置时静默跳过（不阻塞原有流程）；ffmpeg 缺失时跳过抽帧

import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import type { Database, Shot } from '../types';
import { ModelRegistryDAO, ScriptCharacterDAO, CharacterOutfitDAO } from '../models';
import { aiProxy } from './aiProxy';
import { projectStorage } from './projectStorage';

const execFileAsync = promisify(execFile);

/** 质量门通过阈值（0-100） */
export const QUALITY_GATE_THRESHOLD = 70;

/** 质量门总开关：QUALITY_GATE_ENABLED=0 可关闭 */
export function isQualityGateEnabled(): boolean {
  return process.env.QUALITY_GATE_ENABLED !== '0';
}

/** 找 ffmpeg：ffmpeg-static 优先，否则系统 ffmpeg */
export function getFfmpegPath(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ffmpegStatic = require('ffmpeg-static');
    if (ffmpegStatic && typeof ffmpegStatic === 'string' && fs.existsSync(ffmpegStatic)) {
      return ffmpegStatic;
    }
  } catch {
    // 继续降级
  }
  return 'ffmpeg';
}

/** 检查 ffmpeg 是否可用 */
export async function isFfmpegAvailable(): Promise<boolean> {
  try {
    await execFileAsync(getFfmpegPath(), ['-version'], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/** 获取用户配置的第一个 vision 类型模型（未配置返回 null，质量门静默跳过） */
export function getVisionModel(db: Database, userId: string): { provider: string; modelName: string } | null {
  try {
    const models = ModelRegistryDAO.listByUserAndType(db, userId, 'vision');
    if (models.length === 0) return null;
    const m = models[0];
    return { provider: m.provider, modelName: m.model_name };
  } catch {
    return null;
  }
}

/**
 * 抽视频帧：首帧 / 中间帧 / 尾帧 → base64 data URL 数组
 * 返回空数组 = 抽帧失败（调用方应跳过质量门）
 */
export async function extractVideoFrames(videoPath: string, count = 3): Promise<string[]> {
  try {
    if (!fs.existsSync(videoPath)) return [];

    // 探测时长
    let duration = 0;
    try {
      const probe = await execFileAsync(getFfmpegPath(), ['-i', videoPath], { timeout: 15000 });
      const stderr = probe.stderr || '';
      const m = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
      if (m) {
        duration = parseInt(m[1], 10) * 3600 + parseInt(m[2], 10) * 60 + parseFloat(m[3]);
      }
    } catch {
      // ffprobe 输出走 stderr，execFile 在非零退出时抛错但 stderr 可用
    }
    if (duration <= 0) duration = 5;

    const times: number[] = [];
    if (count <= 1) {
      times.push(0);
    } else {
      times.push(0);
      times.push(duration / 2);
      times.push(Math.max(0, duration - 0.1));
    }

    const tempDir = path.join(projectStorage.getDataDir(''), '_quality_gate');
    fs.mkdirSync(tempDir, { recursive: true });

    const frames: string[] = [];
    for (let i = 0; i < times.length; i++) {
      const framePath = path.join(tempDir, `frame_${Date.now()}_${i}.jpg`);
      try {
        await execFileAsync(getFfmpegPath(), [
          '-ss', String(times[i]),
          '-i', videoPath,
          '-frames:v', '1',
          '-q:v', '3',
          '-y',
          framePath,
        ], { timeout: 20000 });
        if (fs.existsSync(framePath)) {
          const buffer = fs.readFileSync(framePath);
          frames.push(`data:image/jpeg;base64,${buffer.toString('base64')}`);
          fs.unlinkSync(framePath);
        }
      } catch {
        // 单帧失败跳过
      }
    }

    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch { /* ignore */ }
    return frames;
  } catch {
    return [];
  }
}

/** 本地相对 URL → data URL（供 VLM 输入） */
export function toDataUrl(imageUrl: string): string {
  if (/^https?:\/\//.test(imageUrl) || imageUrl.startsWith('data:')) return imageUrl;
  if (!imageUrl.startsWith('/')) return imageUrl;
  try {
    const localPath = projectStorage.toLocalPath(imageUrl);
    if (fs.existsSync(localPath)) {
      const ext = path.extname(localPath).slice(1) || 'png';
      const mimeType = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
      const buffer = fs.readFileSync(localPath);
      return `data:${mimeType};base64,${buffer.toString('base64')}`;
    }
  } catch {
    // 转换失败
  }
  return imageUrl;
}

/** 收集镜头的角色参考图（与 collectShotReferenceImages 相同的造型优先策略，供 VLM 对照） */
export function collectCharacterRefs(db: Database, shot: Shot, max = 2): string[] {
  const refs: string[] = [];
  try {
    let charIds: string[] = [];
    if (Array.isArray(shot.characters_in_shot)) charIds = shot.characters_in_shot;
    else if (shot.characters_in_shot) {
      try {
        const parsed = JSON.parse(shot.characters_in_shot);
        if (Array.isArray(parsed)) charIds = parsed;
      } catch {
        charIds = (shot.characters_in_shot as string).split(',').map(s => s.trim()).filter(Boolean);
      }
    }
    const chars = charIds.length > 0 ? ScriptCharacterDAO.getByIds(db, charIds).filter(Boolean) : [];
    let shotOutfits: Record<string, string> | null = null;
    try {
      if (shot.character_outfits && typeof shot.character_outfits === 'object') {
        shotOutfits = shot.character_outfits as Record<string, string>;
      } else if (typeof shot.character_outfits === 'string') {
        shotOutfits = JSON.parse(shot.character_outfits);
      }
    } catch { shotOutfits = null; }

    for (const char of chars) {
      let img: string | null = null;
      if (shotOutfits) {
        const outfitName = shotOutfits[char.name];
        if (outfitName) {
          const outfits = CharacterOutfitDAO.listByCharacter(db, char.id);
          const matched = outfits.find(o => o.name === outfitName || o.name.includes(outfitName) || outfitName.includes(o.name));
          if (matched?.image_url) img = matched.image_url;
        }
      }
      if (!img) {
        const def = CharacterOutfitDAO.getDefaultForCharacter(db, char.id);
        if (def?.image_url) img = def.image_url;
      }
      if (!img && char.reference_image_url) img = char.reference_image_url;
      if (img) {
        refs.push(toDataUrl(img));
        if (refs.length >= max) break;
      }
    }
  } catch {
    // 参考图收集失败不影响质量门主流程
  }
  return refs;
}

export interface QualityAssessment {
  passed: boolean;
  score: number;
  issues: string[];
  skipped?: boolean;
  reason?: string;
  raw?: unknown;
}

const QUALITY_SYSTEM_PROMPT = `你是专业的 AI 短剧视频质检员。你会收到一组图片：
- 第一组：同一段视频抽出的 首帧 / 中间帧 / 尾帧（按顺序）
- 第二组（可能没有）：该镜头应出现的角色参考图（定妆照）

请严格按以下 JSON 输出（不要输出其他文字）：
{
  "consistency_score": 0-100,   // 首帧/中间帧/尾帧中主角是否为同一个人（身份、服装、发型、发色一致性）
  "hallucination_score": 0-100, // 画面是否正常无幻觉（多张脸、肢体畸形、五官错乱、文字乱码等异常越少分越高）
  "subtitle_ghost_score": 0-100,// 画面是否干净无水印/字幕残留（越干净分越高）
  "reference_match_score": 0-100, // 画面人物与角色参考图的相似度（没有参考图时给 70）
  "passed": true或false,          // 综合是否通过
  "issues": ["具体问题1", "具体问题2"]  // 未通过时的具体问题
}`;

function buildQualityPrompt(shot: Shot): string {
  const parts: string[] = ['请检查这段视频帧：'];
  if (shot.action_description) parts.push(`镜头动作：${shot.action_description}`);
  if (shot.dialogue) parts.push(`台词：${shot.dialogue}`);
  parts.push('重点检查：1) 首尾帧中人物是否为同一人且与中间帧一致；2) 画面有无多脸/畸形/乱码等幻觉；3) 有无字幕或水印残留；4) 人物是否与参考图一致。');
  return parts.join('\n');
}

/**
 * 视频质量门评估：抽帧 + VLM 打分
 * - 未配置 vision 模型 → 返回 skipped=true（静默放行）
 * - ffmpeg 不可用 → 返回 skipped=true
 * - VLM 调用失败 → 返回 skipped=true（不因质量门阻断生产）
 */
export async function assessVideoClip(params: {
  db: Database;
  userId: string;
  videoPath: string;
  shot: Shot;
  provider?: string;
  modelName?: string;
}): Promise<QualityAssessment> {
  const { db, userId, videoPath, shot } = params;

  // 0. 总开关
  if (!isQualityGateEnabled()) {
    return { passed: true, score: 100, issues: [], skipped: true, reason: '质量门已关闭（QUALITY_GATE_ENABLED=0）' };
  }

  // 1. 未配置 vision 模型 → 跳过
  const vision = params.provider && params.modelName
    ? { provider: params.provider, modelName: params.modelName }
    : getVisionModel(db, userId);
  if (!vision) {
    return { passed: true, score: 100, issues: [], skipped: true, reason: '未配置视觉模型，质量门跳过' };
  }

  // 2. 抽帧
  const frames = await extractVideoFrames(videoPath, 3);
  if (frames.length === 0) {
    return { passed: true, score: 100, issues: [], skipped: true, reason: '视频抽帧失败，质量门跳过' };
  }

  // 3. 角色参考图
  const charRefs = collectCharacterRefs(db, shot, 2);

  // 4. VLM 打分
  try {
    const images = [...frames, ...charRefs];
    const result = await aiProxy.generateVision({
      db,
      userId,
      provider: vision.provider,
      modelName: vision.modelName,
      prompt: buildQualityPrompt(shot),
      systemPrompt: QUALITY_SYSTEM_PROMPT,
      images,
      temperature: 0.1,
      maxTokens: 800,
    });

    let parsed: any = null;
    try {
      // 模型可能返回 ```json ... ``` 包裹
      const cleaned = result.content.replace(/```json|```/g, '').trim();
      parsed = JSON.parse(cleaned);
    } catch {
      const start = result.content.indexOf('{');
      const end = result.content.lastIndexOf('}');
      if (start >= 0 && end > start) {
        try { parsed = JSON.parse(result.content.slice(start, end + 1)); } catch { parsed = null; }
      }
    }
    if (!parsed) {
      return { passed: true, score: 100, issues: [], skipped: true, reason: 'VLM 返回无法解析，质量门跳过', raw: result.content };
    }

    const consistency = clampScore(parsed.consistency_score);
    const hallucination = clampScore(parsed.hallucination_score);
    const subtitle = clampScore(parsed.subtitle_ghost_score);
    const reference = clampScore(parsed.reference_match_score);

    // 加权综合分：主体一致性 40% + 参考图相似 25% + 幻觉 20% + 字幕 15%
    const score = Math.round(
      consistency * 0.4 + reference * 0.25 + hallucination * 0.2 + subtitle * 0.15
    );

    return {
      passed: score >= QUALITY_GATE_THRESHOLD && parsed.passed !== false,
      score,
      issues: Array.isArray(parsed.issues) ? parsed.issues.map(String) : [],
      raw: parsed,
    };
  } catch (err) {
    console.warn('[QualityGate] VLM 调用失败，跳过质量门:', (err as Error).message);
    return { passed: true, score: 100, issues: [], skipped: true, reason: `VLM 调用失败: ${(err as Error).message}` };
  }
}

function clampScore(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return 70;
  return Math.min(100, Math.max(0, Math.round(n)));
}
