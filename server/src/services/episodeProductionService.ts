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
  ScriptPropDAO,
  ProjectDAO,
} from '../models';
import { createError } from '../middleware/errorHandler';
import { aiProxy } from './aiProxy';
import { buildNovelToScriptPrompt } from './prompts/novelToScript';
import { buildShotGenerationPrompt } from './prompts/shotGeneration';
import { buildKeyframePrompt } from './prompts/keyframe';
import { buildVideoPrompt, type VideoPromptInput } from './prompts/video';
import { projectStorage } from './projectStorage';
import { downloadToFile } from '../utils/download';
import { parseAiJsonOrThrow, parseAiJson , parseShotListArray } from '../utils/aiJsonParser';
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
import { episodeEnrichService } from './episodeEnrichService';

/**
 * 从段级 h3Prompt 中按 [镜头N]（兼容 [Shot N]）切出单镜提示词段落。
 * 加料重构产出的段级提示词是整段官方格式（整体视听描述+声景+配乐），
 * 但本机渲染固定 5s/镜，实际提交需按镜头拆分；最后一镜保留尾部声景/配乐字段。
 */
function splitSegmentPromptByShot(h3Prompt: string, shotIndex: number, shotCount: number): string {
  if (!h3Prompt) return '';
  const re = /\[(?:镜头|Shot)\s*(\d+)\]/g;
  const matches: Array<{ num: number; start: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(h3Prompt))) {
    matches.push({ num: parseInt(m[1], 10), start: m.index });
  }
  if (matches.length === 0) return h3Prompt; // 无镜头标记：整段返回（兜底）
  const target = matches.find(mm => mm.num === shotIndex);
  if (!target) return h3Prompt;
  const next = matches.find(mm => mm.num === shotIndex + 1);
  return next ? h3Prompt.slice(target.start, next.start).trim() : h3Prompt.slice(target.start).trim();
}

// ============ 共享工具 ============

