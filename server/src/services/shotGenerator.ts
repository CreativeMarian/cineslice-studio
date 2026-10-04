// 分镜生成服务（P3-9 拆分自 episodeProductionService.ts）
// 剧本重生成/润色 + 分镜生成 相关逻辑
// 由 episodeProductionService.ts 作为 index 统一重新导出

import {
  NovelEpisodeDAO,
  ShotDAO,
  ScriptCharacterDAO,
  ScriptSceneDAO,
  ScriptPropDAO,
  SegmentDAO,
} from '../models';
import { createError } from '../middleware/errorHandler';
import { ErrorCodes } from '../errors';
import { PHASE_NAMES } from '../constants';
import { aiProxy } from './aiProxy';
import { buildNovelToScriptPrompt } from './prompts/novelToScript';
import { buildShotGenerationPrompt } from './prompts/shotGeneration';
import { parseAiJsonOrThrow, parseAiJson, parseShotListArray } from '../utils/aiJsonParser';
import { buildShotAssetAssociations, matchSceneNameFromText } from './shotConsistencyService';
import type { Database } from '../types';
import { episodeEnrichService } from './episodeEnrichService';

/**
 * 从段级 h3Prompt 中按 [镜头N]（兼容 [Shot N]）切出单镜提示词段落。
 * 加料重构产出的段级提示词是整段官方格式（整体视听描述+声景+配乐），
 * 但本机渲染固定 5s/镜，实际提交需按镜头拆分；最后一镜保留尾部声景/配乐字段。
 */
function splitSegmentPromptByShot(h3Prompt: string, shotIndex: number, _shotCount: number): string {
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
      throw createError(502, ErrorCodes.AI_CALL_FAILED, `${actionLabel}: AI返回内容解析失败: ${(err as Error).message}。返回预览: ${contentPreview}`);
    }
  }
  return data;
}

// ============ 剧本 ============

/**
 * 重新生成某集剧本。
 * @param db 数据库实例
 * @param userId 当前用户 ID（校验剧集归属）
 * @param episodeId 剧集 ID
 * @param provider 文本模型供应商
 * @param modelName 文本模型名称
 * @returns 更新后的 NovelEpisode（script_content 已替换，text_model_used 已记录）
 * @sideEffects 调用 AI 改写剧本并落库，更新剧集状态为 generated
 */
