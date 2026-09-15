// Seedance 官方提示词 Skill（拆分为 2.5 / 2.0 两个独立 Skill，官方规范有实质区别）
// ── 2.5（即梦 Dreamina Seedance 2.5 官方用户手册）──
//   完整提示词 = [素材说明] + [一句话概括] + [具体情节描述] + [全局补充]
//   一句话概括 = 主体 + 地点 + 事件 + 主题/风格 + 特殊运镜
//   具体情节   = 按时间线写画面、运镜、动作、对白、音效和转场
//   全局补充   = 锁定机位、环境、灯光、声音、人物一致性与禁止项
//   分段脚本：长视频每阶段一个主要变化，每阶段有可见结束状态；30-180 秒、时间戳控制、
//   最多 50 份多模态参考、首帧/首尾帧/Omni Reference。
// ── 2.0（火山引擎《Doubao Seedance 2.0 提示词指南》docs/82379/2222480）──
//   进阶公式：精准主体 + 动作细节 + 场景环境 + 光影色调 + 镜头运镜 + 视觉风格 + 画质 + 约束条件
//   八段骨架：主体、场景、动作、运镜、分时段、转场特效、音频、风格（不必段段都写，关键别漏）
//   中文提示词 ≤ 500 字；多模态参考：图片/视频/音频。

import type { PromptSkill, PromptSkillVideoParams } from './types';

// ═══════════════ Seedance 2.5 ═══════════════

const SEEDANCE25_SHOT_RULE = `【Seedance 2.5 官方提示词规范 · 分镜生成阶段】
分镜"动作/画面描述"按 2.5 官方公式组织（完整提示词 = [素材说明] + [一句话概括] + [具体情节描述] + [全局补充]）：
1. 一句话概括：主体 + 地点 + 事件 + 主题/风格 + 特殊运镜，一句话讲清本镜核心。
2. 具体情节：按时间线写画面、运镜、动作、对白、音效和转场；动作要有起承转合（起始→过程→结束），一个镜头一个主动作。
3. 分段意识：5 秒镜头内动作自然完成；若本镜内部有多个小阶段，写明每个阶段的可见结束状态。
4. 镜头语言：景别（远景/全景/中景/近景/特写）+ 运镜（推/拉/摇/移/跟/升降/环绕/手持）+ 运动时机。
5. 对白与音效：写清说话人、台词内容与语气；动作音效、环境声。
6. 全局补充：锁定人物一致性（面容/发型/服装/体型）、环境与光线方向；禁止引入本镜不需要的新元素。
7. 语句通顺完整，前后镜头剧情连贯，资产（人物/场景/道具）跨镜头一致。`;

const SEEDANCE25_ASSET_RULE = `【Seedance 2.5 官方提示词规范 · 资产生成阶段】
2.5 支持最多 50 份多模态参考（Omni Reference），概念图按"素材说明"规则组织：
1. 角色概念图：正面全身/半身像，五官清晰、面部无遮挡、无大面积阴影/过曝，完整服装展示，中性背景，画面中只有该角色、无任何文字/字母/数字/logo/水印；作为"角色参考"锁定身份。
2. 场景概念图：空场景、无人物、透视正确、光影方向一致、无任何文字/招牌/水印；作为"场景参考"。
3. 道具概念图：单一物品、全貌清晰、中性背景、均匀光照、无文字水印；作为"道具参考"。
4. 每个概念图必须信息完整（外观/陈设/细节），供提示词中"@图片 N 用于角色/场景/道具"调度复用。`;

const SEEDANCE25_KEYFRAME_RULE = `【Seedance 2.5 官方提示词规范 · 关键帧生成阶段】
2.5 支持首帧、首尾帧输入：
1. 首帧：人物动作起始状态，表情自然，构图完整，与上一镜尾帧衔接。
2. 尾帧：动作完成状态，与首帧同一人物身份、同一场景、同一光线方向，不引入新物体。
3. 中间帧：身份/场景特征与首尾帧严格一致，仅动作进度不同。
4. 关键帧画面干净无文字/水印。`;

