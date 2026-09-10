// 一次性补丁：keyframePrompt.ts 首尾帧差异化（CRLF 兼容）
const fs = require('fs');
const p = 'server/src/services/prompts/keyframePrompt.ts';
let b = fs.readFileSync(p, 'utf8');
const NL = '\r\n';

// 1. 接口加 frameSpecificDescription
const a1 = "  frameType: 'first' | 'last' | 'middle';" + NL + "  stylePrompt?: string;";
const r1 = "  frameType: 'first' | 'last' | 'middle';" + NL + "  /** 帧专属画面描述：首帧=动作起始状态，尾帧=动作结束状态。有值时优先使用，保证首尾帧画面差异化 */" + NL + "  frameSpecificDescription?: string;" + NL + "  stylePrompt?: string;";
b = b.replace(a1, r1);

// 2. 画面内容优先用帧专属描述
const a2 = "  // 镜头动作" + NL + "  parts.push(`画面内容：${params.shotDescription}`);";
const r2 = "  // 镜头动作：优先使用帧专属描述（首尾帧差异化核心）" + NL + "  const frameContent = params.frameSpecificDescription || params.shotDescription;" + NL + "  parts.push(`画面内容：${frameContent}`);";
b = b.replace(a2, r2);

// 3. 帧类型提示强化
const a3 = "  if (params.frameType === 'first') {" + NL + "    parts.push('这是镜头开始的第一帧，展现场景建立');" + NL + "  } else if (params.frameType === 'last') {" + NL + "    parts.push('这是镜头结束的最后一帧，展现动作结果');";
const r3 = "  if (params.frameType === 'first') {" + NL + "    parts.push('这是镜头开始的第一帧，画面内容为动作起始瞬间的静态定格：人物姿势、位置、表情、道具均处于动作开始前的状态。后续视频将从本帧画面对应状态出发展开动作');" + NL + "    if (params.frameSpecificDescription) {" + NL + "      parts.push('⚠️ 本帧画面内容已指定为动作起始状态，不得画成动作完成后的结果状态');" + NL + "    }" + NL + "  } else if (params.frameType === 'last') {" + NL + "    parts.push('这是镜头结束的最后一帧，画面内容为动作完成后的结果定格：人物姿势、位置、表情、道具均处于动作结束后的状态。本帧必须与首帧画面有明确的动作状态差异（例如首帧举鞭欲抽，本帧鞭已抽下）');" + NL + "    if (params.frameSpecificDescription) {" + NL + "      parts.push('⚠️ 本帧画面内容已指定为动作结束状态，不得画成动作起始状态');" + NL + "    }";
b = b.replace(a3, r3);

fs.writeFileSync(p, b);
console.log('done, frameSpecificDescription count:', (b.match(/frameSpecificDescription/g) || []).length);
