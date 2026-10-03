// 资产路由：角色 / 场景 / 道具
// v1.0

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import {
  NovelEpisodeDAO,
  ProjectDAO,
  ScriptCharacterDAO,
  ScriptSceneDAO,
  ScriptPropDAO,
  CharacterOutfitDAO,
} from '../models';
import { createError, asyncHandler } from '../middleware/errorHandler';
import { validateBody } from '../middleware/validate';
import { imageUpload } from '../middleware/upload';
import { aiProxy } from '../services/aiProxy';
import { buildCharacterExtractPrompt } from '../services/prompts/characterExtract';
import { buildSceneExtractPrompt } from '../services/prompts/sceneExtract';
import { buildKeyframePrompt, buildCharacterConceptPrompt, buildSceneConceptPrompt } from '../services/prompts/keyframe';
import { characterExpressionService } from '../services/characterExpressionService';
import { parseAiJsonOrThrow } from '../utils/aiJsonParser';
import type { Database, CharacterOutfit } from '../types';

const router = Router();

function getDb(req: Request): Database {
  return req.app.locals.db as Database;
}

/**
 * 校验道具归属：道具 → 剧集 → 项目 → 用户，任一环断裂即 404。
 * 防止跨用户读写他人道具（IDOR）。
 */
function requirePropOwnership(db: Database, req: Request, propId: string): void {
  const prop = ScriptPropDAO.getById(db, propId);
  if (!prop) throw createError(404, 'NOT_FOUND', '道具不存在');
  const episode = NovelEpisodeDAO.getById(db, prop.episode_id);
  if (!episode) throw createError(404, 'NOT_FOUND', '剧集不存在');
  const project = ProjectDAO.getByIdAndUser(db, episode.project_id, req.user.id);
  if (!project) throw createError(404, 'NOT_FOUND', '道具不存在');
}

const extractSchema = z.object({
  provider: z.string(),
  modelName: z.string(),
});

const generateImageSchema = z.object({
  provider: z.string(),
  modelName: z.string(),
  count: z.number().int().min(1).max(4).optional(),
  referenceImageUrl: z.string().optional(),
  prompt: z.string().optional(),
});

const updateCharacterSchema = z.object({
  name: z.string().optional(),
  gender: z.enum(['male', 'female', 'other']).optional(),
  role_type: z.enum(['protagonist', 'supporting', 'antagonist', 'extra']).optional(),
  description: z.string().optional(),
  visual_description: z.string().optional(),
  selected_image_index: z.number().int().optional(),
  voice_profile: z.string().optional(), // 音色档案 JSON：{ voice, speed }
});

const updateSceneSchema = z.object({
  name: z.string().optional(),
  location: z.string().optional(),
  time_of_day: z.enum(['day', 'night', 'dawn', 'dusk']).optional(),
  atmosphere: z.string().optional(),
  description: z.string().optional(),
  selected_image_index: z.number().int().optional(),
});

// ============ 角色 ============

