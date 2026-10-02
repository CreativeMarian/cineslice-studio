// 加料重构服务 v1.0
// 用户拍板方案：选择第 x 集后触发，大模型带所选视频模型的官方提示词规范（规范前置）做加料重构，
// 只加血肉不动骨架（不改剧情大方向、不改台词含义、新增细节必须可从原文合理推断），
// 结构化 JSON 产出（含段级 h3Prompt），并执行五层护栏：
//   ① prompt 硬约束（禁增删改剧情事件/人物行为/台词含义，原文完整传入）
//   ② 结构化 JSON 产出 + 新增细节标注出处（addedDetails[].source）
//   ③ 自动三表对账（事件/人物/台词要点，重构前后逐项比对，差异报警）
//   ④ 改动高亮给用户预览、一键通过/打回重改（路由层 approve/reject，前端展示）
//   ⑤ 熔断（最多重改 2 次仍不过标记人工介入）
// 换模型 = 重新注入官方 skill + 重跑加料

import type { Database } from '../types';
import { aiProxy } from './aiProxy';
import { NovelEpisodeDAO, ScriptCharacterDAO, ScriptSceneDAO, ModelRegistryDAO, UserPreferenceDAO } from '../models';
import { getPromptSkillForVideoModel, applySkillRules } from './promptSkills';
import { parseAiJsonOrThrow } from '../utils/aiJsonParser';
import { now } from '../models/index';

// ═══════════════════════════════════════════════════════════════
// 类型定义
// ═══════════════════════════════════════════════════════════════

export interface EnrichShot {
  shot: number;
  seconds: number;
  size: string;         // 景别：中景/特写/全景...
  camera: string;       // 运镜：固定/手持轻微晃动/推...
  frame: string;        // 画面内容（首帧描述）
  action: string;       // 动作/表演
  line: string | null;  // 台词（含角色名前缀，如"赵国梁：这房我不卖"）
}

export interface AddedDetail {
  type: 'action' | 'environment' | 'emotion' | 'prop' | 'rhythm' | 'camera' | 'line_delivery';
  detail: string;                       // 新增了什么
  source: 'quoted' | 'inferred';        // quoted=原文有依据；inferred=从原文合理推断
  quote?: string;                       // source=quoted 时引原文片段
}

export interface EnrichTableStatus {
  status: 'ok' | 'warn';
  missing: string[];   // 原文有、重构后丢失
  added: string[];     // 重构后新增（非细节的实体级新增）
}

export interface EnrichAlignment {
  events: EnrichTableStatus;
  characters: EnrichTableStatus;
  dialogues: EnrichTableStatus;
  differences: string[];  // 报警差异清单（人可读）
}

export interface EnrichStoryboard {
  seconds: number;       // 本集总时长（秒）
  shots: EnrichShot[];
  h3Prompt: string;      // 段级官方格式提示词（整段一次视频生成）
}

export interface EnrichResult {
  episodeId: string;
  episodeTitle: string;
  enrichedScript: string;          // 加料后剧本正文（保留原文全部剧情节点）
  storyboard: EnrichStoryboard;
  addedDetails: AddedDetail[];
  alignment: EnrichAlignment;
  meta: {
    skillId: string;
    skillName: string;
    textModel: string;
    videoModelUsed: string | null;
    retries: number;
    createdAt: string;
  };
}

// ═══════════════════════════════════════════════════════════════
// 加料重构 Prompt（规范前置 + 五层护栏① + ②）
// ═══════════════════════════════════════════════════════════════

