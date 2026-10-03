// 小说转剧本提示词 — shuohao novel-script 设计
// 核心原则：场次 + 节拍流（动作与台词交替），逐集时长按语速确定性折算
//
// 剧本结构：
//   场次（scene）：场景名、时间、地点
//   节拍流（beats）：动作节拍与台词节拍交替
//     - 动作节拍：{ type: 'action', content: '林墨推门进入房间' }
//     - 台词节拍：{ type: 'dialogue', character: '林墨', content: '你来了' }
//
// 质量门：每集时长按 4.5字/秒 折算，钩子前3拍冷开场兑现

export interface ScriptBeat {
  type: 'action' | 'dialogue';
  character?: string;   // 台词节拍时必填
  content: string;
}

export interface ScriptScene {
  scene_name: string;
  location: string;
  time_of_day: string;
  beats: ScriptBeat[];
}

export interface StructuredScript {
  episode_title: string;
  total_duration_seconds: number;  // 按语速折算的总时长
  scenes: ScriptScene[];
}

export function buildNovelToScriptPrompt(
  novelContent: string,
  options?: { genre?: string; targetDurationSeconds?: number },
): string {
  const genre = options?.genre || '都市短剧';
  const targetDuration = options?.targetDurationSeconds || 90; // 默认90秒/集

  return `你是专业的短剧编剧。将以下小说内容改编为${genre}剧本。

【剧本结构：场次 + 节拍流】
输出结构化 JSON，包含：
- episode_title — 本集标题
- total_duration_seconds — 按语速折算的总时长（中文台词4.5字/秒，动作节拍每条约2-3秒）
- scenes — 场次数组，每个场次包含：
  - scene_name — 场景名
  - location — 地点
  - time_of_day — 时间（白天/夜晚/黄昏/黎明）
  - beats — 节拍流数组，动作与台词交替：
    - 动作节拍：{ "type": "action", "content": "林墨推门进入房间，神色紧张" }
    - 台词节拍：{ "type": "dialogue", "character": "林墨", "content": "你来了" }

【改编要求】
- 保留核心剧情和人物关系
- 目标时长约 ${targetDuration} 秒（约${Math.round(targetDuration / 60)}分钟），台词按4.5字/秒折算
- 每集开头前3拍必须是冷开场（直接进入冲突/悬念，不做铺垫）
- 对话简洁有力，每句不超过20字，有戏剧冲突
- 动作节拍描述具体可见的动作，不写心理活动
- 场景切换明确，每场有明确的时间地点
- 每集结尾留钩子（悬念/反转/情绪爆发）

【节拍流规则】
- 动作和台词交替出现，避免连续3个以上同类型节拍
- 动作节拍：描述角色的具体动作、表情、环境变化
- 台词节拍：角色名 + 台词内容，台词必须口语化
- 纯动作场景可以连续2-3个动作节拍
- 对话场景动作和台词交替

【时长折算规则】
- 台词节拍：中文字数 ÷ 4.5 = 所需秒数
- 动作节拍：每条约 2-3 秒
- 总时长 = 所有节拍时长之和，目标 ${targetDuration} 秒左右

小说内容：
${novelContent}`;
}
