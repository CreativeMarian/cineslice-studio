// 剧集生产服务：剧本重生成/润色、分镜生成、关键帧、视频生成与批量任务、字幕
// 从 routes/episodes.ts 下沉的业务逻辑，路由层只负责参数校验与响应包装
import fs from 'fs';
import path from 'path';
import {
  NovelEpisodeDAO,
  ShotDAO,
  ShotKeyframeDAO,
  ShotVideoIntervalDAO,
  ScriptCharacterDAO,
  ScriptSceneDAO,
  ProjectDAO,
} from '../models';
import { createError } from '../middleware/errorHandler';
import { aiProxy } from './aiProxy';
import { novelToScriptPrompt, polishScriptPrompt } from './prompts/novelToScript';
import { shotGenerationPrompt } from './prompts/shotGeneration';
import { keyframePrompt } from './prompts/keyframePrompt';
import { projectStorage } from './projectStorage';
import { downloadToFile } from '../utils/download';
import { parseAiJsonOrThrow, parseAiJson , parseShotListArray } from '../utils/aiJsonParser';
import { scriptAnalysisService } from './scriptAnalysisService';
import { promptOptimizationService } from './promptOptimizationService';
import { getProjectStylePreset } from './autoPipeline/helpers';
import { directorPromptService } from './directorPromptService';
import {
  resolveLastFrameForShot,
  resolvePreviousShotTailFrame,
  resolvePreviousShotVideoUrl,
  collectShotReferenceImages,
  generateKeyframeCandidates,
  buildShotSceneMap,
  parseShotCharacterIds,
} from './shotConsistencyService';
import { parseSpeaker, stripSpeakerPrefix } from './voiceAssignment';
import type { Database } from '../types';
import { assessVideoClip } from './videoQualityGate';

const DEFAULT_STYLE_OBJ = {
  visualStyle: '电影级写实风格，cinematic lighting，高细节，8k分辨率，统一色调',
  colorPalette: '',
  cameraLanguage: '',
};

// ============ 共享工具 ============

/** 解析项目风格预设；无预设或失败时返回默认风格（保持原路由行为） */
function resolveStylePreset(db: Database, projectId: string | undefined): {
  stylePresetObj: { visualStyle: string; colorPalette: string; cameraLanguage: string; rhythm?: string; presetName?: string };
  unifiedStyle: string;
} {
  try {
    if (projectId) {
      const project = ProjectDAO.getById(db, projectId);
      if (project?.style_preset_id) {
        const preset = getProjectStylePreset(db, projectId);
        if (preset) {
          return { stylePresetObj: preset, unifiedStyle: preset.visualStyle };
        }
      }
    }
  } catch {
    // 获取风格预设失败，使用默认
  }
  return { stylePresetObj: { ...DEFAULT_STYLE_OBJ }, unifiedStyle: DEFAULT_STYLE_OBJ.visualStyle };
}

/** 将本地相对路径图片转换为 base64 data URL（视频模型 API 需要可访问的图片） */
function imageToDataUrl(imageUrl: string): string {
  try {
    if (imageUrl.startsWith('/')) {
      const localPath = projectStorage.toLocalPath(imageUrl);
      if (fs.existsSync(localPath)) {
        const imageBuffer = fs.readFileSync(localPath);
        const ext = path.extname(localPath).slice(1) || 'png';
        const mimeType = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
        return `data:${mimeType};base64,${imageBuffer.toString('base64')}`;
      }
    }
  } catch (err) {
    console.error('[EpisodeService] failed to convert image to base64:', err);
  }
  return imageUrl;
}

/** 获取镜头的首帧关键帧（指定 keyframeId 或自动取第一个首帧） */
function resolveFirstFrame(db: Database, userId: string, shotId: string, keyframeId?: string, allowNoKeyframe?: boolean): {
  firstFrameUrl: string;
  startFrameId: string;
} {
  if (keyframeId) {
    const kf = ShotKeyframeDAO.getByIdAndUser(db, keyframeId, userId);
    if (!kf) throw createError(404, 'NOT_FOUND', '关键帧不存在');
    if (kf.image_url) {
      return { firstFrameUrl: kf.image_url, startFrameId: kf.id };
    }
  } else {
    const keyframes = ShotKeyframeDAO.listByShot(db, shotId);
    const firstFrame = keyframes.find(k => k.frame_type === 'first') || keyframes[0];
    if (firstFrame?.image_url) {
      return { firstFrameUrl: firstFrame.image_url, startFrameId: firstFrame.id };
    }
  }
  if (allowNoKeyframe) return { firstFrameUrl: '', startFrameId: '' };
  throw createError(400, 'NO_KEYFRAME', '请先生成首帧关键帧，再生成视频');
}

/** 解析 AI 返回的剧集数据（严格解析失败时尝试宽松解析） */
function parseEpisodeAiData(content: string, actionLabel: string): any {
  let data: any;
  try {
    data = parseAiJsonOrThrow<any>(content);
    if (Array.isArray(data)) data = data[0];
  } catch (err) {
    const loose = parseAiJson<any>(content);
    if (loose.success && loose.data) {
      data = Array.isArray(loose.data) ? loose.data[0] : loose.data;
    } else {
      const contentPreview = content.length > 2000 ? content.slice(0, 2000) + '...[截断]' : content;
      throw createError(502, 'AI_CALL_FAILED', `${actionLabel}: AI返回内容解析失败: ${(err as Error).message}。返回预览: ${contentPreview}`);
    }
  }
  return data;
}

// ============ 剧本 ============

/** 重新生成某集剧本 */
export async function regenerateEpisodeScript(
  db: Database,
  userId: string,
  episodeId: string,
  provider: string,
  modelName: string
) {
  const episode = NovelEpisodeDAO.getByIdAndUser(db, episodeId, userId);
  if (!episode) throw createError(404, 'NOT_FOUND', '剧集不存在');

  const { systemPrompt, prompt } = novelToScriptPrompt({
    novelContent: episode.script_content,
    episodesCount: 1,
  });

  const result = await aiProxy.generateText({
    db, userId, provider, modelName,
    prompt, systemPrompt, responseFormat: 'json', maxTokens: 32000,
  });

  const contentPreview = result.content.length > 2000 ? result.content.slice(0, 2000) + '...[截断]' : result.content;
  console.log(`[RegenerateEpisode] episodeId=${episode.id} AI返回长度: ${result.content.length}, 预览: ${contentPreview}`);

  const data = parseEpisodeAiData(result.content, 'AI返回内容解析失败');

  return NovelEpisodeDAO.update(db, episode.id, {
    title: data.title || episode.title,
    script_content: data.scriptContent || episode.script_content,
    chapter_range: data.chapterRange || episode.chapter_range,
    theme: data.theme || episode.theme,
    characters_json: data.characters ? JSON.stringify(data.characters) : episode.characters_json,
    key_items_json: data.keyItems ? JSON.stringify(data.keyItems) : episode.key_items_json,
    text_model_used: `${provider}/${modelName}`,
    status: 'generated',
  });
}

