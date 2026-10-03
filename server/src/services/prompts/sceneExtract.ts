// 场景提取提示词 - 极简版
export function buildSceneExtractPrompt(scriptContent: string): string {
  return `从以下剧本中提取所有场景。

对每个场景输出：
- name: 场景名
- environment: 一句话环境描述（地点、时间、氛围、关键道具）

剧本内容：
${scriptContent}`;
}
