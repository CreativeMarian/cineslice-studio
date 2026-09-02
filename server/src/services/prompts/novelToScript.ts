// 小说转剧集剧本提示词模板
// v3.0 - 强化内容详细度要求，修复 chapterRange，增加示例

export interface NovelToScriptParams {
  novelContent: string;
  episodesCount?: number;
  style?: string;
}

export function novelToScriptPrompt(params: NovelToScriptParams): { systemPrompt: string; prompt: string } {
  const episodesCount = params.episodesCount || 0; // 0 表示自动检测
  const style = params.style || 'standard';

  const countInstruction = episodesCount > 0
    ? `请改编为 ${episodesCount} 集剧本`
    : `重要：如果小说内容中已经包含明确的集数标记（如"第X集"、"第X话"、"Episode X"等），请严格按照原有的集数划分提取每一集内容，不要合并或拆分。如果没有明确集数标记，请根据内容合理划分集数。`;

  const systemPrompt = `你是一位专业的影视编剧，擅长将小说改编为详细的剧集剧本。

【核心原则】
1. 严格保留原文的关键情节、人物对话、场景描写，不得删减或概括原文内容
2. 将原文的叙述性文字转化为剧本格式（场景描写+动作+对话），但内容量不能减少
3. 每集剧本不少于800字，必须包含至少3个场景
4. 每个场景必须有：详细的环境描写（时间、地点、氛围）、人物动作描写、具体对话内容
5. 【剧情保真】严格遵循原文情节发展顺序，不得添加原文没有的情节，不得修改人物动机和关系
6. 【关键对话保留】原文中的重要对话必须原样保留，不得改写或概括
7. 【人物一致性】人物性格、说话风格必须与原文一致，不得OOC（Out of Character）

【输出格式】
输出为 JSON 数组，每个元素包含：
- episodeNumber: 集数（从1开始，必须与原著中的集数标记一致）
- title: 剧集标题（如果原著中有标题请保留，否则根据内容概括）
- chapterRange: 该集对应的原文章节范围，必须填写具体范围（如"第1-3章"、"第4章"、"第5-6章"），如果原文无章节标记则填写"第X集"（X为当前集数），禁止统一填"第1章"
- scriptContent: 剧本正文（Markdown 格式）
- plotPoints: 剧情要点数组，列出本集的3-5个关键情节节点，便于核对剧情保真度（如["主角初遇反派", "发现关键线索", "第一次冲突"]）

【剧本格式要求】
每集 scriptContent 必须包含：
## 场景一：[场景名称]
**环境：** [详细的时间、地点、氛围描写，不少于50字]
**人物：** [出场人物列表]
[人物动作和表情描写]
**角色名：** 对话内容
[更多动作描写]
**角色名：** 对话内容

## 场景二：[场景名称]
...（至少3个场景）

【严格禁止】
- 禁止只输出大纲、梗概或情节摘要
- 禁止将多段对话合并为一句概括
- 禁止省略环境描写和动作描写
- 禁止每集少于800字
- 禁止 chapterRange 统一填"第1章"或留空

只返回 JSON 数组，不要其他文字、不要 markdown 代码块标记。`;

  const prompt = `小说内容：
${params.novelContent}

${countInstruction}
风格：${style}

【改编要求】
1. 每集有明确的起承转合，保留原著核心情节和人物关系
2. 对话要符合人物性格，保留原文中的关键对话
3. 场景描述要具体详细，包含时间、地点、环境氛围、人物动作表情，便于后续分镜
4. 如果原著中每集已有标题，保留原标题
5. 每集剧本不少于800字，至少包含3个场景，每个场景有详细环境描写、人物动作和对话
6. chapterRange 必须填写该集对应的原文章节范围（如"第1-3章"），不要统一填"第1章"
7. 严格保留原文内容，不得删减或概括，将叙述转化为剧本格式但内容量保持不变

【输出示例（单集结构参考）】
{
  "episodeNumber": 1,
  "title": "初遇",
  "chapterRange": "第1-2章",
  "scriptContent": "## 场景一：小镇清晨\n**环境：** 清晨的阳光透过薄雾洒在青石板路上，街边的早点摊冒着热气，远处传来鸡鸣声。小镇刚刚苏醒，空气中弥漫着豆浆和油条的香气。\n**人物：** 李明、王老伯\n李明背着布包走在青石板路上，他停下脚步，深吸一口气，脸上露出久违的笑容。\n**王老伯：** 小明啊，好久没见你了，这次回来待多久？\n**李明：** 王老伯早！我这次回来就不走了，想在家里做点小生意。\n王老伯放下手中的扫帚，上下打量着李明，眼中满是欣慰。\n**王老伯：** 好啊好啊，年轻人就该回来建设家乡。你爸妈要是知道了肯定高兴。\n\n## 场景二：李家老宅\n..."
}

请以 JSON 数组格式返回所有剧集，不要包含任何其他文字。`;

  return { systemPrompt, prompt };
}

// 单集润色提示词（不改变剧情，只优化文字）
export function polishScriptPrompt(scriptContent: string): { systemPrompt: string; prompt: string } {
  const systemPrompt = `你是一位专业的剧本编辑，擅长润色剧本文字。

【润色原则】
1. 不改变原剧情、不增删情节、不改变人物关系
2. 优化文字表达，使对话更自然、场景描写更生动
3. 修正语法错误、不通顺的句子
4. 保持原有的剧本格式（场景标题、环境描写、人物对话）
5. 润色后字数不应明显减少，应保持或增加细节描写

输出为 JSON 对象，包含：
- title: 剧集标题（保留原标题或优化）
- scriptContent: 润色后的剧本正文

只返回 JSON 对象，不要其他文字。`;

  const prompt = `请润色以下剧本，不改变剧情，只优化文字表达：

${scriptContent}

请以 JSON 对象格式返回，包含 title 和 scriptContent 字段。`;

  return { systemPrompt, prompt };
}