const SEEDANCE25_VIDEO_RULE = `【Seedance 2.5 官方提示词规范 · 视频生成阶段】
最终视频提示词按 2.5 官方四段公式组织：
完整提示词 = [素材说明] + [一句话概括] + [具体情节描述] + [全局补充]
1. 素材说明：按上传顺序写明每份参考素材用于角色、场景、动作、音色还是镜头参考（如"@图片 1 定义角色面容与服装，@图片 2 定义场景"）。
2. 一句话概括：主体 + 地点 + 事件 + 主题/风格 + 特殊运镜，一句话讲清本镜。
3. 具体情节：按时间线写画面、运镜、动作、对白、音效和转场；每个阶段一个主要变化，每阶段有可见结束状态。
4. 全局补充：再次锁定机位、环境、灯光、声音、人物一致性与禁止项（不引入参考中不存在的新物体）。
5. 中文提示词不超过 500 字（2.5 官方建议），分四行写，每行一个元素，不需要的段可省略。`;

function buildSeedance25Prompt(params: PromptSkillVideoParams): string {
  const chars = (params.charactersInShot || []).filter(Boolean);
  const lines: string[] = [];

  // 素材说明（按参考图角色）
  lines.push(`素材说明：@图片（角色参考）定义${chars.length > 0 ? chars.join('、') : '主体'}的面容/发型/服装/体型；@图片（场景参考）定义场景陈设/布局/光线方向。`);

  // 一句话概括：主体 + 地点 + 事件 + 主题/风格 + 特殊运镜
  const subject = chars.length > 0 ? chars.join('、') : '画面主体';
  const scene = params.sceneName || '当前场景';
  const summary = `一句话概括：${subject}在${scene}${params.actionDescription ? '，' + params.actionDescription.split('，')[0] : ''}；${params.stylePrompt || '电影级写实风格'}；${params.cameraMovement || '固定镜头'}。`;
  lines.push(summary);

  // 具体情节：按时间线写画面/运镜/动作/对白/音效/转场
  let plot = `具体情节：0-${params.duration || 5}秒，${params.actionDescription || ''}`;
  if (params.firstFrameDesc) plot += `。起点画面：${params.firstFrameDesc}`;
  if (params.lastFrameDesc) plot += `。终点画面：${params.lastFrameDesc}`;
  plot += `。运镜：${params.shotSize || '中景'}${params.cameraMovement ? '，' + params.cameraMovement : ''}，镜头运动与动作配合`;
  if (params.dialogue) plot += `。对白：${params.dialogue}（语气自然，口型/情绪同步）`;
  lines.push(plot);

  // 全局补充
  lines.push(`全局补充：人物身份、场景环境、光线方向与参考图严格一致；动作沿连续物理路径自然完成，不引入参考图中不存在的新物体；结尾定格明确状态；无字幕/水印。`);

  let prompt = lines.join('\n');
  if (prompt.length > 500) prompt = prompt.slice(0, 500);
  return prompt;
}

export const seedance25PromptSkill: PromptSkill = {
  id: 'seedance-2.5',
  displayName: 'Seedance 2.5 官方提示词',
  providers: ['seedance', 'doubao', 'volcengine', 'ark', 'jimeng'],
  modelKeys: ['seedance-2.5', 'seedance-2-5', 'seedance25', 'seedance-2-5-pro', 'seedance-2-5-turbo', 'seedance-2.5-pro', 'seedance-3'],
  docsUrl: 'https://docs.volcengine.com/docs/82379/2222480',
  skillUrl: 'https://www.hiapi.ai/zh/blog/seedance-2-5-user-guide',
  description: 'Seedance 2.5（即梦 Dreamina）官方提示词规范：四段公式[素材说明+一句话概括+具体情节+全局补充]、分段脚本、30-180秒长视频、时间戳控制、50份多模态参考。',
  modes: ['text2video', 'image2video', 'firstLastFrame', 'omniReference', 'longVideo'],
  shotRule: SEEDANCE25_SHOT_RULE,
  assetRule: SEEDANCE25_ASSET_RULE,
  keyframeRule: SEEDANCE25_KEYFRAME_RULE,
  videoRule: SEEDANCE25_VIDEO_RULE,
  buildVideoPrompt: buildSeedance25Prompt,
  keyframeAnchor: (frameType) => {
    if (frameType === 'first') {
      return '锚定：此为首帧画面（0.00秒），Seedance 2.5 首尾帧输入画面，人物动作起始状态，与上一镜尾帧衔接，画面干净无文字/水印。';
    }
    if (frameType === 'last') {
      return '锚定：此为尾帧画面，动作完成状态，与首帧同一身份/场景/光线，不引入新物体，画面干净无文字/水印。';
    }
    return '锚定：人物/场景/道具特征与首尾帧严格一致，仅动作进度不同，画面干净无文字/水印。';
  },
};