/** 润色某集剧本（不改变剧情，只优化文字） */
export async function polishEpisodeScript(
  db: Database,
  userId: string,
  episodeId: string,
  provider: string,
  modelName: string
) {
  const episode = NovelEpisodeDAO.getByIdAndUser(db, episodeId, userId);
  if (!episode) throw createError(404, 'NOT_FOUND', '剧集不存在');

  const { systemPrompt, prompt } = polishScriptPrompt(episode.script_content);

  const result = await aiProxy.generateText({
    db, userId, provider, modelName,
    prompt, systemPrompt, responseFormat: 'json', maxTokens: 32000,
  });

  const contentPreview = result.content.length > 2000 ? result.content.slice(0, 2000) + '...[截断]' : result.content;
  console.log(`[PolishEpisode] episodeId=${episode.id} AI返回长度: ${result.content.length}, 预览: ${contentPreview}`);

  const data = parseEpisodeAiData(result.content, '润色失败');

  return NovelEpisodeDAO.update(db, episode.id, {
    title: data.title || episode.title,
    script_content: data.scriptContent || episode.script_content,
    text_model_used: `${provider}/${modelName}`,
    status: 'edited',
  });
}

// ============ 分镜 ============

/** 生成分镜（先删旧再创建，与自动流水线逻辑一致）
 * v2.0 - 场景关联（sceneName→script_scenes 匹配/创建，写 scene_id）+ 角色资产上下文注入
 */
export async function generateShotsForEpisode(
  db: Database,
  userId: string,
  episodeId: string,
  opts: {
    textProvider: string;
    textModel: string;
    shotDensity?: 'sparse' | 'normal' | 'dense';
    includeDialogue?: boolean;
  }
) {
  const episode = NovelEpisodeDAO.getByIdAndUser(db, episodeId, userId);
  if (!episode) throw createError(404, 'NOT_FOUND', '剧集不存在');

  const { textProvider, textModel, shotDensity, includeDialogue } = opts;

  // 已有角色资产（定妆信息）→ 注入分镜 prompt，保证分镜描述贴合定妆角色
  const existingCharacters = ScriptCharacterDAO.listByEpisode(db, episode.id)
    .filter(c => c.name)
    .map(c => ({ name: c.name, appearance: c.visual_description || c.description || c.name }));
  // 已有场景清单 → 约束镜头 sceneName 归属
  const existingScenes = ScriptSceneDAO.listByEpisode(db, episode.id);
  const sceneNames = existingScenes.map(s => s.name).filter(Boolean);

  // 剧集元数据 fallback：如果资产阶段还没提取角色/道具，用剧集生成时输出的清单
  let characters = existingCharacters.length > 0 ? existingCharacters : undefined;
  if (!characters && episode.characters_json) {
    try {
      const epChars = JSON.parse(episode.characters_json);
      if (Array.isArray(epChars) && epChars.length > 0) {
        characters = epChars.map((c: any) => ({ name: c.name, appearance: c.description || c.role || c.name }));
        console.log(`[GenerateShots] 使用剧集角色清单作fallback: ${characters.length}个角色`);
      }
    } catch { /* 解析失败忽略 */ }
  }
  let keyItems: Array<{ name: string; description: string }> | undefined;
  if (episode.key_items_json) {
    try {
      const items = JSON.parse(episode.key_items_json);
      if (Array.isArray(items) && items.length > 0) {
        keyItems = items.map((i: any) => ({ name: i.name, description: i.description || i.importance || '' }));
      }
    } catch { /* 解析失败忽略 */ }
  }

  const { systemPrompt, prompt } = shotGenerationPrompt({
    scriptContent: episode.script_content,
    shotDensity: shotDensity || 'normal',
    includeDialogue: includeDialogue !== false,
    characters,
    sceneNames: sceneNames.length > 0 ? sceneNames : undefined,
    keyItems,
    episodeTheme: episode.theme || undefined,
  });

  const result = await aiProxy.generateText({
    db, userId, provider: textProvider, modelName: textModel,
    prompt, systemPrompt, responseFormat: 'json', maxTokens: 32000,
  });

  let shots: any[];
  try {
    // 容错解析：支持 {shots:[...]} 包裹结构 + 中文键名
    shots = parseShotListArray<any[]>(result.content).map(normalizeShotValues);
  } catch (err) {
    throw createError(502, 'AI_CALL_FAILED', (err as Error).message);
  }

  // 删除旧镜头 + 创建新镜头须在同一事务内：分镜子表（关键帧/视频区间）是
  // ON DELETE CASCADE，插入中途失败（如镜头号重复触发唯一索引）会丢失全部旧分镜
  return db.transaction(() => {
    const old = ShotDAO.listByEpisode(db, episode.id);
    for (const s of old) ShotDAO.delete(db, s.id);

    // AI 可能返回重复镜头号（uq_shots_episode_num 唯一约束），先顺序去重
    const seen = new Set<number>();
    let nextNum = 1;
    const finalShots = shots.map((s: any) => {
      let num = s.shotNumber || 0;
      while (seen.has(num)) num = 10000 + nextNum++;
      seen.add(num);
      return { ...s, shotNumber: num };
    });

    // 阶段兜底：AI 未返回 phase 时，按镜头序号均分到 4 个阶段（确保每集都有4阶段结构）
    const PHASE_NAMES = ['开场引入', '矛盾升级', '高潮爆发', '收束悬念'];
    const total = finalShots.length;
    finalShots.forEach((s: any, idx: number) => {
      if (s.phase === undefined || s.phase === null) {
        const phaseNum = Math.min(4, Math.max(1, Math.floor((idx / Math.max(1, total)) * 4) + 1));
        s.phase = phaseNum;
        s.phaseName = PHASE_NAMES[phaseNum - 1];
      }
    });

    // 场景关联：sceneName → 匹配/创建 script_scenes，保证场景参考图注入链路可用
    // （此前 shots.scene_id 100% 为空，场景概念图永远收集不到，是最大连贯性缺口）
    const sceneMap = buildShotSceneMap(db, userId, episode.id, finalShots);

    return ShotDAO.batchCreate(db, finalShots.map((s: any) => ({
      user_id: userId,
      episode_id: episode.id,
      shot_number: s.shotNumber,
      shot_size: s.shotSize || 'medium',
      action_description: s.actionDescription || '',
      dialogue: s.dialogue || '',
      camera_movement: s.cameraMovement || 'static',
      grid_position: s.gridPosition || '5',
      duration_seconds: s.durationSeconds || 5,
      characters_in_shot: s.charactersInShot ? JSON.stringify(s.charactersInShot) : null,
      props_in_shot: s.propsInShot ? JSON.stringify(s.propsInShot) : null,
      scene_id: s.sceneName ? sceneMap.get(String(s.sceneName).trim()) : undefined,
      notes: s.notes || null,
      subject: s.subject || null,
      lighting: s.lighting || null,
      mood: s.mood || null,
      transition: s.transition || 'cut',
      pace: s.pace || 'normal',
      phase: s.phase ?? null,
      phase_name: s.phaseName || null,
    })));
  })();
}

// ============ 关键帧 ============

