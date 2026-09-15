// 提示词重构服务（重构式链路核心）
// 职责：把"分镜数据 + 剧本分析资产 + 官方提示词 Skill"重构成一段通顺完整的
//      视频生成提示词成品（按 skill 的官方公式组织），落库到 shots.video_prompt。
// 设计语义：
//   - 剧本分析保持"纯导演视角"（不再被提示词公式强约束）；
//   - 适配官方规范这件事由重构层专门负责（AI 重构，可换模型重跑）；
//   - 视频生成直接消费成品，不再临时二次包装；
//   - 换视频模型时分析缓存复用，只重跑重构层（轻量、快、省额度）。

import type { Database } from '../types';
import { aiProxy } from './aiProxy';
import {
  ShotDAO, ScriptCharacterDAO, ScriptSceneDAO, NovelEpisodeDAO,
  UserPreferenceDAO, ModelRegistryDAO,
} from '../models';
import { getPromptSkillForVideoModel, getPromptSkill } from './promptSkills';
import type { PromptSkill } from './promptSkills/types';

interface RefactorOptions {
  /** 重构使用的文本模型（默认用户第一个文本模型） */
  provider?: string;
  modelName?: string;
  /** 该镜头的视频生成模型（用于匹配 Skill；默认用户预选视频模型） */
  videoProvider?: string;
  videoModelName?: string;
}

/** 解析本镜头应使用的提示词 Skill：实际视频模型专属优先，否则用户预选视频模型，最后通用兜底 */
function resolveShotSkill(db: Database, userId: string, opts?: RefactorOptions): PromptSkill {
  const pref = UserPreferenceDAO.getByUser(db, userId);
  const videoProvider = opts?.videoProvider || pref?.default_video_model?.split(':')[0] || undefined;
  const videoModelName = opts?.videoModelName || pref?.default_video_model?.split(':')[1] || undefined;
  const direct = getPromptSkill(videoProvider, videoModelName);
  if (direct && direct.id !== 'generic-video') return direct;
  return getPromptSkillForVideoModel(pref?.default_video_model || undefined);
}

/** 收集镜头重构上下文（角色视觉资产 / 场景描述 / 风格 / 前后镜剧情 / 首尾帧） */
function collectShotRefactorContext(db: Database, shot: any, episode: any) {
  const charactersInShot: string[] = [];
  try { charactersInShot.push(...(JSON.parse(shot.characters_in_shot || '[]') || [])); } catch { /* ignore */ }

  // 角色视觉资产：优先定妆表 visual_description，其次 description
  const characters: Record<string, string> = {};
  const allChars = ScriptCharacterDAO.listByEpisode(db, episode.id);
  for (const name of charactersInShot) {
    const c = allChars.find((x: any) => x.name === name);
    if (c) characters[name] = c.visual_description || c.description || '';
  }

  // 场景描述
  let sceneDesc = '';
  if (shot.scene_id) {
    const sc = ScriptSceneDAO.getById(db, shot.scene_id);
    if (sc?.description) sceneDesc = `${sc.name}。${sc.description}`.replace(/\s+/g, ' ').slice(0, 200);
    else if (sc?.name) sceneDesc = sc.name;
  }

  // 前后镜剧情（连贯性）
  const allShots = ShotDAO.listByEpisode(db, episode.id).sort((a: any, b: any) => (a.shot_number || 0) - (b.shot_number || 0));
  const idx = allShots.findIndex((s: any) => s.id === shot.id);
  const prevShot = idx > 0 ? allShots[idx - 1] : null;
  const nextShot = idx >= 0 && idx < allShots.length - 1 ? allShots[idx + 1] : null;

  return { characters, sceneDesc, prevShot, nextShot, charactersInShot };
}

/** 构造重构 prompt（含 skill 官方公式 + 硬性要求） */
function buildRefactorPrompt(
  shot: any,
  skill: PromptSkill,
  ctx: ReturnType<typeof collectShotRefactorContext>,
  episode: any
): { systemPrompt: string; prompt: string } {
  const duration = shot.duration_seconds || 5;
  const shotData = {
    shotNumber: shot.shot_number,
    phase: shot.phase_name || null,
    shotSize: shot.shot_size || 'medium',
    cameraMovement: shot.camera_movement || 'static',
    action: shot.action_description || '',
    dialogue: shot.dialogue || '',
    characters: ctx.charactersInShot,
    props: (() => { try { return JSON.parse(shot.props_in_shot || '[]'); } catch { return []; } })(),
    subject: shot.subject || null,
    lighting: shot.lighting || null,
    mood: shot.mood || null,
    transition: shot.transition || 'cut',
    firstFrame: shot.first_frame_description || null,
    lastFrame: shot.last_frame_description || null,
    durationSeconds: duration,
  };

  const systemPrompt = `你是影视短剧"提示词重构工程师"。把给定的分镜数据重写成一段【完全符合官方公式】的视频生成提示词。

【官方公式（必须严格遵守）】
${skill.videoRule}

【硬性要求】
1. 语句通顺完整，禁止碎片化关键词堆砌，整段是一句/数句可读的自然语言。
2. 资产一致性：人物外观（面容/发型/服装/体型）、场景陈设、关键道具的描述词必须与上下文给出的资产描述完全一致，禁止自行改动或新增。
3. 动作弧：${duration} 秒镜头内动作必须有起承转合——约前 1 秒动作起始 → 中间主体动作（幅度充分、位移明显）→ 尾 1 秒收尾定格；禁止缓慢微动、禁止单一慢动作。
4. 首尾帧：若给出首帧/尾帧画面描述，必须作为动作起点/终点写入提示词。
5. 台词：有台词时写清说话人、台词原文与语气。
6. 剧情连贯：参考"上一镜/下一镜"动作，本镜动作是上一镜的自然延续。
7. 只输出提示词正文，不要任何解释、前后缀、引号或 markdown 标记。`;

  const prompt = `【分镜数据】
${JSON.stringify(shotData, null, 1)}

【角色资产（视觉描述，必须原样沿用）】
${Object.keys(ctx.characters).length > 0 ? Object.entries(ctx.characters).map(([n, d]) => `${n}: ${d}`).join('\n') : '（无）'}

【场景】
${ctx.sceneDesc || '（沿用上下文场景）'}

【风格基调】
${episode?.style_preset ? `预设风格: ${episode.style_preset}` : ''}${(episode as any)?.theme ? `\n主题: ${(episode as any).theme}` : ''}

【剧情上下文】
上一镜: ${ctx.prevShot ? `${ctx.prevShot.shot_number}: ${(ctx.prevShot.action_description || '').slice(0, 120)}` : '（本镜为开场）'}
下一镜: ${ctx.nextShot ? `${ctx.nextShot.shot_number}: ${(ctx.nextShot.action_description || '').slice(0, 120)}` : '（本镜为结尾）'}

请按官方公式重构本镜头的视频生成提示词：`;

  return { systemPrompt, prompt };
}

