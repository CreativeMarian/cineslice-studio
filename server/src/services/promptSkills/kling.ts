// 可灵 Kling 官方提示词 Skill
// 来源：可灵官方使用指南（https://kelingaicn.com/use.html）、
// Kling AI 官方 Prompt Guide（https://kling.ai/blog/kling-ai-prompt-guide）、
// Kling 3.0 官方 SCALE 框架（Shot→Character→Action→Lighting&Location→Extra）、
// 可灵 API 文档（prompt/negative 各 2500 字符上限）。
// 官方公式：主体 + 主体动作 + 场景 + （镜头语言 + 光照 + 氛围）。

import type { PromptSkill, PromptSkillVideoParams } from './types';

const KLING_SHOT_RULE = `【可灵 Kling 官方提示词规范 · 分镜生成阶段】
生成分镜"动作/画面描述"时，严格按可灵官方公式组织：主体 + 主体动作 + 场景 + （镜头语言 + 光照 + 氛围）。
1. 主体：用具体名词和动词描述人物/物体，写清视觉细节（服装、发型、身份特征）。
2. 动作：一个分镜只写一个主动作，动作要完整（起始→过程→结束），避免长难句和抽象词汇。
3. 场景：写明发生地点、环境状态、光照与天气。
4. 镜头语言（可灵必写，不写默认静态）：景别（远景/全景/中景/近景/特写）+ 镜头运动（推/拉/摇/移/跟/环绕/手持），镜头运动要服务于动作。
5. 氛围：情绪基调与整体观感。
6. 语句通顺、前后剧情连贯、人物/场景/道具资产跨镜头一致；有台词时写清说话人、台词内容与语气。`;

const KLING_ASSET_RULE = `【可灵 Kling 官方提示词规范 · 资产生成阶段】
概念图将作为可灵图生视频/首尾帧的参考图，必须满足：
1. 角色概念图：正面全身/半身像，五官清晰、面部无遮挡、无大面积阴影/过曝，完整服装展示，中性背景，画面中只有该角色、无任何文字/字母/数字/logo/水印；此图锁定身份（面容/发型/服装/体型）。
2. 场景概念图：空场景、无人物、透视正确、光影方向一致、无任何文字/招牌/水印；此图锁定环境与光线。
3. 道具概念图：单一物品、全貌清晰、中性背景、均匀光照、无文字水印。
4. 可灵有参考图时提示词聚焦"角色长什么样（服装/年龄气质/面部细节/肤质/视觉调性）+ 环境是什么样（场所/灯光/氛围）"，概念图本身要提供足够完整的身份与环境信息。`;

const KLING_KEYFRAME_RULE = `【可灵 Kling 官方提示词规范 · 关键帧生成阶段】
首帧/尾帧作为可灵 image2video / 首尾帧的输入画面：
1. 首帧：人物动作起始状态，表情自然，构图完整，与上一镜尾帧衔接。
2. 尾帧：动作完成状态，与首帧同一人物身份、同一场景、同一光线方向，不引入新物体。
3. 中间帧：身份/场景特征与首尾帧严格一致，仅动作进度不同。
4. 关键帧画面必须干净无文字/水印，避免可灵把参考图中的文字或杂质生成进视频。`;

const KLING_VIDEO_RULE = `【可灵 Kling 官方提示词规范 · 视频生成阶段】
最终视频提示词按可灵官方 SCALE 框架组织：
1. Shot（镜头）：先写景别 + 镜头运动（推/拉/摇/移/跟/环绕/手持 + 运动时机），无镜头指令可灵默认静态。
2. Character（主体）：引用参考图身份，写清主体外观与动作。
3. Action（动作）：一个动作完整弧线（起始→过程→结束），动作自然、符合物理逻辑。
4. Lighting & Location（光照与场景）：沿用场景参考图，写明光线与氛围。
5. Extra（额外）：声音（环境声/动作声/对白）、风格、技术规格。
6. 约束：保留参考图中的人物身份/构图/光线/场景布局；动作沿连续路径发展，不引入参考图中不存在的新物体。
7. 中文提示词不超过 2500 字符（可灵 API 上限）。`;

function buildKlingVideoPrompt(params: PromptSkillVideoParams): string {
  const parts: string[] = [];

  // SCALE 框架：Shot → Character → Action → Lighting & Location → Extra
  parts.push(`镜头：${params.shotSize || '中景'}，${params.cameraMovement || '固定镜头'}`);

  let action = params.actionDescription || '';
  if (params.firstFrameDesc) action += `。动作起点：${params.firstFrameDesc}`;
  if (params.lastFrameDesc) action += `。动作终点：${params.lastFrameDesc}`;
  if (params.stylePrompt) action += `。氛围：${params.stylePrompt}`;
  parts.push(action);

  const chars = (params.charactersInShot || []).filter(Boolean);
  if (chars.length > 0) parts.push(`人物（${chars.join('、')}）：严格保持参考图中面容/发型/服装/体型完全一致，不得换脸或改变外观。`);
  if (params.sceneName) parts.push(`场景（${params.sceneName}）：沿用场景参考图的陈设/布局/光线方向，不引入参考图中不存在的新物体。`);
  if (params.dialogue) parts.push(`台词：${params.dialogue}（说话人语气自然，与口型同步）。`);
  parts.push(`动作在 ${params.duration || 5} 秒内自然完成，结尾定格明确状态。`);

  let prompt = parts.join('\n');
  // 可灵 API 上限 2500 字符
  if (prompt.length > 2500) prompt = prompt.slice(0, 2500);
  return prompt;
}

export const klingPromptSkill: PromptSkill = {
  id: 'kling',
  displayName: '可灵 Kling 官方提示词',
  providers: ['kling', 'klingai'],
  modelKeys: ['kling', 'kling-v2', 'kling-v3', 'kling-2', 'kling-3'],
  docsUrl: 'https://kling.ai/blog/kling-ai-prompt-guide',
  skillUrl: 'https://kelingaicn.com/use.html',
  description: '可灵 Kling 官方提示词规范：主体+动作+环境+风格公式、SCALE 框架、镜头语言必写、2500 字符上限。',
  modes: ['text2video', 'image2video', 'firstLastFrame'],
  shotRule: KLING_SHOT_RULE,
  assetRule: KLING_ASSET_RULE,
  keyframeRule: KLING_KEYFRAME_RULE,
  videoRule: KLING_VIDEO_RULE,
  buildVideoPrompt: buildKlingVideoPrompt,
  keyframeAnchor: (frameType) => {
    if (frameType === 'first') {
      return '锚定：此为首帧画面（0.00秒），可灵图生视频的输入画面，人物处于动作起始状态，与上一镜尾帧衔接，画面干净无文字/水印。';
    }
    if (frameType === 'last') {
      return '锚定：此为尾帧画面，动作完成状态，与首帧同一身份/场景/光线，不引入新物体，画面干净无文字/水印。';
    }
    return '锚定：人物/场景/道具特征与首尾帧严格一致，仅动作进度不同，画面干净无文字/水印。';
  },
};
