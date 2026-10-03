// 视频生成提示词 - 极简版（核心！不超过300字，无任何标签）
export interface VideoPromptInput {
  styleDescription?: string;  // 项目级风格描述
  action: string;             // 分镜动作描述
  characters?: Array<{ name: string; appearance: string }>;
  scene?: { name: string; environment: string };
}

export function buildVideoPrompt(input: VideoPromptInput): string {
  const parts: string[] = [];
  
  if (input.styleDescription) {
    parts.push(input.styleDescription);
  }
  
  parts.push(input.action);
  
  if (input.characters && input.characters.length > 0) {
    const charStr = input.characters
      .map(c => `${c.name}: ${c.appearance}`)
      .join('\n');
    parts.push(charStr);
  }
  
  if (input.scene) {
    parts.push(`${input.scene.name}: ${input.scene.environment}`);
  }
  
  return parts.join('\n\n');
}
