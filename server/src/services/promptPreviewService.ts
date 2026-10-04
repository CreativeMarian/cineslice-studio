// 提示词预览服务（CineSlice Studio）
// 为9个创作环节提供"提示词预览"——不调用AI，只基于当前数据库数据构建完整提示词字符串并返回。
// 复用 promptBuilder（身份锁/服装/场景/空间/调度/动作/禁令行拼接）与 prompts/ 下提示词模板，
// 不重复实现提示词构建逻辑。
// 数据一致性：一律从数据库实时读取最新数据（episode.script_content / characters / scenes / shots），
// 不使用缓存或请求传入的旧数据；已保存的自定义提示词（custom_* 列）优先于自动构建结果。

import {
  NovelEpisodeDAO,
  ShotDAO,
  ScriptCharacterDAO,
  ScriptSceneDAO,
  ScriptPropDAO,
  ProjectDAO,
  CharacterOutfitDAO,
} from '../models';
import { createError } from '../middleware/errorHandler';
import { ErrorCodes } from '../errors';
import { buildCharacterExtractPrompt } from './prompts/characterExtract';
import { buildSceneExtractPrompt } from './prompts/sceneExtract';
import { buildShotGenerationPrompt } from './prompts/shotGeneration';
import { buildSceneConceptPrompt } from './prompts/keyframe';
import {
  buildFullKeyframePrompt,
  buildFullVideoPrompt,
  buildCharacterConceptPromptWithIdentity,
  buildWardrobeBlock,
  buildSceneSpatialLightingBlock,
  buildSceneTableEntryForPrompt,
} from './promptBuilder';
import { parseShotCharacterIds } from './shotConsistencyService';
import { parseSpeaker, stripSpeakerPrefix } from './voiceAssignment';
import { safeJsonParse } from '../utils/json';
import type { Database, ScriptCharacter, ScriptScene, Shot, WardrobeItem } from '../types';

export interface PromptPreviewResult {
  prompt: string;
  contextSummary: string;
}

// ═══════════════════════════════════════════════════════════════
// 内部工具
// ═══════════════════════════════════════════════════════════════

/** 剧集读取（不存在抛 404） */
function getEpisodeOrThrow(db: Database, episodeId: string) {
  const episode = NovelEpisodeDAO.getById(db, episodeId);
  if (!episode) throw createError(404, ErrorCodes.NOT_FOUND, '剧集不存在');
  return episode;
}

/**
 * 解析剧集"最新剧本"：已通过加料（enrich_status=approved）时优先取加料后的剧本正文
 * （兼容旧数据——加料结果只存 enriched_script JSON 未回写 script_content；
 *  新数据 approve 时已把 enrichedScript 回写 script_content，此处解析仍能命中同一内容）；
 * 未加料/未通过时返回 script_content（数据库中的最新原始剧本）。
 * 提取/分镜等所有下游环节与预览接口统一走本函数，保证"用最新剧本，不用缓存/旧数据"。
 */
export function getEpisodeEffectiveScript(episode: {
  script_content?: string;
  enriched_script?: string | null;
  enrich_status?: string | null;
}): string {
  if (episode.enrich_status === 'approved' && episode.enriched_script && episode.enriched_script.trim()) {
    try {
      const parsed = JSON.parse(episode.enriched_script) as { enrichedScript?: string };
      if (parsed?.enrichedScript && parsed.enrichedScript.trim()) return parsed.enrichedScript.trim();
    } catch { /* JSON 解析失败时忽略，回退 script_content */ }
  }
  return episode.script_content || '';
}

/** 镜头读取（不存在抛 404） */
function getShotOrThrow(db: Database, shotId: string): Shot {
  const shot = ShotDAO.getById(db, shotId);
  if (!shot) throw createError(404, ErrorCodes.NOT_FOUND, '镜头不存在');
  return shot;
}

/** 角色读取（不存在抛 404） */
function getCharacterOrThrow(db: Database, characterId: string): ScriptCharacter {
  const character = ScriptCharacterDAO.getById(db, characterId);
  if (!character) throw createError(404, ErrorCodes.NOT_FOUND, '角色不存在');
  return character;
}

/** 场景读取（不存在抛 404） */
function getSceneOrThrow(db: Database, sceneId: string): ScriptScene {
  const scene = ScriptSceneDAO.getById(db, sceneId);
  if (!scene) throw createError(404, ErrorCodes.NOT_FOUND, '场景不存在');
  return scene;
}