// 从剧本提取角色
router.post('/episodes/:id/characters/extract', validateBody(extractSchema), asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const episode = NovelEpisodeDAO.getByIdAndUser(db, req.params.id, req.user.id);
  if (!episode) throw createError(404, 'NOT_FOUND', '剧集不存在');

  const { provider, modelName } = req.body;
  // 优先使用加料后的剧本（更详细、角色描述更丰富），没有加料则用原始剧本
  const scriptForExtract = episode.enriched_script && episode.enriched_script.trim().length > 0
    ? episode.enriched_script
    : episode.script_content;
  const prompt = buildCharacterExtractPrompt(scriptForExtract);

  const result = await aiProxy.generateText({
    db, userId: req.user.id, provider, modelName,
    prompt, responseFormat: 'json', maxTokens: 16000,
  });

  let characters: any[];
  try {
    const parsed = parseAiJsonOrThrow<unknown>(result.content);
    // 兼容多种返回格式：直接数组 / {characters:[...]} / {data:[...]} / {result:[...]} / 键为角色名的对象
    if (Array.isArray(parsed)) {
      characters = parsed;
    } else if (parsed && typeof parsed === 'object') {
      const obj = parsed as Record<string, unknown>;
      const arr = obj.characters || obj.data || obj.result || obj.list || obj.roles || obj.cast;
      if (Array.isArray(arr)) {
        characters = arr;
      } else {
        // 键为角色名的对象：{ "林墨": {...}, "苏晚": {...} }
        const values = Object.values(obj).filter(v => v && typeof v === 'object');
        if (values.length > 0) {
          characters = values.map((v: any, i) => {
            // 如果值对象没有 name，用键名作为 name
            const key = Object.keys(obj)[i];
            return { name: key, ...v };
          });
        } else {
          characters = [obj];
        }
      }
    } else {
      characters = [];
    }
    // 过滤掉无效角色：检查所有可能的字段名（英文+中文+shuohao新字段）
    characters = characters.filter((c: any) => c && (
      c.name || c.characterName || c.character_name || c.角色名 || c.姓名 ||
      c.description || c.desc || c.描述 || c.简介 ||
      c.character_profile || c.characterProfile || c.人物画像 ||
      c.visual_prompt || c.visualPrompt || c.visual_description || c.visualDescription || c.形象提示词 || c.外貌描述 ||
      c.voice_prompt || c.voicePrompt || c.音色提示词
    ));
  } catch (err) {
    throw createError(502, 'AI_CALL_FAILED', (err as Error).message);
  }

  // 删除旧角色
  const old = ScriptCharacterDAO.listByEpisode(db, episode.id);
  for (const c of old) ScriptCharacterDAO.delete(db, c.id);

  const created = ScriptCharacterDAO.batchCreate(db, characters.map((c: any) => {
    const characterProfile = c.character_profile || c.characterProfile || c.人物画像 || c.description || c.desc || c.描述 || c.简介 || c.characterDescription || '';
    const visualPrompt = c.visual_prompt || c.visualPrompt || c.形象提示词 || c.visual_description || c.visualDescription || c.visual || c.appearance || c.外貌描述 || c.形象描述 || c.visualDesc || '';
    const voicePrompt = c.voice_prompt || c.voicePrompt || c.音色提示词 || c.voice_description || c.voiceDescription || '';
    return {
      user_id: req.user.id,
      episode_id: episode.id,
      name: c.name || c.characterName || c.character_name || c.角色名 || c.姓名 || '未命名',
      gender: c.gender || c.sex || c.性别 || 'other',
      role_type: c.roleType || c.role || c.role_type || c.角色类型 || c.类型 || 'supporting',
      // 兼容旧字段：description 用 character_profile 填充
      description: characterProfile,
      // 兼容旧字段：visual_description 用 visual_prompt 填充
      visual_description: visualPrompt,
      // shuohao 新字段
      character_profile: characterProfile || null,
      visual_prompt: visualPrompt || null,
      voice_prompt: voicePrompt || null,
    };
  }));

  res.json({ success: true, data: created });
}));

// 角色列表
router.get('/episodes/:id/characters', asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const characters = ScriptCharacterDAO.listByEpisode(db, req.params.id);
  res.json({ success: true, data: characters });
}));

// 角色详情
router.get('/characters/:id', asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const character = ScriptCharacterDAO.getByIdAndUser(db, req.params.id, req.user.id);
  if (!character) throw createError(404, 'NOT_FOUND', '角色不存在');
  res.json({ success: true, data: character });
}));

// 更新角色
router.put('/characters/:id', validateBody(updateCharacterSchema), asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const character = ScriptCharacterDAO.getByIdAndUser(db, req.params.id, req.user.id);
  if (!character) throw createError(404, 'NOT_FOUND', '角色不存在');
  const updated = ScriptCharacterDAO.update(db, req.params.id, req.body);
  res.json({ success: true, data: updated });
}));

// 生成角色概念图
router.post('/characters/:id/generate-image', validateBody(generateImageSchema), asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const character = ScriptCharacterDAO.getByIdAndUser(db, req.params.id, req.user.id);
  if (!character) throw createError(404, 'NOT_FOUND', '角色不存在');

  const episode = NovelEpisodeDAO.getById(db, character.episode_id);
  const { provider, modelName, count, referenceImageUrl, prompt: customPrompt } = req.body;

  // 描述为空时的兜底：用角色名+性别+类型生成默认描述
  const visualDesc = character.visual_description && character.visual_description.trim()
    ? character.visual_description
    : `${character.name}，${character.gender === 'male' ? '男性' : character.gender === 'female' ? '女性' : '人物'}，${character.role_type === 'protagonist' ? '主角形象，气质突出' : character.role_type === 'antagonist' ? '反派形象，气场强烈' : '配角形象，特征鲜明'}，详细的面部特征和服装设计`;

  // 使用自定义提示词或极简概念图提示词
  let prompt, negativePrompt;
  if (customPrompt && customPrompt.trim()) {
    prompt = customPrompt;
    negativePrompt = undefined;
  } else {
    prompt = buildCharacterConceptPrompt(character.name, visualDesc);
    negativePrompt = undefined;
  }

  // 图片生成带重试（最多2次）
  let result;
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      result = await aiProxy.generateImage({
        db, userId: req.user.id, projectId: episode!.project_id,
        provider, modelName, prompt, negativePrompt,
        count: count || 1, size: '2048x2048',
        referenceImages: referenceImageUrl ? [referenceImageUrl] : undefined,
        saveSubDir: 'characters',
        skipCache: true,
      });
      break;
    } catch (err) {
      lastError = err as Error;
      if (attempt === 1) throw err;
    }
  }
  if (!result) throw lastError || createError(500, 'IMAGE_GEN_FAILED', '图片生成失败');

  // 保存到角色（DAO层已解析concept_images为数组）
  const existing = Array.isArray(character.concept_images) ? character.concept_images : [];
  const newImages = result.images.map(img => ({ url: img.url, model: modelName, prompt }));
  const allImages = [...existing, ...newImages];
  const updatedCharacter = ScriptCharacterDAO.update(db, character.id, { concept_images: JSON.stringify(allImages) });

  res.json({ success: true, data: updatedCharacter });
}));

