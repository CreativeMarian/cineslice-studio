// 剧本版本过期判断工具
// 后端约定：episodes 表有 script_version（用户编辑剧本后自增），
// 角色/场景/分镜记录记录生成时的 script_version。
// 前端通过比较 episode.script_version > item.script_version 判断是否过期；
// 字段缺失（后端未实现或旧数据）时容错为"未过期"，不显示警告。

export type ScriptVersioned = { script_version?: number | null };

/** 条目是否过期：剧集当前版本 > 条目记录版本（任一字段缺失则视为未过期） */
export function isScriptStale<T extends ScriptVersioned>(
  episode: ScriptVersioned | null | undefined,
  item: T | null | undefined
): boolean {
  const epV = episode?.script_version;
  const itemV = item?.script_version;
  if (epV == null || itemV == null) return false;
  return epV > itemV;
}

/** 列表中有多少条过期（字段缺失容错为未过期） */
export function countScriptStale<T extends ScriptVersioned>(
  episode: ScriptVersioned | null | undefined,
  items: T[] | null | undefined
): number {
  if (!episode || episode.script_version == null || !items) return 0;
  return items.filter((item) => isScriptStale(episode, item)).length;
}
