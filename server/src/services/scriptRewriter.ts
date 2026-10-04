// 剧本改写服务 — 类似 huobao-drama 的 script_rewriter Agent
// 支持三种输入模式：
//   1. rewriteOneLiner   — 一句话创意 → 大纲（人物设定/故事梗概/分集）→ 标准短剧剧本
//   2. rewriteOutline    — 大纲 → 标准短剧剧本
//   3. rewriteNovel      — 小说 → 格式化短剧剧本（优化 novelParser 的纯规则切分）
// 输出标准剧本格式：第X场 INT./EXT. 场景名 - 时间 + 动作描述 + 角色名：台词
// 支持戏剧节奏控制、人物关系一致性；所有 AI 调用通过 aiProxy

import type { Database } from '../types';
import { aiProxy } from './aiProxy';
import { createError } from '../middleware/errorHandler';

export interface ScriptRewriteOptions {
  db: Database;
  userId: string;
  provider: string;
  modelName: string;
  /** 目标集数（默认 1：单集短剧项目；>1 时输出多集剧本，以【第X集】分节） */
  targetEpisodes?: number;
  /** 题材/风格要求（如"都市甜宠""悬疑""逆袭"） */
  style?: string;
  /** 戏剧节奏控制（如"前3秒抓人，每30秒一个钩子，结尾反转"） */
  pacing?: string;
  /** 语言（默认 zh） */
  language?: string;
}

const DEFAULT_TARGET_EPISODES = 1;

/** 单集短剧剧本参考篇幅（约3分钟成片） */
const SINGLE_EPISODE_HINT = '改编为单集短剧（约3分钟成片，剧本1200-1800字）';

// ============ 一句话创意 → 大纲 ============

/** 一句话创意 → 创作大纲（JSON：人物设定/故事梗概/分集设计） */
async function expandOneLinerToOutline(oneLiner: string, options: ScriptRewriteOptions): Promise<string> {
  const { db, userId, provider, modelName, style, pacing, targetEpisodes } = options;
  const episodes = targetEpisodes || DEFAULT_TARGET_EPISODES;

  const prompt = `你是资深的短剧编剧。请根据下面的一句话创意，扩写为一份完整的短剧创作大纲（JSON）。

一句话创意：${oneLiner}
${style ? `题材风格：${style}` : ''}
${pacing ? `节奏要求：${pacing}` : ''}

【输出要求（JSON）】
{
  "title": "剧名",
  "logline": "一句话故事核心（高概念）",
  "characters": [
    { "name": "角色名", "age": "年龄", "identity": "身份/职业", "personality": "性格", "appearance": "外貌特征", "role": "主角/配角/反派" }
  ],
  "synopsis": "故事梗概（200-400字，含起承转合）",
  "episodes": [
    { "number": 1, "title": "本集标题", "hook": "本集钩子/爽点", "conflict": "本集核心冲突" }
  ],
  "relationships": "主要人物关系与情感走向说明"
}

【要求】
- 人物设定 3-6 个，主角形象必须清晰（含外貌特征，供后续角色设计使用）
- 分集设计 ${episodes} 集${episodes > 1 ? '，每集列出核心冲突与钩子（悬念/爽点）' : ''}
- 只输出 JSON，不要其他文字`;

  const result = await aiProxy.generateText({
    db, userId, provider, modelName,
    prompt, responseFormat: 'json', maxTokens: 8000,
  });
  return result.content;
}

// ============ 大纲 → 标准短剧剧本 ============