// 生成角色四视图（面部特写 + 三视图：正面/侧面/背面）
// 对齐《AI短剧制作全流程手册》：最左侧超大人脸特写，右侧依次全身正面、侧面、后视图，16:9比例
router.post('/characters/:id/generate-four-view', validateBody(generateImageSchema), asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const character = ScriptCharacterDAO.getByIdAndUser(db, req.params.id, req.user.id);
  if (!character) throw createError(404, 'NOT_FOUND', '角色不存在');

  const episode = NovelEpisodeDAO.getById(db, character.episode_id);
  const { provider, modelName, referenceImageUrl, prompt: customPrompt } = req.body;

  const visualDesc = character.visual_description && character.visual_description.trim()
    ? character.visual_description
    : `${character.name}，${character.gender === 'male' ? '男性' : character.gender === 'female' ? '女性' : '人物'}，${character.role_type === 'protagonist' ? '主角形象，气质突出' : character.role_type === 'antagonist' ? '反派形象，气场强烈' : '配角形象，特征鲜明'}，详细的面部特征和服装设计`;

  // 使用自定义提示词或极简四视图提示词（buildKeyframePrompt：风格 + 主体描述）
  let prompt, negativePrompt;
  if (customPrompt && customPrompt.trim()) {
    prompt = customPrompt;
    negativePrompt = undefined;
  } else {
    prompt = buildKeyframePrompt(`角色四视图设定图：${character.name}，${visualDesc}。画面包含左侧超大人脸特写与右侧全身正面、侧面、背面三视图，16:9宽画幅`);
    negativePrompt = undefined;
  }

  let result;
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      result = await aiProxy.generateImage({
        db, userId: req.user.id, projectId: episode!.project_id,
        provider, modelName, prompt, negativePrompt,
        count: 1, size: '2560x1440',
        referenceImages: referenceImageUrl ? [referenceImageUrl] : undefined,
        saveSubDir: 'characters',
        skipCache: true,
      });
      break;
    } catch (err) {
      lastError = err as Error;
      if (attempt === 1) throw err;
    }
  }
  if (!result) throw lastError || createError(500, 'IMAGE_GEN_FAILED', '四视图生成失败');

  // 保存到角色的 four_view_images 字段（DAO层已解析为数组）
  const existing = Array.isArray(character.four_view_images) ? character.four_view_images : [];
  const newImages = result.images.map(img => ({ url: img.url, model: modelName, prompt }));
  const allImages = [...existing, ...newImages];
  const updatedCharacter = ScriptCharacterDAO.update(db, character.id, { four_view_images: JSON.stringify(allImages) });

  res.json({ success: true, data: updatedCharacter });
}));

// 删除角色四视图（清空 four_view_images 字段）
router.delete('/characters/:id/four-view-images', asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const character = ScriptCharacterDAO.getByIdAndUser(db, req.params.id, req.user.id);
  if (!character) throw createError(404, 'NOT_FOUND', '角色不存在');

  const updatedCharacter = ScriptCharacterDAO.update(db, character.id, { four_view_images: JSON.stringify([]) });
  res.json({ success: true, data: updatedCharacter });
}));

// P1-4: 生成角色九宫格表情图
router.post('/characters/:id/generate-expressions', validateBody(generateImageSchema), asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const character = ScriptCharacterDAO.getByIdAndUser(db, req.params.id, req.user.id);
  if (!character) throw createError(404, 'NOT_FOUND', '角色不存在');

  const episode = NovelEpisodeDAO.getById(db, character.episode_id);
  const { provider, modelName } = req.body;

  const results = await characterExpressionService.generateAllExpressions(
    db, req.user.id, episode!.project_id, character.id, provider, modelName
  );

  const updatedCharacter = ScriptCharacterDAO.getById(db, character.id);
  res.json({ success: true, data: { character: updatedCharacter, expressions: results } });
}));