/** 镜头项目（镜头 → 剧集 → 项目；getEpisodeOrThrow 已保证剧集非空） */
function getProjectForEpisode(db: Database, episodeId: string): { episode: NonNullable<ReturnType<typeof NovelEpisodeDAO.getById>>; project: ReturnType<typeof ProjectDAO.getById> | null } {
  const episode = getEpisodeOrThrow(db, episodeId);
  const project = episode ? (ProjectDAO.getById(db, episode.project_id) || null) : null;
  return { episode, project };
}

/** 收集镜头出场角色实体（ID/角色名兼容，与 keyframeGenerator/videoGenerator 一致） */
function resolveShotCharacters(db: Database, shot: Shot): ScriptCharacter[] {
  const characters: ScriptCharacter[] = [];
  const refs = parseShotCharacterIds(shot);
  if (refs.length === 0) return characters;
  const epChars = ScriptCharacterDAO.listByEpisode(db, shot.episode_id);
  for (const ref of refs) {
    let c = ScriptCharacterDAO.getById(db, ref);
    if (!c) c = epChars.find(x => x.name === ref) || null;
    if (c) characters.push(c);
  }
  return characters;
}

/** 前一镜上下文（与 keyframeGenerator 生成逻辑一致） */
function resolvePrevShotContext(db: Database, shot: Shot): string {
  try {
    const allShots = ShotDAO.listByEpisode(db, shot.episode_id);
    const currentIdx = allShots.findIndex(s => s.id === shot.id);
    if (currentIdx > 0) {
      const prevShot = allShots[currentIdx - 1];
      if (prevShot?.action_description) {
        return `\n【上下文衔接 — 上一镜画面】\n上一镜：${prevShot.action_description.substring(0, 200)}\n本镜必须与上一镜在同一个场景中，角色位置、朝向、状态必须与上一镜结束时连贯衔接。`;
      }
    }
  } catch { /* 上下文获取失败时忽略 */ }
  return '';
}

/** 角色服装块解析：优先按 wardrobe_id 匹配（wardrobe JSON 内 id → character_outfits 表），否则默认服装 */
function resolveCharacterWardrobeBlock(db: Database, character: ScriptCharacter, wardrobeId?: string): { text: string; label: string | null } {
  const wardrobe = safeJsonParse<WardrobeItem[]>(character.wardrobe, []);
  if (wardrobeId) {
    let item: WardrobeItem | undefined;
    if (Array.isArray(wardrobe)) item = wardrobe.find(w => w.id === wardrobeId);
    if (item) {
      const color = item.color ? `，主色${item.color}` : '';
      return { text: `【服装】${item.name}：${item.description || ''}${color}`, label: item.name };
    }
    const outfit = CharacterOutfitDAO.getById(db, wardrobeId);
    if (outfit) {
      return { text: `【服装】${outfit.name}：${outfit.description || ''}`, label: outfit.name };
    }
  }
  const fallback = buildWardrobeBlock(character);
  return { text: fallback, label: fallback ? '默认服装' : null };
}

// ═══════════════════════════════════════════════════════════════
// 1. 剧本改写
// ═══════════════════════════════════════════════════════════════

/**
 * 剧本改写提示词预览：基于用户输入 + 项目配置构建改写提示词
 * @param input 用户输入（一句话创意 / 大纲 / 小说内容）
 * @param config 项目配置（可选）
 * @returns 改写提示词 + 人类可读摘要
 */
