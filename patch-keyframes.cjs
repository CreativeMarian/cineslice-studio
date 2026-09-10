// 补丁：keyframes.ts 首尾帧差异化生成
const fs = require('fs');
const p = 'server/src/services/autoPipeline/stages/keyframes.ts';
let b = fs.readFileSync(p, 'utf8');
const NL = b.includes('\r\n') ? '\r\n' : '\n';

const log = [];
function rep(a, r, tag) {
  if (!b.includes(a)) { log.push('MISS: ' + tag); return; }
  b = b.replace(a, r);
  log.push('OK: ' + tag);
}

// A. import 后加 extractFrameDesc helper
const a1 = "import { getFirstModel, getOrCreateScriptAnalysis, getProjectStylePreset, buildDirectorShotContext } from '../helpers';";
const r1 = a1 + NL + NL +
  "/** 从动作弧三段式 actionDescription 中提取首/尾帧画面描述（无分段标记时返回 null） */" + NL +
  "function extractFrameDesc(actionDesc: string | null | undefined, which: 'first' | 'last'): string | null {" + NL +
  "  if (!actionDesc) return null;" + NL +
  "  if (which === 'first') {" + NL +
  "    const m = actionDesc.match(/【起始状态】([\\s\\S]*?)(?=【动作过程】|$)/);" + NL +
  "    return m && m[1].trim() ? m[1].trim() : null;" + NL +
  "  }" + NL +
  "  const m = actionDesc.match(/【结束状态】([\\s\\S]*?)$/);" + NL +
  "  return m && m[1].trim() ? m[1].trim() : null;" + NL +
  "}";
rep(a1, r1, 'A-helper');

// B. 导演级关键帧提示词生成：首尾帧独立上下文
const a2 =
  "      const directorContext = buildDirectorShotContext(" + NL +
  "        db," + NL +
  "        shot," + NL +
  "        shots," + NL +
  "        first.id," + NL +
  "        shots.length" + NL +
  "      );" + NL +
  NL +
  "      const directorResult = directorPromptService.generateKeyframePrompt(" + NL +
  "        directorContext," + NL +
  "        scriptAnalysis || undefined" + NL +
  "      );";
const r2 =
  "      // 首帧上下文：动作起始状态（frameSpecificDescription 优先，回退到动作弧【起始状态】）" + NL +
  "      const ctxFirst = buildDirectorShotContext(" + NL +
  "        db," + NL +
  "        shot," + NL +
  "        shots," + NL +
  "        first.id," + NL +
  "        shots.length" + NL +
  "      );" + NL +
  "      ctxFirst.frameType = 'first';" + NL +
  "      ctxFirst.frameSpecificDescription = shot.first_frame_description || extractFrameDesc(shot.action_description, 'first') || undefined;" + NL +
  NL +
  "      // 尾帧上下文：动作结束状态（frameSpecificDescription 优先，回退到动作弧【结束状态】）" + NL +
  "      const ctxLast = buildDirectorShotContext(" + NL +
  "        db," + NL +
  "        shot," + NL +
  "        shots," + NL +
  "        first.id," + NL +
  "        shots.length" + NL +
  "      );" + NL +
  "      ctxLast.frameType = 'last';" + NL +
  "      ctxLast.frameSpecificDescription = shot.last_frame_description || extractFrameDesc(shot.action_description, 'last') || undefined;" + NL +
  NL +
  "      const directorFirstResult = directorPromptService.generateKeyframePrompt(" + NL +
  "        ctxFirst," + NL +
  "        scriptAnalysis || undefined" + NL +
  "      );" + NL +
  "      const directorLastResult = directorPromptService.generateKeyframePrompt(" + NL +
  "        ctxLast," + NL +
  "        scriptAnalysis || undefined" + NL +
  "      );";
rep(a2, r2, 'B-director-context');

// C. AI 优化 + 首尾帧 finalPrompt
const a3 =
  "      let finalPrompt = directorResult.prompt;" + NL +
  "      let finalNegativePrompt = directorResult.negativePrompt;" + NL +
  NL +
  "      try {" + NL +
  "        const aiOptimized = await aiPromptOptimizerService.optimizeKeyframePrompt(" + NL +
  "          db," + NL +
  "          task.userId," + NL +
  "          directorContext," + NL +
  "          scriptContextForAI" + NL +
  "        );" + NL +
  "        if (aiOptimized.prompt && aiOptimized.prompt.length > 50) {" + NL +
  "          finalPrompt = aiOptimized.prompt;" + NL +
  "          finalNegativePrompt = aiOptimized.negativePrompt || directorResult.negativePrompt;" + NL +
  "          console.log(`[AutoPipeline] keyframe shot=${shot.shot_number} AI深度优化成功`);" + NL +
  "        }" + NL +
  "      } catch (aiErr) {" + NL +
  "        console.warn(`[AutoPipeline] keyframe shot=${shot.shot_number} AI深度优化失败，使用导演级提示词:`, (aiErr as Error).message);" + NL +
  "      }" + NL +
  NL +
  "      console.log(`[AutoPipeline] keyframe shot=${shot.shot_number} 提示词生成完成`);";
