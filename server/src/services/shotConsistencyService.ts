// 镜头一致性服务（导演级一致性重构核心）
// 提供：
// 1) collectShotReferenceImages —— 收集镜头角色/场景/道具参考图（注入关键帧与视频生成，防漂移）
// 2) resolveLastFrameForShot —— 首尾帧插值：优先显式尾帧，否则用下一镜首帧作尾帧（VideoClaw 方案）
// 3) generateKeyframeCandidates —— 九宫格候选关键帧（BigBanana 方案：多视角候选选首帧）
// 4) selectCandidateAsFirst —— 候选帧升级为首帧
// 5) generateEndFrameForShot —— 显式尾帧生成（动作/情绪转折镜头）

import fs from 'fs';
import path from 'path';
import type { Database, Shot, ShotKeyframe } from '../types';
import {
  ShotKeyframeDAO,
  ScriptCharacterDAO,
  ScriptSceneDAO,
  ScriptPropDAO,
  NovelEpisodeDAO,
  CharacterOutfitDAO,
} from '../models';
import { projectStorage } from './projectStorage';
import { keyframePrompt } from './prompts/keyframePrompt';
import { aiProxy } from './aiProxy';

/** 解析镜头角色 ID 列表（兼容 JSON 与逗号分隔） */
export function parseShotCharacterIds(shot: Shot): string[] {
  let ids: string[] = [];
  if (shot.characters_in_shot) {
    try {
      const parsed = JSON.parse(shot.characters_in_shot);
      if (Array.isArray(parsed)) ids = parsed;
    } catch {
      ids = shot.characters_in_shot.split(',').map(s => s.trim()).filter(Boolean);
    }
  }
  return ids;
}

/** 解析镜头道具 ID 列表（props_in_shot 兼容 JSON 与逗号分隔） */
export function parseShotPropIds(shot: Shot): string[] {
  let ids: string[] = [];
  if (shot.props_in_shot) {
    try {
      const parsed = JSON.parse(shot.props_in_shot);
      if (Array.isArray(parsed)) ids = parsed;
    } catch {
      ids = shot.props_in_shot.split(',').map(s => s.trim()).filter(Boolean);
    }
  }
  return ids;
}

/** 解析概念图 JSON 数组，返回图片 URL 列表 */
export function parseConceptImages(raw: string | null | any[]): string[] {
  if (Array.isArray(raw)) {
    return raw.map((img: any) => (typeof img === 'string' ? img : img?.url)).filter(Boolean);
  }
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map((img: any) => (typeof img === 'string' ? img : img?.url)).filter(Boolean);
    }
    if (typeof parsed === 'string') return [parsed];
  } catch {
    // 非 JSON 单 URL
  }
  return raw ? [raw] : [];
}

/**
 * 收集镜头的一致性参考图（角色定妆照/概念图 + 场景概念图 + 道具图）
 * 参考 ArcReel / BigBanana：每镜生成时注入"当前角色+场景+道具"参考，显著降低漂移。
 * 上限 3 张：角色优先（最多2张），再场景（1张），道具图在角色不足时补位。
 */