/** 解析项目风格描述（极简系统：用户一句话存在 project.style_description，无则返回 null） */
function resolveStyleDescription(db: Database, projectId: string | undefined): string | null {
  try {
    if (projectId) {
      const project = ProjectDAO.getById(db, projectId);
      if (project?.style_description && project.style_description.trim()) {
        return project.style_description.trim();
      }
    }
  } catch {
    // 获取风格描述失败，返回 null
  }
  return null;
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

  const prompt = buildNovelToScriptPrompt(episode.script_content);

  const result = await aiProxy.generateText({
    db, userId, provider, modelName,
    prompt, responseFormat: 'json', maxTokens: 32000,
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

  // 润色提示词 - 极简版（不改变剧情与人物关系，只优化语言表达）
  const prompt = `润色以下短剧剧本，保留核心剧情、人物关系和场景结构，只优化语言表达，使对话更精炼有力、更有戏剧冲突。

${episode.script_content}`;

  const result = await aiProxy.generateText({
    db, userId, provider, modelName,
    prompt, responseFormat: 'json', maxTokens: 32000,
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

  // ── 加料重构优先（已拍板方案）：该集已通过加料 → 直接用加料结果落库为分镜，
  //    加料结果即官方格式分镜剧本（含段级 h3Prompt），不做二次翻译 ──
  const storedEnrich = episodeEnrichService.parseStored(episode);
  if (episode.enrich_status === 'approved' && storedEnrich?.storyboard?.shots?.length) {
    console.log(`[GenerateShots] 使用加料重构分镜：${storedEnrich.meta.skillName}，${storedEnrich.storyboard.shots.length}镜 / ${storedEnrich.storyboard.seconds}s`);
    const en = storedEnrich.storyboard;
    const PHASE_NAMES = ['开场引入', '矛盾升级', '高潮爆发', '收束悬念'];
    const total = en.shots.length;
    return db.transaction(() => {
      const old = ShotDAO.listByEpisode(db, episode.id);
      for (const s of old) ShotDAO.delete(db, s.id);
      const seen = new Set<number>();
      let nextNum = 1;
      const created = en.shots.map((sh) => {
        let num = sh.shot || 0;
        while (seen.has(num)) num = 10000 + nextNum++;
        seen.add(num);
        const phaseNum = Math.min(4, Math.max(1, Math.floor(((num - 1) / Math.max(1, total)) * 4) + 1));
        let dialogue = '';
        if (sh.line) {
          const m = sh.line.match(/^([\u4e00-\u9fa5A-Za-z0-9·]{2,10})[：:]\s*(.+)$/);
          dialogue = m ? m[2] : sh.line;
        }
        const shotRow = ShotDAO.create(db, {
          user_id: userId,
          episode_id: episode.id,
          shot_number: num,
          shot_size: sh.size || 'medium',
          action_description: sh.action || sh.frame || '',
          dialogue,
          camera_movement: sh.camera || 'static',
          grid_position: '5',
          duration_seconds: sh.seconds || 5,
          notes: `加料重构分镜（${storedEnrich.meta.skillName}）`,
          phase: phaseNum,
          phase_name: PHASE_NAMES[phaseNum - 1],
          first_frame_description: sh.frame || null,
        });
        // 段级提示词按镜头切分落库（5s/镜独立提交消费；最后一镜含声景/配乐尾部）
        ShotDAO.update(db, shotRow.id, {
          video_prompt: splitSegmentPromptByShot(en.h3Prompt, sh.shot || num, total),
          video_skill: storedEnrich.meta.skillId,
        } as any);
        return shotRow;
      });
      console.log(`[GenerateShots] 加料分镜落库完成：${created.length} 镜`);
      return created;
    })();
  }

  const { textProvider, textModel, shotDensity, includeDialogue } = opts;

  // 已有角色资产（定妆信息）→ 注入分镜 prompt，保证分镜描述贴合定妆角色
  const existingCharacters = ScriptCharacterDAO.listByEpisode(db, episode.id)
    .filter(c => c.name)
    .map(c => ({ name: c.name, appearance: c.visual_prompt || c.visual_description || c.description || c.name }));

  // 剧集元数据 fallback：如果资产阶段还没提取角色，用剧集生成时输出的清单
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

  // 极简分镜提示词：场景内容 + 出场角色 + 场景表 + 道具表（分镜只做输出、不引入新场景/新道具）
  const charactersStr = characters && characters.length > 0
    ? characters.map(c => `${c.name}: ${c.appearance}`).join('\n')
    : '未指定';

  // 场景表（visual_prompt 优先）
  const existingScenes = ScriptSceneDAO.listByEpisode(db, episode.id);
  const scenesStr = existingScenes.length > 0
    ? existingScenes.map(s => `${s.name}: ${s.visual_prompt || s.description || s.location || ''}`).join('\n')
    : '未提供场景表';

  // 道具表（visual_prompt + keywords，用于 props_in_shot 匹配）
  const existingProps = ScriptPropDAO.listByEpisode(db, episode.id);
  const propsStr = existingProps.length > 0
    ? existingProps.map(p => `${p.name}: ${p.visual_prompt || p.description || ''}（关键词：${p.keywords || '无'}）`).join('\n')
    : '未提供道具表';

  const prompt = buildShotGenerationPrompt(
    episode.script_content,
    charactersStr,
    scenesStr,
    propsStr
  );

  const result = await aiProxy.generateText({
    db, userId, provider: textProvider, modelName: textModel,
    prompt, responseFormat: 'json', maxTokens: 32000,
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
      segment_id: s.segmentId ?? null,
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

  // 获取项目风格描述（极简系统：一句话风格，拼在提示词开头）
  const styleDescription = resolveStyleDescription(db, episode.project_id);

  // 获取参考角色（显式传入优先；缺省自动按镜头 characters_in_shot 收集——前端/批量入口无需感知，防旧图缓存与角色漂移）
  const referenceImages: string[] = [];
  const characterVisualDescriptions: string[] = []; // 角色视觉描述（服装/面部/年龄），用于提示词双重保障一致性
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
        // 收集角色视觉描述：name + visual_prompt（服装/面部/年龄/发型），拼入提示词确保一致性
        const visualDesc = c.visual_prompt || c.visual_description || c.description || '';
        if (visualDesc) {
          characterVisualDescriptions.push(`${c.name}：${visualDesc}`);
        }
      }
    }
  }

  // 获取参考场景：优先传入的 referenceSceneId，缺省自动用 shot.scene_id
  let scene: any = null;
  const effectiveSceneId = referenceSceneId || shot.scene_id;
  if (effectiveSceneId) {
    scene = ScriptSceneDAO.getById(db, effectiveSceneId);
    // 收集场景参考图（DAO层已解析concept_images为数组）
    if (scene?.concept_images && Array.isArray(scene.concept_images)) {
      const sceneImages = scene.concept_images;
      if (sceneImages.length > 0) {
        const sceneImgUrl = sceneImages[scene.selected_image_index || 0]?.url || sceneImages[0]?.url;
        if (sceneImgUrl) referenceImages.push(sceneImgUrl);
      }
    }
  }

  // 场景锚点描述：房间布局/家具位置/灯光氛围，确保同场景镜头画面一致
  const sceneDescBlock = scene
    ? `\n【场景锚点 — 必须严格保持与场景参考图一致】\n场景：${scene.name}\n环境：${scene.visual_prompt || scene.description || scene.location || ''}\n以上场景的空间布局、家具位置、灯光来源、墙面颜色、地板材质必须与场景参考图完全一致，绝对不能更换场景或改变房间布局。`
    : '';

  // 上下文衔接：获取前一镜的动作描述，确保镜头间画面连贯
  let prevShotContext = '';
  try {
    const allShots = ShotDAO.listByEpisode(db, shot.episode_id);
    const currentIdx = allShots.findIndex(s => s.id === shot.id);
    if (currentIdx > 0) {
      const prevShot = allShots[currentIdx - 1];
      if (prevShot?.action_description) {
        prevShotContext = `\n【上下文衔接 — 上一镜画面】\n上一镜：${prevShot.action_description.substring(0, 200)}\n本镜必须与上一镜在同一个场景中，角色位置、朝向、状态必须与上一镜结束时连贯衔接。`;
      }
    }
  } catch (ctxErr) {
    console.warn('[Keyframe] 上下文衔接获取失败:', (ctxErr as Error).message);
  }

  const types = frameTypes || ['first', 'last'];
  const results = [];

  for (const frameType of types) {
    try {
      console.log('[Keyframe] generating frame:', frameType);
      // 从 action_description 提取动作弧三段式：首帧=起始状态、尾帧=结束状态、中帧=动作过程
      // （分镜生成时三段式混在 action_description 中，未拆独立列；此处按帧型提取实现首尾帧画面差异化）
      const actionDesc = shot.action_description || '';
      let frameSpecificDescription: string | undefined;
      const segStart = actionDesc.match(/【起始状态】([^【]*)/);
      const segProc = actionDesc.match(/【动作过程】([^【]*)/);
      const segEnd = actionDesc.match(/【结束状态】([^【]*)/);
      if (frameType === 'first' && segStart) frameSpecificDescription = segStart[1].trim();
      else if (frameType === 'last' && segEnd) frameSpecificDescription = segEnd[1].trim();
      else if (frameType === 'middle' && segProc) frameSpecificDescription = segProc[1].trim();
      // 关键帧提示词：风格 + 场景锚点 + 上下文衔接 + 角色视觉描述 + 帧画面描述
      const subject = frameSpecificDescription || shot.action_description || '';
      // 注入角色视觉描述：服装/面部/年龄/发型，与参考图形成双重约束，防止角色漂移
      const characterDescBlock = characterVisualDescriptions.length > 0
        ? `\n【出场角色形象 — 必须严格保持与参考图一致】\n${characterVisualDescriptions.join('\n')}\n以上角色的面容、发型、发色、服装、体型、年龄感必须与参考图完全一致，绝对不能更换人物形象。`
        : '';
      // 组合完整提示词：场景锚点 + 上下文衔接 + 动作描述 + 角色描述
      const fullSubject = subject + sceneDescBlock + prevShotContext + characterDescBlock;
      const finalPrompt = buildKeyframePrompt(fullSubject, styleDescription || undefined);
      const finalNegativePrompt: string | undefined = undefined;

      console.log('[Keyframe] prompt generated:', finalPrompt.substring(0, 100));

      // Pollinations FLUX 对英文提示词理解远优于中文：先经 deepseek 翻译成英文
      let effectivePrompt = finalPrompt;
      if (provider === 'pollinations') {
        try {
          const trans = await aiProxy.generateText({
            db, userId,
            provider: 'deepseek', modelName: 'deepseek-chat',
            prompt: 'You are a professional prompt translator for AI image generation models. Translate the following Chinese image prompt into fluent, detailed English. Keep EVERY visual detail: characters, clothing, props, scene, background, action, body pose, camera angle, lighting, color tone, mood and art style. For Chinese-style elements (costume, architecture, props) use clear English descriptions instead of raw pinyin. Output ONLY the English translation with no explanation, no quotes.\n\n' + finalPrompt,
            temperature: 0.3,
            maxTokens: 900,
          });
          const t = (trans.content || '').trim();
          if (t.length > 20) effectivePrompt = t;
        } catch (transErr) {
          console.warn('[Keyframe] FLUX提示词翻译失败，使用中文原词:', (transErr as Error).message);
        }
      }

      const imgResult = await aiProxy.generateImage({
        db, userId, projectId: episode.project_id,
        provider, modelName, prompt: effectivePrompt, negativePrompt: finalNegativePrompt,
        count: 1, size: '2560x1440',
        referenceImages: referenceImages.length > 0 ? referenceImages : undefined,
        saveSubDir: 'keyframes',
        skipCache: true, // 关键帧生成跳过缓存，确保修改提示词后重新生成得到新图
      });
      console.log('[Keyframe] image generated:', imgResult.images?.length);

      const keyframe = ShotKeyframeDAO.create(db, {
        user_id: userId,
        shot_id: shot.id,
        frame_type: frameType,
        prompt: effectivePrompt,
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
  const { provider, modelName } = opts;

  // 极简系统：直接用原提示词重生成（一致性靠参考图，不再做优化/包装）
  let finalPrompt = keyframe.prompt;
  let finalNegativePrompt = keyframe.negative_prompt || undefined;

  const result = await aiProxy.generateImage({
    db, userId, projectId: episode!.project_id,
    provider, modelName,
    prompt: finalPrompt,
    negativePrompt: finalNegativePrompt,
    count: 1, size: '2560x1440',
    saveSubDir: 'keyframes',
    referenceImages: collectShotReferenceImages(db, shot!),
    skipCache: true, // 重新生成关键帧跳过缓存
  });

  return ShotKeyframeDAO.update(db, keyframe.id, {
    image_url: result.images[0]?.url,
    image_model_used: modelName,
    prompt: finalPrompt,
    negative_prompt: finalNegativePrompt,
  });
}

// ============ 视频生成 ============

/** 镜头运动英文枚举 → 中文标签（buildVideoPrompt 的 cameraMovement 段，生成自然中文提示词） */
const CAMERA_MOVEMENT_LABEL: Record<string, string> = {
  static: '固定', push_in: '缓慢推近', pull_out: '缓慢拉远', pan: '水平摇移', tilt: '垂直摇移',
  truck: '横向移动', crane: '升降运镜', handheld: '手持跟拍', zoom: '变焦', dolly: '推拉运镜',
  steadicam: '稳定器跟拍', long: '固定', full: '固定',
};

/** 极简视频提示词构建：风格描述 + 动作 + 角色定妆 + 场景（一致性主要靠参考图） */
function buildMinimalVideoPrompt(db: Database, shot: any, styleDescription: string | null): string {
  const characters: Array<{ name: string; appearance: string }> = [];
  try {
    const charRefs = parseShotCharacterIds(shot);
    for (const ref of charRefs) {
      let c = ScriptCharacterDAO.getById(db, ref);
      if (!c) {
        const epChars = ScriptCharacterDAO.listByEpisode(db, shot.episode_id);
        c = epChars.find((x: any) => x.name === ref) || null;
      }
      if (c && (c.visual_prompt || c.visual_description || c.description)) {
        const appearance = (c.visual_prompt || c.visual_description || c.description || '').slice(0, 120);
        characters.push({ name: c.name, appearance });
      }
    }
  } catch (err) {
    console.warn('[Video] 角色信息解析失败:', (err as Error).message);
  }

  let scene: { name: string; environment: string } | undefined;
  try {
    if (shot.scene_id) {
      const sc = ScriptSceneDAO.getById(db, shot.scene_id);
      if (sc) {
        const environment = (sc.visual_prompt || sc.description || sc.atmosphere || '').slice(0, 150);
        scene = { name: sc.name, environment };
      }
    }
  } catch (err) {
    console.warn('[Video] 场景信息解析失败:', (err as Error).message);
  }

  const input: VideoPromptInput = {
    styleDescription: styleDescription || undefined,
    action: shot.action_description || '',
    characters: characters.length > 0 ? characters : undefined,
    scene,
    // shuohao novel-storyboard：注入镜头情绪基调与运镜（英文枚举转中文标签）
    mood: shot.mood || undefined,
    cameraMovement: shot.camera_movement ? (CAMERA_MOVEMENT_LABEL[shot.camera_movement] || shot.camera_movement) : undefined,
  };
  return buildVideoPrompt(input);
}

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
  // 首尾帧模式（flf2v）下禁用"上一镜尾帧继承"：本镜 first/last 均由资产管线按分镜起止画面生成，
  // 首帧直接用本镜 first 关键帧，避免继承上一镜视频尾帧（可能携带旧方案场景漂移）
  const isFlf2vMode = String(modelName).includes('flf2v');
  let inheritedFirstFrameUrl: string | null = null;
  if (!explicitFirstFrame && !isFlf2vMode) {
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

  // 极简视频提示词：未传入 motionPrompt 时用 buildVideoPrompt 构建（风格+动作+角色+场景）
  let finalMotionPrompt = motionPrompt;
  if (!finalMotionPrompt) {
    try {
      const styleDescription = resolveStyleDescription(db, episode?.project_id);
      finalMotionPrompt = buildMinimalVideoPrompt(db, shot, styleDescription);
    } catch (err) {
      console.error('[Video] 提示词构建失败（使用原始动作描述）:', (err as Error).message);
      finalMotionPrompt = shot.action_description || '';
    }
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
  opts: { provider: string; modelName: string; shotIds?: string[]; candidatesPerShot?: number; frameTypes?: Array<'first' | 'last' | 'middle'> },
  _onProgress?: (p: { index: number; total: number; shotId: string; status: 'ok' | 'failed' }) => void
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
        frameTypes: opts.frameTypes || ['first'],
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
      // 速率限制：额外冷却再继续（Agnes 免费额度分钟级限流）
      if (errorMsg.includes('rate limit') || errorMsg.includes('限流') || err.code === 'AI_RATE_LIMITED') {
        await new Promise(resolve => setTimeout(resolve, Number(process.env.BATCH_KEYFRAME_RATE_LIMIT_BACKOFF_MS) || 30000));
      }
    }

    // 请求间隔：避免速率限制（Agnes AI 免费额度分钟级限流），可用环境变量 BATCH_KEYFRAME_INTERVAL_MS 调整
    await new Promise(resolve => setTimeout(resolve, Number(process.env.BATCH_KEYFRAME_INTERVAL_MS) || 20000));
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

    // 检查是否已有处理中的视频（超时清理）
    // ⚠️ 注意：ComfyUI 本地渲染（MiniMaxH3 等）单镜头可达 30 分钟以上，且队列按序渲染。
    // 之前按"超过2分钟即失败"清理，会把排队/渲染中的本地任务误杀，重复点击批量生成时
    // 更是直接作废正在跑的任务（用户反馈"只有前几秒后面空白/只剩一个视频"的重要成因之一）。
    // 修复：ComfyUI 任务不设短超时（24h 兜底，与 getVideoStatus 一致）；云端任务保留 10 分钟超时。
    const existingVideos = ShotVideoIntervalDAO.listByShot(db, shot.id);
    const now = Date.now();
    for (const v of existingVideos) {
      if ((v.status === 'processing' || v.status === 'pending') && v.created_at) {
        const createdTime = new Date(v.created_at).getTime();
        const isLocalComfy = (v.video_model_used || '').startsWith('comfyui');
        const timeoutMs = isLocalComfy ? 24 * 60 * 60 * 1000 : 10 * 60 * 1000;
        if (now - createdTime > timeoutMs) {
          // 超时任务标记为失败
          ShotVideoIntervalDAO.update(db, v.id, { status: 'failed', error_message: isLocalComfy ? '任务超时（ComfyUI本地渲染超过24小时）' : '任务超时（超过10分钟）' });
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

      // 极简视频提示词：buildVideoPrompt 构建（风格+动作+角色+场景）
      let finalMotionPrompt = '';
      try {
        const styleDescription = resolveStyleDescription(db, episode.project_id);
        finalMotionPrompt = buildMinimalVideoPrompt(db, shot, styleDescription);
      } catch (err) {
        console.error('[BatchVideo] 提示词构建失败:', (err as Error).message);
        finalMotionPrompt = shot.action_description || '';
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
  // shuohao 新输出字段归一化（snake_case → camelCase）：全量字段映射
  const SNAKE_TO_CAMEL: Record<string, string> = {
    shot_number: 'shotNumber',
    shot_size: 'shotSize',
    camera_movement: 'cameraMovement',
    action_description: 'actionDescription',
    duration_seconds: 'durationSeconds',
    characters_in_shot: 'charactersInShot',
    scene_name: 'sceneName',
    props_in_shot: 'propsInShot',
    segment_id: 'segmentId',
    first_frame_description: 'firstFrameDescription',
    last_frame_description: 'lastFrameDescription',
  };
  for (const [snake, camel] of Object.entries(SNAKE_TO_CAMEL)) {
    if (out[snake] !== undefined && out[camel] === undefined) out[camel] = out[snake];
  }
  if (out.segmentId !== undefined && out.segmentId !== null && typeof out.segmentId !== 'number') {
    const n = Number(String(out.segmentId).replace(/[^\d.]/g, ''));
    out.segmentId = Number.isFinite(n) ? n : null;
  }
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