// 上传角色参考图
router.post('/characters/:id/upload-reference', imageUpload.single('file'), asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const character = ScriptCharacterDAO.getByIdAndUser(db, req.params.id, req.user.id);
  if (!character) throw createError(404, 'NOT_FOUND', '角色不存在');
  if (!req.file) throw createError(400, 'VALIDATION_ERROR', '请上传图片');

  const urlPath = `/uploads/${character.episode_id}/${req.file.filename}`;
  ScriptCharacterDAO.update(db, character.id, { reference_image_url: urlPath });
  res.json({ success: true, data: { url: urlPath } });
}));

// 删除角色指定概念图
router.delete('/characters/:id/images/:index', asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const character = ScriptCharacterDAO.getByIdAndUser(db, req.params.id, req.user.id);
  if (!character) throw createError(404, 'NOT_FOUND', '角色不存在');

  const index = parseInt(req.params.index, 10);
  const images = Array.isArray(character.concept_images) ? character.concept_images : [];
  if (index < 0 || index >= images.length) {
    throw createError(400, 'INVALID_INDEX', '图片索引无效');
  }

  const newImages = images.filter((_, i) => i !== index);
  const newSelectedIndex = character.selected_image_index >= newImages.length
    ? Math.max(0, newImages.length - 1)
    : character.selected_image_index;

  ScriptCharacterDAO.update(db, character.id, {
    concept_images: JSON.stringify(newImages),
    selected_image_index: newSelectedIndex,
  });

  res.json({ success: true, data: { message: '图片已删除', remaining: newImages.length } });
}));

// 删除角色
router.delete('/characters/:id', asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const character = ScriptCharacterDAO.getByIdAndUser(db, req.params.id, req.user.id);
  if (!character) throw createError(404, 'NOT_FOUND', '角色不存在');
  ScriptCharacterDAO.delete(db, req.params.id);
  res.json({ success: true, data: { message: '角色已删除' } });
}));

// ============ 衣橱（多套造型，BigBanana Base Look 方案） ============

const outfitCreateSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  imageUrl: z.string().optional(),
});

const outfitUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  is_default: z.number().int().min(0).max(1).optional(),
});

/** 校验造型归属：造型 → 角色 → 剧集 → 项目 → 用户 */
function requireOutfitOwnership(db: Database, req: Request, outfitId: string): CharacterOutfit {
  const outfit = CharacterOutfitDAO.getById(db, outfitId);
  if (!outfit) throw createError(404, 'NOT_FOUND', '造型不存在');
  const character = ScriptCharacterDAO.getById(db, outfit.character_id);
  if (!character) throw createError(404, 'NOT_FOUND', '造型不存在');
  const episode = NovelEpisodeDAO.getById(db, character.episode_id);
  if (!episode) throw createError(404, 'NOT_FOUND', '造型不存在');
  const project = ProjectDAO.getByIdAndUser(db, episode.project_id, req.user.id);
  if (!project) throw createError(404, 'NOT_FOUND', '造型不存在');
  return outfit;
}

// 角色造型列表
router.get('/characters/:id/outfits', asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const character = ScriptCharacterDAO.getByIdAndUser(db, req.params.id, req.user.id);
  if (!character) throw createError(404, 'NOT_FOUND', '角色不存在');
  const outfits = CharacterOutfitDAO.listByCharacter(db, character.id);
  res.json({ success: true, data: outfits });
}));

// 新建造型（手工录入，可先无图，稍后生成造型图）
router.post('/characters/:id/outfits', validateBody(outfitCreateSchema), asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const character = ScriptCharacterDAO.getByIdAndUser(db, req.params.id, req.user.id);
  if (!character) throw createError(404, 'NOT_FOUND', '角色不存在');
  const existing = CharacterOutfitDAO.listByCharacter(db, character.id);
  const outfit = CharacterOutfitDAO.create(db, {
    user_id: req.user.id,
    character_id: character.id,
    name: req.body.name,
    description: req.body.description || '',
    image_url: req.body.imageUrl || undefined,
    is_default: existing.length === 0 ? 1 : 0, // 首个造型自动设为默认
  });
  res.json({ success: true, data: outfit });
}));

// 更新造型（名称/描述/默认标记）
router.put('/outfits/:id', validateBody(outfitUpdateSchema), asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  requireOutfitOwnership(db, req, req.params.id);
  const updated = CharacterOutfitDAO.update(db, req.params.id, req.body);
  res.json({ success: true, data: updated });
}));

