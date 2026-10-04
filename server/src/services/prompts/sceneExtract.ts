// 场景提取提示词 — shuohao novel-art 设计
// 核心原则：场景是叙事空间，必须精确到可以直接出图
//   1. visual_prompt      — 场景形象提示词（布局/家具/灯光/氛围/时间，直接用于出图）
//   2. consistency_anchor — 一致性锚点（该场景最核心的不变特征，跨镜头必须保持）
//   3. lighting_variants  — 光照变体（白天/黄昏/夜晚的不同光照描述）
//   4. spatial_layout     — 空间坐标体系（道具/家具在画面中的位置，P0-2 新增）
//   5. lighting           — 灯光体系（主光/补光/轮廓光/环境光，P0-2 新增）
//
// 质量门：每个场景必须有 visual_prompt，叙事关键场景必须有 consistency_anchor

import type { SpatialLayoutItem, LightingConfig } from '../../types';

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
  // P0-2: 空间坐标体系 + 灯光体系（下游由 normalizeSpatialLayout / normalizeLighting 消费）
  spatial_layout: SpatialLayoutItem[];  // 道具列表：name + x(0-1) + y(0-1) + position
  lighting: LightingConfig;             // key_light/fill_light/rim_light/ambient
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
10. spatial_layout — 空间布局（JSON数组，P0-2）：
    列出该场景画面内的关键家具/道具，每项包含：
    - name — 道具/家具名（如"沙发""落地灯""茶几""办公桌"）
    - x — 相对画面X坐标（0-1，0=最左，1=最右）
    - y — 相对画面Y坐标（0-1，0=最上，1=最下）
    - position — 文字位置描述（如"画面左侧靠墙""窗边""画面中央"）
    格式示例：[{"name":"L型沙发","x":0.2,"y":0.6,"position":"画面左侧靠墙"},{"name":"落地灯","x":0.85,"y":0.4,"position":"画面右后角"}]
    无关键道具时输出空数组 []
11. lighting — 灯光配置（JSON对象，P0-2）：
    - key_light（必填）— 主光：position（光源位置，如"左上方45度""窗外"）、color（如"暖白色"）、intensity（如"柔和""强烈"）
    - fill_light（可选）— 补光：同上
    - rim_light（可选）— 轮廓光：position + color
    - ambient（可选）— 环境光描述（如"窗外透入的月光""室内昏暗的暖光"）
    格式示例：{"key_light":{"position":"左上方45度","color":"暖白色","intensity":"柔和"},"fill_light":{"position":"正前方","color":"白色","intensity":"弱"},"ambient":"窗外透入的月光"}
    必须至少包含 key_light。

【输出格式】
直接输出 JSON 数组（不要输出任何解释文字），每个场景一个对象，字段名必须与上面完全一致（英文键名）：
[
  {
    "name": "林墨公寓客厅",
    "location": "城市普通公寓，客厅",
    "time_of_day": "day",
    "atmosphere": "温馨",
    "description": "林墨与苏晚第一次正式交谈的地点，茶几上放着两杯咖啡",
    "visual_prompt": "30平米现代公寓客厅，浅灰色L型沙发靠西墙，前方黑色茶几，东侧整面落地窗配白色纱帘，下午阳光斜照入内，地面浅木色地板，墙上挂抽象装饰画，角落有绿植，整体简洁明亮",
    "consistency_anchor": "L型浅灰沙发+落地窗白纱帘",
    "lighting_variants": "{\"day\":\"下午自然光，斜照入内\",\"dusk\":\"暖黄色灯光渐亮\",\"night\":\"室内暖光吊灯，窗外夜色\"}",
    "scale_reference": "中等大小客厅，沙发可坐三人",
    "spatial_layout": [{"name":"L型沙发","x":0.2,"y":0.6,"position":"画面左侧靠墙"},{"name":"茶几","x":0.45,"y":0.65,"position":"画面中央"},{"name":"落地灯","x":0.85,"y":0.4,"position":"画面右后角"}],
    "lighting": {"key_light":{"position":"左上方45度","color":"暖白色","intensity":"柔和"},"fill_light":{"position":"正前方","color":"白色","intensity":"弱"},"ambient":"落地窗透入的下午阳光"}
  }
]

【重要规则】
- 只提取剧本中实际发生事件的场景，不要编造
- visual_prompt 必须具体到可以直接出图，禁止"漂亮""豪华"等空泛描述
- 场景概念图严格要求：无人、无手、纯白/中性背景，只有场景环境
- consistency_anchor 是跨镜头一致性的核心，必须选取最有辨识度的特征
- spatial_layout 的 x/y 必须是 0-1 之间的数字，position 是自然语言位置描述
- lighting 必须至少给出 key_light；每个光源字段必须是 position/color/intensity 的对象
- 按出场顺序排列

剧本内容：
${scriptContent}`;
}
