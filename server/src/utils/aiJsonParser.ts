// AI 返回内容的健壮 JSON 解析工具
// 处理 markdown 代码块、格式不规范、额外文字等问题

export interface ParseResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  rawPreview?: string;
}

/**
 * 从 AI 返回的文本中提取并解析 JSON
 * 支持：直接 JSON、markdown 代码块、额外文字包裹、常见格式修复
 */
export function parseAiJson<T = unknown>(raw: string): ParseResult<T> {
  if (!raw || typeof raw !== 'string') {
    return { success: false, error: 'AI 返回内容为空' };
  }

  const trimmed = raw.trim();
  const preview = trimmed.length > 500 ? trimmed.slice(0, 500) + '...' : trimmed;

  // 1. 直接解析
  try {
    return { success: true, data: JSON.parse(trimmed) as T };
  } catch { /* continue */ }

  // 2. 提取 markdown 代码块中的 JSON (```json ... ``` 或 ``` ... ```)
  const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (codeBlockMatch) {
    try {
      return { success: true, data: JSON.parse(codeBlockMatch[1].trim()) as T };
    } catch { /* continue */ }
  }

  // 3. 提取第一个 { 到最后一个 } 之间的内容（处理额外文字包裹）
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    const extracted = trimmed.slice(firstBrace, lastBrace + 1);
    try {
      return { success: true, data: JSON.parse(extracted) as T };
    } catch { /* continue with repair */ }

    // 3.1 修复常见格式问题后重试
    const repaired = repairJson(extracted);
    try {
      return { success: true, data: JSON.parse(repaired) as T };
    } catch { /* continue */ }
  }

  // 4. 提取第一个 [ 到最后一个 ] 之间的内容（数组）
  const firstBracket = trimmed.indexOf('[');
  const lastBracket = trimmed.lastIndexOf(']');
  if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
    const extracted = trimmed.slice(firstBracket, lastBracket + 1);
    try {
      return { success: true, data: JSON.parse(extracted) as T };
    } catch { /* continue with repair */ }

    const repaired = repairJson(extracted);
    try {
      return { success: true, data: JSON.parse(repaired) as T };
    } catch { /* continue */ }
  }

  // 5. 对整个内容做格式修复后解析
  const repaired = repairJson(trimmed);
  try {
    return { success: true, data: JSON.parse(repaired) as T };
  } catch (e) {
    return {
      success: false,
      error: `JSON 解析失败: ${(e as Error).message}`,
      rawPreview: preview,
    };
  }
}

/**
 * 修复常见的 JSON 格式问题
 */
/**
 * 只转义 JSON 字符串值内部的裸换行/回车/Tab（JSON.parse 不允许字符串值内出现裸换行），
 * 保留字符串外部的格式化换行（JSON 合法空白）。
 * 用状态机扫描：仅当处于双引号字符串内且未处于转义序列中时替换。
 */
function escapeNewlinesInJsonStrings(str: string): string {
  let out = '';
  let inStr = false;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (inStr) {
      if (ch === '\\') {
        out += ch;
        if (i + 1 < str.length) { out += str[i + 1]; i++; }
        continue;
      }
      if (ch === '"') { inStr = false; out += ch; continue; }
      if (ch === '\n') { out += '\\n'; continue; }
      if (ch === '\r') { out += '\\r'; continue; }
      if (ch === '\t') { out += '\\t'; continue; }
      out += ch;
    } else {
      if (ch === '"') inStr = true;
      out += ch;
    }
  }
  return out;
}

function repairJson(str: string): string {
  let repaired = str;

  // 移除 trailing commas (,} 或 ,])
  repaired = repaired.replace(/,(\s*[}\]])/g, '$1');

  // 将单引号替换为双引号（简单处理，不处理字符串内的单引号）
  repaired = repaired.replace(/'([^']*)'/g, '"$1"');

  // 修复没有引号的键名: { key: "value" } -> { "key": "value" }
  repaired = repaired.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');

  // 修复字符串值内的裸换行/回车/Tab（保留字符串外的格式化换行）
  repaired = escapeNewlinesInJsonStrings(repaired);
  return repaired;
}

/**
 * 解析 AI JSON 并在失败时抛出标准化错误
 */
