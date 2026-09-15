// 通用视频提示词 Skill（兜底适配任何未配置专属官方 Skill 的模型）
// 来源：跨模型通用的官方最佳实践（可灵官方公式、Seedance 官方进阶公式、MiniMax H3 官方三段式、
// 以及各厂商一致强调的"参考图管身份/提示词管动作"等原则）提炼出的中性规范。
// 作用：换任何视频模型都能自动注入，保证"语句通顺、剧情连贯、资产一致性"，
// 避免无 Skill 时退化为无规则的分镜/提示词生成。

import type { PromptSkill, PromptSkillVideoParams } from './types';

const GENERIC_SHOT_RULE = `【通用视频提示词规范 · 分镜生成阶段】（当前视频模型未配置专属官方 Skill，使用通用规范自动适配）
生成每个分镜的"动作/画面描述"（actionDescription）时，必须遵循以下视频生成通用规范：
1. 一个分镜只讲一个主动作：画面主体（谁）在做什么（动作），动作要有"起始→过程→结束"的完整弧线，禁止把多个不相关动作塞进一个镜头。
2. 五要素齐全且语句通顺：主体 + 动作 + 场景环境 + 镜头（景别/运镜） + 光色氛围，用自然通顺的中文完整句表达，禁止碎片化关键词堆砌。
3. 明确写出镜头语言：景别（远景/全景/中景/近景/特写）、镜头运动（推/拉/摇/移/跟/手持/固定），镜头运动必须服务于动作和情绪。
4. 明确写出节奏与落点：动作在镜头时长内自然完成，结尾定格在明确状态（动作完成/情绪到位/信息揭示）。
5. 前后镜头剧情连贯：本镜的起止状态必须衔接上一镜的结束状态和下一镜的起始状态（人物位置、动作、情绪、场景连续），禁止跳变。
6. 资产一致性硬约束：人物身份（面容/发型/服装/体型）、场景（陈设/光线方向/布局）、关键道具必须在全剧分镜中保持一致；角色首次出现必须写清完整外观，之后引用相同描述词。
7. 台词与口型：若本镜有对白，写明说话人、语气和情绪，台词要口语化、符合人物性格，禁止乱码/无意义音节。`;

const GENERIC_ASSET_RULE = `【通用视频提示词规范 · 资产生成阶段】（当前视频模型未配置专属官方 Skill，使用通用规范自动适配）
生成角色/场景/道具概念图时，必须遵循以下参考图规范：
1. 角色概念图：正面全身像或半身像，五官清晰、面部不可遮挡、无大面积阴影/过曝，自然光色，完整服装展示，中性背景，画面中只有该角色、无任何文字/字母/数字/logo/水印。此图将作为视频生成的身份参考图，锁定面容/发型/服装/体型。
2. 场景概念图：空场景、无人物，完整空间展示、透视正确、光影方向一致、陈设布局清晰，无任何文字/招牌/水印。此图将作为视频生成的场景参考图，锁定环境与光线。
3. 道具概念图：单一物品、完整展示全貌与细节，中性背景、均匀光照，画面中无人物/手/多余物品，无文字水印。
4. 所有概念图保持统一风格与统一人物/场景描述词，供跨镜头复用，保证资产一致性。`;

const GENERIC_KEYFRAME_RULE = `【通用视频提示词规范 · 关键帧生成阶段】（当前视频模型未配置专属官方 Skill，使用通用规范自动适配）
生成首帧/尾帧/中间帧时，必须遵循：
1. 首帧（动作起点画面）：人物处于动作起始状态，表情自然，构图完整；与上一镜尾帧画面衔接（人物位置/服装/场景连续）。
2. 尾帧（动作结束画面）：人物处于动作完成状态，与首帧同一人物身份（面容/服装/道具）、同一场景、同一光线方向；画面中不引入首帧中不存在的新物体。
3. 中间帧：人物/场景特征与首尾帧严格一致，仅动作进度不同。
4. 关键帧将作为视频生成的首尾参考图，双端锁定身份与场景，保证人物/场景/道具跨镜头一致。`;