export async function getScriptRewritePrompt(
  _db: Database,
  input: string,
  config: { project_style?: string; aspect_ratio?: string; target_duration?: number; genre?: string; input_mode?: string } = {},
): Promise<PromptPreviewResult> {
  const mode = (config.input_mode || 'one_liner').trim();
  const style = (config.project_style || config.genre || '').trim();
  const duration = config.target_duration && config.target_duration > 0 ? `${config.target_duration}分钟` : '约3分钟';
  const aspect = (config.aspect_ratio || '').trim();

  const styleLine = style ? `\n题材风格：${style}` : '';
  const aspectLine = aspect ? `\n画面比例：${aspect}` : '';

  let prompt: string;
  if (mode === 'novel') {
    prompt = `你是资深的短剧编剧。请将以下小说内容改编为一部标准短剧剧本。${styleLine}${aspectLine}

【小说内容】
${input}

【改编要求】
- 提炼核心剧情线与关键冲突，去除冗余描写
- 保留小说的精彩情节与人物关系，节奏紧凑化
- 改编为单集短剧（${duration}成片，剧本1200-1800字）
- 输出标准剧本格式（逐字遵循）：
  第X场 INT./EXT. 场景名 - 时间
  动作/环境描述
  角色名：台词
- 场景类型：INT.（内景）/ EXT.（外景）；时间标注如"日/夜/黄昏"
- 台词必须符合人物性格，口语化有张力，对话不超过5个来回
- 保持人物关系一致，不引入小说外的关键新角色
- 戏剧节奏：每场戏要有冲突或推进，杜绝注水，结尾留钩子

【输出要求】
只输出剧本正文纯文本，不要JSON，不要额外解释。`;
  } else if (mode === 'outline') {
    prompt = `你是资深的短剧编剧。请根据以下创作大纲，编写一部标准短剧剧本。${styleLine}${aspectLine}

【创作大纲】
${input}

【剧本格式要求（严格遵守）】
- 改编为单集短剧（${duration}成片，剧本1200-1800字）
- 每场戏格式（逐字遵循）：
  第X场 INT./EXT. 场景名 - 时间
  动作/环境描述（写明谁在做什么、环境状态）
  角色名：台词
- 场景类型：INT.（内景）/ EXT.（外景）；时间标注如"日/夜/黄昏"
- 每场戏必须包含：环境交代 + 角色动作 + 对白
- 台词口语化、有戏剧张力，符合角色性格，对话不超过5个来回
- 保持人物关系一致，不出现大纲外的角色
- 戏剧节奏：每场戏都要有冲突或推进，杜绝注水对话，结尾留钩子

【输出要求】
只输出剧本正文纯文本，不要JSON，不要额外解释。`;
  } else {
    // one_liner（默认）
    prompt = `你是资深的短剧编剧。请根据下面的一句话创意，扩写为一部标准短剧剧本。${styleLine}${aspectLine}

一句话创意：${input}

【要求】
- 先构建短剧创作大纲（人物设定 3-6 个、故事梗概、分集设计），再扩写为标准短剧剧本
- 改编为单集短剧（${duration}成片，剧本1200-1800字）
- 剧本格式（逐字遵循）：第X场 INT./EXT. 场景名 - 时间 / 动作环境描述 / 角色名：台词
- 台词口语化有张力，对话不超过5个来回，结尾留钩子
- 主角形象必须清晰（含外貌特征，供后续角色设计使用）

【输出要求】
只输出剧本正文纯文本，不要JSON，不要额外解释。`;
  }

  const modeLabel = mode === 'novel' ? '小说' : mode === 'outline' ? '大纲' : '一句话创意';
  const summary = [
    `已填入：${modeLabel}（${input.length}字）`,
    style ? `项目风格：${style}` : '',
    aspect ? `画面比例：${aspect}` : '',
    `目标时长：${duration}成片`,
  ].filter(Boolean).join('、');
  return { prompt, contextSummary: summary };
}

// ═══════════════════════════════════════════════════════════════
// 2. 角色提取 / 3. 场景提取
// ═══════════════════════════════════════════════════════════════

/**
 * 角色提取提示词预览：基于剧集最新剧本构建提取提示词
 */
export async function getCharacterExtractPrompt(db: Database, episodeId: string): Promise<PromptPreviewResult> {
  const episode = getEpisodeOrThrow(db, episodeId);
  const script = getEpisodeEffectiveScript(episode);
  if (!script.trim()) throw createError(400, ErrorCodes.VALIDATION_ERROR, '该集剧本为空，无法构建角色提取提示词');
  const prompt = buildCharacterExtractPrompt(script);
  const enriched = episode.enrich_status === 'approved';
  const contextSummary = `已填入：剧集「${episode.title}」${enriched ? '加料后剧本' : '剧本'}（${script.length}字）`;
  return { prompt, contextSummary };
}

/**
 * 场景提取提示词预览：基于剧集最新剧本构建提取提示词
 */