// ═══════════════ Seedance 2.0（含 1.x / 2.0 Mini / 2.0 Fast）═══════════════
// 官方规范来源：火山方舟《Doubao Seedance 2.0 系列提示词指南》docs/82379/2222480
// 2.0 全系列（含 Mini/Fast）共用此规范：进阶公式（精准主体+动作细节+场景环境+光影色调+
// 镜头运镜+视觉风格+画质+约束条件）、全模态参考/编辑视频/延长视频三类任务、镜头时序、
// 低缓连续动作、符号规范（台词{} 音效<> 音乐() 字幕【】）、官方约束词（无字幕/无水印）。

const SEEDANCE20_SHOT_RULE = `【Seedance 2.0 官方提示词规范 · 分镜生成阶段】
分镜"动作/画面描述"按 2.0 官方八段骨架组织（主体、场景、动作、运镜、分时段、转场特效、音频、风格；不必段段都写，关键别漏）：
1. 定义主体：角色用 2-3 个清晰稳定的静态特征（服装/发型/外观/类别）定义一次，后续用同一标签指代（如"警察"）；每次涉及主体都明确指代，可用"主体@参考图"绑定，避免省略、避免语义冲突。
2. 场景：主体在什么环境，写明地点/状态/光影，空间关系优先用参考图表达。
3. 动作：肢体细化 + 程度量化（缓慢抬手/快速转头/用力蹬地/微微低头）；优先低缓连续小动作（缓慢行走/轻轻抬手/顺势坐下），规避狂奔、大跳、剧烈翻滚等高爆发大动态动作；写明动作过渡衔接（借着转身惯性顺势抬手、从停顿自然过渡到举手）；情绪用具体身体细节外化（悲伤=低头+肩膀微微颤抖+眼眶泛红，紧张=频繁看表+手指敲击桌面），不用"很悲伤/非常愤怒"这类抽象词。
4. 运镜：用标准运镜术语（中景/特写/全景/缓慢推镜/平稳横移/固定镜头/环绕/跟拍）；一个镜头只指定 1 种运镜，不混用推拉摇移。
5. 分时段：多阶段动作按"镜头1/镜头2/镜头3"时间轴化组织（谁+在哪+做什么+镜头怎么动），按事件顺序先主后次，不写死秒数（模型对精确秒数支持不稳定）；每个镜头按：运镜/切换方式 → 主体动作与表情 → 位置/空间变化 → 音频信息。
6. 转场特效：本镜与上/下镜衔接方式（如需要）。
7. 音频：台词用{}括起（如{你好}，非中英文标注语种），音效用<>括起，音乐用()括起；写清说话人、内容与语气。
8. 风格与画质：写清视觉风格（电影质感/复古胶片/日系清新等）与情绪基调；约束无字幕、无文字、无水印。
语句通顺完整，剧情前后连贯，人物/场景/道具资产跨镜头一致。`;