const GENERIC_VIDEO_RULE = `【通用视频提示词规范 · 视频生成阶段】（当前视频模型未配置专属官方 Skill，使用通用规范自动适配）
最终视频提示词按以下官方通用结构组织（语句通顺、剧情连贯、资产一致）：
1. 主体与动作：谁（引用参考图身份：面容/服装/道具），做什么动作（一条提示词一个动作，有起承转合），动作自然完成。
2. 场景与光线：沿用场景参考图（陈设/布局/光影方向一致），写明光线氛围。
3. 镜头：景别 + 运镜 + 镜头运动时机（何时推/拉/摇/移）。
4. 声音：环境声/动作声/对白语气（有台词时写清说话内容与语气）。
5. 节奏与落点：动作在时长内自然完成，结尾定格明确状态。
6. 约束：保留参考图中的人物身份/构图/光线/场景布局，不引入参考图中不存在的新物体；中文语句通顺完整，禁止碎片堆砌。`;

function buildGenericVideoPrompt(params: PromptSkillVideoParams): string {
  const parts: string[] = [];

  // 画面主体描述（含动作弧）
  let visual = params.actionDescription || '';
  if (params.firstFrameDesc) visual += `。首帧（0.00秒）：${params.firstFrameDesc}`;
  if (params.lastFrameDesc) visual += `。尾帧（${(params.duration || 5).toFixed(3)}秒）：${params.lastFrameDesc}`;
  if (params.stylePrompt) visual += `。风格：${params.stylePrompt}`;
  parts.push(visual);

  // 一致性约束
  const chars = (params.charactersInShot || []).filter(Boolean);
  if (chars.length > 0) parts.push(`人物（${chars.join('、')}）必须保持身份参考图中的面容/发型/服装/道具完全一致，不得换脸或改变外观。`);
  if (params.sceneName) parts.push(`场景（${params.sceneName}）必须保持场景参考图中的陈设/布局/光线方向一致，不引入参考图中不存在的新物体。`);

  // 镜头语言
  parts.push(`镜头：${params.shotSize || '中景'}，${params.cameraMovement || '固定镜头'}，镜头运动服务于动作与情绪。`);

  // 台词
  if (params.dialogue) parts.push(`台词：${params.dialogue}（说话人语气自然，与口型/情绪同步）。`);

  // 时长与节奏
  parts.push(`动作在 ${params.duration || 5} 秒内自然完成，节奏实时，结尾定格在明确状态。`);

  let prompt = parts.join('\n');
  // 通用兜底按 7000 字符截断（宽松上限）
  if (prompt.length > 7000) prompt = prompt.slice(0, 7000);
  return prompt;
}

export const genericVideoPromptSkill: PromptSkill = {
  id: 'generic-video',
  displayName: '通用视频提示词规范',
  providers: [],           // 不按 provider 匹配
  modelKeys: [],           // 不按模型名匹配
  docsUrl: 'https://www.volcengine.com/docs/82379/2222480',
  skillUrl: 'https://kling.ai/blog/kling-ai-prompt-guide',
  description: '跨模型通用视频提示词官方最佳实践（可灵/Seedance/MiniMax 各官方指南提炼）。任何未配置专属 Skill 的视频模型自动使用本规范，保证语句通顺、剧情连贯、资产一致。',
  modes: ['text2video', 'image2video', 'firstLastFrame'],
  shotRule: GENERIC_SHOT_RULE,
  assetRule: GENERIC_ASSET_RULE,
  keyframeRule: GENERIC_KEYFRAME_RULE,
  videoRule: GENERIC_VIDEO_RULE,
  buildVideoPrompt: buildGenericVideoPrompt,
  keyframeAnchor: (frameType) => {
    if (frameType === 'first') {
      return '锚定：此为首帧画面（0.00秒），人物处于动作起始状态，与上一镜尾帧衔接（位置/服装/场景连续），画面中无任何文字/水印。';
    }
    if (frameType === 'last') {
      return '锚定：此为尾帧画面，人物处于动作完成状态，与首帧同一身份/场景/光线方向，不引入新物体，画面中无任何文字/水印。';
    }
    return '锚定：人物/场景/道具特征与首尾帧严格一致，仅动作进度不同，画面中无任何文字/水印。';
  },
};
