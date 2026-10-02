// P0-2: 视觉记忆库服务
// 借鉴 StoryMem（Memory to Video）：所有关键帧自动入库，生成新镜时自动检索历史参考图
// 核心功能：
// 1) indexKeyframe - 关键帧生成后自动入库
// 2) indexCharacterAsset - 角色资产图入库
// 3) indexSceneAsset - 场景资产图入库
// 4) retrieveReferenceImages - 生成新镜时检索历史参考图（同角色+同场景+近期帧）
// 5) buildVisualMemoryContext - 构建视觉记忆上下文文本（注入到提示词）

import type { Database, VisualMemory, Shot } from '../types';
import {
  VisualMemoryDAO,
  ShotKeyframeDAO,
  ScriptCharacterDAO,
  ScriptSceneDAO,
  ShotDAO,
} from '../models';
import { imageToDataUrl } from './shotConsistencyService';

// ═══════════════════════════════════════════════════════════════
// 关键帧入库
// ═══════════════════════════════════════════════════════════════

/**
 * 关键帧生成后自动入库
 * @param db 数据库
 * @param projectId 项目ID
 * @param episodeId 剧集ID
 * @param shotId 镜头ID
 * @param keyframeId 关键帧ID
 * @param imageUrl 图片URL
 * @param frameType 帧类型 first/last/candidate
 * @param characters 该镜头中的角色（用于索引）
 * @param sceneName 场景名（用于索引）
 */
export function indexKeyframe(
  db: Database,
  projectId: string,
  episodeId: string,
  shotId: string,
  keyframeId: string,
  imageUrl: string,
  frameType: string = 'first',
  characters: string[] = [],
  sceneName: string = ''
): VisualMemory[] {
  // 避免重复入库
  if (VisualMemoryDAO.existsByKeyframe(db, keyframeId)) {
    return [];
  }

  const shot = ShotDAO.getById(db, shotId);
  const shotNumber = shot?.shot_number || 0;

  const created: VisualMemory[] = [];

  // 1. 作为通用关键帧入库
  const generalMem = VisualMemoryDAO.create(db, {
    project_id: projectId,
    episode_id: episodeId,
    shot_id: shotId,
    keyframe_id: keyframeId,
    image_url: imageUrl,
    memory_type: 'keyframe',
    entity_name: `shot_${shotNumber}`,
    shot_number: shotNumber,
    frame_type: frameType,
    is_reference: frameType === 'first' ? 1 : 0, // 首帧默认可作为参考
  });
  created.push(generalMem);

  // 2. 按角色分别入库（同一张图可能对应多个角色）
  for (const charName of characters) {
    if (!charName || charName.length < 1) continue;
    const char = ScriptCharacterDAO.listByEpisode(db, episodeId).find(c => c.name === charName);
    VisualMemoryDAO.create(db, {
      project_id: projectId,
      episode_id: episodeId,
      shot_id: shotId,
      keyframe_id: keyframeId,
      image_url: imageUrl,
      memory_type: 'character',
      entity_name: charName,
      entity_id: char?.id || null,
      shot_number: shotNumber,
      frame_type: frameType,
      is_reference: 1, // 角色帧默认可作为参考
    });
  }

  // 3. 按场景入库
  if (sceneName) {
    const scene = ScriptSceneDAO.listByEpisode(db, episodeId).find(s => s.name === sceneName);
    VisualMemoryDAO.create(db, {
      project_id: projectId,
      episode_id: episodeId,
      shot_id: shotId,
      keyframe_id: keyframeId,
      image_url: imageUrl,
      memory_type: 'scene',
      entity_name: sceneName,
      entity_id: scene?.id || null,
      shot_number: shotNumber,
      frame_type: frameType,
      is_reference: 1,
    });
  }

  return created;
}

// ═══════════════════════════════════════════════════════════════
// 资产图入库
// ═══════════════════════════════════════════════════════════════

/**
 * 角色概念图/四视图入库
 */
export function indexCharacterAsset(
  db: Database,
  projectId: string,
  episodeId: string,
  characterId: string,
  characterName: string,
  imageUrl: string,
  assetType: string = 'concept'
): VisualMemory {
  return VisualMemoryDAO.create(db, {
    project_id: projectId,
    episode_id: episodeId,
    image_url: imageUrl,
    memory_type: 'character',
    entity_name: characterName,
    entity_id: characterId,
    frame_type: assetType,
    metadata: JSON.stringify({ assetType }),
    is_reference: 1,
    quality_score: 0.9, // 资产图默认高质量
  });
}

/**
 * 场景概念图入库
 */
export function indexSceneAsset(
  db: Database,
  projectId: string,
  episodeId: string,
  sceneId: string,
  sceneName: string,
  imageUrl: string
): VisualMemory {
  return VisualMemoryDAO.create(db, {
    project_id: projectId,
    episode_id: episodeId,
    image_url: imageUrl,
    memory_type: 'scene',
    entity_name: sceneName,
    entity_id: sceneId,
    frame_type: 'concept',
    is_reference: 1,
    quality_score: 0.9,
  });
}

// ═══════════════════════════════════════════════════════════════
// 历史参考图检索
// ═══════════════════════════════════════════════════════════════

export interface RetrievedReferences {
  characterImages: Array<{ url: string; name: string; shotNumber: number }>;
  sceneImages: Array<{ url: string; name: string; shotNumber: number }>;
  recentKeyframes: Array<{ url: string; shotNumber: number }>;
  allDataUrls: string[]; // 全部转为 dataUrl 的图片（用于API调用）
  contextText: string;   // 视觉记忆上下文文本（用于提示词注入）
}

