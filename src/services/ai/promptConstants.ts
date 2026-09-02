// 提示词模板常量（版本化管理）

export const PROMPT_TEMPLATES = {
  // 小说 → 剧集剧本
  novelToScript: (novelContent: string, style = 'standard') => `你是一位专业影视编剧。请根据以下小说内容，改编为影视剧本。

风格要求：${style === 'standard' ? '标准剧本格式，场景描述简洁，对话生动' : style}

输出格式要求：
- 使用 Markdown 格式
- 每个场景以 "## 场景：场景名称" 开头
- 场景描述使用普通段落
- 对话格式为 "角色名：对话内容"
- 动作描述使用括号或斜体

小说内容：
${novelContent}`,

  // 角色提取
  extractCharacters: (scriptContent: string) => `请从以下剧本中提取所有出现的角色信息，以 JSON 数组格式输出。

每个角色包含：
- name: 角色名
- gender: male/female/other
- role_type: protagonist(主角)/supporting(配角)/antagonist(反派)/extra(路人)
- description: 角色身份与性格描述
- visual_description: 外貌特征描述（用于图像生成）

只输出 JSON，不要其他解释。

剧本内容：
${scriptContent}`,

  // 场景提取
  extractScenes: (scriptContent: string) => `请从以下剧本中提取所有场景信息，以 JSON 数组格式输出。

每个场景包含：
- name: 场景名称
- location: 地点
- time_of_day: day/night/dawn/dusk
- atmosphere: 氛围描述
- description: 详细描述

只输出 JSON，不要其他解释。

剧本内容：
${scriptContent}`,

  // 分镜生成
  generateShots: (scriptContent: string, density = 'normal') => `请根据以下剧本生成分镜表，以 JSON 数组格式输出。

镜头密度：${density === 'sparse' ? '稀疏（每场景2-3镜）' : density === 'dense' ? '密集（每场景5-8镜）' : '正常（每场景3-5镜）'}

每个镜头包含：
- shot_number: 镜头序号
- shot_size: closeup(特写)/medium(中景)/wide(全景)/extreme_wide(远景)
- action_description: 动作描述
- dialogue: 对话内容（如有）
- camera_movement: static/pan/tilt/dolly/zoom
- grid_position: 九宫格位置(1-9)
- duration_seconds: 预估时长（秒）

只输出 JSON，不要其他解释。

剧本内容：
${scriptContent}`,

  // 角色概念图提示词
  characterImagePrompt: (characterName: string, visualDesc: string, style = '') =>
    `角色概念图，${characterName}，${visualDesc}${style ? `，风格：${style}` : ''}，高质量，细节丰富，电影级光影，角色设定图`,

  // 场景概念图提示词
  sceneImagePrompt: (sceneName: string, location: string, atmosphere: string, style = '') =>
    `场景概念图，${sceneName}，${location}，氛围：${atmosphere}${style ? `，风格：${style}` : ''}，高质量，电影级光影，环境设定图`,

  // 关键帧提示词
  keyframePrompt: (action: string, characters: string, scene: string, style = '') =>
    `关键帧画面，${action}${characters ? `，角色：${characters}` : ''}${scene ? `，场景：${scene}` : ''}${style ? `，风格：${style}` : ''}，电影级画面，构图精美`,
} as const;

export const NEGATIVE_PROMPTS = {
  default: '低质量, 模糊, 变形, 多余手指, 文字, 水印, 签名',
  character: '低质量, 模糊, 变形, 多余手指, 文字, 水印, 签名, 丑陋, 比例失调',
  scene: '低质量, 模糊, 文字, 水印, 签名, 人物',
};
