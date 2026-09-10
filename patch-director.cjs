// 补丁：directorPromptService.ts 关键帧提示词支持首尾帧差异化
const fs = require('fs');
const p = 'server/src/services/directorPromptService.ts';
let b = fs.readFileSync(p, 'utf8');
const NL = b.includes('\r\n') ? '\r\n' : '\n';

// 1. DirectorShotContext 接口加字段
const a1 = "  // 前后镜头上下文" + NL + "  previousShotAction?: string;" + NL + "  nextShotAction?: string;";
const r1 = "  // 前后镜头上下文" + NL + "  previousShotAction?: string;" + NL + "  nextShotAction?: string;" + NL + "  /** 关键帧帧类型：first=动作起点画面，last=动作终点画面 */" + NL + "  frameType?: 'first' | 'last';" + NL + "  /** 帧专属画面描述（生成关键帧时优先于 actionDescription） */" + NL + "  frameSpecificDescription?: string;";
b = b.replace(a1, r1);

// 2. generateKeyframePrompt 的画面定格段落支持帧差异化
const a2 = "    const keyframePrompt = result.prompt" + NL + "      .replace(/【时序分解】[\\s\\S]*?(?=\\n【动作详解】|\\n【动作描述】)/, " + NL + "        `【画面定格】这是镜头开始的第一帧，捕捉动作的关键瞬间。\\n画面内容：${shotContext.actionDescription}\\n要求：画面稳定，焦点清晰，光影自然，为后续视频生成提供准确的参考。`);";
const r2 = "    const frameContent = shotContext.frameSpecificDescription || shotContext.actionDescription;" + NL + "    const frameKindText = shotContext.frameType === 'last'" + NL + "      ? '这是镜头结束的最后一帧，画面内容为动作完成后的结果定格：人物姿势、位置、表情、道具均处于动作结束后的状态。本帧必须与首帧画面有明确的动作状态差异（例如首帧举鞭欲抽，本帧鞭已抽下）'" + NL + "      : '这是镜头开始的第一帧，画面内容为动作起始瞬间的静态定格：人物姿势、位置、表情、道具均处于动作开始前的状态。后续视频将从本帧画面对应状态出发展开动作';" + NL + "    const keyframePrompt = result.prompt" + NL + "      .replace(/【时序分解】[\\s\\S]*?(?=\\n【动作详解】|\\n【动作描述】)/, " + NL + "        `【画面定格】${frameKindText}\\n画面内容：${frameContent}\\n要求：画面稳定，焦点清晰，光影自然，为后续视频生成提供准确的参考。`);";
if (!b.includes(a2)) { console.log('WARN: a2 not found'); } else { b = b.replace(a2, r2); }

fs.writeFileSync(p, b);
console.log('directorPromptService patched, frameSpecificDescription count:', (b.match(/frameSpecificDescription/g) || []).length);
