// 分镜生成提示词 - 极简版
export function buildShotGenerationPrompt(sceneContent: string, characters: string): string {
  return `将以下场景内容拆分为分镜。

每个分镜输出：
- shot_type: 景别（特写/近景/中景/全景/远景）
- camera_movement: 镜头运动（固定/推/拉/摇/移）
- action: 一句话动作描述（谁在做什么）
- dialogue: 对话内容（无则空）

场景内容：
${sceneContent}

出场角色：
${characters}`;
}