/** 生成关键帧（支持 first/last/middle 多帧类型与角色/场景参考图） */
export async function generateKeyframesForShot(
  db: Database,
  userId: string,
  shotId: string,
  opts: {
    provider: string;
    modelName: string;
    frameTypes?: Array<'first' | 'last' | 'middle'>;
    referenceCharacterIds?: string[];
    referenceSceneId?: string;
  }
) {
  const shot = ShotDAO.getByIdAndUser(db, shotId, userId);
  if (!shot) throw createError(404, 'NOT_FOUND', '镜头不存在');

  const episode = NovelEpisodeDAO.getById(db, shot.episode_id);
  if (!episode) throw createError(404, 'NOT_FOUND', '剧集不存在');

  const { provider, modelName, frameTypes, referenceCharacterIds, referenceSceneId } = opts;
  console.log('[Keyframe] start:', { provider, modelName, frameTypes, shotId: shot.id, projectId: episode.project_id });

  // 获取项目风格预设（保证全片画风一致）
  const { unifiedStyle, stylePresetObj } = resolveStylePreset(db, episode.project_id);

  // 获取剧本分析结果（用于提示词优化）
  let scriptAnalysis = null;
  try {
    scriptAnalysis = await scriptAnalysisService.analyzeScript(db, shot.episode_id, userId);
  } catch (err) {
    console.error('[Keyframe] 剧本分析失败（使用原始提示词）:', (err as Error).message);
  }

  // 获取参考角色（显式传入优先；缺省自动按镜头 characters_in_shot 收集——前端/批量入口无需感知，防旧图缓存与角色漂移）
  const characters: Array<{ name: string; visualDescription: string }> = [];
  const referenceImages: string[] = [];
  const charRefs: string[] = (referenceCharacterIds && referenceCharacterIds.length > 0)
    ? referenceCharacterIds
    : parseShotCharacterIds(shot);
  if (charRefs.length > 0) {
    for (const ref of charRefs) {
      let c = ScriptCharacterDAO.getById(db, ref);
      if (!c) {
        const epChars = ScriptCharacterDAO.listByEpisode(db, shot.episode_id);
        c = epChars.find((x: any) => x.name === ref) || null;
      }
      if (c) {
        if (c.reference_image_url) referenceImages.push(c.reference_image_url);
        characters.push({ name: c.name, visualDescription: c.visual_description });
      }
    }
  }

  // 获取参考场景
  let scene: any = null;
  if (referenceSceneId) {
    scene = ScriptSceneDAO.getById(db, referenceSceneId);
    // 收集场景参考图（DAO层已解析concept_images为数组）
    if (scene?.concept_images && Array.isArray(scene.concept_images)) {
      const sceneImages = scene.concept_images;
      if (sceneImages.length > 0) {
        const sceneImgUrl = sceneImages[scene.selected_image_index || 0]?.url || sceneImages[0]?.url;
        if (sceneImgUrl) referenceImages.push(sceneImgUrl);
      }
    }
  }

  const types = frameTypes || ['first', 'last'];
  const results = [];

  for (const frameType of types) {
    try {
      console.log('[Keyframe] generating frame:', frameType);
      const { prompt: basePrompt, negativePrompt: baseNegativePrompt } = keyframePrompt({
        shotDescription: shot.action_description,
        characters,
        scene: scene ? { name: scene.name, description: scene.description, timeOfDay: scene.time_of_day, atmosphere: scene.atmosphere } : undefined,
        frameType: frameType as 'first' | 'last' | 'middle',
        stylePrompt: unifiedStyle,
      });

      // 提示词优化（基于剧本分析结果）
      let finalPrompt = basePrompt;
      let finalNegativePrompt = baseNegativePrompt;
      if (scriptAnalysis) {
        const shotContext = {
          shotNumber: shot.shot_number || 0,
          actionDescription: shot.action_description || '',
          dialogue: shot.dialogue || '',
          shotSize: shot.shot_size || 'medium',
          cameraMovement: shot.camera_movement || 'static',
          duration: shot.duration_seconds || 5,
          charactersInShot: characters.map(c => c.name),
          sceneName: scene?.name,
        };
        const optimized = promptOptimizationService.optimizeKeyframePrompt(
          basePrompt,
          shotContext,
          scriptAnalysis,
          stylePresetObj
        );
        finalPrompt = optimized.prompt;
        if (optimized.negativePrompt) finalNegativePrompt = optimized.negativePrompt;
        console.log('[Keyframe] 提示词优化:', promptOptimizationService.getOptimizationSummary(optimized));
      }

      console.log('[Keyframe] prompt generated:', finalPrompt.substring(0, 100));

      const imgResult = await aiProxy.generateImage({
        db, userId, projectId: episode.project_id,
        provider, modelName, prompt: finalPrompt, negativePrompt: finalNegativePrompt,
        count: 1, size: '2560x1440',
        referenceImages: referenceImages.length > 0 ? referenceImages : undefined,
        saveSubDir: 'keyframes',
      });
      console.log('[Keyframe] image generated:', imgResult.images?.length);

      const keyframe = ShotKeyframeDAO.create(db, {
        user_id: userId,
        shot_id: shot.id,
        frame_type: frameType,
        prompt: finalPrompt,
        negative_prompt: finalNegativePrompt,
        image_url: imgResult.images[0]?.url,
        image_model_used: modelName,
        reference_characters: charRefs.length > 0 ? JSON.stringify(charRefs) : undefined,
        reference_scene: referenceSceneId || undefined,
      });
      results.push(keyframe);
    } catch (err: any) {
      console.error('[Keyframe] frame generation failed:', frameType, err.message, err.stack);
      throw err;
    }
  }

  return results;
}

/** 重新生成单帧（可选提示词优化） */
export async function regenerateKeyframe(
  db: Database,
  userId: string,
  keyframeId: string,
  opts: { provider: string; modelName: string; optimizePrompt?: boolean }
) {
  const keyframe = ShotKeyframeDAO.getByIdAndUser(db, keyframeId, userId);
  if (!keyframe) throw createError(404, 'NOT_FOUND', '关键帧不存在');

  const shot = ShotDAO.getById(db, keyframe.shot_id);
  const episode = NovelEpisodeDAO.getById(db, shot!.episode_id);
  const { provider, modelName, optimizePrompt } = opts;

  // 如果用户要求优化提示词，则进行剧本分析和提示词优化
  let finalPrompt = keyframe.prompt;
  let finalNegativePrompt = keyframe.negative_prompt || undefined;

  if (optimizePrompt !== false) {
    try {
      // 获取项目风格预设
      const { stylePresetObj } = resolveStylePreset(db, episode!.project_id);

      // 获取剧本分析结果
      const scriptAnalysis = await scriptAnalysisService.analyzeScript(db, shot!.episode_id, userId);

      // 提示词优化
      const shotContext = {
        shotNumber: shot!.shot_number || 0,
        actionDescription: shot!.action_description || '',
        dialogue: shot!.dialogue || '',
        shotSize: shot!.shot_size || 'medium',
        cameraMovement: shot!.camera_movement || 'static',
        duration: shot!.duration_seconds || 5,
        charactersInShot: [],
        sceneName: undefined,
      };
      const optimized = promptOptimizationService.optimizeKeyframePrompt(
        keyframe.prompt,
        shotContext,
        scriptAnalysis,
        stylePresetObj
      );
      finalPrompt = optimized.prompt;
      if (optimized.negativePrompt) finalNegativePrompt = optimized.negativePrompt;
      console.log('[Keyframe Regenerate] 提示词优化:', promptOptimizationService.getOptimizationSummary(optimized));
    } catch (err) {
      console.error('[Keyframe Regenerate] 提示词优化失败（使用原始提示词）:', (err as Error).message);
    }
  }

  const result = await aiProxy.generateImage({
    db, userId, projectId: episode!.project_id,
    provider, modelName,
    prompt: finalPrompt,
    negativePrompt: finalNegativePrompt,
    count: 1, size: '2560x1440',
    saveSubDir: 'keyframes',
    referenceImages: collectShotReferenceImages(db, shot!),
  });

  return ShotKeyframeDAO.update(db, keyframe.id, {
    image_url: result.images[0]?.url,
    image_model_used: modelName,
    prompt: finalPrompt,
    negative_prompt: finalNegativePrompt,
  });
}

// ============ 视频生成 ============