/** 大纲 → 标准短剧剧本（纯文本） */
async function outlineToScript(outline: string, options: ScriptRewriteOptions): Promise<string> {
  const { db, userId, provider, modelName, targetEpisodes, style, pacing } = options;
  const episodes = targetEpisodes || DEFAULT_TARGET_EPISODES;

  const prompt = `你是资深的短剧编剧。请根据以下创作大纲，编写一部标准短剧剧本。
${style ? `题材风格：${style}` : ''}
${pacing ? `节奏要求：${pacing}` : ''}

【创作大纲】
${outline}

【剧本格式要求（严格遵守）】
${episodes > 1
  ? `- 全剧共 ${episodes} 集，每集以【第X集】作为集标题开头，集内再分场`
  : `- ${SINGLE_EPISODE_HINT}`}
- 每场戏格式（逐字遵循）：
  第X场 INT./EXT. 场景名 - 时间
  动作/环境描述（写明谁在做什么、环境状态）
  角色名：台词
- 场景类型：INT.（内景）/ EXT.（外景）；时间标注如"日/夜/黄昏"
- 每场戏必须包含：环境交代 + 角色动作 + 对白
- 台词口语化、有戏剧张力，符合角色性格，对话不超过5个来回
- 保持人物关系一致，不出现大纲外的角色
- 戏剧节奏：${pacing || '每场戏都要有冲突或推进，杜绝注水对话，结尾留钩子'}

【输出要求】
只输出剧本正文纯文本，不要JSON，不要额外解释。`;

  const result = await aiProxy.generateText({
    db, userId, provider, modelName,
    prompt, responseFormat: 'text', maxTokens: 32000,
  });
  return result.content.trim();
}

// ============ 小说 → 标准短剧剧本 ============

/** 小说 → 格式化短剧剧本（AI 改编，优化 novelParser 纯规则切分） */
async function novelToScript(novelText: string, options: ScriptRewriteOptions): Promise<string> {
  const { db, userId, provider, modelName, targetEpisodes, style, pacing } = options;
  const episodes = targetEpisodes || DEFAULT_TARGET_EPISODES;

  const prompt = `你是资深的短剧编剧。请将以下小说内容改编为一部标准短剧剧本。
${style ? `题材风格：${style}` : ''}

【小说内容】
${novelText}

【改编要求】
- 提炼核心剧情线与关键冲突，去除冗余描写
- 保留小说的精彩情节与人物关系，节奏紧凑化
- ${episodes > 1
    ? `改编为 ${episodes} 集短剧，每集以【第X集】开头，集内再分场`
    : SINGLE_EPISODE_HINT}
- 输出标准剧本格式（逐字遵循）：
  第X场 INT./EXT. 场景名 - 时间
  动作/环境描述
  角色名：台词
- 场景类型：INT.（内景）/ EXT.（外景）；时间标注如"日/夜/黄昏"
- 台词必须符合人物性格，口语化有张力，对话不超过5个来回
- 保持人物关系一致，不引入小说外的关键新角色
- 戏剧节奏：${pacing || '每场戏要有冲突或推进，杜绝注水，结尾留钩子'}

【输出要求】
只输出剧本正文纯文本，不要JSON，不要额外解释。`;

  const result = await aiProxy.generateText({
    db, userId, provider, modelName,
    prompt, responseFormat: 'text', maxTokens: 32000,
  });
  return result.content.trim();
}

// ============ 对外 API ============

/**
 * 一句话创意 → 大纲 → 标准短剧剧本（两段式：先扩写大纲，再扩写剧本）
 * @param oneLiner 一句话创意（不能为空）
 * @param options 改写选项（db/userId/provider/modelName 必填；targetEpisodes/style/pacing/language 可选）
 * @returns 标准短剧剧本文本
 * @sideEffects 发起两次 AI 调用（expandOneLinerToOutline + outlineToScript）；输出输入/输出长度日志
 */
export async function rewriteOneLiner(oneLiner: string, options: ScriptRewriteOptions): Promise<string> {
  if (!oneLiner || !oneLiner.trim()) throw createError(400, 'VALIDATION_ERROR', '一句话创意不能为空');
  console.log(`[${new Date().toISOString()}] [ScriptRewriter] 模式=one_liner，输入长度=${oneLiner.length}`);
  const outline = await expandOneLinerToOutline(oneLiner, options);
  const script = await outlineToScript(outline, options);
  console.log(`[${new Date().toISOString()}] [ScriptRewriter] 模式=one_liner，输出剧本长度=${script.length}`);
  return script;
}

/** 大纲 → 标准短剧剧本
 * @param outline 创作大纲文本（不能为空）
 * @param options 改写选项（见 ScriptRewriteOptions）
 * @returns 标准短剧剧本文本
 * @sideEffects 发起一次 AI 调用（outlineToScript）；输出输入/输出长度日志
 */
