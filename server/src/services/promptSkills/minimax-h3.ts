// MiniMax H3（海螺3.0）官方提示词 Skill
// 规范来源：
//  - MiniMax 官方 API 文档 / 官方 h3-prompt-writing Skill
//    https://github.com/MiniMax-AI/MiniMax-H3/tree/main/skills
//  - MiniMax H3 分镜提示词生成 Skill（社区官方模板）
//    https://github.com/sjh00/MiniMax-H3-Storyboard-Prompt-Generator-Skill
//  - 官方发布说明：2K/24fps/4-15秒，768P 与 2K 档位，提示词上限 7000 字符
// 核心写法（官方提炼）：
//  基础公式 = 主要表现物 + 场景空间 + 运动/变化
//  精确公式 = 主要表现物 + 场景空间 + 运动/变化 + 镜头运动 + 美感氛围
//  官方三段式（h3-prompt-writing）：
//    integrated_multimodal_description: 按时间线写画面/动作/运镜/台词（[Shot 1] 开头，切镜 [Shot N]，同镜头变化 At MM:SS.mmm）
//    overall_soundscape: 环境声/动作声/非语言人声（1-4 句）
//    non_diegetic_music: 画外配乐（1-3 句，无则 N/A）
//  首尾帧（FL2VA）：两张图分别对齐开头与结尾，描述连续、符合物理逻辑的中间路径
//  图生视频（I2VA）：先锚定 Picture 1 于 0.00 秒，保留人物/构图/光线，再描述画面如何向前发展

import type { PromptSkill, PromptSkillVideoParams } from './types';

const SHOT_SIZE_LABELS: Record<string, string> = {
  extreme_wide: '大远景，交代环境全貌',
  long: '远景，人物全身与环境关系',
  full: '全景，完整动作',
  medium: '中景，人物膝盖以上',
  medium_closeup: '近景，人物胸部以上',
  closeup: '特写，人物肩部以上，情绪聚焦',
  extreme_closeup: '大特写，眼睛/手部/物品细节',
};

const CAMERA_LABELS: Record<string, string> = {
  push_in: '镜头缓慢推近，聚焦主体',
  pull_out: '镜头缓慢拉远，展现场景',
  pan: '镜头水平摇移，跟随动作',
  tilt: '镜头垂直升降',
  truck: '摄像机平行移动跟随人物',
  crane: '镜头升降运动，宏大场面',
  handheld: '手持镜头，轻微晃动，纪实紧张感',
  steadicam: '稳定器平滑跟随，长镜头',
  static: '固定镜头，稳定画面',
};

/** 景别中文标签（缺省返回原值） */
function shotLabel(size?: string): string {
  return (size && SHOT_SIZE_LABELS[size]) || size || '中景';
}

/** 运镜中文标签（缺省返回原值） */
function camLabel(move?: string): string {
  return (move && CAMERA_LABELS[move]) || move || '固定镜头';
}