/** 从剧本分析中提取角色/场景上下文（用于视频提示词的人物一致性） */
function buildVideoShotContext(shot: any, scriptAnalysis: any, totalShots: number, duration: number, sceneWithLighting = true) {
  // 获取该镜头中的角色信息（P0 一致性：优先按 shots.characters_in_shot 过滤，只注入该镜角色，防止无关角色乱入）
  let charactersInShot: string[] = [];
  const characterDetails: Record<string, string> = {};
  const analysisChars: any[] = (scriptAnalysis && scriptAnalysis.characterAnalysis) || [];
  const matchName = (shotName: string, charName: string) =>
    shotName === charName || shotName.includes(charName) || charName.includes(shotName);
  try {
    // mapShotRow 已将 characters_in_shot 解析为数组；此处兼容字符串/数组两种形态
    const rawCis: any = shot.characters_in_shot;
    if (rawCis) {
      let parsed: any = rawCis;
      if (typeof rawCis === 'string') { try { parsed = JSON.parse(rawCis); } catch { parsed = []; } }
      if (Array.isArray(parsed) && parsed.length > 0) {
        charactersInShot = parsed.filter((n: any) => typeof n === 'string');
      }
    }
    // 镜头无角色标记 → 退回全部分析角色
    if (charactersInShot.length === 0 && analysisChars.length > 0) {
      charactersInShot = analysisChars.map((c: any) => c.characterName);
    }
    // 按镜头角色过滤 characterDetails（用字符包含匹配兼容 桂芬/刘桂芬 等别名）
    for (const char of analysisChars) {
      if (char.characterName && char.visualTraits) {
        const inShot = charactersInShot.some((n: string) => matchName(n, char.characterName));
        if (inShot) {
          // 优先使用角色定妆表的 visual_description（含年龄/面容/服装等权威描述），
          // H3 对文本约束的遵循强于参考图，可显著改善人物年龄/身份漂移
          const vd = resolveVisualDescription(db, shot.episode_id, char.characterName);
          characterDetails[char.characterName] = vd || char.visualTraits;
        }
      }
    }
    // 从动作描述中提取角色名（兜底）
    if (charactersInShot.length === 0 && shot.action_description) {
      const nameMatches: string[] | null = shot.action_description.match(/[\u4e00-\u9fa5]{2,4}(?=[，。、\s])/g);
      if (nameMatches) {
        charactersInShot = [...new Set(nameMatches)].slice(0, 3);
      }
    }
  } catch {
    // 获取角色信息失败，使用空数组
  }

  // 获取场景信息
  let sceneName: string | undefined;
  let sceneDescription: string | undefined;
  try {
    if (scriptAnalysis && scriptAnalysis.sceneAnalysis && scriptAnalysis.sceneAnalysis.length > 0) {
      const scene = scriptAnalysis.sceneAnalysis[0];
      sceneName = scene.sceneName;
      sceneDescription = sceneWithLighting
        ? `${scene.location}, ${scene.timeOfDay}, 氛围: ${scene.atmosphere?.join('/')}, 光线: ${scene.lighting}`
        : `${scene.location}, ${scene.timeOfDay}, 氛围: ${scene.atmosphere?.join('/')}`;
    }
  } catch {
    // 获取场景信息失败
  }

  return {
    shotNumber: shot.shot_number || 0,
    totalShots,
    actionDescription: shot.action_description || '',
    dialogue: shot.dialogue || '',
    shotSize: shot.shot_size || 'medium',
    cameraMovement: shot.camera_movement || 'static',
    duration,
    charactersInShot,
    sceneName,
    sceneDescription,
    characterDetails,
  };
}

const SHOT_SIZE_LABELS: Record<string, string> = {
  extreme_wide: '大远景，展现场景全貌',
  long: '远景，人物全身与环境',
  full: '全景，完整动作',
  medium: '中景，膝盖以上',
  medium_closeup: '近景，胸部以上',
  closeup: '特写，肩部以上，情绪聚焦',
  extreme_closeup: '大特写，细节强调',
};

const CAMERA_MOVEMENT_LABELS: Record<string, string> = {
  push_in: '镜头缓慢推近，聚焦主体',
  pull_out: '镜头缓慢拉远，展现场景',
  pan: '镜头水平摇移，跟随动作',
  tilt: '镜头垂直升降',
  truck: '摄像机平行移动跟随人物',
  crane: '镜头升降运动，宏大场面',
  handheld: '手持镜头，轻微晃动，纪实紧张感',
  steadicam: '稳定器平滑跟随，长镜头',
  static: '固定镜头，稳定画面',
};

/** 生成单个镜头的视频（异步任务，返回处理中的记录） */
/** 从角色定妆表解析 visual_description（episode+名称模糊匹配） */
function resolveVisualDescription(db: Database, episodeId: string, charName: string): string | null {
  try {
    const chars = ScriptCharacterDAO.listByEpisode(db, episodeId) || [];
    const hit = chars.find((c: any) =>
      c.visual_description && (c.name === charName || c.name.includes(charName) || charName.includes(c.name))
    );
    return hit ? String(hit.visual_description).slice(0, 120) : null;
  } catch (err) {
    console.warn('[Video] visual_description 解析失败:', (err as Error).message);
    return null;
  }
}