// 设为默认造型（同时清除同角色其他默认）
router.put('/outfits/:id/default', asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const outfit = requireOutfitOwnership(db, req, req.params.id);
  const updated = CharacterOutfitDAO.setDefault(db, outfit.id, outfit.character_id);
  res.json({ success: true, data: updated });
}));

// 删除造型
router.delete('/outfits/:id', asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const outfit = requireOutfitOwnership(db, req, req.params.id);
  CharacterOutfitDAO.delete(db, outfit.id);
  res.json({ success: true, data: { message: '造型已删除' } });
}));

// 生成造型图：用角色定妆照做参考，保持面容/体型一致，仅更换服装
router.post('/outfits/:id/generate-image', validateBody(generateImageSchema), asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const outfit = requireOutfitOwnership(db, req, req.params.id);
  const character = ScriptCharacterDAO.getById(db, outfit.character_id)!;
  const episode = NovelEpisodeDAO.getById(db, character.episode_id)!;
  const { provider, modelName, prompt: customPrompt } = req.body;

  // 参考图：角色定妆照（reference_image_url 优先，否则选中概念图）
  let refImage: string | null = character.reference_image_url;
  if (!refImage && character.concept_images) {
    try {
      const imgs = JSON.parse(character.concept_images);
      if (Array.isArray(imgs) && imgs.length > 0) {
        const idx = Math.min(character.selected_image_index || 0, imgs.length - 1);
        refImage = imgs[idx]?.url || imgs[0]?.url || null;
      }
    } catch { /* 解析失败跳过 */ }
  }

  const defaultPrompt = `角色换装设定图，${character.name}，保持面部特征、体型、发型、发色与参考图完全一致，仅更换服装：${outfit.description || outfit.name}。正面全身站立姿势，双臂自然下垂，正视镜头，中性表情，纯白色背景，角色居中，完整全身像，服装面料与细节清晰，高质量，电影级光影，8K分辨率，角色一致性参考图`;

  const result = await aiProxy.generateImage({
    db, userId: req.user.id, projectId: episode.project_id,
    provider, modelName,
    prompt: customPrompt || defaultPrompt,
    count: 1, size: '2048x2048',
    referenceImages: refImage ? [refImage] : undefined,
    saveSubDir: 'outfits',
  });

  const url = result.images[0]?.url;
  if (!url) throw createError(500, 'IMAGE_GEN_FAILED', '造型图生成失败');
  const updated = CharacterOutfitDAO.update(db, outfit.id, { image_url: url });
  res.json({ success: true, data: updated });
}));

// ============ 场景 ============

// 从剧本提取场景
router.post('/episodes/:id/scenes/extract', validateBody(extractSchema), asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const episode = NovelEpisodeDAO.getByIdAndUser(db, req.params.id, req.user.id);
  if (!episode) throw createError(404, 'NOT_FOUND', '剧集不存在');

  const { provider, modelName } = req.body;
  // 优先使用加料后的剧本
  const scriptForExtract = episode.enriched_script && episode.enriched_script.trim().length > 0
    ? episode.enriched_script
    : episode.script_content;
  const prompt = buildSceneExtractPrompt(scriptForExtract);

  const result = await aiProxy.generateText({
    db, userId: req.user.id, provider, modelName,
    prompt, responseFormat: 'json', maxTokens: 16000,
  });

  let scenes: any[];
  try {
    const parsed = parseAiJsonOrThrow<unknown>(result.content);
    if (Array.isArray(parsed)) {
      scenes = parsed;
    } else if (parsed && typeof parsed === 'object') {
      const obj = parsed as Record<string, unknown>;
      const arr = obj.scenes || obj.data || obj.result || obj.list || obj.locations || obj.environments;
      if (Array.isArray(arr)) {
        scenes = arr;
      } else {
        // 键为场景名的对象：{ "客厅": {...}, "街道": {...} }
        const values = Object.values(obj).filter(v => v && typeof v === 'object');
        if (values.length > 0) {
          scenes = values.map((v: any, i) => {
            const key = Object.keys(obj)[i];
            return { name: key, ...v };
          });
        } else {
          scenes = [obj];
        }
      }
    } else {
      scenes = [];
    }
    // 过滤：检查所有可能的字段名（英文+中文+shuohao新字段）
    scenes = scenes.filter((s: any) => s && (
      s.name || s.sceneName || s.scene_name || s.场景名 || s.名称 ||
      s.description || s.desc || s.描述 || s.简介 ||
      s.location || s.place || s.地点 || s.位置 ||
      s.visual_prompt || s.visualPrompt || s.形象提示词 || s.场景提示词 ||
      s.consistency_anchor || s.consistencyAnchor || s.一致性锚点
    ));
  } catch (err) {
    throw createError(502, 'AI_CALL_FAILED', (err as Error).message);
  }

  // 数组/对象值安全序列化为字符串，避免 SQLite "Too many parameter values" 错误
  const toStr = (v: any): string | undefined => {
    if (v == null) return undefined;
    if (typeof v === 'string') return v || undefined;
    try { return JSON.stringify(v); } catch { return String(v); }
  };

  const old = ScriptSceneDAO.listByEpisode(db, episode.id);
  for (const s of old) ScriptSceneDAO.delete(db, s.id);

  const created = ScriptSceneDAO.batchCreate(db, scenes.map((s: any) => ({
    user_id: req.user.id,
    episode_id: episode.id,
    name: String(s.name || s.sceneName || s.scene_name || s.场景名 || s.名称 || '未命名场景'),
    location: String(s.location || s.place || s.地点 || s.位置 || ''),
    time_of_day: String(s.time_of_day || s.timeOfDay || s.time || s.时段 || s.时间 || 'day'),
    atmosphere: String(s.atmosphere || s.mood || s.氛围 || s.气氛 || ''),
    description: String(s.description || s.desc || s.描述 || s.简介 || ''),
    visual_prompt: toStr(s.visual_prompt || s.visualPrompt || s.形象提示词 || s.场景提示词 || s.visual_description || s.visualDescription),
    consistency_anchor: toStr(s.consistency_anchor || s.consistencyAnchor || s.一致性锚点),
    lighting_variants: toStr(s.lighting_variants || s.lightingVariants || s.光照变体),
    scale_reference: toStr(s.scale_reference || s.scaleReference || s.尺度参照),
  })));

  res.json({ success: true, data: created });
}));