export function collectShotReferenceImages(db: Database, shot: Shot): string[] {
  const refs: string[] = [];

  // 1. 角色参考图（衣橱默认造型图优先，BigBanana Base Look：服装一致）
  // characters_in_shot 可能存角色 id 或角色名（兼容两种历史数据），统一解析
  const charIds = parseShotCharacterIds(shot);
  const chars = charIds.length > 0
    ? ScriptCharacterDAO.getByIds(db, charIds).filter(Boolean)
    : [];
  if (chars.length < charIds.length) {
    // 有按 id 未命中的项 → 按角色名匹配当前剧集角色
    const episodeChars = ScriptCharacterDAO.listByEpisode(db, shot.episode_id);
    for (const ref of charIds) {
      if (!chars.some(c => c.id === ref)) {
        const matched = episodeChars.find(c => c.name === ref);
        if (matched && !chars.some(c => c.id === matched.id)) chars.push(matched);
      }
    }
  }
  for (const char of chars) {
    if (!char) continue;
    let img: string | null = null;
    // 默认造型图（面容一致 + 服装一致）
    const outfit = CharacterOutfitDAO.getDefaultForCharacter(db, char.id);
    if (outfit?.image_url) {
      img = outfit.image_url;
    } else if (char.reference_image_url) {
      img = char.reference_image_url;
    } else {
      const concepts = parseConceptImages(char.concept_images);
      const selected = char.selected_image_index != null && concepts[char.selected_image_index]
        ? concepts[char.selected_image_index]
        : concepts[0];
      if (selected) img = selected;
    }
    if (img) {
      refs.push(img);
      if (refs.length >= 2) break;
    }
  }

  // 2. 场景参考图
  if (refs.length < 3 && shot.scene_id) {
    const scene = ScriptSceneDAO.getById(db, shot.scene_id);
    if (scene) {
      const sceneImgs = parseConceptImages(scene.concept_images);
      const selected = scene.selected_image_index != null && sceneImgs[scene.selected_image_index]
        ? sceneImgs[scene.selected_image_index]
        : sceneImgs[0];
      if (selected) refs.push(selected);
    }
  }

  // 3. 道具参考图（线索道具优先，保证跨镜视觉连贯）
  // props_in_shot 同样可能存道具 id 或名称
  if (refs.length < 3) {
    const propIds = parseShotPropIds(shot);
    if (propIds.length > 0) {
      const props = ScriptPropDAO.getByIds(db, propIds).filter(Boolean);
      if (props.length < propIds.length) {
        const episodeProps = ScriptPropDAO.listByEpisode(db, shot.episode_id);
        for (const ref of propIds) {
          if (!props.some(p => p.id === ref)) {
            const matched = episodeProps.find(p => p.name === ref);
            if (matched && !props.some(p => p.id === matched.id)) props.push(matched);
          }
        }
      }
      for (const prop of props) {
        if (!prop) continue;
        const propImgs = parseConceptImages(prop.concept_images);
        if (propImgs.length > 0) {
          refs.push(propImgs[0]);
          if (refs.length >= 3) break;
        }
      }
    }
  }

  return [...new Set(refs)].slice(0, 3);
}

/** 本地路径转可访问 URL（图片 API 需要可访问的图片） */
export function imageToDataUrl(imageUrl: string): string {
  if (/^https?:\/\//.test(imageUrl)) return imageUrl;
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
    // 转换失败，原样返回
  }
  return imageUrl;
}

export interface ResolvedLastFrame {
  keyframeId: string;
  imageUrl: string;
  source: 'explicit_end' | 'next_shot_first';
}

/**
 * 解析镜头视频的尾帧（首尾帧插值）：
 * 1. 优先使用镜头自身的显式尾帧（frame_type='end'，用户手动生成）
 * 2. 否则若 shot.use_next_first_frame=1，取下一镜的首帧作为尾帧（VideoClaw 方案）
 *    镜头间画面硬衔接，解决"不连戏"，同时大幅减少视频落点抽卡
 */
export function resolveLastFrameForShot(
  db: Database,
  shot: Shot,
  shots: Shot[]
): ResolvedLastFrame | null {
  // 1. 显式尾帧
  const keyframes = ShotKeyframeDAO.listByShot(db, shot.id);
  const endFrame = keyframes.find(k => k.frame_type === 'end' && k.image_url);
  if (endFrame?.image_url) {
    return { keyframeId: endFrame.id, imageUrl: endFrame.image_url, source: 'explicit_end' };
  }

  // 2. 下一镜首帧（use_next_first_frame 默认 1）
  if (shot.use_next_first_frame !== 0) {
    const nextShots = shots
      .filter(s => s.shot_number > shot.shot_number)
      .sort((a, b) => a.shot_number - b.shot_number);
    for (const next of nextShots) {
      const nextKeyframes = ShotKeyframeDAO.listByShot(db, next.id);
      const nextFirst = nextKeyframes.find(k => k.frame_type === 'first' && k.image_url)
        || nextKeyframes.find(k => k.image_url);
      if (nextFirst?.image_url) {
        return { keyframeId: nextFirst.id, imageUrl: nextFirst.image_url, source: 'next_shot_first' };
      }
    }
  }

  return null;
}

/**
 * 生成九宫格候选关键帧：同一镜头生成 N 个视角候选（frame_type='candidate'），
 * 供用户挑选最满意的一张作为首帧（BigBanana 九宫格分镜方案）。
 * 小成本买确定性：候选帧均为"带角色/场景/道具参考图"的可控生成，选中后视频抽卡空间大幅收窄。
 */