export async function generateVideoForShot(
  db: Database,
  userId: string,
  shotId: string,
  opts: {
    provider: string;
    modelName: string;
    keyframeId?: string;
    motionPrompt?: string;
    duration?: number;
    ratio?: '16:9' | '9:16' | '1:1' | '4:3' | '3:4' | '21:9';
    resolution?: '720p' | '1080p' | '2k' | '4k';
    subtitles?: boolean;
    endFrameId?: string;       // 显式指定尾帧关键帧
    firstFrameImageUrl?: string; // 显式覆盖首帧（上一镜尾帧继承等）
    referenceImages?: string[]; // 一致性参考图（角色/场景/道具），未传则自动收集
  }
) {
  const shot = ShotDAO.getByIdAndUser(db, shotId, userId);
  if (!shot) throw createError(404, 'NOT_FOUND', '镜头不存在');

  const { provider, modelName, keyframeId, motionPrompt, duration, ratio, resolution, subtitles, endFrameId, referenceImages, firstFrameImageUrl: explicitFirstFrame } = opts;

  // 获取剧集信息（用于提示词优化和项目ID）
  const episode = NovelEpisodeDAO.getById(db, shot.episode_id);

  // 获取首帧
  const { firstFrameUrl, startFrameId } = resolveFirstFrame(db, userId, shot.id, keyframeId, provider === 'comfyui');

  // ═══════════════════════════════════════════════════════════
  // 首尾帧衔接（低抽卡核心）：显式尾帧 > 下一镜首帧（use_next_first_frame=1）
  // 尾帧硬锁定 → 视频模型只做中间插值，起止落点完全可控
  // ═══════════════════════════════════════════════════════════
  let lastFrameImageUrl: string | undefined;
  let resolvedEndFrameId: string | null = null;
  try {
    if (endFrameId) {
      const kf = ShotKeyframeDAO.getById(db, endFrameId);
      if (kf?.image_url) {
        lastFrameImageUrl = imageToDataUrl(kf.image_url);
        resolvedEndFrameId = kf.id;
      }
    } else {
      const allShots = ShotDAO.listByEpisode(db, shot.episode_id);
      const lastFrame = resolveLastFrameForShot(db, shot, allShots);
      if (lastFrame) {
        lastFrameImageUrl = imageToDataUrl(lastFrame.imageUrl);
        resolvedEndFrameId = lastFrame.keyframeId;
      }
    }
  } catch (err) {
    console.warn('[Video] 尾帧解析失败，退化为单首帧生成:', (err as Error).message);
  }

  // 一致性参考图（未显式传入时自动收集角色/场景/道具图）
  let shotReferenceImages = referenceImages && referenceImages.length > 0
    ? referenceImages
    : collectShotReferenceImages(db, shot);

  // 首帧来源：显式覆盖 > 上一镜尾帧继承 > 关键帧
  // （ComfyUI H3 无 end 帧参数，"尾帧硬锁定"对其无效；改以真实画面锚定镜头起点）
  let inheritedFirstFrameUrl: string | null = null;
  if (!explicitFirstFrame) {
    inheritedFirstFrameUrl = resolvePreviousShotTailFrame(db, shot);
  }
  const sourceFirstFrame = explicitFirstFrame || inheritedFirstFrameUrl || firstFrameUrl;

  // 将相对路径的首帧图片转换为 base64 data URL（豆包 API 需要可访问的图片）
  const firstFrameImageForApi = imageToDataUrl(sourceFirstFrame);
  if (firstFrameImageForApi !== firstFrameUrl) {
    console.log('[Video] first frame converted to base64, length:', firstFrameImageForApi.length);
  }
  // 使用继承帧时，本镜关键帧降为参考图首位，维持角色/场景/道具锚定
  if (sourceFirstFrame !== firstFrameUrl) {
    shotReferenceImages = [imageToDataUrl(firstFrameUrl), ...shotReferenceImages];
  }

  // 提示词优化（基于剧本分析结果）
  let finalMotionPrompt = motionPrompt;

  try {
    // 获取项目风格预设
    const { stylePresetObj } = resolveStylePreset(db, episode?.project_id);

    // 获取剧本分析结果
    const scriptAnalysis = await scriptAnalysisService.analyzeScript(db, shot.episode_id, userId);

    // 如果没有传入 motionPrompt，则自动构建基础提示词
    let baseMotionPrompt = motionPrompt;
    if (!baseMotionPrompt) {
      const shotSizeDesc = SHOT_SIZE_LABELS[shot.shot_size] || '中景';
      const cameraDesc = CAMERA_MOVEMENT_LABELS[shot.camera_movement] || '固定镜头';
      baseMotionPrompt = `【景别】${shotSizeDesc}。【镜头运动】${cameraDesc}。【画面内容】${shot.action_description || ''}。【风格】${stylePresetObj.visualStyle}。`;
    }

    const shotContext = buildVideoShotContext(shot, scriptAnalysis, 0, shot.duration_seconds || 5);
    const { charactersInShot, characterDetails, sceneName } = shotContext;

    // 先使用导演提示词服务生成基础提示词（如果可用）
    let directorPromptResult: any = null;
    try {
      // characterDetails 实际传的是 visualTraits 字符串表；原实现经动态 require 调用无类型检查，此处保持一致
      directorPromptResult = directorPromptService.generateVideoPrompt(shotContext as any, scriptAnalysis);
    } catch {
      // 导演提示词服务不可用，继续使用优化服务
    }

    const optimized = promptOptimizationService.optimizeVideoPrompt(
      directorPromptResult?.prompt || baseMotionPrompt,
      shotContext,
      scriptAnalysis,
      stylePresetObj
    );

    // 直接按镜头角色从定妆表注入 visual_description（不依赖剧本分析的 visualTraits，保证始终有权威外貌描述）
    if (charactersInShot.length > 0) {
      for (const n of charactersInShot) {
        if (typeof n === 'string' && n.trim()) {
          const vd = resolveVisualDescription(db, shot.episode_id, n.trim());
          if (vd && !Object.values(characterDetails).includes(vd)) characterDetails[n.trim()] = vd;
        }
      }
    }
    // 合并导演提示词和优化提示词，注入角色视觉描述确保人物一致性
    let finalPrompt = optimized.prompt;
    if (Object.keys(characterDetails).length > 0) {
      const charDescText = Object.entries(characterDetails)
        .map(([name, desc]) => `${name}: ${desc}`)
        .join('；');
      finalPrompt += `。【角色视觉一致性】${charDescText}。严格保持角色外观、服装、发型、发色与角色设定一致。画面中只出现以上列出的角色，不得出现名单之外的其他人物，前后镜头角色身份必须一致。画面中只出现以上列出的角色，不得出现名单之外的其他人物`;
    }
    if (directorPromptResult?.negativePrompt) {
      finalPrompt += `。【避免】${directorPromptResult.negativePrompt}`;
    }

    finalMotionPrompt = finalPrompt;
    console.log('[Video] 提示词优化:', promptOptimizationService.getOptimizationSummary(optimized));
    console.log('[Video] 角色数:', charactersInShot.length, '场景:', sceneName || '未知');
  } catch (err) {
    console.error('[Video] 提示词优化失败（使用原始提示词）:', (err as Error).message);
  }

  // 创建视频片段记录
  const videoInterval = ShotVideoIntervalDAO.create(db, {
    user_id: userId,
    shot_id: shot.id,
    start_frame_id: startFrameId,
    end_frame_id: resolvedEndFrameId || undefined,
    duration_seconds: duration || 5,
    motion_prompt: finalMotionPrompt,
    video_model_used: `${provider}/${modelName}`,
  });

  try {
    // 获取 project_id
    const projectId = episode?.project_id || '';

    // 调用 AI 生成视频（异步任务）
    const result = await aiProxy.generateVideo({
      db,
      userId,
      projectId,
      provider,
      modelName,
      firstFrameImageUrl: firstFrameImageForApi,
      lastFrameImageUrl,
      referenceImages: shotReferenceImages.length > 0 ? shotReferenceImages : undefined,
      referenceVideos: (() => { const u = resolvePreviousShotVideoUrl(db, shot); return u ? [u] : undefined; })(),
      motion: finalMotionPrompt || shot.action_description || '',
      duration: duration || 5,
      ratio,
      resolution,
      subtitles,
    });

    // 更新任务 ID
    ShotVideoIntervalDAO.update(db, videoInterval.id, {
      external_task_id: result.taskId,
      status: 'processing',
    });

    return { ...videoInterval, external_task_id: result.taskId, status: 'processing' };
  } catch (err) {
    ShotVideoIntervalDAO.updateStatus(db, videoInterval.id, 'failed', (err as Error).message);
    throw err;
  }
}

