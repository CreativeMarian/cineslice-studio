// 场景提取提示词 — shuohao novel-art 设计
// 核心原则：场景是叙事空间，必须精确到可以直接出图
//   1. visual_prompt      — 场景形象提示词（布局/家具/灯光/氛围/时间，直接用于出图）
//   2. consistency_anchor — 一致性锚点（该场景最核心的不变特征，跨镜头必须保持）
//   3. lighting_variants  — 光照变体（白天/黄昏/夜晚的不同光照描述）
//
// 质量门：每个场景必须有 visual_prompt，叙事关键场景必须有 consistency_anchor

export interface SceneExtractOutput {
  name: string;
  location: string;
  time_of_day: 'day' | 'night' | 'dawn' | 'dusk';
  atmosphere: string;
  description: string;
  visual_prompt: string;          // 场景形象提示词，用于出图
  consistency_anchor: string;     // 一致性锚点：最核心的不变特征
  lighting_variants: string;      // 光照变体 JSON: {"day":"...","dusk":"...","night":"..."}
  scale_reference: string;        // 尺度参照：空间大小、人物与空间的比例
}

export function buildSceneExtractPrompt(scriptContent: string): string {
  return `你是专业的影视美术指导。从以下剧本中提取所有重要场景（发生对话或关键动作的地点）。

【输出要求】
对每个场景输出 JSON 对象，包含以下字段：

1. name — 场景名（简洁明确，如"林墨公寓客厅""公司会议室""雨夜街道"）
2. location — 具体地点描述（城市/建筑/房间类型）
3. time_of_day — day（白天）/ night（夜晚）/ dawn（黎明）/ dusk（黄昏）
4. atmosphere — 氛围关键词（2-3个，如"压抑""温馨""紧张""破败"）
5. description — 场景描述（50-100字）：空间功能、在剧情中的作用、关键事件
6. visual_prompt — 场景形象提示词（不少于40字，用于AI出图，必须具体）：
   - 空间布局（开间/进深/层高）
   - 主要家具和物品（具体位置关系）
   - 墙面/地面/天花板材质颜色
   - 光源类型和位置（窗户/吊灯/台灯/霓虹灯）
   - 装饰细节（挂画/绿植/杂物/污渍等）
   - 时间对应的光线效果
   格式示例："30平米现代公寓客厅，浅灰色L型沙发靠西墙，前方黑色茶几，东侧整面落地窗配白色纱帘，下午阳光斜照入内，地面浅木色地板，墙上挂抽象装饰画，角落有绿植，整体简洁明亮"
7. consistency_anchor — 一致性锚点（20-40字）：
   该场景最核心、跨镜头绝对不能变的特征（如"红色大门+门牌号302""落地窗+城市天际线""老旧木质吧台+镜面墙"）
8. lighting_variants — 光照变体（JSON字符串）：
   该场景在不同时间段的光照描述，格式 {"day":"...","dusk":"...","night":"..."}
   至少包含当前 time_of_day 对应的描述
9. scale_reference — 尺度参照（15-30字）：
   空间大小感、人物与空间的比例关系（如"狭长走廊，两人并排勉强通过""开阔大厅，可容纳20人"）

【重要规则】
- 只提取剧本中实际发生事件的场景，不要编造
- visual_prompt 必须具体到可以直接出图，禁止"漂亮""豪华"等空泛描述
- 场景概念图严格要求：无人、无手、纯白/中性背景，只有场景环境
- consistency_anchor 是跨镜头一致性的核心，必须选取最有辨识度的特征
- 按出场顺序排列

剧本内容：
${scriptContent}`;
}
