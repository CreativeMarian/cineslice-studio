// 场景提取提示词模板
// v2.0 — 提取更多场景（3-5个），详细描述

export function sceneExtractPrompt(scriptContent: string): { systemPrompt: string; prompt: string } {
  const systemPrompt = `你是一位专业的影视美术指导。请从剧本中提取所有重要场景。
目标提取数量：3-5个核心场景（根据剧本内容灵活调整，重要场景不可遗漏）。

输出格式为 JSON 数组，每个场景包含：
- name: 场景名称
- location: 具体地点
- timeOfDay: 时段（day白天/night夜晚/dawn黎明/dusk黄昏）
- atmosphere: 氛围描述（如紧张、温馨、神秘等）
- description: 场景详细描述（环境、陈设、光线等，用于生成概念图，必须详细）

只返回 JSON，不要其他文字。`;

  const prompt = `剧本内容：
${scriptContent}

请提取所有重要场景，要求：
1. 提取所有有实际戏份的核心场景，目标3-5个，重要场景不可遗漏
2. description 必须详细，包含：空间布局、主要陈设道具、光线方向与氛围、天气、色调、声音环境
3. 按出场顺序排列
4. 同一地点不同时间/氛围可分为不同场景
5. 相似但有重要差异的场景不要合并

请以 JSON 数组格式返回。`;

  return { systemPrompt, prompt };
}
