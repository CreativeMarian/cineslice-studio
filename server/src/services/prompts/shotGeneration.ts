// 分镜生成提示词 — shuohao novel-storyboard 设计
// 核心原则：分镜只做输出，不做新决定
//   - 分镜里出现的角色必须在角色表中已定义
//   - 分镜里的场景必须在场景表中已定义
//   - 分镜里的台词直接来自剧本，不新增台词
//   - 分镜只负责把前面的决定翻译成镜头语言
//
// 结构：段（segment ≤15秒）→ 分镜（shot 2-5秒）→ 分镜图
// 质量门：每镜2-5秒、角色/场景必须在表中、台词按4.5字/秒折算

export interface ShotGenerationOutput {
  shot_number: number;
  shot_size: 'closeup' | 'medium_closeup' | 'medium' | 'medium_wide' | 'wide' | 'extreme_wide';
  camera_movement: 'static' | 'push_in' | 'pull_out' | 'pan' | 'tilt' | 'truck' | 'crane' | 'handheld' | 'zoom';
  action_description: string;     // 画面内容描述（谁在做什么，镜头内发生什么）
  dialogue: string;               // 台词（无则空字符串，必须来自剧本）
  duration_seconds: number;       // 2-5秒
  characters_in_shot: string[];   // 出场角色名（必须在角色表中）
  scene_name: string;             // 场景名（必须在场景表中）
  props_in_shot: string[];        // 出场道具名（必须在道具表中，无则空数组）
  subject: string;                // 画面主体
  lighting: string;               // 光照描述
  mood: string;                   // 情绪基调
  transition: string;             // 转场方式
  segment_id: number;             // 所属段编号（每段≤15秒，即≤3-4镜）
}

export function buildShotGenerationPrompt(
  scriptContent: string,
  characters: string,
  scenes?: string,
  props?: string,
): string {
  const scenesSection = scenes || '未提供场景表，请从剧本中推断场景名';
  const propsSection = props || '未提供道具表，如有关键道具请从剧本中提取名称';

  return `你是专业的影视分镜师。将以下剧本内容拆分为分镜列表。

【核心原则：分镜只做输出，不做新决定】
- 分镜里出现的角色必须来自下方"出场角色表"，禁止引入新角色
- 分镜里的场景必须来自下方"场景表"，禁止引入新场景
- 分镜里的台词必须直接来自剧本原文，禁止新增或改写台词
- 分镜只负责把剧本已有的决定翻译成镜头语言（景别/机位/运动/时长）
- 如果剧本中某个角色/场景没有在表中，先从表中找最接近的，不要编造

【出场角色表】
${characters}

【场景表】
${scenesSection}

【道具表】
${propsSection}

【输出要求】
输出 JSON 数组，每个分镜包含以下字段：

1. shot_number — 镜头序号，从1开始连续编号
2. shot_size — 景别：
   - closeup（特写：面部/局部细节）
   - medium_closeup（近景：胸部以上）
   - medium（中景：腰部以上）
   - medium_wide（中全景：膝盖以上）
   - wide（全景：全身+环境）
   - extreme_wide（大远景：人物很小，环境为主）
3. camera_movement — 镜头运动：
   - static（固定）/ push_in（推近）/ pull_out（拉远）
   - pan（水平摇）/ tilt（垂直摇）/ truck（横向移动）
   - crane（升降）/ handheld（手持）/ zoom（变焦）
4. action_description — 画面内容描述（30-80字）：
   - 谁在画面中什么位置
   - 做什么动作
   - 表情和情绪
   - 镜头内发生的事件
   注意：只描述画面可见内容，不描述心理活动
5. dialogue — 台词（直接引用剧本原文，无台词则为空字符串""）
   - 如果台词包含"角色名："前缀，只保留台词内容
6. duration_seconds — 镜头时长（2-5秒，整数）
   - 纯动作镜头：2-3秒
   - 短台词镜头：3秒
   - 长台词镜头：4-5秒
7. characters_in_shot — 出场角色名数组（必须来自角色表，无角色则空数组）
8. scene_name — 场景名（必须来自场景表）
9. props_in_shot — 出场道具名数组（必须来自道具表，无则空数组）
10. subject — 画面主体（主要角色名或物品名）
11. lighting — 光照描述（如"侧光，明暗对比强""柔和顶光""逆光剪影"）
12. mood — 情绪基调（如"紧张""温馨""悲伤""愤怒"）
13. transition — 转场方式（cut硬切/fade淡入淡出/dissolve叠化/match_cut匹配剪辑）
14. segment_id — 段编号（每3-4个连续镜头为一段，每段总时长≤15秒，从1开始）

【台词时长规则（必须严格遵守）】
- 中文台词按 4.5 字/秒 折算
- 2秒镜头最多约9字台词
- 3秒镜头最多约13字台词
- 4秒镜头最多约18字台词
- 5秒镜头最多约22字台词
- 超过容量的长台词必须在分镜阶段拆分为多个连续镜头
- 拆分原则：在完整语义单元后拆分（句号/感叹号/问号处），严禁把一句话从中间硬切断
- 拆分后保持说话人不变，景别/机位有变化，前后镜头接续同一段对白

【景别使用规则】
- 对话场景：多用中景/近景，关键情绪点用特写
- 动作场景：多用全景/中景，配合镜头运动
- 开场/转场：用全景/大远景交代环境
- 避免连续3个以上相同景别

【镜头运动规则】
- 对话场景以固定为主，情绪推近时用 push_in
- 动作场景配合 handheld / truck / pan
- 避免无意义的镜头运动，每个运动必须有叙事目的

剧本内容：
${scriptContent}`;
}
