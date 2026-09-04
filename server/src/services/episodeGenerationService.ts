// 剧集批量生成服务：目标集数估算、分批调度、缺失集补全
// 从 routes/projects.ts 的 POST /:id/episodes/generate 中下沉的业务逻辑
// v1.0 - 修复"长篇小说只生成少量剧集"：自动检测集标记并分批生成、每批只传对应章节、缺失集补全

import type { Database } from '../types';
import { aiProxy } from './aiProxy';
import { novelToScriptPrompt } from './prompts/novelToScript';
import { parseAiJson } from '../utils/aiJsonParser';
import { chineseToNumber } from './novelParser';

/** 参与分集生成的章节最小字段 */
export interface EpisodeChapterInput {
  id: string;
  title: string;
  content: string;
  chapter_number: number;
}

// ============ 集标记识别 ============

// 排除"第X至Y集"范围标题（如"第1-5集剧情回顾"），避免误识别
const RANGE_TITLE_RE = /第\s*[\d一二三四五六七八九十百千零两壹贰叁肆伍陆柒捌玖拾佰仟]+\s*[至到—~-]\s*[\d一二三四五六七八九十百千零两壹贰叁肆伍陆柒捌玖拾佰仟]+\s*[集话]/;

const EPISODE_MARK_PATTERNS = [
  // 第X集 / 第X话（中文或阿拉伯数字）
  /^第\s*([一二三四五六七八九十百千零两壹贰叁肆伍陆柒捌玖拾佰仟\d]+)\s*[集话]/,
  // Episode X / EP X
  /^(?:Episode|EP)\s*(\d+)\b/i,
  // 纯 "X集" / "X话"（无"第"字）
  /^([一二三四五六七八九十百千零两壹贰叁肆伍陆柒捌玖拾佰仟\d]+)\s*[集话]/,
];

/** 从章节标题提取集标记编号（"第一集"/"第3话"/"Episode 5"），非集标记返回 null */
export function extractEpisodeMark(title: string): number | null {
  const t = (title || '').trim();
  if (RANGE_TITLE_RE.test(t)) return null;
  for (const pattern of EPISODE_MARK_PATTERNS) {
    const m = t.match(pattern);
    if (m) {
      const num = chineseToNumber(m[1]);
      if (num !== null) return num;
    }
  }
  return null;
}

/** 检测章节集合中的最大集标记数；标记数 >=2 时返回最大集号，否则 null（表示无集标记） */
export function detectMaxEpisodeMark(chapters: Pick<EpisodeChapterInput, 'title'>[]): number | null {
  let max = 0;
  let found = 0;
  for (const c of chapters) {
    const num = extractEpisodeMark(c.title);
    if (num !== null) {
      found++;
      if (num > max) max = num;
    }
  }
  return found >= 2 && max >= 2 ? max : null;
}

// ============ 分批参数 ============

const MAX_BATCH_CHARS = 40000; // 每批内容字符上限，防止超出模型上下文
const MAX_BATCH_EPISODES = 5;  // 每批最多集数

/** 按内容总量与目标集数计算每批集数（内容越大每批集数越少） */
export function calcBatchSize(totalChars: number, targetEpisodes: number): number {
  const charsPerEpisode = Math.max(1, Math.ceil(totalChars / targetEpisodes));
  const sizeByChars = Math.max(1, Math.floor(MAX_BATCH_CHARS / charsPerEpisode));
  return Math.min(MAX_BATCH_EPISODES, sizeByChars);
}

// ============ 章节选择 ============

/**
 * 选取指定集号范围对应的章节内容。
 * - 有集标记：按标题中的集号匹配，无标记章节（如"序言"）作为背景设定附在每批开头
 * - 无集标记：按章节数均分到每集，取本批对应的章节段
 */
export function selectChaptersForRange(
  chapters: EpisodeChapterInput[],
  startEpisode: number,
  endEpisode: number,
  targetEpisodes: number,
  hasEpisodeMarks: boolean
): EpisodeChapterInput[] {
  if (hasEpisodeMarks) {
    const range = new Set<number>();
    for (let i = startEpisode; i <= endEpisode; i++) range.add(i);
    const matched = chapters.filter(c => {
      const num = extractEpisodeMark(c.title);
      return num !== null && range.has(num);
    });
    if (matched.length > 0) {
      const prefaces = chapters.filter(c => extractEpisodeMark(c.title) === null);
      return [...prefaces, ...matched];
    }
    // 标记匹配为空（异常数据），回退到均分
  }
  // 无集标记：按章节数均分到每集，取本批对应的章节段。
  // 端点用累积 round（而非独立 floor/ceil），保证相邻批次既不重叠也不遗漏
  const perEpisode = chapters.length / targetEpisodes;
  const startIdx = Math.max(0, Math.round((startEpisode - 1) * perEpisode));
  const endIdx = Math.min(chapters.length, Math.round(endEpisode * perEpisode));
  return chapters.slice(startIdx, endIdx);
}

// ============ AI 返回规范化 ============