/** 查询视频任务状态（含超时清理与外部状态同步、视频下载） */
export async function getVideoStatus(db: Database, userId: string, videoId: string) {
  const video = ShotVideoIntervalDAO.getById(db, videoId);
  if (!video || video.user_id !== userId) {
    throw createError(404, 'NOT_FOUND', '视频不存在');
  }

  // 超时清理：云端供应商通常 1-10 分钟出片；ComfyUI 本地渲染（MiniMaxH3 等）可长达 30 分钟以上，
  // 按 provider 区分超时窗口，避免把健康任务误判失败
  if ((video.status === 'pending' || video.status === 'processing') && video.created_at) {
    const createdTime = new Date(video.created_at).getTime();
    const isLocalComfy = (video.video_model_used || '').startsWith('comfyui');
    // ComfyUI 本地任务由队列顺序渲染，排队时间计入等待，不设主动超时；
    // 真正失败由轮询 /history 的 status_str=error 捕获，避免排队任务被误判超时
    const timeoutMs = isLocalComfy ? 24 * 60 * 60 * 1000 : 10 * 60 * 1000;
    if (Date.now() - createdTime > timeoutMs) {
      const msg = isLocalComfy ? '任务超时（ComfyUI本地渲染超过24小时）' : '任务超时（超过10分钟）';
      ShotVideoIntervalDAO.update(db, video.id, { status: 'failed', error_message: msg });
      return { ...video, status: 'failed', error_message: msg };
    }
  }

  // 如果还在处理中，查询外部任务状态
  if ((video.status === 'pending' || video.status === 'processing') && video.external_task_id && video.video_model_used) {
    const [provider, modelName] = video.video_model_used.split('/');
    try {
      const taskResult = await aiProxy.getVideoTask({
        db,
        userId,
        provider,
        modelName,
        taskId: video.external_task_id,
      });

      if (taskResult.status === 'completed' && taskResult.videoUrl) {
        // 下载视频到本地
        try {
          const shot = ShotDAO.getById(db, video.shot_id);
          const episode = shot ? NovelEpisodeDAO.getById(db, shot.episode_id) : null;
          const projectId = episode?.project_id || '';
          const saveDir = path.resolve(projectStorage.getDataDir(projectId), 'videos');
          projectStorage.ensureDir(saveDir);
          const fileName = projectStorage.generateFileName('mp4');
          const localPath = path.resolve(saveDir, fileName);
          // 流式下载：带超时与状态校验
          await downloadToFile(taskResult.videoUrl, localPath, { timeoutMs: 180_000 });
          const localUrl = projectStorage.toUrlPath(localPath);

          ShotVideoIntervalDAO.update(db, video.id, {
            status: 'completed',
            video_url: localUrl,
            completed_at: new Date().toISOString(),
            progress: 100,
          });

          // VLM 视频质量门：抽帧 + 视觉模型打分（主体漂移/幻觉/字幕残留）
          // 不合格 → 标记 failed 并给出具体原因，前端可直接重生成该镜头
          // （未配置视觉模型或调用失败时静默放行，不阻断生产）
          try {
            if (shot) {
              const quality = await assessVideoClip({
                db,
                userId,
                videoPath: localPath,
                shot,
              });
              if (!quality.skipped && !quality.passed) {
                const qMsg = `[质量门] score=${quality.score}：${quality.issues.join('；') || '主体一致性/画面异常'}`;
                ShotVideoIntervalDAO.updateStatus(db, video.id, 'failed', qMsg);
                console.warn(`[VideoStatus] 镜头 ${shot.shot_number} ${qMsg}`);
                return { ...video, status: 'failed', error_message: qMsg };
              }
              if (!quality.skipped) {
                // 质量门结果落库（quality_check 列）
                ShotVideoIntervalDAO.update(db, video.id, {
                  quality_check: quality.passed ? 'passed' : 'failed',
                  quality_score: quality.score,
                  quality_issues: quality.issues.slice(0, 5).join('；'),
                });
                console.log(`[VideoStatus] 镜头 ${shot.shot_number} 质量门通过 score=${quality.score}`);
              }
            }
          } catch (qErr) {
            console.warn('[VideoStatus] 质量门执行失败（跳过）:', (qErr as Error).message);
          }

          return { ...video, status: 'completed', video_url: localUrl };
        } catch {
          // 下载失败，保留远程 URL
          ShotVideoIntervalDAO.update(db, video.id, {
            status: 'completed',
            video_url: taskResult.videoUrl,
            completed_at: new Date().toISOString(),
            progress: 100,
          });
          return { ...video, status: 'completed', video_url: taskResult.videoUrl };
        }
      } else if (taskResult.status === 'failed') {
        ShotVideoIntervalDAO.update(db, video.id, { status: 'failed', error_message: '视频生成失败', progress: 0 });
        return { ...video, status: 'failed', error_message: '视频生成失败', progress: 0 };
      } else {
        // 处理中：同步真实渲染进度（ComfyUI /progress），前端进度条使用真实数据而非估算
        if (typeof taskResult.progress === 'number' && taskResult.progress >= 0) {
          ShotVideoIntervalDAO.update(db, video.id, { progress: taskResult.progress });
          return { ...video, status: taskResult.status, progress: taskResult.progress };
        }
        return { ...video, status: taskResult.status };
      }
    } catch (err) {
      // 查询失败，记录错误并返回本地状态
      console.error('[VideoStatus] 查询外部任务状态失败:', {
        videoId: video.id,
        provider,
        modelName,
        externalTaskId: video.external_task_id,
        error: (err as Error).message,
        stack: (err as Error).stack,
      });
      return video;
    }
  }

  return video;
}

// ============ 批量生成 ============

/** 批量生成首帧关键帧（对已有首帧的镜头先删后生成） */
export async function batchGenerateKeyframes(
  db: Database,
  userId: string,
  episodeId: string,
  opts: { provider: string; modelName: string; shotIds?: string[]; candidatesPerShot?: number },
  onProgress?: (p: { index: number; total: number; shotId: string; status: 'ok' | 'failed' }) => void
) {
  const episode = NovelEpisodeDAO.getByIdAndUser(db, episodeId, userId);
  if (!episode) throw createError(404, 'NOT_FOUND', '剧集不存在');

  const { provider, modelName, shotIds, candidatesPerShot } = opts;
  const candidateCount = Math.min(Math.max(candidatesPerShot || 1, 1), 9);

  let shots = ShotDAO.listByEpisode(db, episode.id);
  if (shotIds && shotIds.length > 0) {
    shots = shots.filter(s => shotIds.includes(s.id));
  }

  const results: any[] = [];
  const errors: Array<{ shotId: string; error: string }> = [];

  for (const shot of shots) {
    // 重新生成首帧：必须先生成成功、再删除旧帧。
    // 旧逻辑先删后生成，一旦生成失败（限流/Key 失效），镜头唯一的首帧永久丢失，
    // 下游视频生成会因"无首帧关键帧"跳过该镜头
    try {
      // 九宫格候选模式：生成 N 个视角候选（frame_type='candidate'），不删除旧首帧，
      // 用户挑选满意的一张后经"选择为首帧"接口升级（BigBanana 九宫格方案）
      if (candidateCount > 1) {
        const candidates = await generateKeyframeCandidates(db, userId, shot, {
          provider,
          modelName,
          count: candidateCount,
          referenceImages: collectShotReferenceImages(db, shot),
        });
        results.push({ shotId: shot.id, success: true, mode: 'candidates', candidates });
        continue;
      }

      // 复用单镜完整逻辑：角色参考（缺省自动按镜头角色收集）+ 场景 + 提示词优化 + 参考图注入
      // 与前端单镜/批量入口行为完全一致，防止批量关键帧缺角色描述导致人物漂移
      const kfs = await generateKeyframesForShot(db, userId, shot.id, {
        provider,
        modelName,
        frameTypes: ['first'],
      });
      const keyframe = kfs[0];

      // 新帧落库成功后再移除旧帧（保留新生成的 first）
      const existing = ShotKeyframeDAO.listByShot(db, shot.id);
      const existingFirst = existing.find(k => k.frame_type === 'first' && k.image_url && k.id !== keyframe.id);
      if (existingFirst) {
        ShotKeyframeDAO.delete(db, existingFirst.id);
      }
      results.push({ shotId: shot.id, success: true, keyframe });
    } catch (err: any) {
      const errorMsg = err.message || '生成失败';
      console.error(`[BatchKeyframe] 镜头 ${shot.id} 生成失败:`, errorMsg);
      errors.push({ shotId: shot.id, error: errorMsg });
      results.push({ shotId: shot.id, success: false, error: errorMsg });
    }
  }

  return {
    total: shots.length,
    success: results.filter(r => r.success).length,
    skipped: results.filter(r => r.skipped).length,
    failed: errors.length,
    results,
  };
}

