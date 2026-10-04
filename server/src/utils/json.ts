// 公共 JSON 工具（P3-1）
// 统一替换散落在各服务中的 try { JSON.parse(...) } catch { ... } 模式，
// 解析失败时安全回退，避免重复样板代码。

/**
 * 安全 JSON 解析：空值或解析失败时返回 fallback，不抛异常。
 * @param value 待解析的 JSON 字符串（null/undefined 直接返回 fallback）
 * @param fallback 解析失败或空值时的回退值
 */
export function safeJsonParse<T = any>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

/**
 * 安全 JSON 序列化：序列化失败时返回 fallback（默认 null），不抛异常。
 * @param value 待序列化的值
 * @param fallback 序列化失败时的回退值（默认 null）
 */
export function safeJsonStringify(value: any, fallback?: string): string | null {
  try {
    const out = JSON.stringify(value);
    // JSON.stringify(undefined) 返回 undefined（非字符串），统一回退到 fallback/null，保持返回类型一致
    return out === undefined ? (fallback ?? null) : out;
  } catch { return fallback ?? null; }
}
