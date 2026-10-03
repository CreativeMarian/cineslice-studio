// 镜头一致性服务（导演级一致性重构核心）
// 提供：
// 1) collectShotReferenceImages —— 收集镜头角色/场景/道具参考图（注入关键帧与视频生成，防漂移）
// 2) resolveLastFrameForShot —— 首尾帧插值：优先显式尾帧，否则用下一镜首帧作尾帧（VideoClaw 方案）
// 3) generateKeyframeCandidates —— 九宫格候选关键帧（BigBanana 方案：多视角候选选首帧）
// 4) selectCandidateAsFirst —— 候选帧升级为首帧
// 5) generateEndFrameForShot —— 显式尾帧生成（动作/情绪转折镜头）
// 6) resolvePreviousShotTailFrame —— 上一镜尾帧继承（ComfyUI H3 无 end 帧参数，用真实画面锚定本镜起点）

import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import type { Database, Shot, ShotKeyframe } from '../types';
import {
  ShotKeyframeDAO,
  ShotDAO,
  ShotVideoIntervalDAO,
  ScriptCharacterDAO,
  ScriptSceneDAO,
  ScriptPropDAO,
  NovelEpisodeDAO,
  CharacterOutfitDAO,
} from '../models';
import { projectStorage } from './projectStorage';
import { buildKeyframePrompt } from './prompts/keyframe';
import { aiProxy } from './aiProxy';
import { characterExpressionService, type ExpressionKey } from './characterExpressionService';

/** 解析镜头角色 ID 列表（兼容 JSON 与逗号分隔） */
export function parseShotCharacterIds(shot: Shot): string[] {
  if (Array.isArray(shot.characters_in_shot)) return shot.characters_in_shot;
  let ids: string[] = [];
  if (shot.characters_in_shot) {
    try {
      const parsed = JSON.parse(shot.characters_in_shot);
      if (Array.isArray(parsed)) ids = parsed;
    } catch {
      ids = (shot.characters_in_shot as string).split(',').map(s => s.trim()).filter(Boolean);
    }
  }
  return ids;
}

/** 解析镜头道具 ID 列表（props_in_shot 兼容 JSON 与逗号分隔） */
export function parseShotPropIds(shot: Shot): string[] {
  if (Array.isArray(shot.props_in_shot)) return shot.props_in_shot;
  let ids: string[] = [];
  if (shot.props_in_shot) {
    try {
      const parsed = JSON.parse(shot.props_in_shot);
      if (Array.isArray(parsed)) ids = parsed;
    } catch {
      ids = (shot.props_in_shot as string).split(',').map(s => s.trim()).filter(Boolean);
    }
  }
  return ids;
}

/**
 * 分镜场景关联：sceneName → 已有场景精确/包含匹配，未匹配则创建
 * 返回 场景名 → scene_id 映射，供 ShotDAO.batchCreate 写入 scene_id
 * （此前分镜不关联场景，shots.scene_id 全空，场景参考图链路完全失效）
 */