/** 批量生成视频（为每个有首帧的镜头创建视频任务，限速间隔避免限流） */
export async function batchGenerateVideos(
  db: Database,
  userId: string,
  episodeId: string,
  opts: {
    provider: string;
    modelName: string;
    shotIds?: string[];
    duration?: number;
    ratio?: '16:9' | '9:16' | '1:1' | '4:3' | '3:4' | '21:9';
    resolution?: '720p' | '1080p' | '2k' | '4k';
  },
  onProgress?: (p: { index: number; total: number; shotId: string; status: 'created' | 'skipped' | 'failed' }) => void
) {
  const episode = NovelEpisodeDAO.getByIdAndUser(db, episodeId, userId);
  if (!episode) throw createError(404, 'NOT_FOUND', '剧集不存在');

  const { provider, modelName, shotIds, duration, ratio, resolution } = opts;
  // 项目风格预设：保证批量视频与单镜/关键帧使用同一画风（此前硬编码默认风格导致预设失效）
  const { stylePresetObj } = resolveStylePreset(db, episode.project_id);
  let shots = ShotDAO.listByEpisode(db, episode.id);
  if (shotIds && shotIds.length > 0) {
    shots = shots.filter(s => shotIds.includes(s.id));
  }

  const created: any[] = [];
  const skipped: any[] = [];

  for (const shot of shots) {
    // 检查是否有首帧
    const keyframes = ShotKeyframeDAO.listByShot(db, shot.id);
    const firstFrame = keyframes.find(k => k.frame_type === 'first' && k.image_url) || keyframes[0];
    if (!firstFrame || !firstFrame.image_url) {
      skipped.push({ shotId: shot.id, reason: '无首帧关键帧' });
      onProgress?.({ index: skipped.length + created.length, total: shots.length, shotId: shot.id, status: 'skipped' });
      continue;
    }

    // ═══════════════════════════════════════════════════════════
    // 首尾帧衔接（低抽卡核心）：下一镜首帧作尾帧（VideoClaw 方案）
    // + 一致性参考图注入（角色/场景/道具，防漂移）
    // ═══════════════════════════════════════════════════════════
    let lastFrameImageUrl: string | undefined;
    let resolvedEndFrameId: string | null = null;
    try {
      const lastFrame = resolveLastFrameForShot(db, shot, shots);
      if (lastFrame) {
        lastFrameImageUrl = imageToDataUrl(lastFrame.imageUrl);
        resolvedEndFrameId = lastFrame.keyframeId;
      }
    } catch { /* 尾帧解析失败，退化为单首帧生成 */ }
    const shotReferenceImages = collectShotReferenceImages(db, shot);

    // 检查是否已有处理中的视频（清理超时超过2分钟的任务）
    const existingVideos = ShotVideoIntervalDAO.listByShot(db, shot.id);
    const TWO_MINUTES = 2 * 60 * 1000;
    const now = Date.now();
    for (const v of existingVideos) {
      if ((v.status === 'processing' || v.status === 'pending') && v.created_at) {
        const createdTime = new Date(v.created_at).getTime();
        if (now - createdTime > TWO_MINUTES) {
          // 超时任务标记为失败
          ShotVideoIntervalDAO.update(db, v.id, { status: 'failed', error_message: '任务超时（超过2分钟）' });
        }
      }
    }
    // 重新获取更新后的视频列表
    const updatedVideos = ShotVideoIntervalDAO.listByShot(db, shot.id);
    if (updatedVideos.some(v => v.status === 'processing' || v.status === 'pending')) {
      skipped.push({ shotId: shot.id, reason: '已有处理中视频' });
      onProgress?.({ index: skipped.length + created.length, total: shots.length, shotId: shot.id, status: 'skipped' });
      continue;
    }

    try {
      // 转换首帧为 base64
      const firstFrameImageForApi = imageToDataUrl(firstFrame.image_url);

      // 提示词优化（人物一致性 + 导演级提示词）
      let finalMotionPrompt = shot.action_description || '';
      try {
        const scriptAnalysis = await scriptAnalysisService.analyzeScript(db, shot.episode_id, userId);
        const shotContext = buildVideoShotContext(shot, scriptAnalysis, shots.length, duration || 5, false);
        const { characterDetails } = shotContext;

        // 导演提示词服务
        let directorPromptResult: any = null;
        try {
          // 同上：保持原动态 require 调用的宽松类型行为
          directorPromptResult = directorPromptService.generateVideoPrompt(shotContext as any, scriptAnalysis);
        } catch { /* ignore */ }

        // 提示词优化服务
        const optimized = promptOptimizationService.optimizeVideoPrompt(
          directorPromptResult?.prompt || shot.action_description || '',
          shotContext,
          scriptAnalysis,
          stylePresetObj
        );

        // 合并提示词，注入角色视觉描述确保人物一致性
        finalMotionPrompt = optimized.prompt;
        if (Object.keys(characterDetails).length > 0) {
          const charDescText = Object.entries(characterDetails)
            .map(([name, desc]) => `${name}: ${desc}`)
            .join('；');
          finalMotionPrompt += `。【角色视觉一致性】${charDescText}。严格保持角色外观、服装、发型、发色与角色设定一致`;
        }
      } catch (err) {
        console.error('[BatchVideo] 提示词优化失败:', (err as Error).message);
      }

      const videoInterval = ShotVideoIntervalDAO.create(db, {
        user_id: userId,
        shot_id: shot.id,
        start_frame_id: firstFrame.id,
        end_frame_id: resolvedEndFrameId || undefined,
        duration_seconds: duration || 5,
        motion_prompt: finalMotionPrompt,
        video_model_used: `${provider}/${modelName}`,
      });

      const result = await aiProxy.generateVideo({
        db, userId, projectId: episode.project_id,
        provider, modelName,
        firstFrameImageUrl: firstFrameImageForApi,
        lastFrameImageUrl,
        referenceImages: shotReferenceImages.length > 0 ? shotReferenceImages : undefined,
        motion: finalMotionPrompt,
        duration: duration || 5,
        ratio, resolution,
        subtitles: false, // 对齐文档：生视频阶段不要字幕
      });

      ShotVideoIntervalDAO.update(db, videoInterval.id, {
        external_task_id: result.taskId,
        status: 'processing',
      });

      created.push({ shotId: shot.id, videoId: videoInterval.id, taskId: result.taskId });
      onProgress?.({ index: skipped.length + created.length, total: shots.length, shotId: shot.id, status: 'created' });
    } catch (err: any) {
      const errorMsg = err.message || '创建失败';
      skipped.push({ shotId: shot.id, reason: errorMsg });
      onProgress?.({ index: skipped.length + created.length, total: shots.length, shotId: shot.id, status: 'failed' });
      // 如果是速率限制，多等一会儿再继续
      if (errorMsg.includes('rate limit') || errorMsg.includes('限流') || err.code === 'AI_RATE_LIMITED') {
        await new Promise(resolve => setTimeout(resolve, 10000));
      }
    }

    // 请求间隔：避免速率限制（Agnes AI 等模型有每分钟请求数限制），可用环境变量 BATCH_VIDEO_INTERVAL_MS 调整
    await new Promise(resolve => setTimeout(resolve, Number(process.env.BATCH_VIDEO_INTERVAL_MS) || 5000));
  }

  return {
    total: shots.length,
    created: created.length,
    skipped: skipped.length,
    createdVideos: created,
    skippedShots: skipped,
  };
}

// ============ 字幕 ============

function formatSrtTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

