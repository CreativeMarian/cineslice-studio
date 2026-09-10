// 补丁：video.ts 注入首尾帧动作弧 + 反慢动作约束
const fs = require('fs');
const p = 'server/src/services/autoPipeline/stages/video.ts';
let b = fs.readFileSync(p, 'utf8');
const NL = b.includes('\r\n') ? '\r\n' : '\n';
const log = [];
function rep(a, r, tag) {
  if (!b.includes(a)) { log.push('MISS: ' + tag); return; }
  b = b.replace(a, r);
  log.push('OK: ' + tag);
}

// 1. 尾帧解析记录来源（explicit_end=本镜last帧 / next_shot_first=下一镜首帧）
const a1 =
  "      let lastFrameImageForApi: string | undefined;" + NL +
  "      let resolvedEndFrameId: string | null = null;" + NL +
  "      try {" + NL +
  "        const lastFrame = resolveLastFrameForShot(db, shot, shots);" + NL +
  "        if (lastFrame) {" + NL +
  "          lastFrameImageForApi = imageToDataUrl(lastFrame.imageUrl);" + NL +
  "          resolvedEndFrameId = lastFrame.keyframeId;" + NL +
  "        }" + NL +
  "      } catch { /* 尾帧解析失败，退化为单首帧生成 */ }";
const r1 =
  "      let lastFrameImageForApi: string | undefined;" + NL +
  "      let resolvedEndFrameId: string | null = null;" + NL +
  "      let lastFrameSource: string | null = null;" + NL +
  "      try {" + NL +
  "        const lastFrame = resolveLastFrameForShot(db, shot, shots);" + NL +
  "        if (lastFrame) {" + NL +
  "          lastFrameImageForApi = imageToDataUrl(lastFrame.imageUrl);" + NL +
  "          resolvedEndFrameId = lastFrame.keyframeId;" + NL +
  "          lastFrameSource = lastFrame.source;" + NL +
  "        }" + NL +
  "      } catch { /* 尾帧解析失败，退化为单首帧生成 */ }";
rep(a1, r1, '1-lastframe-source');

// 2. 动作弧注入（styleSuffix 之后、videoMotionPrompt 之前）
const a2 =
  "      // 合并正面提示词和负面提示词（视频模型通常不支持独立的负面提示词参数）" + NL +
  "      const videoMotionPrompt = `${finalPrompt}\\n\\n【负面提示词·绝对避免】${finalNegativePrompt}`;";
const r2 =
  "      // ═══════════════════════════════════════════════════════════" + NL +
  "      // 首尾帧动作弧注入（根源修复：5秒一个慢动作）" + NL +
  "      // 首帧=动作起点画面，尾帧=动作终点画面（explicit_end=本镜last帧才可引用尾帧描述；" + NL +
  "      // next_shot_first=下一镜首帧作尾帧时只注入首帧描述+泛化动作弧，避免描述与画面不符）" + NL +
  "      // ═══════════════════════════════════════════════════════════" + NL +
  "      const firstFrameDesc = shot.first_frame_description || null;" + NL +
  "      const lastFrameDesc = (lastFrameSource === 'explicit_end' && shot.last_frame_description) ? shot.last_frame_description : null;" + NL +
  "      if (firstFrameDesc || lastFrameDesc) {" + NL +
  "        const arcParts = [" + NL +
  "          '【首尾帧动作弧·强制】'," + NL +
  "          firstFrameDesc ? `首帧画面为动作起点：${firstFrameDesc}` : ''," + NL +
  "          lastFrameDesc ? `尾帧画面为动作终点：${lastFrameDesc}` : ''," + NL +
  "          '视频必须在这5秒内完成从动作起点到动作终点的完整过渡：约1秒动作起始→3秒主体动作（动作幅度充分、位移明显、节奏紧凑）→1秒动作收尾定格。'," + NL +
  "          '⚠️ 禁止缓慢微动、禁止几乎静止的画面、禁止5秒内只有一个细微动作或慢吞吞的单一动作；动作要有明确过程和幅度，接近真人影视短剧的节奏。'," + NL +
  "        ].filter(Boolean).join('\\n');" + NL +
  "        finalPrompt = finalPrompt + '\\n\\n' + arcParts;" + NL +
  "      }" + NL +
  NL +
  "      // 合并正面提示词和负面提示词（视频模型通常不支持独立的负面提示词参数）" + NL +
  "      const videoMotionPrompt = `${finalPrompt}\\n\\n【负面提示词·绝对避免】${finalNegativePrompt}`;";
rep(a2, r2, '2-action-arc');

fs.writeFileSync(p, b);
console.log(log.join('\n'));