export function buildShotSceneMap(
  db: Database,
  userId: string,
  episodeId: string,
  shots: Array<{ sceneName?: string | null; actionDescription?: string }>
): Map<string, string> {
  const sceneMap = new Map<string, string>();
  for (const s of ScriptSceneDAO.listByEpisode(db, episodeId)) {
    if (s.name) sceneMap.set(s.name, s.id);
  }
  const normalize = (n: string): string => n.replace(/场景|室内|室外|外景|内景|【|】/g, '').trim();

  for (const s of shots) {
    const raw = s.sceneName;
    if (!raw || typeof raw !== 'string') continue;
    const name = raw.trim();
    if (!name || sceneMap.has(name)) continue;
    const norm = normalize(name);
    let matchedId: string | undefined;
    if (norm) {
      for (const [existingName, id] of sceneMap.entries()) {
        const eNorm = normalize(existingName);
        if (eNorm && (eNorm.includes(norm) || norm.includes(eNorm))) {
          matchedId = id;
          break;
        }
      }
    }
    if (matchedId) {
      sceneMap.set(name, matchedId);
    } else {
      const created = ScriptSceneDAO.create(db, {
        user_id: userId,
        episode_id: episodeId,
        name,
        description: shots.find(x => String(x.sceneName || '').trim() === name)?.actionDescription || '',
      });
      sceneMap.set(name, created.id);
    }
  }
  return sceneMap;
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
  if (chars.length === 0) {
    // 镜头未标记角色（约 44% 历史镜头）→ 从动作描述/台词按角色名匹配，保证角色参考图不丢失
    const episodeChars = ScriptCharacterDAO.listByEpisode(db, shot.episode_id);
    const text = `${shot.action_description || ''} ${shot.dialogue || ''}`;
    for (const c of episodeChars) {
      if (c.name && text.includes(c.name)) {
        chars.push(c);
        if (chars.length >= 2) break;
      }
    }
  } else if (chars.length < charIds.length) {
    // 有按 id 未命中的项 → 按角色名匹配当前剧集角色
    const episodeChars = ScriptCharacterDAO.listByEpisode(db, shot.episode_id);
    for (const ref of charIds) {
      if (!chars.some(c => c.id === ref)) {
        const matched = episodeChars.find(c => c.name === ref);
        if (matched && !chars.some(c => c.id === matched.id)) chars.push(matched);
      }
    }
  }
  // 造型调度：从镜头的 character_outfits 字段读取该镜头各角色应穿的造型
  // 格式：{"角色名": "造型名"}，由分镜AI根据剧情场景判断（卧室→睡衣，办公室→职业装）
  let shotOutfits: Record<string, string> | null = null;
  try {
    if (shot.character_outfits && typeof shot.character_outfits === 'object') {
      shotOutfits = shot.character_outfits as Record<string, string>;
    } else if (typeof shot.character_outfits === 'string') {
      shotOutfits = JSON.parse(shot.character_outfits);
    }
  } catch { shotOutfits = null; }

  for (const char of chars) {
    if (!char) continue;
    let img: string | null = null;

    // 1. 优先按镜头指定的造型匹配定妆照（剧情驱动的服装一致性）
    if (shotOutfits) {
      const outfitName = shotOutfits[char.name];
      if (outfitName) {
        const allOutfits = CharacterOutfitDAO.listByCharacter(db, char.id);
        const matched = allOutfits.find(o =>
          o.name === outfitName || o.name.includes(outfitName) || outfitName.includes(o.name)
        );
        if (matched?.image_url) {
          img = matched.image_url;
        }
      }
    }

    // 2. fallback：默认造型图
    if (!img) {
      const outfit = CharacterOutfitDAO.getDefaultForCharacter(db, char.id);
      if (outfit?.image_url) img = outfit.image_url;
    }

    // 3. fallback：角色概念图
    if (!img && char.reference_image_url) {
      img = char.reference_image_url;
    }
    if (!img) {
      const concepts = parseConceptImages(char.concept_images);
      const selected = char.selected_image_index != null && concepts[char.selected_image_index]
        ? concepts[char.selected_image_index]
        : concepts[0];
      if (selected) img = selected;
    }

    if (img) {
      refs.push(img);
      // 角色四视图也加入参考（如果有），增强角色一致性
      const fourViews = parseConceptImages(char.four_view_images);
      if (fourViews.length > 0 && refs.length < 4) {
        refs.push(fourViews[0]);
      }
      if (refs.length >= 3) break;
    }
  }

  // 2. 场景参考图
  if (refs.length < 6 && shot.scene_id) {
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
  if (refs.length < 6) {
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
          if (refs.length >= 4) break;
        }
      }
    }
  }

  return [...new Set(refs)].slice(0, 4);
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
/**
 * 上一镜成品视频 URL（用于 H3 ref_videos 视频续写，锁定跨镜人物/场景延续）。
 * 无上一镜/无已完成视频时返回 null。
 */
export function resolvePreviousShotVideoUrl(db: Database, shot: Shot): string | null {
  try {
    const shots = ShotDAO.listByEpisode(db, shot.episode_id)
      .filter((s: Shot) => s.shot_number < shot.shot_number)
      .sort((a: Shot, b: Shot) => b.shot_number - a.shot_number);
    const prev = shots[0];
    if (!prev) return null;
    const vids = ShotVideoIntervalDAO.listByShot(db, prev.id)
      .filter((v: any) => v.status === 'completed' && v.video_url)
      .sort((a: any, b: any) => new Date(b.completed_at || 0).getTime() - new Date(a.completed_at || 0).getTime());
    return vids[0]?.video_url || null;
  } catch (err) {
    console.warn('[Consistency] 上一镜视频解析失败:', (err as Error).message);
    return null;
  }
}

/**
 * 上一镜尾帧继承：取上一镜已完成视频的最后一帧作为本镜首帧（H3 无 end 参数时的真实画面锚定）。
 * 返回相对 URL 路径；无上一镜/无已完成视频/抽帧失败时返回 null（调用方回退关键帧首帧）。
 */