export async function getSceneExtractPrompt(db: Database, episodeId: string): Promise<PromptPreviewResult> {
  const episode = getEpisodeOrThrow(db, episodeId);
  const script = getEpisodeEffectiveScript(episode);
  if (!script.trim()) throw createError(400, ErrorCodes.VALIDATION_ERROR, '该集剧本为空，无法构建场景提取提示词');
  const prompt = buildSceneExtractPrompt(script);
  const enriched = episode.enrich_status === 'approved';
  const contextSummary = `已填入：剧集「${episode.title}」${enriched ? '加料后剧本' : '剧本'}（${script.length}字）`;
  return { prompt, contextSummary };
}

// ═══════════════════════════════════════════════════════════════
// 4. 分镜生成
// ═══════════════════════════════════════════════════════════════

/**
 * 分镜生成提示词预览：基于剧本 + 角色 + 场景（含空间布局/灯光）+ 道具构建分镜提示词
 * @param config shot_density / include_dialogue 作为生成参数追加到提示词尾部
 */
export async function getShotGenerationPrompt(
  db: Database,
  episodeId: string,
  config: { shot_density?: string; include_dialogue?: boolean } = {},
): Promise<PromptPreviewResult> {
  const { episode, project } = getProjectForEpisode(db, episodeId);
  const script = getEpisodeEffectiveScript(episode);
  if (!script.trim()) throw createError(400, ErrorCodes.VALIDATION_ERROR, '该集剧本为空，无法构建分镜提示词');

  // 角色资产（定妆信息）注入
  const existingCharacters = ScriptCharacterDAO.listByEpisode(db, episode.id)
    .filter(c => c.name)
    .map(c => ({ name: c.name, appearance: c.visual_prompt || c.visual_description || c.description || c.name }));
  let characters = existingCharacters.length > 0 ? existingCharacters : undefined;
  if (!characters && episode.characters_json) {
    try {
      const epChars = JSON.parse(episode.characters_json);
      if (Array.isArray(epChars) && epChars.length > 0) {
        characters = epChars.map((c: any) => ({ name: c.name, appearance: c.description || c.role || c.name }));
      }
    } catch { /* 解析失败忽略 */ }
  }
  const charactersStr = characters && characters.length > 0
    ? characters.map(c => `${c.name}: ${c.appearance}`).join('\n')
    : '未指定';

  // 场景表（buildSceneTableEntryForPrompt：含空间布局 + 灯光体系摘要）
  const existingScenes = ScriptSceneDAO.listByEpisode(db, episode.id);
  const scenesStr = existingScenes.length > 0
    ? existingScenes.map(s => buildSceneTableEntryForPrompt(s)).join('\n')
    : '未提供场景表';

  // 道具表
  const existingProps = ScriptPropDAO.listByEpisode(db, episode.id);
  const propsStr = existingProps.length > 0
    ? existingProps.map(p => `${p.name}: ${p.visual_prompt || p.description || ''}（关键词：${p.keywords || '无'}）`).join('\n')
    : '未提供道具表';

  let prompt = buildShotGenerationPrompt(script, charactersStr, scenesStr, propsStr);

  // 生成参数（shot_density / include_dialogue）追加为【生成参数】块
  const hints: string[] = [];
  if (config.shot_density) {
    hints.push(config.shot_density === 'dense' ? '分镜密度：密集（更多镜头，动作拆分更细）'
      : config.shot_density === 'sparse' ? '分镜密度：稀疏（镜头精简）'
      : '分镜密度：标准');
  }
  if (config.include_dialogue === false) hints.push('本镜不含台词（只保留动作镜头语言）');
  else if (config.include_dialogue === true) hints.push('完整保留台词');
  if (hints.length > 0) prompt += `\n\n【生成参数】\n${hints.join('\n')}`;

  const styleText = project?.style_description || project?.visual_style || '';
  const summary = [
    `已填入：剧集「${episode.title}」剧本（${script.length}字）`,
    `${characters?.length ?? 0}个角色`,
    `${existingScenes.length}个场景`,
    `${existingProps.length}个道具`,
    styleText ? `项目风格：${styleText}` : '',
    config.shot_density ? `分镜密度：${config.shot_density}` : '',
    config.include_dialogue !== undefined ? `台词：${config.include_dialogue ? '包含' : '不包含'}` : '',
  ].filter(Boolean).join('、');
  return { prompt, contextSummary: summary };
}

// ═══════════════════════════════════════════════════════════════
// 5. 角色概念图 / 6. 场景概念图
// ═══════════════════════════════════════════════════════════════