/** 规范化批内剧集数据：集号解析/去重，无集号条目兜底分配未占用的最小期望号 */
export function normalizeBatchData(data: any[], startEpisode: number, _batchCount: number): any[] {
  const used = new Set<number>();
  const result: any[] = [];

  const parseNum = (raw: any): number | null => {
    if (typeof raw === 'number' && Number.isFinite(raw)) return Math.floor(raw);
    if (typeof raw === 'string') {
      const t = raw.trim();
      if (t === '') return null;
      const n = parseInt(t, 10);
      if (!isNaN(n)) return n;
      return chineseToNumber(t);
    }
    return null;
  };

  // 第一遍：有明确集号的条目（去重）
  for (const d of data) {
    const num = parseNum(d.episodeNumber);
    if (num !== null && !used.has(num)) {
      used.add(num);
      result.push({ ...d, episodeNumber: num });
    }
  }
  // 第二遍：无集号的条目，兜底分配未占用的最小期望号
  let next = startEpisode;
  const take = (): number => {
    while (used.has(next)) next++;
    return next;
  };
  for (const d of data) {
    if (parseNum(d.episodeNumber) === null) {
      const n = take();
      used.add(n);
      result.push({ ...d, episodeNumber: n });
    }
  }
  return result;
}

// ============ AI 响应解析 ============

/** 解析 AI 返回的剧集数据（标准解析 → 提取数组 → 提取对象） */
export function parseEpisodesData(rawContent: string): any[] {
  const firstResult = parseAiJson<any>(rawContent);
  if (firstResult.success && firstResult.data) {
    return Array.isArray(firstResult.data) ? firstResult.data : [firstResult.data];
  }

  const arrayMatch = rawContent.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    const secondResult = parseAiJson<any>(arrayMatch[0]);
    if (secondResult.success && secondResult.data) {
      return Array.isArray(secondResult.data) ? secondResult.data : [secondResult.data];
    }
  }

  const objMatch = rawContent.match(/\{[\s\S]*\}/);
  if (objMatch) {
    const thirdResult = parseAiJson<any>(objMatch[0]);
    if (thirdResult.success && thirdResult.data) {
      return Array.isArray(thirdResult.data) ? thirdResult.data : [thirdResult.data];
    }
  }

  const preview = rawContent.length > 2000 ? rawContent.slice(0, 2000) + '...' : rawContent;
  throw new Error(`AI返回内容无法解析为JSON。返回内容预览：\n${preview}`);
}

// ============ 批生成 ============

/**
 * 生成一个批次的剧集（第 startEpisode 起共 batchCount 集）。
 * - 一次调用生成；AI 返回不足时按缺失集号补生成（最多补 2 轮）
 * - enforceCount=false（自动模式且无集标记）时不强制补全，只记录警告
 */
export async function generateEpisodeBatch(
  db: Database,
  userId: string,
  provider: string,
  modelName: string,
  style: string | undefined,
  novelContent: string,
  startEpisode: number,
  batchCount: number,
  enforceCount: boolean
): Promise<any[]> {
  const expectedNums = Array.from({ length: batchCount }, (_, i) => startEpisode + i);
  const expectedSet = new Set(expectedNums);

  const callBatch = async (nums: number[]): Promise<any[]> => {
    const { systemPrompt, prompt } = novelToScriptPrompt({
      novelContent,
      episodesCount: nums.length,
      style,
    });
    const rangeDesc = nums.length === 1
      ? `第${nums[0]}集`
      : `第${nums[0]}到第${nums[nums.length - 1]}集（共${nums.length}集）`;
    const batchPrompt = prompt +
      `\n\n注意：本次只需生成${rangeDesc}，episodeNumber 必须分别等于 ${nums.join('、')}，不得生成其他集数。`;
    const result = await aiProxy.generateText({
      db, userId, provider, modelName,
      prompt: batchPrompt, systemPrompt, responseFormat: 'json', maxTokens: 32000,
    });
    const preview = result.content.length > 2000 ? result.content.slice(0, 2000) + '...[截断]' : result.content;
    console.log(`[GenerateEpisodes] 批次 ${nums[0]}${nums.length > 1 ? '-' + nums[nums.length - 1] : ''} AI返回长度: ${result.content.length}, 预览: ${preview}`);
    return parseEpisodesData(result.content);
  };

  let data = normalizeBatchData(await callBatch(expectedNums), startEpisode, batchCount);

  if (enforceCount) {
    for (let round = 0; round < 2; round++) {
      const gotNums = new Set(data.map(d => d.episodeNumber as number));
      const missing = expectedNums.filter(n => !gotNums.has(n));
      if (missing.length === 0) break;
      console.warn(`[GenerateEpisodes] 批次 ${startEpisode}-${startEpisode + batchCount - 1} 缺失集: ${missing.join('、')}，第 ${round + 1} 轮补全`);
      const extra = await callBatch(missing);
      data = normalizeBatchData(data.concat(extra), startEpisode, batchCount);
    }
  }

  // 过滤范围外集号并去重
  const got = new Set<number>();
  const filtered: any[] = [];
  for (const d of data) {
    const num = d.episodeNumber as number;
    if (!expectedSet.has(num) || got.has(num)) continue;
    got.add(num);
    filtered.push(d);
  }
  const stillMissing = expectedNums.filter(n => !got.has(n));
  if (stillMissing.length > 0) {
    console.warn(`[GenerateEpisodes] 批次 ${startEpisode}-${startEpisode + batchCount - 1} 最终缺失集: ${stillMissing.join('、')}`);
  }
  return filtered;
}