const SEEDANCE20_ASSET_RULE = `【Seedance 2.0 官方提示词规范 · 资产生成阶段】
2.0 支持全模态参考（图片/视频/音频），概念图作为"角色/场景/道具参考"必须满足：
1. 角色概念图：正面全身/半身像，五官清晰、面部无遮挡、无大面积阴影/过曝，完整服装展示，中性背景，画面中只有该角色、无任何文字/字母/数字/logo/水印。
2. 防 ID 漂移（官方方案）：为每个角色另备一张"人脸特写图"（大头照，仅保留面部，无表情最佳，尽量减少肩颈/背景干扰），与全身照组合锁定身份；提示词写清"<主体>的面部特征参考图片1（大头照），妆造参考图片2（全身照）"，重要素材在提示词中越靠前越精准。
3. 场景概念图：空场景、无人物、透视正确、光影方向一致、无任何文字/招牌/水印。
4. 道具概念图：单一物品、全貌清晰、中性背景、均匀光照、无文字水印。
5. 人物参考不使用三视图/多视图（模型易识别为多个不同主体，反而加剧 ID 漂移）；单镜参考人物超过 4 人时分批生成图片再图生视频。
6. 素材配置建议 4-5 个即可：角色图 1-2 张（面部特写/全身）+ 场景图 1 张 + 运镜视频 1 段 + 音频 1 段；不要用满上限，过多素材会风格冲突、主体识别模糊。`;

const SEEDANCE20_KEYFRAME_RULE = `【Seedance 2.0 官方提示词规范 · 关键帧生成阶段】
首帧/尾帧作为 Seedance 2.0 image2video / 首尾帧输入画面：
1. 首帧：人物动作起始状态，表情自然，构图完整，与上一镜尾帧衔接。
2. 尾帧：动作完成状态，与首帧同一人物身份、同一场景、同一光线方向，不引入新物体。
3. 中间帧：身份/场景特征与首尾帧严格一致，仅动作进度不同。
4. 关键帧画面干净，无文字/字幕/水印/Logo（官方约束词：保持无字幕、避免生成任何文字或字幕、不要生成水印、不要生成Logo）。`;

const SEEDANCE20_VIDEO_RULE = `【Seedance 2.0 官方提示词规范 · 视频生成阶段】
最终视频提示词按 2.0 官方进阶公式组织：
精准主体 + 动作细节 + 场景环境 + 光影色调 + 镜头运镜 + 视觉风格 + 画质 + 约束条件
1. 精准主体：谁。引用参考图身份，写清"<主体>@图片N"或"将图片N中的[2-3个静态特征]定义为主体N"；角色名后标注对应参考图（张三对应图片1），保持格式统一。
2. 动作细节：做什么。一条提示词一个主动作，肢体细化+程度量化，动作有起承转合，优先低缓连续小动作；用身体细节外化情绪。
3. 场景环境：沿用场景参考图（陈设/布局/光线方向）。
4. 光影色调：光线氛围与色调。
5. 镜头运镜：景别 + 运镜（只 1 种）+ 运动时机。
6. 视觉风格：预设风格/电影质感（如"2D日漫风格"等明确风格词防风格漂移）。
7. 画质：高清、细节丰富、电影质感、色彩自然、光影柔和。
8. 约束条件（官方约束词）：保留参考图中人物身份/构图/光线/场景布局，动作沿连续物理路径自然完成，不引入参考图中不存在的新物体；"保持无字幕"、"避免生成任何文字或字幕"、"不要生成水印"、"不要生成Logo"；多角色画面末尾追加"视频全程禁止出现外形、着装、配饰完全一致的人物，禁止同款分身、双胞胎效果，同一画面仅保留单个对应人物"。
多阶段动作按"镜头1/镜头2/镜头3"时间轴化组织（运镜/切换 → 动作与表情 → 空间变化 → 音频），不写死秒数；台词用{}括起（非中英文标注语种）、音效<>、音乐()；有参考音频时补充音色特征（如"使用@音频1低厚温润带细碎颗粒感中年男声的音色说"）；中文提示词不超过 500 字。`;

