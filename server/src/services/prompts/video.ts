// 视频生成提示词 — shuohao novel-storyboard export 投产包设计
// 核心原则：极简结构，不超过300字，主要依赖参考图保证一致性
//   - 一致性不靠冗长文字描述，靠传入的参考图（角色锚点图/四视图、场景概念图、首帧图）
//   - 提示词只提供：全局风格 + 分镜动作 + 角色一句话外貌 + 场景一句话环境
//
// 视频生成时必须传入的参考图：
//   1. 首帧图（必须）
//   2. 角色概念图/四视图（镜头中有角色时必须）
//   3. 场景概念图（必须）
//   4. 上一镜尾帧（首尾帧模式时）

export interface VideoPromptInput {
  styleDescription?: string;                              // 项目级风格描述（一句话）
  action: string;                                         // 分镜动作描述（画面内发生什么）
  characters?: Array<{ name: string; appearance: string }>; // 出场角色：名字 + 一句话外貌
  scene?: { name: string; environment: string };          // 场景：名字 + 一句话环境
  mood?: string;                                          // 情绪基调（可选）
  cameraMovement?: string;                                // 镜头运动（可选，如"缓慢推近"）
}

const MAX_PROMPT_CHARS = 300;

/**
 * 构建极简视频生成提示词
 * 结构：
 *   {全局风格}
 *   {分镜动作描述}
 *   {角色名}: {一句话外貌}
 *   {场景名}: {一句话环境}
 *
 * 总字数严格控制在 300 字以内，超出部分截断
 * 一致性主要靠参考图，不靠文字
 */
export function buildVideoPrompt(input: VideoPromptInput): string {
  const parts: string[] = [];

  // 1. 全局风格（一句话）
  if (input.styleDescription && input.styleDescription.trim()) {
    parts.push(input.styleDescription.trim());
  }

  // 2. 镜头运动 + 情绪（如果有，拼在动作前）
  let actionLine = input.action || '';
  if (input.cameraMovement && input.cameraMovement.trim()) {
    actionLine = `镜头${input.cameraMovement.trim()}。${actionLine}`;
  }
  if (input.mood && input.mood.trim()) {
    actionLine = `${actionLine}（${input.mood.trim()}）`;
  }
  if (actionLine.trim()) {
    parts.push(actionLine.trim());
  }

  // 3. 角色一句话外貌（每个角色一行，不超过40字）
  if (input.characters && input.characters.length > 0) {
    const charLines = input.characters
      .slice(0, 3) // 最多3个角色，避免提示词过长
      .map(c => {
        const appearance = (c.appearance || '').slice(0, 40);
        return `${c.name}: ${appearance}`;
      })
      .join('\n');
    if (charLines) parts.push(charLines);
  }

  // 4. 场景一句话环境（不超过50字）
  if (input.scene && input.scene.name) {
    const env = (input.scene.environment || '').slice(0, 50);
    parts.push(`${input.scene.name}: ${env}`);
  }

  let result = parts.join('\n\n');

  // 严格控制在 300 字以内
  if (result.length > MAX_PROMPT_CHARS) {
    result = result.slice(0, MAX_PROMPT_CHARS);
  }

  return result;
}

/**
 * 构建投产包 prompt.md 内容（shuohao export 格式）
 * 每个段（segment）一个 prompt.md，包含该段所有镜头的提示词
 */
export function buildSegmentPromptMd(
  segmentId: number,
  shots: Array<{
    shot_number: number;
    action_description: string;
    dialogue?: string;
    duration_seconds: number;
    shot_size?: string;
    camera_movement?: string;
  }>,
  styleDescription?: string,
): string {
  const lines: string[] = [];
  lines.push(`# Segment ${segmentId}`);
  lines.push('');
  if (styleDescription) {
    lines.push(`**风格**: ${styleDescription}`);
    lines.push('');
  }
  lines.push(`**镜头数**: ${shots.length}`);
  lines.push(`**总时长**: ${shots.reduce((s, sh) => s + (sh.duration_seconds || 0), 0)}秒`);
  lines.push('');
  lines.push('---');
  lines.push('');

  for (const shot of shots) {
    lines.push(`## Shot ${shot.shot_number}（${shot.duration_seconds}秒）`);
    lines.push('');
    lines.push(`- 景别: ${shot.shot_size || 'medium'}`);
    lines.push(`- 镜头运动: ${shot.camera_movement || 'static'}`);
    lines.push(`- 画面: ${shot.action_description}`);
    if (shot.dialogue) {
      lines.push(`- 台词: ${shot.dialogue}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