/** 从分镜台词生成 SRT 字幕 */
export function getEpisodeSubtitles(db: Database, userId: string, episodeId: string) {
  const episode = NovelEpisodeDAO.getByIdAndUser(db, episodeId, userId);
  if (!episode) throw createError(404, 'NOT_FOUND', '剧集不存在');

  const shots = ShotDAO.listByEpisode(db, episode.id);
  const subtitles: Array<{ index: number; start: string; end: string; text: string; speaker?: string }> = [];
  let currentTime = 0;

  shots.forEach((shot, idx) => {
    if (shot.dialogue && shot.dialogue.trim()) {
      const duration = shot.duration_seconds || 3;
      const startSeconds = currentTime;
      const endSeconds = currentTime + duration;
      subtitles.push({
        index: idx + 1,
        start: formatSrtTime(startSeconds),
        end: formatSrtTime(endSeconds),
        text: stripSpeakerPrefix(shot.dialogue),
        speaker: shot.subject || parseSpeaker(shot.dialogue) || undefined,
      });
    }
    currentTime += shot.duration_seconds || 3;
  });

  // 生成 SRT 内容
  const srtContent = subtitles.map(s =>
    `${s.index}\n${s.start} --> ${s.end}\n${s.speaker ? s.speaker + ': ' : ''}${s.text}\n`
  ).join('\n');

  return {
    subtitles,
    srtContent,
    count: subtitles.length,
  };
}


// ============ 分镜字段归一化 ============

/** 中文景别 → 英文枚举 */
const SHOT_SIZE_MAP: Record<string, string> = {
  '大远景': 'extreme_wide', '远景': 'long', '全景': 'full', '中景': 'medium',
  '近景': 'medium_closeup', '特写': 'closeup', '大特写': 'extreme_closeup',
};
/** 中文运镜 → 英文枚举 */
const CAMERA_MOVEMENT_MAP: Record<string, string> = {
  '推镜': 'push_in', '拉镜': 'pull_out', '摇镜': 'pan', '移镜': 'truck',
  '升降镜': 'crane', '升降': 'crane', '手持': 'handheld', '稳定器': 'steadicam', '固定': 'static', '固定镜头': 'static',
};
/** 中文节奏 → 英文枚举 */
const PACE_MAP: Record<string, string> = {
  '快': 'fast', '快节奏': 'fast', '快速剪辑': 'fast', '中': 'normal', '中速': 'normal', '中速剪辑': 'normal',
  '慢': 'slow', '慢速': 'slow', '慢速镜头': 'slow', '慢动作': 'slow_motion', '快动作': 'fast_motion', '长镜头': 'long_take',
};
/** 中文转场 → 英文枚举 */
const TRANSITION_MAP: Record<string, string> = {
  '硬切': 'cut', '切': 'cut', '淡入淡出': 'fade', '淡入': 'fade', '淡出': 'fade', '叠化': 'dissolve', '划像': 'wipe', '匹配剪辑': 'match_cut',
};
/** 中文阶段 → 数字 */
const PHASE_MAP: Record<string, number> = {
  '一': 1, '1': 1, '开场引入': 1, '铺垫': 1, '引入': 1,
  '二': 2, '2': 2, '矛盾升级': 2, '发展': 2, '展开': 2,
  '三': 3, '3': 3, '高潮爆发': 3, '高潮': 3, '爆发': 3,
  '四': 4, '4': 4, '收束悬念': 4, '收束': 4, '结局': 4, '尾声': 4,
};

/** 分镜字段归一化：中文枚举/字符串数字 → 标准值 */
function normalizeShotValues(shot: any): any {
  if (!shot || typeof shot !== 'object') return shot;
  const out = { ...shot };
  // 景别
  if (out.shotSize && SHOT_SIZE_MAP[String(out.shotSize).trim()]) out.shotSize = SHOT_SIZE_MAP[String(out.shotSize).trim()];
  else if (out.shotSize && !/^(extreme_wide|long|full|medium|medium_closeup|closeup|extreme_closeup)$/.test(String(out.shotSize))) {
    // 带前后缀（如"中景镜头"）尝试匹配
    const v = String(out.shotSize);
    for (const [k, en] of Object.entries(SHOT_SIZE_MAP)) if (v.includes(k)) { out.shotSize = en; break; }
  }
  // 运镜
  if (out.cameraMovement && CAMERA_MOVEMENT_MAP[String(out.cameraMovement).trim()]) out.cameraMovement = CAMERA_MOVEMENT_MAP[String(out.cameraMovement).trim()];
  else if (out.cameraMovement && !/^(push_in|pull_out|pan|truck|crane|handheld|steadicam|static)$/.test(String(out.cameraMovement))) {
    const v = String(out.cameraMovement);
    for (const [k, en] of Object.entries(CAMERA_MOVEMENT_MAP)) if (v.includes(k)) { out.cameraMovement = en; break; }
  }
  // 节奏
  if (out.pace && PACE_MAP[String(out.pace).trim()]) out.pace = PACE_MAP[String(out.pace).trim()];
  else if (out.pace && !/^(fast|normal|slow|slow_motion|fast_motion|long_take)$/.test(String(out.pace))) {
    const v = String(out.pace);
    for (const [k, en] of Object.entries(PACE_MAP)) if (v.includes(k)) { out.pace = en; break; }
  }
  // 转场
  if (out.transition && TRANSITION_MAP[String(out.transition).trim()]) out.transition = TRANSITION_MAP[String(out.transition).trim()];
  else if (out.transition && !/^(cut|fade|dissolve|wipe|match_cut)$/.test(String(out.transition))) {
    const v = String(out.transition);
    for (const [k, en] of Object.entries(TRANSITION_MAP)) if (v.includes(k)) { out.transition = en; break; }
  }
  // 阶段
  if (out.phase !== undefined && out.phase !== null) {
    const key = String(out.phase).trim();
    if (PHASE_MAP[key]) out.phase = PHASE_MAP[key];
    else if (/^\d+$/.test(key)) out.phase = Number(key);
    else out.phase = 1;
  }
  if (out.phaseName && !/^(开场引入|矛盾升级|高潮爆发|收束悬念)$/.test(String(out.phaseName))) {
    const v = String(out.phaseName);
    if (v.includes('开场') || v.includes('引入') || v.includes('铺垫')) out.phaseName = '开场引入';
    else if (v.includes('矛盾') || v.includes('升级') || v.includes('发展')) out.phaseName = '矛盾升级';
    else if (v.includes('高潮') || v.includes('爆发')) out.phaseName = '高潮爆发';
    else if (v.includes('收束') || v.includes('悬念') || v.includes('结局') || v.includes('尾声')) out.phaseName = '收束悬念';
  }
  // 数字字段
  for (const k of ['shotNumber', 'durationSeconds']) {
    if (out[k] !== undefined && out[k] !== null && typeof out[k] !== 'number') {
      const n = Number(String(out[k]).replace(/[^\d.]/g, ''));
      out[k] = Number.isFinite(n) ? n : (k === 'durationSeconds' ? 4 : 1);
    }
  }
  // 数组字段
  for (const k of ['charactersInShot', 'propsInShot']) {
    if (out[k] && typeof out[k] === 'string') {
      out[k] = String(out[k]).split(/[,，、]/).map((x: string) => x.trim()).filter(Boolean);
    }
  }
  // subject 兜底：空时取 charactersInShot 第一个
  if (!out.subject && Array.isArray(out.charactersInShot) && out.charactersInShot.length > 0) {
    out.subject = out.charactersInShot[0];
  }
  return out;
}