const ENRICH_SYSTEM_BASE = `你是一位专业的短剧「加料重构工程师」+「分镜导演」。你的唯一任务是：在绝不动剧情骨架的前提下，把给定剧本加料成可以直接交给视频模型生成的分镜剧本。

## 第一层护栏：硬约束（违反即不合格）
1. 【只加血肉，不动骨架】禁止增、删、改任何剧情事件；禁止改变事件发生顺序；禁止新增或删除角色；禁止改变场景的数量与顺序；禁止改变任何台词的含义。
2. 【台词保真】原文每一句台词都必须完整保留，含义一字不改。你可以补充"谁在什么情绪/节奏下说"（写入镜头的 action 或 frame），但台词文本本身（含角色名）必须原样出现。
3. 【新增细节必须可溯】允许补充的只有：动作幅度、环境细节、光线、道具状态、情绪节奏、运镜方式、台词口气。每条新增细节必须在 addedDetails 中标注出处：source="quoted"（原文明确支持，需 quote 原文片段）或 source="inferred"（从原文可合理推断，不改变事实）。
4. 【原文完整传入】enrichedScript 必须包含原文的全部剧情节点与台词，一个都不能少；它是对原文的"加料展开"，不是重写。

## 分镜规则
5. 按剧情顺序拆分为若干镜头（shot），每镜固定 5 秒（本机渲染能力固定段长）。一句话没说完，可以延续到下一镜继续说。
6. 每镜给出：size（景别）、camera（运镜）、frame（画面内容，供首帧/概念图复用）、action（动作表演）、line（台词原文，无台词填 null）。
7. storyboard.seconds = 镜头数 × 5。整段时长上限 15 秒（3 镜）；超过 3 镜的内容按 5 秒/镜继续累加 seconds，但 h3Prompt 必须按段组织（一段=一次视频生成调用）。

## 输出规模控制（硬性，防止输出超限）
8. 全剧集镜头总数上限 6 镜（即 storyboard.seconds ≤ 30）。镜头数按剧情主次取舍：保留关键剧情节点，次要过渡可合并进相邻镜头的 action 中描述。
9. enrichedScript 只做"适度加料"：每个剧情节点补 1-3 句动作/环境/神态细节，禁止大段扩写、禁止重复已写内容；整体加料后篇幅不超过原文的 1.8 倍。
10. h3Prompt 精炼通顺：整体视听描述逐镜带时间码，每镜描述 2-4 句，加声景与配乐字段；禁止堆砌关键词，禁止罗列装饰性细节。
11. 整个 JSON 输出必须控制在 6000 tokens 以内。若镜头超过 6 镜或篇幅过大，说明你已违反本规则，请压缩重写。

## 输出要求（第二层护栏：结构化 JSON）
只输出一个 JSON 对象，不要输出任何其他文字。schema 如下：
{
  "enrichedScript": "加料后的整集剧本正文（Markdown，保留原文全部场景/事件/台词，补充表演与环境细节）",
  "storyboard": {
    "seconds": 总秒数,
    "shots": [
      { "shot": 1, "seconds": 5, "size": "中景", "camera": "固定", "frame": "画面内容", "action": "动作表演", "line": "角色名：台词原文 或 null" }
    ],
    "h3Prompt": "整段官方格式视频提示词（见下方官方规范），包含：整体视听描述（逐镜按时间码 [镜头N] 于 00:00.000 组织）、声景、配乐"
  },
  "addedDetails": [
    { "type": "action|environment|emotion|prop|rhythm|camera|line_delivery", "detail": "新增了什么", "source": "quoted|inferred", "quote": "原文片段（source=quoted 时必填）" }
  ]
}`;

const ENRICH_QUALITY_REQUIREMENT = `\n\n【转换质量硬性要求】以上输出将直接作为当前视频模型的官方提示词输入：1) enrichedScript 与 storyboard 中所有语句必须通顺完整，禁止碎片化关键词堆砌；2) frame/action 必须具体到可直接生成画面（人物外观/场景陈设/关键道具描述词需一致，跨镜头复用，保证资产一致性）；3) h3Prompt 必须严格按官方规范组织（整体视听描述逐镜带时间码 + 声景 + 配乐），语句通顺、可被视频模型直接理解。`;

// ═══════════════════════════════════════════════════════════════
// 三表对账（第三层护栏）：事件/人物/台词 重构前后比对
// ═══════════════════════════════════════════════════════════════

/** 剥离台词行内括注（如「赵虎（狞笑）：…」→「赵虎：…」），便于角色名/台词提取 */
function stripParenthetical(s: string): string {
  return s.replace(/（[^）]*）|\([^)]*\)/g, '');
}

/** 提取台词行：形如「角色名：台词」；支持角色名后带括注（赵虎（狞笑）：…） */
function extractDialogues(text: string): string[] {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const out: string[] = [];
  for (const line of lines) {
    const cleaned = stripParenthetical(line);
    const m = cleaned.match(/^([\u4e00-\u9fa5A-Za-z0-9·]{2,10})[：:]\s*(.+)$/);
    if (m && m[2].length >= 2 && !/^(场景|地点|时间|镜头|画面|旁白|背景)/.test(m[1])) {
      out.push(`${m[1]}：${m[2]}`);
    }
  }
  return out;
}