// 场景列表
router.get('/episodes/:id/scenes', asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const scenes = ScriptSceneDAO.listByEpisode(db, req.params.id);
  res.json({ success: true, data: scenes });
}));

// 场景详情
router.get('/scenes/:id', asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const scene = ScriptSceneDAO.getByIdAndUser(db, req.params.id, req.user.id);
  if (!scene) throw createError(404, 'NOT_FOUND', '场景不存在');
  res.json({ success: true, data: scene });
}));

// 更新场景
router.put('/scenes/:id', validateBody(updateSceneSchema), asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const scene = ScriptSceneDAO.getByIdAndUser(db, req.params.id, req.user.id);
  if (!scene) throw createError(404, 'NOT_FOUND', '场景不存在');
  const updated = ScriptSceneDAO.update(db, req.params.id, req.body);
  res.json({ success: true, data: updated });
}));

// 生成场景概念图
router.post('/scenes/:id/generate-image', validateBody(generateImageSchema), asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const scene = ScriptSceneDAO.getByIdAndUser(db, req.params.id, req.user.id);
  if (!scene) throw createError(404, 'NOT_FOUND', '场景不存在');

  const episode = NovelEpisodeDAO.getById(db, scene.episode_id);
  const { provider, modelName, count, prompt: customPrompt } = req.body;

  // 描述为空时的兜底
  const sceneDesc = scene.description && scene.description.trim()
    ? scene.description
    : `${scene.name}，${scene.location || '未指定地点'}，${scene.time_of_day === 'night' ? '夜晚，月光照明' : scene.time_of_day === 'dawn' ? '黎明，柔和晨光' : scene.time_of_day === 'dusk' ? '黄昏，金色夕阳' : '白天，自然光'}，氛围${scene.atmosphere || '自然'}，详细的环境布局和陈设`;

  // 使用自定义提示词或极简场景概念图提示词
  let prompt, negativePrompt;
  if (customPrompt && customPrompt.trim()) {
    prompt = customPrompt;
    negativePrompt = undefined;
  } else {
    prompt = buildSceneConceptPrompt(scene.name, sceneDesc);
    negativePrompt = undefined;
  }

  // 图片生成带重试（最多2次）
  let result;
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      result = await aiProxy.generateImage({
        db, userId: req.user.id, projectId: episode!.project_id,
        provider, modelName, prompt, negativePrompt,
        count: count || 1, size: '2560x1440',
        saveSubDir: 'scenes',
        skipCache: true,
      });
      break;
    } catch (err) {
      lastError = err as Error;
      if (attempt === 1) throw err;
    }
  }
  if (!result) throw lastError || createError(500, 'IMAGE_GEN_FAILED', '图片生成失败');

  const existing = Array.isArray(scene.concept_images) ? scene.concept_images : [];
  const newImages = result.images.map(img => ({ url: img.url, model: modelName, prompt }));
  const allImages = [...existing, ...newImages];
  const updatedScene = ScriptSceneDAO.update(db, scene.id, { concept_images: JSON.stringify(allImages) });

  res.json({ success: true, data: updatedScene });
}));