export const minimaxH3PromptSkill: PromptSkill = {
  id: 'minimax-h3',
  displayName: 'MiniMax H3（海螺3.0）官方提示词',
  providers: ['minimax', 'comfyui'],
  modelKeys: ['minimax-h3', 'minimaxh3', 'h3', 'minimax-h3-flf2v', 'flf2v', 'hailuo3', 'hailuo-3'],
  docsUrl: 'https://platform.minimaxi.com/docs',
  skillUrl: 'https://github.com/MiniMax-AI/MiniMax-H3/tree/main/skills',
  description:
    'MiniMax H3 官方提示词规范：2K/24fps/4-15秒，原生立体声；' +
    '提示词按【主体+动作+场景+镜头+美感氛围】公式撰写，一条提示词只讲一个动作；' +
    '官方三段式结构：integrated_multimodal_description（时间线画面/动作/台词）+ overall_soundscape（环境声）+ non_diegetic_music（配乐）；' +
    '首尾帧模式把首尾图分别对齐开头与结尾，描述中间物理路径；参考图管身份、提示词管动作。',
  modes: ['T2VA 文生视频', 'I2VA 首帧图生', 'FL2VA 首尾帧', 'L2VA 尾帧', 'Ref2VA 多参考'],

  // ═══ 分镜生成阶段：官方镜头动作/画面写法 ═══
  shotRule: `【MiniMax H3 官方提示词规范 · 分镜阶段】（视频模型为 MiniMax H3 时必须遵守）
- 官方公式：一条提示词 = 主要表现物（主体） + 场景空间 + 运动/变化 + 镜头运动 + 美感氛围。
- 一条提示词只讲一个动作：H3 单次生成 4-15 秒，写「她推开门，回头一笑」远好于「她推开门、穿过走廊、坐下、开始打字」。每个镜头的 actionDescription 必须聚焦一个核心动作弧，禁止堆叠多个无关动作。
- 动作必须写出可见的时间变化：起始状态 → 动作过程 → 结束状态，让模型知道画面随时间如何演变，而不是只描述一张静态画面。
- 把镜头运动写明白：推（push in）、拉（pull out）、摇（pan）、移（truck）、升（crane）、手持（handheld）、固定（static）等镜头语言是视频提示词与图片提示词最大的差别；不写运镜默认是静止机位。
- 写声音：H3 原生生成音频，把环境音（雨声、街市声）、动作音（脚步声、挥鞭声）、台词写进描述，成片完成度更高。
- 先定光和色：一句配色/打光（如「冷蓝夜景+霓虹反光」「暖金色黄昏逆光」）决定整条片子的质感。
- 给出速度和节奏：慢动作、实时、延时，以及动作发生在第几秒；不写节奏模型会自己均分时间，常常慢半拍。
- 写画幅和落点：明确横竖屏（16:9/9:16），顺手写一句结尾停在哪个画面（如「最后定格在鞭子落下的瞬间」），剪辑时省事。
- 语言要求：画面结构描述尽量具体可执行，避免抽象形容词堆砌；台词保持原文。`,

  // ═══ 资产提取阶段（角色/场景概念图）：官方参考图写法 ═══
  assetRule: `【MiniMax H3 官方提示词规范 · 资产生成阶段】
- 参考图管身份，提示词管动作：角色/场景概念图是后续视频生成锁定身份的唯一锚点，必须清晰完整。
- 角色概念图：正面全身、正对镜头或轻微侧对镜头、五官清晰、面部不可遮挡、无大面积阴影或过曝、自然光色；纯色/白底、双臂自然下垂、手里不拿物品、画面只有一个人，避免正侧角度或五官不在画面内。
- 场景概念图：完整场景空间、透视准确、光影方向一致、陈设细节明确、无人物，画面中绝对不能出现任何文字/字母/数字/logo/招牌。
- 一致性原则：后续每个镜头的视频提示词都严格引用这些参考图锁定身份（面孔、服装、道具），提示词只描述动作与镜头。`,

  // ═══ 关键帧生成阶段：官方首帧/尾帧锚定写法 ═══
  keyframeRule: `【MiniMax H3 官方提示词规范 · 关键帧阶段】
- 图生视频（I2VA）：首帧是 0.00 秒的真实画面，描述后续动作前先保留首帧已确定的人物身份、服装、物体、光线方向、空间关系和构图；不要把整张图重新发明一遍，也不要随意加入原图没有的物体。
- 首尾帧（FL2VA）：首帧对齐视频开头、尾帧对齐视频结尾，中间路径必须连续、符合物理逻辑（颜色/光线/建筑/主体姿势构成自然的变形桥梁），转场过程中保持主体稳定。
- 首尾帧必须存在明确的状态差异（如首帧举鞭欲抽 → 尾帧鞭已抽下），差异越大视频动作越明显。
- 每个关键帧必须保持与角色/场景参考图一致的面孔、服装、道具和整体构图。`,

  // ═══ 视频生成阶段：官方三段式结构 ═══
  videoRule: `【MiniMax H3 官方提示词规范 · 视频生成阶段】
- 提示词上限 7000 字符，简洁的指导比堆砌形容词更有效。
- 官方三段式结构（h3-prompt-writing Skill）：
  1) integrated_multimodal_description：按时间线写画面、动作、运镜与台词。从 [Shot 1] 开始；只有真实切镜才增加 [Shot N]；同一镜头内的变化使用 At MM:SS.mmm。
  2) overall_soundscape：环境声、动作声和非语言人声（1-4 句）。不要重复台词；明确要求全片静音时写 N/A。
  3) non_diegetic_music：角色听不到的画外配乐（1-3 句，描述乐器/速度/节奏/动态）；没有配乐时写 N/A。
- 首尾帧（FL2VA）模式：首尾两张图分别对齐开头与结尾时间，描述一条连续、符合物理逻辑的中间路径；先保留首尾帧已确定的人物身份/服装/构图/光线，再描述动作如何展开。
- 参考图管身份、提示词管动作：人物长相、服装、道具交给参考图锁定，提示词专注写动作、镜头、光线、声音。
- 一个时刻只选一种主要运镜，避免同时堆叠环绕、推轨、手持、微距和摇臂。`,

  // ═══ 官方视频提示词模板（FL2VA 首尾帧 / I2VA 首帧 / T2VA 文生）═══
  // 入参 actionDescription 为已优化好的完整画面描述（含景别/镜头/画面内容/风格/角色一致性/场景锚），
  // 此处按官方三段式结构（h3-prompt-writing）包装：时间线描述 + 环境声 + 画外配乐。
  buildVideoPrompt(params: PromptSkillVideoParams): string {
    const action = (params.actionDescription || '').trim();
    const duration = params.duration || 5;
    const ratio = params.ratio || '16:9';
    const dialogue = (params.dialogue || '').trim();

    // —— 首尾帧/首帧锚定（FL2VA / I2VA 官方对齐规则）——
    let anchor = '';
    if (params.isFirstLastFrame) {
      anchor = `，首帧画面（<Picture 1>，0.00秒）与尾帧画面（<Picture 2>，${Math.max(4, duration)}.000秒）已给出：首帧为动作起始状态、尾帧为动作结束状态；必须保留首尾帧中的人物身份（面孔/服装/道具）、构图、光线方向与场景布局，动作沿一条连续、符合物理逻辑的中间路径从首帧状态发展到尾帧状态，不引入首尾帧中不存在的新物体`;
    } else if (params.isImageToVideo) {
      anchor = `，首帧画面（<Picture 1>，0.00秒）已给出：必须保留首帧中的人物身份（面孔/服装/道具）、构图、光线方向与场景布局，动作从首帧状态开始向前发展，不引入首帧中不存在的新物体`;
    }

    // 时间线描述：官方要求从 [Shot 1] 开始，按时间顺序写画面/动作/镜头/台词
    let timeline = `integrated_multimodal_description: [Shot 1] ${action}`;
    if (anchor) timeline += anchor;
    if (dialogue) {
      timeline += `。台词：${dialogue}（由画面中对应角色说出，口型与台词同步）`;
    }
    timeline += `。动作在 ${duration} 秒内自然完成，节奏实时，结尾定格在动作完成后的明确状态。画面比例为${ratio}，24fps，电影级完成度。`;

    // 环境声：官方字段 overall_soundscape（不重复台词）
    const soundscape = `overall_soundscape: ${
      dialogue ? '对白由画面中说话的角色发出，口型与台词同步；' : '无对白；'
    }动作声（脚步声/衣料摩擦/动作音效）与环境底噪（场景氛围音）自然呈现，符合场景氛围。`;

    // 画外配乐：官方字段 non_diegetic_music
    const music = `non_diegetic_music: 克制的背景配乐，节奏与画面情绪同步，不压过对白与动作声。`;

    const prompt = `${timeline}\n${soundscape}\n${music}`;
    // 官方上限 7000 字符
    return prompt.length > 7000 ? prompt.substring(0, 6997) + '...' : prompt;
  },

  keyframeAnchor(frameType: 'first' | 'last' | 'middle'): string {
    if (frameType === 'first') {
      return '（H3 I2VA 锚定：本帧作为视频 0.00 秒真实首帧，后续动作从此帧状态开始发展；必须保持与角色/场景参考图一致的面孔、服装、道具与构图）';
    }
    if (frameType === 'last') {
      return '（H3 FL2VA 锚定：本帧作为视频结尾帧，与首帧之间有明确状态差异，动作沿连续物理路径从首帧发展到本帧；保持与角色/场景参考图一致的面孔、服装、道具与构图）';
    }
    return '（H3 中间帧：展现动作高潮瞬间，保持与首尾帧及参考图一致的造型与场景）';
  },
};