export async function rewriteOutline(outline: string, options: ScriptRewriteOptions): Promise<string> {
  if (!outline || !outline.trim()) throw createError(400, 'VALIDATION_ERROR', '大纲不能为空');
  console.log(`[${new Date().toISOString()}] [ScriptRewriter] 模式=outline，输入长度=${outline.length}`);
  const script = await outlineToScript(outline, options);
  console.log(`[${new Date().toISOString()}] [ScriptRewriter] 模式=outline，输出剧本长度=${script.length}`);
  return script;
}

/** 小说 → 格式化短剧剧本（场次/INT.EXT/动作/对白）
 * @param novelText 小说文本（不能为空）
 * @param options 改写选项（见 ScriptRewriteOptions）
 * @returns 标准短剧剧本文本
 * @sideEffects 发起一次 AI 调用（novelToScript）；输出输入/输出长度日志
 */
export async function rewriteNovel(novelText: string, options: ScriptRewriteOptions): Promise<string> {
  if (!novelText || !novelText.trim()) throw createError(400, 'VALIDATION_ERROR', '小说内容不能为空');
  console.log(`[${new Date().toISOString()}] [ScriptRewriter] 模式=novel，输入长度=${novelText.length}`);
  const script = await novelToScript(novelText, options);
  console.log(`[${new Date().toISOString()}] [ScriptRewriter] 模式=novel，输出剧本长度=${script.length}`);
  return script;
}

/**
 * 按输入模式选择对应改写函数
 */
export async function rewriteScriptByMode(
  inputMode: 'one_liner' | 'outline' | 'novel',
  content: string,
  options: ScriptRewriteOptions,
): Promise<string> {
  switch (inputMode) {
    case 'one_liner':
      return rewriteOneLiner(content, options);
    case 'outline':
      return rewriteOutline(content, options);
    case 'novel':
      return rewriteNovel(content, options);
    default:
      throw createError(400, 'VALIDATION_ERROR', `不支持的输入模式: ${inputMode}`);
  }
}

/** P1-22: 宽松匹配剧集标题行——兼容【第X集】、[第X集]、第X集：、第X集 标题、EPISODE X 等写法 */
function matchEpisodeHeader(line: string): { number: string; title: string } | null {
  // 中文：全角/半角括号可选、冒号可选、结尾空格/结尾可选
  const cn = line.match(/^\s*(?:【|\[)?\s*第\s*([一二三四五六七八九十百千\d]+)\s*集\s*(?:】|\]|[:：]|\s|$)(.*)$/);
  if (cn) return { number: cn[1], title: cn[2].trim() };
  // 英文：EPISODE X / EP X（大小写不敏感）
  const en = line.match(/^\s*(?:EPISODE|EP)\s*[:：]?\s*(\d+)\s*(?:[:：]|\s|$)(.*)$/i);
  if (en) return { number: en[1], title: en[2].trim() };
  return null;
}

/**
 * 将多集剧本文本按【第X集】拆分为剧集数组（无集标题时整体作为单集）
 * P1-22: 标题行匹配已扩展（见 matchEpisodeHeader），支持全角【】/半角[]/无括号"第X集："/"第X集 "/"EPISODE X"
 * 供 /api/projects/from-input 创建剧集使用
 */
export function splitScriptToEpisodes(script: string): Array<{ title: string; content: string }> {
  const episodes: Array<{ title: string; content: string }> = [];
  const lines = String(script || '').split(/\r?\n/);
  let current: { title: string; content: string[] } | null = null;
  for (const line of lines) {
    const m = matchEpisodeHeader(line);
    if (m) {
      if (current) episodes.push({ title: current.title, content: current.content.join('\n').trim() });
      current = { title: line.trim(), content: [] };
      continue;
    }
    if (current) current.content.push(line);
  }
  if (current) episodes.push({ title: current.title, content: current.content.join('\n').trim() });
  if (episodes.length === 0 && String(script || '').trim()) {
    episodes.push({ title: '第1集', content: String(script).trim() });
  }
  return episodes;
}