// 删除场景指定图片
router.delete('/scenes/:id/images/:index', asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const scene = ScriptSceneDAO.getByIdAndUser(db, req.params.id, req.user.id);
  if (!scene) throw createError(404, 'NOT_FOUND', '场景不存在');

  const index = parseInt(req.params.index, 10);
  const images = Array.isArray(scene.concept_images) ? scene.concept_images : [];
  if (index < 0 || index >= images.length) {
    throw createError(400, 'INVALID_INDEX', '图片索引无效');
  }

  const newImages = images.filter((_, i) => i !== index);
  const newSelectedIndex = scene.selected_image_index >= newImages.length
    ? Math.max(0, newImages.length - 1)
    : scene.selected_image_index;

  ScriptSceneDAO.update(db, scene.id, {
    concept_images: JSON.stringify(newImages),
    selected_image_index: newSelectedIndex,
  });

  res.json({ success: true, data: { message: '图片已删除', remaining: newImages.length } });
}));

// 删除场景
router.delete('/scenes/:id', asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const scene = ScriptSceneDAO.getByIdAndUser(db, req.params.id, req.user.id);
  if (!scene) throw createError(404, 'NOT_FOUND', '场景不存在');
  ScriptSceneDAO.delete(db, req.params.id);
  res.json({ success: true, data: { message: '场景已删除' } });
}));

// ============ 道具（P1） ============

// 从剧本提取道具
router.post('/episodes/:id/props/extract', validateBody(extractSchema), asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const episode = NovelEpisodeDAO.getByIdAndUser(db, req.params.id, req.user.id);
  if (!episode) throw createError(404, 'NOT_FOUND', '剧集不存在');

  const { provider, modelName } = req.body;
  // 优先使用加料后的剧本
  const scriptForExtract = episode.enriched_script && episode.enriched_script.trim().length > 0
    ? episode.enriched_script
    : episode.script_content;

  const systemPrompt = `你是一位专业的影视道具分析师。请从剧本中提取所有重要道具。
目标提取数量：3-8个关键道具。
输出格式为 JSON 数组，每个道具包含：
- name: 道具名称
- category: 类别（weapon武器/clothing服装/tool工具/electronic电子/food食物/document文书/decoration装饰/other其他）
- description: 道具外观、材质、功能描述（用于后续生成概念图）
- importance: 重要程度（key关键道具/supporting辅助道具/background背景道具）
- is_clue: 是否为贯穿剧情的核心线索道具（0或1）。线索道具指推动剧情、承载悬念、跨多镜头反复出现的关键物件（如关键信件、玉佩、凶器、地图碎片、证据照片等），务必准确识别

只返回 JSON，不要其他文字。`;

  const prompt = `剧本内容：
${scriptForExtract}

请提取所有重要道具，要求：
1. 提取对剧情有推动作用或反复出现的道具，目标3-8个
2. description 要详细，包含外观、材质、颜色、尺寸、特殊功能
3. 按重要程度排序，关键道具在前
4. 同类道具合并
5. 准确标记 is_clue：推动剧情、反复出现或承载悬念的物件标 1，其余标 0

请以 JSON 数组格式返回。`;

  const result = await aiProxy.generateText({
    db, userId: req.user.id, provider, modelName,
    prompt, systemPrompt, responseFormat: 'json', maxTokens: 2048,
  });

  let props: any[];
  try {
    const parsed = parseAiJsonOrThrow<unknown>(result.content);
    if (Array.isArray(parsed)) {
      props = parsed;
    } else if (parsed && typeof parsed === 'object') {
      const obj = parsed as Record<string, unknown>;
      const arr = obj.props || obj.data || obj.result || obj.list || obj.items;
      if (Array.isArray(arr)) {
        props = arr;
      } else {
        // 键为道具名的对象
        const values = Object.values(obj).filter(v => v && typeof v === 'object');
        if (values.length > 0) {
          props = values.map((v: any, i) => {
            const key = Object.keys(obj)[i];
            return { name: key, ...v };
          });
        } else {
          props = [obj];
        }
      }
    } else {
      props = [];
    }
    props = props.filter((p: any) => p && (p.name || p.propName || p.prop_name || p.道具名 || p.名称 || p.description || p.desc || p.描述));
  } catch (err) {
    throw createError(502, 'AI_CALL_FAILED', (err as Error).message);
  }

  // 删除旧道具
  const old = ScriptPropDAO.listByEpisode(db, episode.id);
  for (const p of old) ScriptPropDAO.delete(db, p.id);

  const created = props.map((p: any) => ScriptPropDAO.create(db, {
    user_id: req.user.id,
    episode_id: episode.id,
    name: p.name || p.propName || p.道具名 || p.名称 || '未命名道具',
    category: p.category || p.type || p.类别 || p.类型 || 'other',
    description: p.description || p.desc || p.描述 || p.简介 || '',
    // 线索道具：AI 显式标记，或 importance=key 且名称含关键/重要/核心字样时兜底
    is_clue: (p.is_clue === 1 || p.is_clue === true || p.isClue === 1 || p.isClue === true || (p.importance === 'key' && /关键|重要|核心/.test(p.name || ''))) ? 1 : 0,
    keywords: Array.isArray(p.keywords) ? p.keywords.join(',') : (p.keywords || ''),
  }));

  res.json({ success: true, data: created });
}));