/**
 * 角色概念图提示词预览：角色 identity_lock + 服装 + 项目风格
 * 已保存的自定义提示词（script_characters.custom_image_prompt）优先返回
 * @param wardrobeId 可选：指定服装（wardrobe JSON 内 id 或 character_outfits 表 id）
 */
export async function getCharacterImagePrompt(db: Database, characterId: string, wardrobeId?: string): Promise<PromptPreviewResult> {
  const character = getCharacterOrThrow(db, characterId);
  const episode = NovelEpisodeDAO.getById(db, character.episode_id);
  const project = episode ? (ProjectDAO.getById(db, episode.project_id) || null) : null;

  // 已保存的自定义提示词优先（下次生成默认使用）
  if (character.custom_image_prompt && character.custom_image_prompt.trim()) {
    return {
      prompt: character.custom_image_prompt,
      contextSummary: `已填入：角色「${character.name}」已保存的自定义提示词（custom_image_prompt）`,
    };
  }

  let prompt = buildCharacterConceptPromptWithIdentity(character, project);
  const summaryParts = [`已填入：角色「${character.name}」身份锁${character.identity_lock ? '（逐字锁定）' : '（无，回退外貌描述）'}`];

  // 服装块（指定 wardrobe_id 或默认服装）
  const wardrobe = resolveCharacterWardrobeBlock(db, character, wardrobeId);
  if (wardrobe.text) {
    prompt += `\n${wardrobe.text}`;
    summaryParts.push(`服装：${wardrobe.label}`);
  }

  const styleText = project?.style_description || project?.visual_style || '';
  if (styleText) summaryParts.push(`项目风格：${styleText}`);
  return { prompt, contextSummary: summaryParts.join('、') };
}

/**
 * 场景概念图提示词预览：场景描述 + 空间布局 + 灯光体系 + 项目风格
 * 已保存的自定义提示词（script_scenes.custom_image_prompt）优先返回
 */
export async function getSceneImagePrompt(db: Database, sceneId: string): Promise<PromptPreviewResult> {
  const scene = getSceneOrThrow(db, sceneId);
  const episode = NovelEpisodeDAO.getById(db, scene.episode_id);
  const project = episode ? (ProjectDAO.getById(db, episode.project_id) || null) : null;

  if (scene.custom_image_prompt && scene.custom_image_prompt.trim()) {
    return {
      prompt: scene.custom_image_prompt,
      contextSummary: `已填入：场景「${scene.name}」已保存的自定义提示词（custom_image_prompt）`,
    };
  }

  const sceneDesc = scene.description && scene.description.trim()
    ? scene.description
    : `${scene.name}，${scene.location || '未指定地点'}，${scene.time_of_day === 'night' ? '夜晚，月光照明' : scene.time_of_day === 'dawn' ? '黎明，柔和晨光' : scene.time_of_day === 'dusk' ? '黄昏，金色夕阳' : '白天，自然光'}，氛围${scene.atmosphere || '自然'}，详细的环境布局和陈设`;

  // 空间布局 + 灯光体系（与场景概念图生成路由一致）
  const spatialLighting = buildSceneSpatialLightingBlock(scene);
  const styleText = project?.style_description || project?.visual_style || '';
  const prompt = buildSceneConceptPrompt(scene.name, spatialLighting ? `${sceneDesc}\n\n${spatialLighting}` : sceneDesc, styleText || undefined);

  const summaryParts = [
    `已填入：场景「${scene.name}」描述（${sceneDesc.length}字）`,
    scene.spatial_layout ? '空间布局' : '',
    scene.lighting ? '灯光体系' : '',
    styleText ? `项目风格：${styleText}` : '',
  ].filter(Boolean).join('、');
  return { prompt, contextSummary: summaryParts || `已填入：场景「${scene.name}」` };
}

// ═══════════════════════════════════════════════════════════════
// 7. 关键帧 / 8. 视频 / 9. 配音
// ═══════════════════════════════════════════════════════════════

/**
 * 关键帧提示词预览：基于分镜 + 角色 + 场景（含空间/灯光）+ 前一镜上下文
 * 已保存的自定义提示词（shots.custom_keyframe_prompt）优先返回
 */
