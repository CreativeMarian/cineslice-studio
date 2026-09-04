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
import { parseAiJsonOrThrow, parseAiJson } from '../utils/aiJsonParser';
import { scriptAnalysisService } from './scriptAnalysisService';
import { promptOptimizationService } from './promptOptimizationService';
import { getProjectStylePreset } from './autoPipeline/helpers';
import { directorPromptService } from './directorPromptService';
import {
  resolveLastFrameForShot,
  collectShotReferenceImages,
  generateKeyframeCandidates,
} from './shotConsistencyService';
import type { Database } from '../types';

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
function resolveFirstFrame(db: Database, userId: string, shotId: string, keyframeId?: string): {
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
    prompt, systemPrompt, responseFormat: 'json', maxTokens: 16000,
  });

  const contentPreview = result.content.length > 2000 ? result.content.slice(0, 2000) + '...[截断]' : result.content;
  console.log(`[RegenerateEpisode] episodeId=${episode.id} AI返回长度: ${result.content.length}, 预览: ${contentPreview}`);

  const data = parseEpisodeAiData(result.content, 'AI返回内容解析失败');

  return NovelEpisodeDAO.update(db, episode.id, {
    title: data.title || episode.title,
    script_content: data.scriptContent || episode.script_content,
    chapter_range: data.chapterRange || episode.chapter_range,
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
    prompt, systemPrompt, responseFormat: 'json', maxTokens: 16000,
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

/** 生成分镜（先删旧再创建，与自动流水线逻辑一致） */
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
  const { systemPrompt, prompt } = shotGenerationPrompt({
    scriptContent: episode.script_content,
    shotDensity: shotDensity || 'normal',
    includeDialogue: includeDialogue !== false,
  });

  const result = await aiProxy.generateText({
    db, userId, provider: textProvider, modelName: textModel,
    prompt, systemPrompt, responseFormat: 'json', maxTokens: 16000,
  });

  let shots: any[];
  try {
    const parsed = parseAiJsonOrThrow<any[]>(result.content);
    shots = Array.isArray(parsed) ? parsed : [parsed];
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
      notes: s.notes || null,
      subject: s.subject || null,
      lighting: s.lighting || null,
      mood: s.mood || null,
      transition: s.transition || 'cut',
      pace: s.pace || 'normal',
    })));
  });
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

  // 获取参考角色
  let characters: Array<{ name: string; visualDescription: string }> = [];
  const referenceImages: string[] = [];
  if (referenceCharacterIds && referenceCharacterIds.length > 0) {
    characters = referenceCharacterIds.map((id: string) => {
      const c = ScriptCharacterDAO.getById(db, id);
      if (c?.reference_image_url) {
        referenceImages.push(c.reference_image_url);
      }
      return c ? { name: c.name, visualDescription: c.visual_description } : null;
    }).filter((c): c is { name: string; visualDescription: string } => c !== null);
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
        reference_characters: referenceCharacterIds ? JSON.stringify(referenceCharacterIds) : undefined,
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
  // 获取该镜头中的角色信息
  let charactersInShot: string[] = [];
  const characterDetails: Record<string, string> = {};
  try {
    if (scriptAnalysis && scriptAnalysis.characterAnalysis && scriptAnalysis.characterAnalysis.length > 0) {
      charactersInShot = scriptAnalysis.characterAnalysis.map((c: any) => c.characterName);
      for (const char of scriptAnalysis.characterAnalysis) {
        if (char.characterName && char.visualTraits) {
          characterDetails[char.characterName] = char.visualTraits;
        }
      }
    }
    // 从动作描述中提取角色名
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
    referenceImages?: string[]; // 一致性参考图（角色/场景/道具），未传则自动收集
  }
) {
  const shot = ShotDAO.getByIdAndUser(db, shotId, userId);
  if (!shot) throw createError(404, 'NOT_FOUND', '镜头不存在');

  const { provider, modelName, keyframeId, motionPrompt, duration, ratio, resolution, subtitles, endFrameId, referenceImages } = opts;

  // 获取剧集信息（用于提示词优化和项目ID）
  const episode = NovelEpisodeDAO.getById(db, shot.episode_id);

  // 获取首帧
  const { firstFrameUrl, startFrameId } = resolveFirstFrame(db, userId, shot.id, keyframeId);

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
  const shotReferenceImages = referenceImages && referenceImages.length > 0
    ? referenceImages
    : collectShotReferenceImages(db, shot);

  // 将相对路径的首帧图片转换为 base64 data URL（豆包 API 需要可访问的图片）
  const firstFrameImageForApi = imageToDataUrl(firstFrameUrl);
  if (firstFrameImageForApi !== firstFrameUrl) {
    console.log('[Video] first frame converted to base64, length:', firstFrameImageForApi.length);
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

    // 合并导演提示词和优化提示词，注入角色视觉描述确保人物一致性
    let finalPrompt = optimized.prompt;
    if (Object.keys(characterDetails).length > 0) {
      const charDescText = Object.entries(characterDetails)
        .map(([name, desc]) => `${name}: ${desc}`)
        .join('；');
      finalPrompt += `。【角色视觉一致性】${charDescText}。严格保持角色外观、服装、发型、发色与角色设定一致，前后镜头角色身份必须一致`;
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

  // 超时清理：供应商侧视频任务通常 1-10 分钟出片（适配器预估 60-120s），
  // 旧值 2 分钟会把健康任务误判失败、诱导用户重复付费；放宽到 10 分钟
  if ((video.status === 'pending' || video.status === 'processing') && video.created_at) {
    const createdTime = new Date(video.created_at).getTime();
    if (Date.now() - createdTime > 10 * 60 * 1000) {
      ShotVideoIntervalDAO.update(db, video.id, { status: 'failed', error_message: '任务超时（超过10分钟）' });
      return { ...video, status: 'failed', error_message: '任务超时（超过10分钟）' };
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
          });
          return { ...video, status: 'completed', video_url: localUrl };
        } catch {
          // 下载失败，保留远程 URL
          ShotVideoIntervalDAO.update(db, video.id, {
            status: 'completed',
            video_url: taskResult.videoUrl,
            completed_at: new Date().toISOString(),
          });
          return { ...video, status: 'completed', video_url: taskResult.videoUrl };
        }
      } else if (taskResult.status === 'failed') {
        ShotVideoIntervalDAO.updateStatus(db, video.id, 'failed', '视频生成失败');
        return { ...video, status: 'failed', error_message: '视频生成失败' };
      } else {
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
  opts: { provider: string; modelName: string; shotIds?: string[]; candidatesPerShot?: number }
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

      const { prompt, negativePrompt } = keyframePrompt({
        shotDescription: shot.action_description,
        frameType: 'first',
      });

      const imgResult = await aiProxy.generateImage({
        db, userId, projectId: episode.project_id,
        provider, modelName, prompt, negativePrompt,
        count: 1, size: '2560x1440',
        saveSubDir: 'keyframes',
        referenceImages: collectShotReferenceImages(db, shot),
      });

      // 新帧落库成功后再移除旧帧
      const existing = ShotKeyframeDAO.listByShot(db, shot.id);
      const existingFirst = existing.find(k => k.frame_type === 'first' && k.image_url);
      if (existingFirst) {
        ShotKeyframeDAO.delete(db, existingFirst.id);
      }

      const keyframe = ShotKeyframeDAO.create(db, {
        user_id: userId,
        shot_id: shot.id,
        frame_type: 'first',
        prompt,
        negative_prompt: negativePrompt,
        image_url: imgResult.images[0]?.url,
        image_model_used: modelName,
      });
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
  }
) {
  const episode = NovelEpisodeDAO.getByIdAndUser(db, episodeId, userId);
  if (!episode) throw createError(404, 'NOT_FOUND', '剧集不存在');

  const { provider, modelName, shotIds, duration, ratio, resolution } = opts;
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
          { visualStyle: '电影级写实风格，cinematic lighting，高细节，8k分辨率，统一色调', colorPalette: '', cameraLanguage: '' }
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
    } catch (err: any) {
      const errorMsg = err.message || '创建失败';
      skipped.push({ shotId: shot.id, reason: errorMsg });
      // 如果是速率限制，多等一会儿再继续
      if (errorMsg.includes('rate limit') || errorMsg.includes('限流') || err.code === 'AI_RATE_LIMITED') {
        await new Promise(resolve => setTimeout(resolve, 10000));
      }
    }

    // 请求间隔：避免速率限制（Agnes AI 等模型有每分钟请求数限制）
    await new Promise(resolve => setTimeout(resolve, 5000));
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
        text: shot.dialogue,
        speaker: shot.subject || undefined,
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