router.get('/episodes/:id/props', asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const props = ScriptPropDAO.listByEpisode(db, req.params.id);
  res.json({ success: true, data: props });
}));

router.post('/episodes/:id/props', asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const prop = ScriptPropDAO.create(db, { user_id: req.user.id, episode_id: req.params.id, ...req.body });
  res.json({ success: true, data: prop });
}));

router.put('/props/:id', asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  requirePropOwnership(db, req, req.params.id);
  const prop = ScriptPropDAO.update(db, req.params.id, req.body);
  res.json({ success: true, data: prop });
}));

router.delete('/props/:id', asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  requirePropOwnership(db, req, req.params.id);
  ScriptPropDAO.delete(db, req.params.id);
  res.json({ success: true, data: { message: '道具已删除' } });
}));

// 生成道具概念图
router.post('/props/:id/generate-image', validateBody(generateImageSchema), asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const prop = ScriptPropDAO.getById(db, req.params.id);
  if (!prop || prop.user_id !== req.user.id) throw createError(404, 'NOT_FOUND', '道具不存在');

  const episode = NovelEpisodeDAO.getById(db, prop.episode_id);
  const { provider, modelName, count, referenceImageUrl, prompt: customPrompt } = req.body;

  // 描述为空时的兜底
  const desc = prop.description && prop.description.trim()
    ? prop.description
    : `${prop.name}，详细的外观、材质、颜色、尺寸描述`;

  // 使用自定义提示词或极简道具概念图提示词
  let prompt, negativePrompt;
  if (customPrompt && customPrompt.trim()) {
    prompt = customPrompt;
    negativePrompt = undefined;
  } else {
    prompt = buildKeyframePrompt(`物品道具概念图：${prop.name}，${desc}`);
    negativePrompt = undefined;
  }

  // 图片生成带重试（最多2次）
  let result;
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      result = await aiProxy.generateImage({
        db, userId: req.user.id, projectId: episode!.project_id,
        provider, modelName, prompt, negativePrompt,
        count: count || 1, size: '2048x2048',
        referenceImages: referenceImageUrl ? [referenceImageUrl] : undefined,
        saveSubDir: 'props',
        skipCache: true,
      });
      break;
    } catch (err) {
      lastError = err as Error;
      if (attempt === 1) throw err;
    }
  }
  if (!result) throw lastError || createError(500, 'IMAGE_GEN_FAILED', '图片生成失败');

  // 保存到道具
  const existing = Array.isArray(prop.concept_images) ? prop.concept_images : [];
  const newImages = result.images.map(img => ({ url: img.url, model: modelName, prompt }));
  const allImages = [...existing, ...newImages];
  ScriptPropDAO.update(db, prop.id, { concept_images: JSON.stringify(allImages) });

  res.json({ success: true, data: newImages });
}));

// 删除道具概念图
router.delete('/props/:id/images/:index', asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const prop = ScriptPropDAO.getById(db, req.params.id);
  if (!prop || prop.user_id !== req.user.id) throw createError(404, 'NOT_FOUND', '道具不存在');

  const index = parseInt(req.params.index, 10);
  const images = Array.isArray(prop.concept_images) ? prop.concept_images : [];
  if (index < 0 || index >= images.length) throw createError(400, 'INVALID_INDEX', '图片索引无效');

  const newImages = images.filter((_: any, i: number) => i !== index);
  const newSelectedIndex = (prop as any).selected_image_index >= newImages.length
    ? Math.max(0, newImages.length - 1)
    : (prop as any).selected_image_index;

  ScriptPropDAO.update(db, prop.id, {
    concept_images: JSON.stringify(newImages),
    selected_image_index: newSelectedIndex,
  } as any);

  res.json({ success: true, data: { message: '图片已删除', remaining: newImages.length } });
}));

export default router;
