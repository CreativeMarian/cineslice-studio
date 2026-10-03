// 道具提取提示词 — shuohao novel-art 叙事道具设计
// 核心原则：只提取"叙事道具"（推动剧情/揭示人物/承载伏笔的关键物品）
// 普通背景道具不提取，避免噪声
//
// 质量门：叙事道具必须有 visual_prompt，is_narrative=1

export interface PropExtractOutput {
  name: string;
  category: 'weapon' | 'furniture' | 'vehicle' | 'document' | 'electronic' | 'clothing' | 'food' | 'other';
  description: string;        // 道具在剧情中的功能和意义
  visual_prompt: string;      // 形象提示词，用于出图
  is_narrative: number;       // 1=叙事道具（推动剧情），0=普通道具
  keywords: string;           // 关键词（逗号分隔），用于镜头匹配
}

export function buildPropExtractPrompt(scriptContent: string): string {
  return `你是专业的影视道具设计师。从以下剧本中提取"叙事道具"——即推动剧情发展、揭示人物性格、或承载伏笔悬念的关键物品。

【什么是叙事道具】
- 被角色重点关注、拿取、争夺的物品
- 承载关键信息的物品（信件、文件、照片、手机、U盘等）
- 角色身份象征的物品（武器、饰品、制服、工具等）
- 引发剧情转折的物品（毒药、遗嘱、钥匙、合同等）
- 反复出现的意象物品（怀表、戒指、玩偶等）

【什么不是叙事道具】
- 普通背景家具（除非有特殊意义）
- 一次性使用且无后续影响的普通物品
- 角色日常穿着的普通衣物（除非是关键造型）

【输出要求】
对每个叙事道具输出 JSON 对象，包含以下字段：

1. name — 道具名（简洁明确，如"林墨的旧怀表""神秘信封""银色录音笔"）
2. category — 类别：weapon（武器）/ furniture（家具）/ vehicle（交通工具）/ document（文件纸张）/ electronic（电子设备）/ clothing（服饰配饰）/ food（食物饮品）/ other（其他）
3. description — 道具描述（30-60字）：
   - 外观特征
   - 在剧情中的功能和意义
   - 与哪些角色相关
4. visual_prompt — 形象提示词（不少于20字，用于AI出图）：
   - 材质、颜色、形状、尺寸
   - 磨损/新旧程度
   - 标志性细节（刻字、图案、损坏痕迹等）
   格式示例："银色黄铜怀表，直径约4cm，表壳有细密划痕，表盖内侧刻有'1998'字样，配深棕色皮链，复古机械质感"
5. is_narrative — 固定为 1（本提示词只提取叙事道具）
6. keywords — 关键词（逗号分隔，3-5个）：用于在分镜中自动匹配该道具
   格式示例："怀表,银色,黄铜,复古,刻字"

【重要规则】
- 只提取叙事道具，普通背景物品不要提取
- 最多提取 15 个叙事道具，优先提取最关键的
- visual_prompt 必须具体到可以直接出图
- 道具概念图要求：纯白/中性背景、单一物品、无人物、无手、均匀光照、产品摄影风格
- 按在剧情中的重要性排列，最关键的在前

剧本内容：
${scriptContent}`;
}
