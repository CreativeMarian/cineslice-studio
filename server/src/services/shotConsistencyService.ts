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
import { keyframePrompt } from './prompts/keyframePrompt';
import { aiProxy } from './aiProxy';

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

    // 解析镜头角色（缺省自动按 characters_in_shot 收集，参考图与提示词双注入防漂移）
  const charRefs = parseShotCharacterIds(shot);
  const characters: Array<{ name: string; visualDescription: string }> = [];
  for (const ref of charRefs) {
    let c = ScriptCharacterDAO.getById(db, ref);
    if (!c) {
      const epChars = ScriptCharacterDAO.listByEpisode(db, shot.episode_id);
      c = epChars.find((x: any) => x.name === ref) || null;
    }
    if (c) characters.push({ name: c.name, visualDescription: c.visual_description });
  }
  // 解析镜头场景
  let scene: any = null;
  if (shot.scene_id) {
    const sc = ScriptSceneDAO.getById(db, shot.scene_id);
    if (sc) scene = { name: sc.name, description: sc.description, timeOfDay: sc.time_of_day, atmosphere: sc.atmosphere };
  }

  const { prompt, negativePrompt } = keyframePrompt({
    shotDescription: shot.action_description || '',
    characters: characters.length > 0 ? characters : undefined,
    scene: scene || undefined,
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
