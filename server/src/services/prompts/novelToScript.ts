// 小说转剧本提示词 - 极简版
export function buildNovelToScriptPrompt(novelContent: string, options?: { genre?: string }): string {
  return `将以下小说内容改编为短剧剧本。

要求：
- 保留核心剧情和人物关系
- 每集3-5分钟，包含明确的场景切换
- 对话简洁有力，有戏剧冲突
- 输出格式：场景描述 + 角色对话

${novelContent}`;
}