export async function generateKeyframeCandidates(
  db: Database,
  userId: string,
  shot: Shot,
  opts: {
    provider: string;
    modelName: string;
    count?: number; // 候选数量，默认 4
    referenceImages?: string[];
  }
): Promise<ShotKeyframe[]> {
  const count = Math.min(Math.max(opts.count || 4, 1), 9);

  const { prompt, negativePrompt } = keyframePrompt({
    shotDescription: shot.action_description || '',
    frameType: 'first',
  });

  const episode = NovelEpisodeDAO.getById(db, shot.episode_id);
  const projectId = episode?.project_id || '';

  const imgResult = await aiProxy.generateImage({
    db, userId, projectId,
    provider: opts.provider, modelName: opts.modelName,
    prompt,
    negativePrompt,
    count,
    size: '2560x1440',
    saveSubDir: 'keyframes',
    referenceImages: opts.referenceImages && opts.referenceImages.length > 0 ? opts.referenceImages : undefined,
  });

  const created: ShotKeyframe[] = [];
  for (let i = 0; i < imgResult.images.length; i++) {
    const kf = ShotKeyframeDAO.create(db, {
      user_id: userId,
      shot_id: shot.id,
      frame_type: 'candidate',
      candidate_index: i,
      is_selected: 0,
      prompt,
      negative_prompt: negativePrompt,
      image_url: imgResult.images[i]?.url,
      image_model_used: opts.modelName,
    });
    created.push(kf);
  }
  return created;
}

/**
 * 选中候选帧作为首帧：候选升级为 first，旧 first 帧降级为候选（不删除，保留对照）。
 */
export function selectCandidateAsFirst(
  db: Database,
  userId: string,
  keyframeId: string
): ShotKeyframe | null {
  const kf = ShotKeyframeDAO.getByIdAndUser(db, keyframeId, userId);
  if (!kf) return null;
  if (kf.frame_type !== 'candidate') {
    // 本身就是 first，直接返回
    return kf;
  }

  const existing = ShotKeyframeDAO.listByShot(db, kf.shot_id);
  const oldFirst = existing.find(k => k.frame_type === 'first' && k.id !== kf.id);
  if (oldFirst) {
    ShotKeyframeDAO.update(db, oldFirst.id, { frame_type: 'candidate', candidate_index: -1, is_selected: 0 });
  }

  return ShotKeyframeDAO.update(db, kf.id, {
    frame_type: 'first',
    candidate_index: 0,
    is_selected: 1,
  });
}

/**
 * 生成显式尾帧（frame_type='end'）：对动作/情绪转折镜头生成结尾画面，
 * 配合首帧做首尾帧插值，让视频落点完全可控。
 */
export async function generateEndFrameForShot(
  db: Database,
  userId: string,
  shot: Shot,
  opts: {
    provider: string;
    modelName: string;
    referenceImages?: string[];
  }
): Promise<ShotKeyframe> {
  const { prompt, negativePrompt } = keyframePrompt({
    shotDescription: shot.action_description || '',
    frameType: 'last',
  });

  const episode = NovelEpisodeDAO.getById(db, shot.episode_id);
  const projectId = episode?.project_id || '';

  const imgResult = await aiProxy.generateImage({
    db, userId, projectId,
    provider: opts.provider, modelName: opts.modelName,
    prompt,
    negativePrompt,
    count: 1,
    size: '2560x1440',
    saveSubDir: 'keyframes',
    referenceImages: opts.referenceImages && opts.referenceImages.length > 0 ? opts.referenceImages : undefined,
  });

  // 删除旧显式尾帧，避免堆积
  const existing = ShotKeyframeDAO.listByShot(db, shot.id);
  for (const kf of existing) {
    if (kf.frame_type === 'end') {
      ShotKeyframeDAO.delete(db, kf.id);
    }
  }

  return ShotKeyframeDAO.create(db, {
    user_id: userId,
    shot_id: shot.id,
    frame_type: 'end',
    prompt,
    negative_prompt: negativePrompt,
    image_url: imgResult.images[0]?.url,
    image_model_used: opts.modelName,
  });
}
