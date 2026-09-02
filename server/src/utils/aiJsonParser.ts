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
function repairJson(str: string): string {
  let repaired = str;

  // 移除 trailing commas (,} 或 ,])
  repaired = repaired.replace(/,(\s*[}\]])/g, '$1');

  // 将单引号替换为双引号（简单处理，不处理字符串内的单引号）
  repaired = repaired.replace(/'([^']*)'/g, '"$1"');

  // 修复没有引号的键名: { key: "value" } -> { "key": "value" }
  repaired = repaired.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');

  // 修复换行符在字符串内的问题
  repaired = repaired.replace(/\n/g, '\\n');
  repaired = repaired.replace(/\r/g, '\\r');
  repaired = repaired.replace(/\t/g, '\\t');

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