export function resolvePreviousShotTailFrame(db: Database, shot: Shot): string | null {
  try {
    const shots = ShotDAO.listByEpisode(db, shot.episode_id)
      .filter((s: Shot) => s.shot_number < shot.shot_number)
      .sort((a: Shot, b: Shot) => b.shot_number - a.shot_number);
    const prev = shots[0];
    if (!prev) return null;
    const vids = ShotVideoIntervalDAO.listByShot(db, prev.id)
      .filter((v: any) => v.status === 'completed' && v.video_url)
      .sort((a: any, b: any) => new Date(b.completed_at || 0).getTime() - new Date(a.completed_at || 0).getTime());
    const vid = vids[0];
    if (!vid?.video_url) return null;
    const local = projectStorage.toLocalPath(vid.video_url);
    if (!local || !fs.existsSync(local)) return null;
    const dir = path.join(path.dirname(local), 'tails');
    fs.mkdirSync(dir, { recursive: true });
    const out = path.join(dir, path.basename(local, '.mp4') + '_tail.png');
    if (!fs.existsSync(out)) {
      execFileSync('ffmpeg', ['-y', '-sseof', '-0.3', '-i', local, '-frames:v', '1', '-update', '1', out], { timeout: 60000 });
    }
    return projectStorage.toUrlPath(out);
  } catch (err) {
    console.warn('[Consistency] 上一镜尾帧继承失败:', (err as Error).message);
    return null;
  }
}

/**
 * P1-6: 收集镜头的角色表情图参考（自动注入视频生成，确保表情一致性）
 * 逻辑：分析镜头情绪 → 匹配表情类型 → 从角色 expression_images 取对应表情图
 */
export function collectExpressionReferenceImages(db: Database, shot: Shot): string[] {
  const refs: string[] = [];

  // 1. 获取镜头中的角色（与 collectShotReferenceImages 相同的解析逻辑）
  const charIds = parseShotCharacterIds(shot);
  let chars = charIds.length > 0
    ? ScriptCharacterDAO.getByIds(db, charIds).filter(Boolean)
    : [];
  if (chars.length === 0) {
    const episodeChars = ScriptCharacterDAO.listByEpisode(db, shot.episode_id);
    const text = `${shot.action_description || ''} ${shot.dialogue || ''}`;
    for (const c of episodeChars) {
      if (c.name && text.includes(c.name)) {
        chars.push(c);
        if (chars.length >= 2) break;
      }
    }
  }

  if (chars.length === 0) return refs;

  // 2. 分析镜头情绪（优先 emotion 字段，否则从动作描述/台词推断）
  const moodText = [
    (shot as any).emotion,
    (shot as any).mood,
    shot.action_description,
    shot.dialogue,
  ].filter(Boolean).join(' ');

  const expressionKey = characterExpressionService.matchExpressionByMood(moodText);
  if (!expressionKey) return refs; // 无法匹配情绪时不注入表情图

  // 3. 从各角色的 expression_images 字段取对应表情图
  for (const char of chars) {
    if (!char || !(char as any).expression_images) continue;
    try {
      const expressions: Record<string, string> = typeof (char as any).expression_images === 'string'
        ? JSON.parse((char as any).expression_images)
        : (char as any).expression_images;
      const exprImg = expressions[expressionKey];
      if (exprImg && !refs.includes(exprImg)) {
        refs.push(exprImg);
      }
    } catch {
      // expression_images 解析失败时跳过
    }
  }

  if (refs.length > 0) {
    console.log(`[Consistency] shot=${shot.shot_number} 情绪匹配表情=${expressionKey}，注入 ${refs.length} 张角色表情图`);
  }
  return refs;
}

