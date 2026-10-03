// 角色提取提示词 - 极简版
export function buildCharacterExtractPrompt(scriptContent: string): string {
  return `从以下剧本中提取所有角色信息。

对每个角色输出：
- name: 角色名
- appearance: 一句话外貌描述（年龄、发型、服装、显著特征）
- personality: 一句话性格描述

剧本内容：
${scriptContent}`;
}