export async function regenerateEpisodeScript(
  db: Database,
  userId: string,
  episodeId: string,
  provider: string,
  modelName: string
) {
  const episode = NovelEpisodeDAO.getByIdAndUser(db, episodeId, userId);
  if (!episode) throw createError(404, ErrorCodes.NOT_FOUND, '剧集不存在');

  const prompt = buildNovelToScriptPrompt(episode.script_content);

  const result = await aiProxy.generateText({
    db, userId, provider, modelName,
    prompt, responseFormat: 'json', maxTokens: 32000,
  });

  console.log(`[RegenerateEpisode] episodeId=${episode.id} AI返回长度: ${result.content.length}`);
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

/**
 * 润色某集剧本（不改变剧情，只优化文字）。
 * @param db 数据库实例
 * @param userId 当前用户 ID（校验剧集归属）
 * @param episodeId 剧集 ID
 * @param provider 文本模型供应商
 * @param modelName 文本模型名称
 * @returns 更新后的 NovelEpisode（文字已润色，text_model_used 已记录）
 * @sideEffects 调用 AI 润色剧本并落库，更新剧集状态为 edited
 */
export async function polishEpisodeScript(
  db: Database,
  userId: string,
  episodeId: string,
  provider: string,
  modelName: string
) {
  const episode = NovelEpisodeDAO.getByIdAndUser(db, episodeId, userId);
  if (!episode) throw createError(404, ErrorCodes.NOT_FOUND, '剧集不存在');

  // 润色提示词 - 极简版（不改变剧情与人物关系，只优化语言表达）
  const prompt = `润色以下短剧剧本，保留核心剧情、人物关系和场景结构，只优化语言表达，使对话更精炼有力、更有戏剧冲突。

${episode.script_content}`;

  const result = await aiProxy.generateText({
    db, userId, provider, modelName,
    prompt, responseFormat: 'json', maxTokens: 32000,
  });

  console.log(`[PolishEpisode] episodeId=${episode.id} AI返回长度: ${result.content.length}`);

  const data = parseEpisodeAiData(result.content, '润色失败');

  return NovelEpisodeDAO.update(db, episode.id, {
    title: data.title || episode.title,
    script_content: data.scriptContent || episode.script_content,
    text_model_used: `${provider}/${modelName}`,
    status: 'edited',
  });
}

// ============ 分镜 ============

/**
 * 生成分镜（先删旧再创建，与自动流水线逻辑一致）
 * v2.0 - 场景关联（sceneName→script_scenes 匹配/创建，写 scene_id）+ 角色资产上下文注入
 * @param db 数据库实例
 * @param userId 当前用户 ID（校验剧集归属）
 * @param episodeId 剧集 ID
 * @param opts 生成选项（textProvider/textModel 必填；shotDensity/includeDialogue 可选）
 * @returns 新创建的分镜列表
 * @sideEffects 单事务内删除旧分镜并批量创建新分镜（含场景关联与调度解析），失败自动回滚
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
  if (!episode) throw createError(404, ErrorCodes.NOT_FOUND, '剧集不存在');

  // ── 加料重构优先（已拍板方案）：该集已通过加料 → 直接用加料结果落库为分镜，
  //    加料结果即官方格式分镜剧本（含段级 h3Prompt），不做二次翻译 ──
  const storedEnrich = episodeEnrichService.parseStored(episode);
  if (episode.enrich_status === 'approved' && storedEnrich?.storyboard?.shots?.length) {
    console.log(`[GenerateShots] 使用加料重构分镜：${storedEnrich.meta.skillName}，${storedEnrich.storyboard.shots.length}镜 / ${storedEnrich.storyboard.seconds}s`);
    const en = storedEnrich.storyboard;
    const total = en.shots.length;

    // P0-5: 加料分镜落库时执行与普通分镜相同的资产关联
    // （角色提取 → characters_in_shot；场景匹配 → scene_id；调度解析 → blocking；场景匹配服装 → character_outfits）
    const existingScenes = ScriptSceneDAO.listByEpisode(db, episode.id);
    const assetInput = en.shots.map(sh => ({
      sceneName: matchSceneNameFromText([sh.action, sh.frame, sh.line].filter(Boolean).join(' '), existingScenes),
      actionDescription: sh.action || sh.frame || '',
    }));
    const assetAssociations = buildShotAssetAssociations(db, userId, episode.id, assetInput);

    return db.transaction(() => {
      // P0-6: 分镜重建时在同一事务内先级联删除旧 segments（避免孤儿段，与自动管线 stages/shots.ts 一致）
      SegmentDAO.deleteByEpisode(db, episode.id);
      const old = ShotDAO.listByEpisode(db, episode.id);
      for (const s of old) ShotDAO.delete(db, s.id);
      const seen = new Set<number>();
      let nextNum = 1;
      const created = en.shots.map((sh, idx) => {
        let num = sh.shot || 0;
        while (seen.has(num)) num = 10000 + nextNum++;
        seen.add(num);
        const phaseNum = Math.min(4, Math.max(1, Math.floor(((num - 1) / Math.max(1, total)) * 4) + 1));
        let dialogue = '';
        if (sh.line) {
          const m = sh.line.match(/^([\u4e00-\u9fa5A-Za-z0-9·]{2,10})[：:]\s*(.+)$/);
          dialogue = m ? m[2] : sh.line;
        }
        const assoc = assetAssociations[idx];
        const shotRow = ShotDAO.create(db, {
          user_id: userId,
          episode_id: episode.id,
          shot_number: num,
          shot_size: sh.size || 'medium',
          action_description: sh.action || sh.frame || '',
          dialogue,
          camera_movement: sh.camera || 'static',
          grid_position: '5',
          duration_seconds: Math.max(3, Math.min(15, sh.seconds || 5)),
          notes: `加料重构分镜（${storedEnrich.meta.skillName}）`,
          phase: phaseNum,
          phase_name: PHASE_NAMES[phaseNum - 1],
          first_frame_description: sh.frame || null,
          characters_in_shot: assoc.characters_in_shot ?? undefined,
          scene_id: assoc.scene_id ?? undefined,
          blocking: assoc.blocking ?? null,
          character_outfits: assoc.character_outfits ?? undefined,
        });
        // 段级提示词按镜头切分落库（5s/镜独立提交消费；最后一镜含声景/配乐尾部）
        ShotDAO.update(db, shotRow.id, {
          video_prompt: splitSegmentPromptByShot(en.h3Prompt, sh.shot || num, total),
          video_skill: storedEnrich.meta.skillId,
        });
        return shotRow;
      });
      console.log(`[GenerateShots] 加料分镜落库完成：${created.length} 镜（含资产关联）`);
      return created;
    })();
  }

  // shotDensity / includeDialogue 为兼容入参，当前提示词构建未消费（保留在 opts 类型中以兼容前端）
  const { textProvider, textModel } = opts;

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
    throw createError(502, ErrorCodes.AI_CALL_FAILED, (err as Error).message);
  }

  // 删除旧镜头 + 创建新镜头须在同一事务内：分镜子表（关键帧/视频区间）是
  // ON DELETE CASCADE，插入中途失败（如镜头号重复触发唯一索引）会丢失全部旧分镜
  return db.transaction(() => {
    // P0-6: 分镜重建时在同一事务内先级联删除旧 segments（避免孤儿段，与自动管线 stages/shots.ts 一致）
    SegmentDAO.deleteByEpisode(db, episode.id);
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
    const total = finalShots.length;
    finalShots.forEach((s: any, idx: number) => {
      if (s.phase === undefined || s.phase === null) {
        const phaseNum = Math.min(4, Math.max(1, Math.floor((idx / Math.max(1, total)) * 4) + 1));
        s.phase = phaseNum;
        s.phaseName = PHASE_NAMES[phaseNum - 1];
      }
    });

    // P0-5/P1-10: 资产关联（场景/角色/调度/服装）统一走 buildShotAssetAssociations——
    // 与加料分镜路径共用同一逻辑；blocking 未匹配角色 ID 时保留 character_name（不再丢弃）
    // P1-7/P1-5: 普通路径与加料路径场景匹配统一——sceneName 都用 matchSceneNameFromText
    // 匹配已有场景（AI 直出的虚构场景名不再进入 buildShotSceneMap，杜绝垃圾场景创建）
    const existingScenesForMatch = ScriptSceneDAO.listByEpisode(db, episode.id);
    const assetAssociations = buildShotAssetAssociations(db, userId, episode.id, finalShots.map((s: any) => ({
      sceneName: matchSceneNameFromText(
        [String(s.sceneName || ''), String(s.actionDescription || ''), String(s.dialogue || '')].filter(Boolean).join(' '),
        existingScenesForMatch
      ),
      actionDescription: s.actionDescription || '',
      charactersInShot: Array.isArray(s.charactersInShot) ? s.charactersInShot : null,
      blocking: Array.isArray(s.blocking) ? s.blocking : null,
      characterOutfits: (s.characterOutfits && typeof s.characterOutfits === 'object') ? s.characterOutfits : null,
    })));

    return ShotDAO.batchCreate(db, finalShots.map((s: any, idx: number) => {
      const assoc = assetAssociations[idx];
      return {
        user_id: userId,
        episode_id: episode.id,
        shot_number: s.shotNumber,
        shot_size: s.shotSize || 'medium',
        action_description: s.actionDescription || '',
        dialogue: s.dialogue || '',
        camera_movement: s.cameraMovement || 'static',
        grid_position: s.gridPosition || '5',
        // P1-12: duration 入库 clamp [3,15]
        duration_seconds: Math.max(3, Math.min(15, s.durationSeconds || 5)),
        characters_in_shot: assoc.characters_in_shot,
        props_in_shot: s.propsInShot ? JSON.stringify(s.propsInShot) : null,
        scene_id: assoc.scene_id ?? undefined,
        blocking: assoc.blocking,
        character_outfits: assoc.character_outfits,
        notes: s.notes || null,
        subject: s.subject || null,
        lighting: s.lighting || null,
        mood: s.mood || null,
        transition: s.transition || 'cut',
        pace: s.pace || 'normal',
        phase: s.phase ?? null,
        phase_name: s.phaseName || null,
        segment_id: s.segmentId ?? null,
      };
    }));
  })();
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
  // blocking 调度数组：项内 snake_case → camelCase（保留原始字段，兼容读取方）
  if (Array.isArray(out.blocking)) {
    out.blocking = out.blocking
      .filter((b: any) => b && typeof b === 'object')
      .map((b: any) => {
        const nb: any = { ...b };
        if (nb.character_name !== undefined && nb.characterName === undefined) nb.characterName = nb.character_name;
        if (nb.character_name === undefined && nb.characterName !== undefined) nb.character_name = nb.characterName;
        return nb;
      });
  }
  // subject 兜底：空时取 charactersInShot 第一个
  if (!out.subject && Array.isArray(out.charactersInShot) && out.charactersInShot.length > 0) {
    out.subject = out.charactersInShot[0];
  }
  return out;
}