export function resolveLastFrameForShot(
  db: Database,
  shot: Shot,
  shots: Shot[]
): ResolvedLastFrame | null {
  // v2.1 - 优先级：本镜显式尾帧优先（'end' 手动生成 / 'last' 批量关键帧镜头结尾画面），
  //         保证每镜动作弧完整定格（首帧→尾帧插值忠实表达本镜剧情，过场/空镜不被下一镜污染）；
  //         仅当本镜无显式尾帧时，才回退"同场景连戏"：本镜尾帧 = 下一镜首帧（镜头间无缝衔接，人物/场景不跳变）。
  //         修复 v2.0 的过场镜头缺陷：无人物/纯环境的镜头若尾帧硬锁下一镜人物首帧，
  //         会在 5 秒插值里把空镜 morph 出人物，摧毁过场意图（《逆道善念》镜头1 实测暴露）。
  // 本镜显式尾帧
  const keyframes = ShotKeyframeDAO.listByShot(db, shot.id);
  const endFrame = keyframes.find(k => k.frame_type === 'end' && k.image_url)
    || keyframes.find(k => k.frame_type === 'last' && k.image_url);
  if (endFrame?.image_url) {
    return { keyframeId: endFrame.id, imageUrl: endFrame.image_url, source: 'explicit_end' };
  }

  // 回退：同场景连戏（下一镜首帧），仅限同场景且本镜未禁用连戏
  const nextShots = shots
    .filter(s => s.shot_number > shot.shot_number)
    .sort((a, b) => a.shot_number - b.shot_number);
  const next = nextShots[0];
  if (next && shot.use_next_first_frame !== 0) {
    const sameScene = !shot.scene_id || !next.scene_id || shot.scene_id === next.scene_id;
    if (sameScene) {
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

  // 极简提示词：风格兜底 + 镜头动作描述（候选帧一致性主要靠参考图）
  const prompt = buildKeyframePrompt(shot.action_description || '');
  const negativePrompt = undefined;

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
  // 极简提示词：风格兜底 + 镜头动作描述（尾帧一致性主要靠参考图）
  const prompt = buildKeyframePrompt(shot.action_description || '');
  const negativePrompt = undefined;

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

// ═══════════════════════════════════════════════════════════════
// P1-2: 镜头就绪状态计算
// ═══════════════════════════════════════════════════════════════

export type ShotReadinessStatus = 'ready' | 'missing_ref' | 'need_previous' | 'stale' | 'no_keyframe';

export interface ShotReadiness {
  shotId: string;
  shotNumber: number;
  status: ShotReadinessStatus;
  issues: string[];
  hasFirstFrame: boolean;
  hasLastFrame: boolean;
  hasCharacterRefs: boolean;
  hasSceneRef: boolean;
  hasVideo: boolean;
  previousShotHasVideo: boolean;
}

/**
 * 计算单个镜头的就绪状态
 * - ready: 所有参考齐全，可以生成
 * - missing_ref: 缺少角色/场景参考图
 * - need_previous: 前一镜没有视频，需要按顺序生成
 * - stale: 参考图已更新，需要重新生成
 * - no_keyframe: 没有首帧关键帧
 */
export function calculateShotReadiness(
  db: Database,
  shot: Shot,
  allShots: Shot[]
): ShotReadiness {
  const issues: string[] = [];

  // 1. 检查首帧
  const keyframes = ShotKeyframeDAO.listByShot(db, shot.id);
  const hasFirstFrame = keyframes.some(k => k.frame_type === 'first' && k.image_url);
  const hasLastFrame = keyframes.some(k => (k.frame_type === 'last' || k.frame_type === 'end') && k.image_url);
  if (!hasFirstFrame) {
    issues.push('缺少首帧关键帧');
  }

  // 2. 检查角色参考图
  const charIds = parseShotCharacterIds(shot);
  let hasCharacterRefs = charIds.length === 0; // 没有角色的镜头默认通过
  if (charIds.length > 0) {
    const allChars = ScriptCharacterDAO.listByEpisode(db, shot.episode_id);
    const charsInShot = allChars.filter(c => charIds.includes(c.id) || charIds.includes(c.name));
    hasCharacterRefs = charsInShot.every(c => c.concept_images || c.reference_image_url || c.four_view_images);
    if (!hasCharacterRefs) {
      issues.push(`缺少角色参考图（${charsInShot.filter(c => !c.concept_images && !c.reference_image_url).map(c => c.name).join('、')}）`);
    }
  }

  // 3. 检查场景参考图
  let hasSceneRef = true;
  if (shot.scene_id) {
    const scene = ScriptSceneDAO.getById(db, shot.scene_id);
    hasSceneRef = !!(scene && (scene as any).concept_image_url);
    if (!hasSceneRef) {
      issues.push(`缺少场景参考图（${scene?.name || '未知场景'}）`);
    }
  }

  // 4. 检查前一镜是否有视频
  const shotIndex = allShots.findIndex(s => s.id === shot.id);
  let previousShotHasVideo = true;
  if (shotIndex > 0) {
    const prevShot = allShots[shotIndex - 1];
    const prevIntervals = ShotVideoIntervalDAO.listByShot(db, prevShot.id);
    previousShotHasVideo = prevIntervals.some(v => v.status === 'completed' && v.video_url);
    if (!previousShotHasVideo) {
      issues.push('前一镜尚未生成视频（建议按顺序生成）');
    }
  }

  // 5. 检查是否已有视频
  const intervals = ShotVideoIntervalDAO.listByShot(db, shot.id);
  const hasVideo = intervals.some(v => v.status === 'completed' && v.video_url);

  // 综合判断状态
  let status: ShotReadinessStatus = 'ready';
  if (!hasFirstFrame) {
    status = 'no_keyframe';
  } else if (!hasCharacterRefs || !hasSceneRef) {
    status = 'missing_ref';
  } else if (!previousShotHasVideo) {
    status = 'need_previous';
  }

  return {
    shotId: shot.id,
    shotNumber: shot.shot_number,
    status,
    issues,
    hasFirstFrame,
    hasLastFrame,
    hasCharacterRefs,
    hasSceneRef,
    hasVideo,
    previousShotHasVideo,
  };
}

/**
 * 批量计算所有镜头的就绪状态
 */
export function calculateAllShotsReadiness(
  db: Database,
  episodeId: string
): ShotReadiness[] {
  const shots = ShotDAO.listByEpisode(db, episodeId);
  return shots.map(shot => calculateShotReadiness(db, shot, shots));
}