/** 对单个镜头执行提示词重构并落库；失败返回 null（不抛错，由调用方决定） */
export async function refactorShotVideoPrompt(
  db: Database,
  userId: string,
  shotId: string,
  opts?: RefactorOptions
): Promise<string | null> {
  const shot = ShotDAO.getByIdAndUser(db, shotId, userId);
  if (!shot) return null;

  const episode = NovelEpisodeDAO.getById(db, shot.episode_id);
  if (!episode) return null;

  const skill = resolveShotSkill(db, userId, opts);
  const ctx = collectShotRefactorContext(db, shot, episode);
  const { systemPrompt, prompt } = buildRefactorPrompt(shot, skill, ctx, episode);

  // 重构使用的文本模型：显式传入 > 用户第一个文本模型
  let provider = opts?.provider;
  let modelName = opts?.modelName;
  if (!provider || !modelName) {
    const textModels = ModelRegistryDAO.listByUserAndType(db, userId, 'text');
    const preferred = textModels.find((m: any) => ['doubao', 'deepseek', 'zhipu', 'qwen', 'minimax'].includes(m.provider)) || textModels[0];
    if (preferred) { provider = preferred.provider; modelName = preferred.model_name; }
  }
  if (!provider || !modelName) {
    console.warn('[PromptRefactor] 未配置文本模型，跳过重构');
    return null;
  }

  try {
    let refactored = '';
    // AI 偶发空响应：最多重试 2 次
    for (let attempt = 1; attempt <= 2 && !refactored; attempt++) {
      if (attempt > 1) console.log(`[PromptRefactor] shot=${shot.shot_number} 结果为空，第${attempt}次重试...`);
      const result = await aiProxy.generateText({
        db, userId, provider, modelName,
        prompt, systemPrompt,
        temperature: 0.4,
        maxTokens: 1200,
      });
      refactored = (result.content || '').trim();
    }
    if (!refactored) {
      console.warn(`[PromptRefactor] shot=${shot.shot_number} 重构结果为空（重试后），保留原逻辑`);
      return null;
    }
    ShotDAO.update(db, shot.id, { video_prompt: refactored, video_skill: skill.id } as any);
    console.log(`[PromptRefactor] shot=${shot.shot_number} 重构完成（${skill.displayName}，${refactored.length}字）`);
    return refactored;
  } catch (err) {
    console.warn(`[PromptRefactor] shot=${shot.shot_number} 重构失败:`, (err as Error).message);
    return null;
  }
}

/** 对剧集全部镜头批量重构（换视频模型后重跑入口）；返回统计 */
export async function refactorEpisodeVideoPrompts(
  db: Database,
  userId: string,
  episodeId: string,
  opts?: RefactorOptions & { force?: boolean }
): Promise<{ total: number; ok: number; failed: number; skipped: number }> {
  const shots = ShotDAO.listByEpisode(db, episodeId);
  const skill = resolveShotSkill(db, userId, opts);
  let ok = 0, failed = 0, skipped = 0;

  for (const shot of shots) {
    // 非强制模式：已有成品且 skill 匹配 → 跳过（分析缓存复用 + 成品复用）
    if (!opts?.force && shot.video_prompt && shot.video_skill === skill.id) {
      skipped++;
      continue;
    }
    const r = await refactorShotVideoPrompt(db, userId, shot.id, opts);
    if (r) ok++; else failed++;
  }
  console.log(`[PromptRefactor] 剧集 ${episodeId} 重构完成：总 ${shots.length}，成功 ${ok}，失败 ${failed}，跳过 ${skipped}`);
  return { total: shots.length, ok, failed, skipped };
}

/** 检查某镜头是否已具备可用的成品提示词（skill 匹配才算） */
export function hasUsableVideoPrompt(db: Database, shot: any, opts?: RefactorOptions): boolean {
  if (!shot?.video_prompt) return false;
  const skill = resolveShotSkill(db, shot.user_id, opts);
  return shot.video_skill === skill.id;
}

/** 服务导出对象（兼容既有调用风格） */
export const promptRefactorService = {
  refactorShotVideoPrompt,
  refactorEpisodeVideoPrompts,
  hasUsableVideoPrompt,
};