const r3 =
  "      let finalFirstPrompt = directorFirstResult.prompt;" + NL +
  "      let finalLastPrompt = directorLastResult.prompt;" + NL +
  "      let finalNegativePrompt = directorFirstResult.negativePrompt;" + NL +
  "      let aiOptimizedOk = false;" + NL +
  NL +
  "      try {" + NL +
  "        const aiOptimized = await aiPromptOptimizerService.optimizeKeyframePrompt(" + NL +
  "          db," + NL +
  "          task.userId," + NL +
  "          ctxFirst," + NL +
  "          scriptContextForAI" + NL +
  "        );" + NL +
  "        if (aiOptimized.prompt && aiOptimized.prompt.length > 50) {" + NL +
  "          finalFirstPrompt = aiOptimized.prompt;" + NL +
  "          finalNegativePrompt = aiOptimized.negativePrompt || directorFirstResult.negativePrompt;" + NL +
  "          aiOptimizedOk = true;" + NL +
  "          console.log(`[AutoPipeline] keyframe shot=${shot.shot_number} AI深度优化成功`);" + NL +
  "        }" + NL +
  "      } catch (aiErr) {" + NL +
  "        console.warn(`[AutoPipeline] keyframe shot=${shot.shot_number} AI深度优化失败，使用导演级提示词:`, (aiErr as Error).message);" + NL +
  "      }" + NL +
  NL +
  "      // 帧专属画面兜底追加：防止 AI 优化丢弃首尾帧差异化信息" + NL +
  "      if (aiOptimizedOk && ctxFirst.frameSpecificDescription && !finalFirstPrompt.includes('【帧专属画面】')) {" + NL +
  "        finalFirstPrompt += `\\n【帧专属画面】本帧画面必须严格为以下内容：${ctxFirst.frameSpecificDescription}`;" + NL +
  "      }" + NL +
  "      if (ctxLast.frameSpecificDescription && !finalLastPrompt.includes('【帧专属画面】')) {" + NL +
  "        finalLastPrompt += `\\n【帧专属画面】本帧画面必须严格为以下内容：${ctxLast.frameSpecificDescription}`;" + NL +
  "      }" + NL +
  NL +
  "      console.log(`[AutoPipeline] keyframe shot=${shot.shot_number} 提示词生成完成`);";
rep(a3, r3, 'C-ai-optimize');

// D. genFrame 调用：first/last 用各自 prompt
const a4 =
  "      // first：镜头起始画面（现有提示词）" + NL +
  "      if (!hasFirst) {" + NL +
  "        await genFrame('first', finalPrompt);" + NL +
  "      }" + NL +
  NL +
  "      // last：镜头结尾画面——剧情收束时刻，动作已完成，状态/情绪呈现结果（首尾帧链路的尾端锁定）" + NL +
  "      if (!hasLast) {" + NL +
  "        const lastPrompt = finalPrompt + `" + NL + NL +
  "【关键帧类型】这是该镜头结尾瞬间的关键帧：本镜剧情在此收束，人物动作已完成，呈现动作/情绪的结果状态；道具、服饰、场景与镜头全程保持一致。`;" + NL +
  "        await genFrame('last', lastPrompt);" + NL +
  "      }";
const r4 =
  "      // first：镜头起始画面（动作起点状态）" + NL +
  "      if (!hasFirst) {" + NL +
  "        await genFrame('first', finalFirstPrompt);" + NL +
  "      }" + NL +
  NL +
  "      // last：镜头结尾画面（动作终点状态——与 first 有明确动作状态差异，是首尾帧插值的差异化尾端）" + NL +
  "      if (!hasLast) {" + NL +
  "        await genFrame('last', finalLastPrompt);" + NL +
  "      }";
rep(a4, r4, 'D-genframe');

fs.writeFileSync(p, b);
console.log(log.join('\n'));