export function parseAiJsonOrThrow<T = unknown>(raw: string): T {
  const result = parseAiJson<T>(raw);
  if (!result.success) {
    const detail = result.rawPreview ? `，返回内容预览: ${result.rawPreview}` : '';
    const err = new Error(`AI 返回的 JSON 解析失败: ${result.error}${detail}`);
    err.name = 'AI_JSON_PARSE_ERROR';
    throw err;
  }
  return result.data as T;
}

// ---------- 分镜/剧本等结构化数据的容错解析 ----------

/** 常见中文键名 → 英文键名（分镜场景） */
const ZH_KEY_MAP: Record<string, string> = {
  镜号: 'shotNumber', 序号: 'shotNumber', 镜头号: 'shotNumber',
  阶段: 'phase', 阶段名: 'phaseName', 阶段名称: 'phaseName',
  场景: 'sceneName', 场景名: 'sceneName', 场景名称: 'sceneName',
  景别: 'shotSize', 镜头运动: 'cameraMovement', 运镜: 'cameraMovement',
  节奏: 'pace', 主体: 'subject', 镜头主体: 'subject',
  动作: 'actionDescription', 画面: 'actionDescription', 主画面: 'actionDescription', 动作描述: 'actionDescription',
  台词: 'dialogue', 对话: 'dialogue',
  构图: 'composition', 光影: 'lighting', 灯光: 'lighting',
  情绪: 'mood', 氛围: 'mood', 氛围情绪: 'mood',
  转场: 'transition', 时长: 'durationSeconds', 预估时长: 'durationSeconds',
  出场角色: 'charactersInShot', 角色: 'charactersInShot', 角色列表: 'charactersInShot',
  造型: 'characterOutfits', 服装造型: 'characterOutfits', 服装: 'characterOutfits',
  道具: 'propsInShot', 关键道具: 'propsInShot',
  备注: 'notes',
};

/** 中文键名递归替换为英文键名 */
export function normalizeZhKeys<T = unknown>(input: T): T {
  if (Array.isArray(input)) return input.map((v) => normalizeZhKeys(v)) as unknown as T;
  if (input && typeof input === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      const mapped = ZH_KEY_MAP[k] ?? k;
      out[mapped] = normalizeZhKeys(v);
    }
    return out as T;
  }
  return input;
}

/**
 * 解析"镜头/分镜"类 AI 输出：
 * 1. 兼容 {shots:[...]} / {storyboards:[...]} / {分镜表:[...]} / {镜头:[...]} 包裹结构
 * 2. 兼容中文键名 → 英文键名
 * 3. 兼容单对象（自动包装为数组）
 */
export function parseShotListArray<T = any>(raw: string): T[] {
  const data = parseAiJsonOrThrow<unknown>(raw);
  let arr: unknown[] | null = null;
  if (Array.isArray(data)) {
    arr = data;
  } else if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    for (const key of ['shots', 'storyboards', 'storyboard', '分镜表', '分镜', '镜头', 'shotsList', 'data', 'result', 'results', 'list', 'items']) {
      if (Array.isArray(obj[key])) {
        arr = obj[key];
        break;
      }
    }
    if (!arr && ('shotNumber' in obj || '镜号' in obj || 'actionDescription' in obj || '动作' in obj)) {
      arr = [data];
    }
  }
    if (!arr) {
    // 深度兜底：任意层级扫描第一个含镜头字段的数组
    const walk = (o: any, depth = 0): any[] | null => {
      if (!o || typeof o !== 'object' || depth > 6) return null;
      if (Array.isArray(o)) {
        if (o.length > 0 && typeof o[0] === 'object' && o[0] !== null && ('shotNumber' in o[0] || 'shot_number' in o[0] || '镜号' in o[0] || 'actionDescription' in o[0] || '动作' in o[0])) return o;
        for (const item of o) { const r = walk(item, depth + 1); if (r) return r; }
        return null;
      }
      for (const k of Object.keys(o)) {
        const r = walk(o[k], depth + 1);
        if (r) return r;
      }
      return null;
    };
    arr = walk(data);
  }
  if (!arr) throw Object.assign(new Error('AI 返回内容不是镜头数组'), { name: 'AI_JSON_PARSE_ERROR' });
  return normalizeZhKeys(arr) as unknown as T[];
}