function buildSeedance20Prompt(params: PromptSkillVideoParams): string {
  const chars = (params.charactersInShot || []).filter(Boolean);
  const hasChars = chars.length > 0;

  // 官方句式：将图片N中的[主体]定义为主体N，持续用同一标签指代
  const subject = hasChars
    ? `主体：${chars.join('、')}。${chars.map((c, i) => `将图片${i + 1}中的[${c}]定义为主体${i + 1}`).join('，')}；面部特征参考人脸特写图（大头照），妆造参考全身照；`
    : '主体：画面主体（严格保持参考图身份：面容/发型/服装/道具一致）。';

  let action = params.actionDescription || '';
  if (params.firstFrameDesc) action += `；动作起点：${params.firstFrameDesc}`;
  if (params.lastFrameDesc) action += `；动作终点：${params.lastFrameDesc}`;
  action += '；肢体细化、程度量化，动作有起承转合，优先低缓连续小动作，写明动作过渡衔接';

  const scene = params.sceneName ? `场景：${params.sceneName}（沿用场景参考图的陈设/布局/光线方向）` : '场景：沿用场景参考图';
  const camera = `镜头：${params.shotSize || '中景'}，${params.cameraMovement || '固定镜头'}（一个镜头只 1 种运镜，镜头运动与动作配合）`;
  // 官方符号规范：台词{} / 音效<> / 音乐()
  const dialogue = params.dialogue ? `台词：{${params.dialogue}}（说话人语气自然，口型/情绪同步）` : '';
  const style = params.stylePrompt ? `风格：${params.stylePrompt}` : '风格：电影质感，色彩自然，光影柔和';
  const constraints = [
    '约束：保留参考图中的人物身份/构图/光线/场景布局，动作沿连续物理路径自然完成，不引入参考图中不存在的新物体',
    '保持无字幕，避免生成任何文字或字幕，不要生成水印，不要生成Logo',
    hasChars && chars.length > 1 ? '视频全程禁止出现外形、着装、配饰完全一致的人物，禁止同款分身、双胞胎效果，同一画面仅保留单个对应人物' : '',
    '5 秒内动作有起承转合，结尾定格明确状态',
    '画质高清、细节丰富、电影质感',
  ].filter(Boolean).join('；');

  let prompt = [subject, `动作：${action}`, scene, camera, dialogue, style, constraints].filter(Boolean).join('\n');
  if (prompt.length > 500) prompt = prompt.slice(0, 500);
  return prompt;
}

export const seedance20PromptSkill: PromptSkill = {
  id: 'seedance-2.0',
  displayName: 'Seedance 2.0 官方提示词',
  providers: ['seedance', 'doubao', 'volcengine', 'ark', 'jimeng'],
  modelKeys: ['seedance-2-0-mini', 'seedance-2-0-fast', 'seedance-2.0-mini', 'seedance-2.0-fast', 'seedance-2-0', 'seedance-2.0', 'seedance20', 'seedance-1', 'seedance-1.0', 'seed-1', 'seed-2'],
  docsUrl: 'https://docs.volcengine.com/docs/82379/2222480',
  skillUrl: 'https://seed.bytedance.com/zh/blog/official-launch-of-seedance-2-0',
  description: 'Seedance 2.0 系列（含 2.0 / 2.0 Mini / 2.0 Fast 与 1.x）官方提示词规范：进阶公式（主体+动作+场景+光影+运镜+风格+画质+约束）、八段骨架、全模态参考/编辑/延长三类任务、镜头时序、低缓连续动作、符号规范（台词{}/音效<>/音乐()）、官方约束词（无字幕/无水印）、500 字上限。',
  modes: ['text2video', 'image2video', 'firstLastFrame', 'reference2video', 'fullModalReference', 'editVideo', 'extendVideo'],
  shotRule: SEEDANCE20_SHOT_RULE,
  assetRule: SEEDANCE20_ASSET_RULE,
  keyframeRule: SEEDANCE20_KEYFRAME_RULE,
  videoRule: SEEDANCE20_VIDEO_RULE,
  buildVideoPrompt: buildSeedance20Prompt,
  keyframeAnchor: (frameType) => {
    if (frameType === 'first') {
      return '锚定：此为首帧画面（0.00秒），Seedance 2.0 image2video 输入画面，人物动作起始状态，与上一镜尾帧衔接，画面干净无文字/水印。';
    }
    if (frameType === 'last') {
      return '锚定：此为尾帧画面，动作完成状态，与首帧同一身份/场景/光线，不引入新物体，画面干净无文字/水印。';
    }
    return '锚定：人物/场景/道具特征与首尾帧严格一致，仅动作进度不同，画面干净无文字/水印。';
  },
};