export async function getKeyframePrompt(db: Database, shotId: string): Promise<PromptPreviewResult> {
  const shot = getShotOrThrow(db, shotId);
  const { project } = getProjectForEpisode(db, shot.episode_id);

  if (shot.custom_keyframe_prompt && shot.custom_keyframe_prompt.trim()) {
    return {
      prompt: shot.custom_keyframe_prompt,
      contextSummary: `已填入：镜头#${shot.shot_number}已保存的自定义提示词（custom_keyframe_prompt）`,
    };
  }

  const charactersInShot = resolveShotCharacters(db, shot);
  let scene: ScriptScene | null = null;
  if (shot.scene_id) scene = ScriptSceneDAO.getById(db, shot.scene_id) || null;
  const prevShotContext = resolvePrevShotContext(db, shot);

  const prompt = buildFullKeyframePrompt(shot, charactersInShot, scene, project, prevShotContext || undefined);

  const styleText = project?.style_description || project?.visual_style || '';
  const summary = [
    `已填入：镜头#${shot.shot_number}动作（${(shot.action_description || '').length}字）`,
    `${charactersInShot.length}个角色`,
    scene ? `场景「${scene.name}」${scene.spatial_layout ? '（含空间布局）' : ''}${scene.lighting ? '（含灯光）' : ''}` : '场景：无',
    styleText ? `项目风格：${styleText}` : '',
    prevShotContext ? '前一镜上下文' : '',
  ].filter(Boolean).join('、');
  return { prompt, contextSummary: summary };
}

/**
 * 视频提示词预览：基于分镜 + 角色 + 场景（压缩但保留主光方向/颜色）
 * 已保存的自定义提示词（shots.custom_video_prompt）优先返回
 */
export async function getVideoPrompt(db: Database, shotId: string): Promise<PromptPreviewResult> {
  const shot = getShotOrThrow(db, shotId);
  const { project } = getProjectForEpisode(db, shot.episode_id);

  if (shot.custom_video_prompt && shot.custom_video_prompt.trim()) {
    return {
      prompt: shot.custom_video_prompt,
      contextSummary: `已填入：镜头#${shot.shot_number}已保存的自定义提示词（custom_video_prompt）`,
    };
  }

  const characters = resolveShotCharacters(db, shot);
  let scene: ScriptScene | null = null;
  if (shot.scene_id) scene = ScriptSceneDAO.getById(db, shot.scene_id) || null;
  const prompt = buildFullVideoPrompt(shot, characters, scene, project);

  const styleText = project?.style_description || project?.visual_style || '';
  const summary = [
    `已填入：镜头#${shot.shot_number}动作（${(shot.action_description || '').length}字）`,
    `${characters.length}个角色`,
    scene ? `场景「${scene.name}」${scene.lighting ? '（含灯光主光）' : ''}` : '场景：无',
    styleText ? `项目风格：${styleText}` : '',
  ].filter(Boolean).join('、');
  return { prompt, contextSummary: summary };
}

/**
 * 配音提示词预览：基于台词文本 + 角色信息（说话人 / 音色 / 性格）构建 TTS 提示词
 */
export async function getAudioPrompt(db: Database, shotId: string): Promise<PromptPreviewResult> {
  const shot = getShotOrThrow(db, shotId);
  const dialogueText = stripSpeakerPrefix(shot.dialogue || '').trim();
  const speaker = parseSpeaker(shot.dialogue || '');

  let speakerCharacter: ScriptCharacter | null = null;
  if (speaker) {
    speakerCharacter = ScriptCharacterDAO.listByEpisode(db, shot.episode_id)
      .find(c => c.name === speaker) || null;
  }

  let prompt: string;
  if (!dialogueText) {
    prompt = `（本镜头无台词，无需配音。若要生成旁白，请补充旁白文本后重试）`;
  } else {
    const lines = ['请为以下短剧台词配音，输出自然、有情绪张力的中文语音。'];
    if (speaker) lines.push(`角色：${speaker}`);
    if (speakerCharacter?.voice_prompt) lines.push(`角色音色要求：${speakerCharacter.voice_prompt}`);
    if (speakerCharacter?.character_profile) lines.push(`角色性格：${speakerCharacter.character_profile.slice(0, 100)}`);
    lines.push(`台词：${dialogueText}`);
    prompt = lines.join('\n');
  }

  const summaryParts = [
    `已填入：镜头#${shot.shot_number}台词（${dialogueText.length}字）`,
    speaker ? `说话人：${speaker}` : '',
    speakerCharacter ? '角色音色/性格信息' : '',
  ].filter(Boolean).join('、');
  return { prompt, contextSummary: summaryParts || `已填入：镜头#${shot.shot_number}（无台词）` };
}