/**
 * 提取事件要点：只取"剧情推进行"——括注动作行（（…））、场景标题行（#/【）、系统提示行。
 * 纯环境/光影/表情等描写层（**环境层：** 等）不作为事件点，避免加料改写导致的误报。
 */
function extractEvents(text: string): string[] {
  const dialogues = extractDialogues(text);
  return text.split('\n').map(l => l.trim()).filter(Boolean)
    .filter(l => !dialogues.includes(l))
    .filter(l => !/^(角色名|人物|旁白)[：:]/.test(l))
    // 过滤"描写层"标记行（**环境层：** 等）
    .filter(l => !/^\*\*[^*]{0,12}层[：:]\s*\*\*/.test(l))
    // 只保留：括注动作行 / 场景标题行 / 系统提示行
    .filter(l => /^（|^\(|^【|^#/.test(l) || /^\[/.test(l));
}

/** 提取角色名：台词前缀（剥离括注后）+ 全角冒号前缀 */
function extractCharacters(text: string): string[] {
  const names = new Set<string>();
  for (const line of text.split('\n')) {
    const cleaned = stripParenthetical(line.trim());
    const m = cleaned.match(/^([\u4e00-\u9fa5A-Za-z0-9·]{2,10})[：:]/);
    if (m) names.add(m[1]);
  }
  return [...names];
}

/** 归一化（去标点空白）用于模糊包含匹配 */
function normalize(s: string): string {
  return s.replace(/[\s，。！？、,.!?；;：:""''「」【】（）()·—…]/g, '').toLowerCase();
}

/** 判断 needle 是否"包含式"出现在 haystack 列表中（归一化后） */
function containsFuzzy(list: string[], needle: string): boolean {
  const n = normalize(needle);
  if (!n || n.length < 2) return true;
  return list.some(item => normalize(item).includes(n) || n.includes(normalize(item)));
}

function diffTable(original: string[], enriched: string[], label: string): EnrichTableStatus {
  const missing = original.filter(o => !containsFuzzy(enriched, o));
  const added = enriched.filter(e => !containsFuzzy(original, e));
  return {
    status: missing.length === 0 ? 'ok' : 'warn',
    missing,
    added,
  };
}

/**
 * 三表对账：事件/人物/台词
 * 台词必须全部保留（missing 非空即报警）；事件/人物缺失或实体级新增也报警。
 */
function runAlignment(originalScript: string, enrichedScript: string): EnrichAlignment {
  const origEvents = extractEvents(originalScript);
  const newEvents = extractEvents(enrichedScript);
  const origChars = extractCharacters(originalScript);
  const newChars = extractCharacters(enrichedScript);
  const origDlgs = extractDialogues(originalScript);
  const newDlgs = extractDialogues(enrichedScript);

  const events = diffTable(origEvents, newEvents, '事件');
  const characters = diffTable(origChars, newChars, '角色');
  const dialogues = diffTable(origDlgs, newDlgs, '台词');

  const differences: string[] = [];
  if (events.missing.length) differences.push(`事件缺失：${events.missing.slice(0, 5).join(' / ')}`);
  if (events.added.length) differences.push(`事件新增（疑似乱加剧情）：${events.added.slice(0, 5).join(' / ')}`);
  if (characters.missing.length) differences.push(`角色缺失：${characters.missing.join(' / ')}`);
  if (characters.added.length) differences.push(`角色新增：${characters.added.join(' / ')}`);
  if (dialogues.missing.length) differences.push(`台词缺失：${dialogues.missing.slice(0, 5).join(' / ')}`);

  return { events, characters, dialogues, differences };
}

function alignmentPassed(a: EnrichAlignment): boolean {
  return a.differences.length === 0;
}

// ═══════════════════════════════════════════════════════════════
// 服务实现
// ═══════════════════════════════════════════════════════════════

export const episodeEnrichService = {
  /**
   * 加料重构：按集触发。规范前置（官方提示词 skill 注入）+ 加料重构 + JSON 产出 + 三表对账 + 熔断。
   */
  async enrichEpisode(
    db: Database,
    userId: string,
    episodeId: string,
    opts?: { provider?: string; modelName?: string; forceRefresh?: boolean }
  ): Promise<EnrichResult> {
    const episode = NovelEpisodeDAO.getByIdAndUser(db, episodeId, userId);
    if (!episode) throw new Error(`剧集不存在: ${episodeId}`);
    const originalScript = episode.script_content || '';
    if (!originalScript.trim()) throw new Error('该集剧本为空，无法加料重构');

    console.log(`[Enrich] 开始加料重构 episode=${episodeId} 第${episode.episode_number}集`);

    // ── 规范前置：按用户预选视频模型加载官方提示词 skill ──
    const videoModelUsed = UserPreferenceDAO.getByUser(db, userId)?.default_video_model;
    const promptSkill = getPromptSkillForVideoModel(videoModelUsed);
    console.log(`[Enrich] 注入官方提示词 skill: ${promptSkill.displayName}（视频模型: ${videoModelUsed || '未设置'}）`);

    // ── 文本模型解析：优先显式传入，否则取用户第一个文本模型 ──
    let provider = opts?.provider;
    let modelName = opts?.modelName;
    if (!provider || !modelName) {
      const textModels = ModelRegistryDAO.listByUserAndType(db, userId, 'text');
      // 优先白名单 provider；deepseek 内优先 deepseek-chat（reasoner 为思考模型，慢且不支持 response_format=json）
      const preferred = textModels.find(
        m => ['doubao', 'deepseek', 'zhipu', 'qwen', 'minimax'].includes(m.provider)
          && !(m.provider === 'deepseek' && /reasoner|r1/i.test(m.model_name))
      ) || textModels.find(m => ['doubao', 'deepseek', 'zhipu', 'qwen', 'minimax'].includes(m.provider))
        || textModels[0];
      if (preferred) {
        provider = preferred.provider;
        modelName = preferred.model_name;
      }
    }
    if (!provider || !modelName) {
      throw new Error('未配置文本模型，无法进行加料重构');
    }

    // ── 上下文：已提取角色/场景（辅助加料，保持一致） ──
    const characters = ScriptCharacterDAO.listByEpisode(db, episodeId);
    const scenes = ScriptSceneDAO.listByEpisode(db, episodeId);
    let context = '';
    if (characters.length > 0) {
      context += '\n\n## 已提取角色（加料时必须保持一致的外观/性格）\n';
      characters.forEach(c => {
        context += `- ${c.name}: ${c.description || c.visual_description || '无描述'}\n`;
      });
    }
    if (scenes.length > 0) {
      context += '\n## 已提取场景（加料时不得增删场景）\n';
      scenes.forEach(s => {
        context += `- ${s.name}: ${s.location || ''} (${s.time_of_day || '未知时段'})\n`;
      });
    }

    // ── 官方规范前置注入（第一层护栏的"规范"部分）+ 质量硬要求 ──
    const systemPrompt = applySkillRules(ENRICH_SYSTEM_BASE, promptSkill, 'videoRule')
      + applySkillRules('', promptSkill, 'shotRule')
      + ENRICH_QUALITY_REQUIREMENT;

    const fullPrompt = `## 原文剧本（必须完整保留其剧情节点与台词）\n\n${originalScript}${context}\n\n## 任务\n按上述规则完成加料重构，输出 JSON。`;

    // ── 熔断（第五层护栏）：AI 调用最多 3 次（含解析失败/对账不过的重试） ──
    const MAX_AI_TRIES = 3;
    let result: EnrichResult | null = null;
    let lastError = '';
    let retries = 0;

    for (let attempt = 1; attempt <= MAX_AI_TRIES && !result; attempt++) {
      if (attempt > 1) {
        retries++;
        console.log(`[Enrich] 第 ${attempt}/${MAX_AI_TRIES} 次重试: ${lastError.slice(0, 120)}`);
      }

      const aiResult = await aiProxy.generateText({
        db,
        userId,
        provider,
        modelName,
        prompt: fullPrompt,
        systemPrompt,
        temperature: 0.4,
        maxTokens: 8000,
        responseFormat: 'json',
      });

      let parsed: { enrichedScript?: string; storyboard?: EnrichStoryboard; addedDetails?: AddedDetail[] };
      try {
        parsed = parseAiJsonOrThrow(aiResult.content);
      } catch (e) {
        lastError = `JSON 解析失败: ${(e as Error).message}`;
        continue;
      }

      if (!parsed.enrichedScript || !parsed.storyboard?.shots?.length || !parsed.storyboard?.h3Prompt) {
        lastError = '输出缺少关键字段（enrichedScript/storyboard.shots/h3Prompt）';
        continue;
      }

      // ── 三表对账（第三层护栏） ──
      const alignment = runAlignment(originalScript, parsed.enrichedScript);
      const passed = alignmentPassed(alignment);
      console.log(`[Enrich] 对账结果: ${passed ? '通过' : '未通过'} | 事件缺失${alignment.events.missing.length} 角色缺失${alignment.characters.missing.length} 台词缺失${alignment.dialogues.missing.length}`);

      if (!passed && attempt < MAX_AI_TRIES) {
        // 打回重改（护栏③的自动重试路径）
        lastError = `三表对账未通过：${alignment.differences.join('；')}`;
        // 把对账结果作为反馈注入，指导模型修正
        continue;
      }

      // 组装最终结果（含新增细节出处兜底）
      result = {
        episodeId,
        episodeTitle: episode.title,
        enrichedScript: parsed.enrichedScript,
        storyboard: {
          seconds: parsed.storyboard.seconds || parsed.storyboard.shots.length * 5,
          shots: parsed.storyboard.shots,
          h3Prompt: parsed.storyboard.h3Prompt,
        },
        addedDetails: (parsed.addedDetails || []).map(d => ({
          type: d.type || 'action',
          detail: d.detail || '',
          source: d.source === 'quoted' ? 'quoted' as const : 'inferred' as const,
          quote: d.quote,
        })),
        alignment,
        meta: {
          skillId: promptSkill.id,
          skillName: promptSkill.displayName,
          textModel: `${provider}/${modelName}`,
          videoModelUsed: videoModelUsed || null,
          retries,
          createdAt: new Date().toISOString(),
        },
      };

      if (!passed) {
        // 熔断触底：重试耗尽仍不过 → 标记 manual，仍落库供人工介入
        console.warn(`[Enrich] 熔断触发：重试 ${retries} 次后三表对账仍未通过，标记人工介入`);
      }
    }

    if (!result) {
      throw new Error(`加料重构失败：${lastError}`);
    }

    // ── 落库（pending 待用户预览确认；通过后 enrich_status=approved） ──
    NovelEpisodeDAO.update(db, episodeId, {
      enriched_script: JSON.stringify(result),
      enriched_skill: result.meta.skillId,
      enriched_model: result.meta.textModel,
      enriched_at: now(),
      enrich_status: result.alignment.differences.length === 0 ? 'pending' : 'manual',
    });

    console.log(`[Enrich] 完成：${result.storyboard.shots.length} 镜 / ${result.storyboard.seconds}s / skill=${result.meta.skillId} / 状态=${result.alignment.differences.length === 0 ? 'pending' : 'manual'}`);
    return result;
  },

  /** 通过加料结果（用户预览确认后）：后续分镜/视频生成优先使用 enriched_script */
  approve(db: Database, userId: string, episodeId: string): void {
    const episode = NovelEpisodeDAO.getByIdAndUser(db, episodeId, userId);
    if (!episode) throw new Error(`剧集不存在: ${episodeId}`);
    if (!episode.enriched_script) throw new Error('该集还没有加料重构结果');
    NovelEpisodeDAO.update(db, episodeId, { enrich_status: 'approved' });
  },

  /** 打回重改：标记 rejected，前端可重新触发加料 */
  reject(db: Database, userId: string, episodeId: string): void {
    const episode = NovelEpisodeDAO.getByIdAndUser(db, episodeId, userId);
    if (!episode) throw new Error(`剧集不存在: ${episodeId}`);
    NovelEpisodeDAO.update(db, episodeId, { enrich_status: 'rejected' });
  },

  /** 解析落库的加料结果 */
  parseStored(episode: { enriched_script?: string | null }): EnrichResult | null {
    if (!episode.enriched_script) return null;
    try {
      return JSON.parse(episode.enriched_script) as EnrichResult;
    } catch {
      return null;
    }
  },
};