/**
 * 生成新镜时检索历史参考图
 * 策略：
 * 1. 同角色的近期历史帧（每个角色最多2张）
 * 2. 同场景的近期历史帧（最多2张）
 * 3. 前3个镜头的首帧（时序上下文）
 * 总共最多6-8张参考图
 */
export function retrieveReferenceImages(
  db: Database,
  projectId: string,
  episodeId: string,
  shot: Shot,
  maxPerEntity: number = 2,
  maxRecent: number = 3
): RetrievedReferences {
  const characterImages: RetrievedReferences['characterImages'] = [];
  const sceneImages: RetrievedReferences['sceneImages'] = [];
  const recentKeyframes: RetrievedReferences['recentKeyframes'] = [];

  // 1. 解析镜头中的角色（DAO已解析为 string[]）
  const characterNames: string[] = shot.characters_in_shot || [];

  // 2. 检索同角色的近期历史帧
  for (const charName of characterNames.slice(0, 3)) { // 最多3个角色
    const charMems = VisualMemoryDAO.listRecentByEntity(db, projectId, charName, maxPerEntity);
    for (const mem of charMems) {
      if (!characterImages.find(ci => ci.url === mem.image_url)) {
        characterImages.push({ url: mem.image_url, name: charName, shotNumber: mem.shot_number });
      }
    }
  }

  // 3. 检索同场景的近期历史帧
  if (shot.scene_id) {
    const scene = ScriptSceneDAO.getById(db, shot.scene_id);
    if (scene?.name) {
      const sceneMems = VisualMemoryDAO.listRecentByEntity(db, projectId, scene.name, maxPerEntity);
      for (const mem of sceneMems) {
        if (!sceneImages.find(si => si.url === mem.image_url)) {
          sceneImages.push({ url: mem.image_url, name: scene.name, shotNumber: mem.shot_number });
        }
      }
    }
  }

  // 4. 检索前N个镜头的首帧（时序上下文）
  if (shot.shot_number > 1) {
    const prevMems = VisualMemoryDAO.listBeforeShot(db, projectId, shot.shot_number, maxRecent);
    for (const mem of prevMems.filter(m => m.memory_type === 'keyframe' && m.frame_type === 'first')) {
      recentKeyframes.push({ url: mem.image_url, shotNumber: mem.shot_number });
    }
  }

  // 5. 汇总所有图片并转为 dataUrl
  const allUrls = [
    ...characterImages.map(c => c.url),
    ...sceneImages.map(s => s.url),
    ...recentKeyframes.map(r => r.url),
  ];
  const uniqueUrls = [...new Set(allUrls)];
  const allDataUrls = uniqueUrls.map(url => {
    try {
      return imageToDataUrl(url);
    } catch {
      return url; // 转换失败保留原URL
    }
  }).filter(Boolean);

  // 6. 构建上下文文本
  let contextText = '';
  if (characterImages.length > 0) {
    contextText += `【角色历史视觉参考·${characterImages.length}张】\n`;
    const byChar = new Map<string, number[]>();
    characterImages.forEach(c => {
      if (!byChar.has(c.name)) byChar.set(c.name, []);
      byChar.get(c.name)!.push(c.shotNumber);
    });
    byChar.forEach((shots, name) => {
      contextText += `- ${name}：曾出现在第${shots.join('、')}镜，视觉风格保持一致\n`;
    });
    contextText += '\n';
  }
  if (sceneImages.length > 0) {
    contextText += `【场景历史视觉参考·${sceneImages.length}张】\n`;
    const byScene = new Map<string, number[]>();
    sceneImages.forEach(s => {
      if (!byScene.has(s.name)) byScene.set(s.name, []);
      byScene.get(s.name)!.push(s.shotNumber);
    });
    byScene.forEach((shots, name) => {
      contextText += `- ${name}：曾出现在第${shots.join('、')}镜，场景布局保持一致\n`;
    });
    contextText += '\n';
  }
  if (recentKeyframes.length > 0) {
    contextText += `【前序镜头视觉参考·${recentKeyframes.length}张】\n`;
    contextText += `- 第${recentKeyframes.map(r => r.shotNumber).join('、')}镜的首帧，注意动作和构图的连贯性\n`;
  }

  return { characterImages, sceneImages, recentKeyframes, allDataUrls, contextText };
}

// ═══════════════════════════════════════════════════════════════
// 批量索引（项目初始化时把已有数据入库）
// ═══════════════════════════════════════════════════════════════

export function indexExistingKeyframes(
  db: Database,
  projectId: string,
  episodeId: string
): number {
  const shots = ShotDAO.listByEpisode(db, episodeId);
  let indexed = 0;

  for (const shot of shots) {
    const keyframes = ShotKeyframeDAO.listByShot(db, shot.id);
    const characterNames: string[] = shot.characters_in_shot || [];
    let sceneName = '';
    if (shot.scene_id) {
      const scene = ScriptSceneDAO.getById(db, shot.scene_id);
      sceneName = scene?.name || '';
    }

    for (const kf of keyframes) {
      if (!kf.image_url) continue;
      const created = indexKeyframe(
        db, projectId, episodeId, shot.id, kf.id, kf.image_url,
        kf.frame_type || 'first', characterNames, sceneName
      );
      indexed += created.length;
    }
  }

  return indexed;
}

// ═══════════════════════════════════════════════════════════════
// 导出服务对象
// ═══════════════════════════════════════════════════════════════

export const visualMemoryService = {
  indexKeyframe,
  indexCharacterAsset,
  indexSceneAsset,
  retrieveReferenceImages,
  indexExistingKeyframes,
};
