// 关键帧提示词生成模板
// v1.0

export interface KeyframePromptParams {
  shotDescription: string;
  characters?: Array<{ name: string; visualDescription: string }>;
  scene?: { name: string; description: string; timeOfDay: string; atmosphere: string };
  frameType: 'first' | 'last' | 'middle';
  stylePrompt?: string;
  negativePrompt?: string;
}

export function keyframePrompt(params: KeyframePromptParams): { prompt: string; negativePrompt: string } {
  const parts: string[] = [];

  // 场景描述
  if (params.scene) {
    parts.push(`场景：${params.scene.name}，${params.scene.description}`);
    parts.push(`时间：${params.scene.timeOfDay}，氛围：${params.scene.atmosphere}`);
  }

  // 镜头动作
  parts.push(`画面内容：${params.shotDescription}`);

  // 角色描述
  if (params.characters && params.characters.length > 0) {
    const charDesc = params.characters.map(c => `${c.name}（${c.visualDescription}）`).join('、');
    parts.push(`画面中必须同时出现且仅出现以下角色：${charDesc}。所有列出的角色都必须出现在画面中，不得遗漏任何一人，不得出现名单之外的人物`);
    parts.push(`角色：${charDesc}`);
  }

  // 帧类型提示
  if (params.frameType === 'first') {
    parts.push('这是镜头开始的第一帧，展现场景建立');
  } else if (params.frameType === 'last') {
    parts.push('这是镜头结束的最后一帧，展现动作结果');
  } else {
    parts.push('这是镜头中间的关键帧，展现动作高潮');
  }

  // 风格
  if (params.stylePrompt) {
    parts.push(`风格：${params.stylePrompt}`);
  }

  // 画质要求
  parts.push('高质量，电影级画面，细节丰富，光影自然，8k分辨率');

  const prompt = parts.join('。');

  const negativePrompt = params.negativePrompt ||
    '低质量，模糊，变形，多余手指，丑陋，水印，文字，卡通，动漫，3d渲染感';

  return { prompt, negativePrompt };
}

// 角色概念图提示词
// 对齐《AI短剧制作全流程手册》：全身正面白底、双手自然下垂、鞋子踩地、手里不拿东西、画面只有一个人
// 优化：增加正位站立约束，确保角色一致性，可用于后续视频生成
export function characterConceptPrompt(
  characterName: string,
  visualDescription: string,
  stylePrompt?: string
): { prompt: string; negativePrompt: string } {
  const parts = [
    `角色概念设定图：${characterName}`,
    visualDescription,
    '正面全身站立姿势，从头到脚完整显示，角色居中，正视镜头，中性表情',
    '双臂自然下垂，双手放松，双脚并拢站立，鞋子完全踩在地面',
    '纯白色背景，无任何杂物，画面只有一个人，手里不拿任何物品',
    '角色设计稿风格，服装设计细节清晰，面部特征明确',
    '标准角色参考图，用于视频生成时保持角色一致性',
  ];
  if (stylePrompt) parts.push(`风格：${stylePrompt}`);
  parts.push('高质量，8K分辨率，细节丰富，电影级光影，专业角色设定');

  return {
    prompt: parts.join('。'),
    negativePrompt: '低质量，模糊，变形，多余手指，丑陋，水印，文字，背景复杂，多人，手持物品，坐姿，跪姿，跳跃，动态姿势，侧面，背面，半身像，特写，裁切，不完整身体',
  };
}

// 场景概念图提示词
// 优化：增加严谨描述，确保场景一致性，可用于后续视频生成
export function sceneConceptPrompt(
  sceneName: string,
  description: string,
  timeOfDay: string,
  atmosphere: string,
  stylePrompt?: string
): { prompt: string; negativePrompt: string } {
  const timeText = timeOfDay === 'night' ? '夜晚，月光照明，深色天空' :
    timeOfDay === 'dawn' ? '黎明，柔和晨光，淡色天空' :
    timeOfDay === 'dusk' ? '黄昏，金色夕阳，暖色天空' :
    '白天，自然光，明亮天空';

  const parts = [
    `场景概念设定图：${sceneName}`,
    description,
    `时间：${timeText}，氛围：${atmosphere}`,
    '广角镜头，展现完整场景空间，透视准确',
    '场景布局清晰，陈设细节明确，光影方向一致',
    '电影级概念艺术，氛围浓厚，色彩统一',
    '标准场景参考图，用于视频生成时保持场景一致性',
    '画面中绝对不能出现任何文字、字母、数字、符号、字幕、标题、标签、logo、招牌',
  ];
  if (stylePrompt) parts.push(`风格：${stylePrompt}`);
  parts.push('高质量，8K分辨率，细节丰富，光影自然，专业场景设定，纯视觉画面无文字');

  return {
    prompt: parts.join('。'),
    negativePrompt: '低质量，模糊，变形，人物，水印，文字，英文字母，中文文字，数字，符号，字幕，标题，标签，logo，招牌，广告牌，文字标识，卡通，透视错误，布局混乱，光影不一致，色彩杂乱',
  };
}

// 角色四视图提示词（面部特写 + 三视图：正面/侧面/背面）
// 对齐《AI短剧制作全流程手册》：最左侧超大人脸特写，右侧依次全身正面、侧面、后视图
// 比例统一16:9，与后续视频比例一致
export function characterFourViewPrompt(
  characterName: string,
  visualDescription: string,
  stylePrompt?: string
): { prompt: string; negativePrompt: string } {
  const parts = [
    `角色四视图设定表：${characterName}`,
    visualDescription,
    '布局：从左到右依次为面部特写、正面全身、侧面全身、背面全身，四个视图等宽排列',
    '纯白色背景，角色设计稿风格，专业角色设定表',
    '正面全身：标准站立姿势，双臂自然下垂，双脚并拢，正视镜头，从头到脚完整显示',
    '侧面全身：标准侧面站姿，双臂自然下垂，双脚并拢，从头到脚完整显示',
    '背面全身：标准背面站姿，双臂自然下垂，双脚并拢，从头到脚完整显示',
    '面部特写：正面面部特写，清晰展示五官特征和发型',
    '四个视图的服装、发型、配色、身高完全一致，细节清晰，角色一致性',
    '用于视频生成时保持角色一致性的标准参考图',
  ];
  if (stylePrompt) parts.push(`风格：${stylePrompt}`);
  parts.push('高质量，8K分辨率，细节丰富，电影级光影，专业角色设定，16:9宽幅比例');

  return {
    prompt: parts.join('。'),
    negativePrompt: '低质量，模糊，变形，多余手指，丑陋，水印，文字，背景复杂，多人，姿势不一致，服装不一致，配色不一致，裁切，不完整身体，动态姿势，坐姿，跪姿，跳跃',
  };
}

// 道具概念图提示词（全景、纯白色背景）
export function propConceptPrompt(
  propName: string,
  description: string,
  stylePrompt?: string
): { prompt: string; negativePrompt: string } {
  const parts = [
    `道具设计图：${propName}`,
    description,
    '全景展示，纯白色背景',
    '道具设计稿风格，细节清晰，无人物',
  ];
  if (stylePrompt) parts.push(`风格：${stylePrompt}`);
  parts.push('高质量，电影级道具设计');

  return {
    prompt: parts.join('。'),
    negativePrompt: '低质量，模糊，变形，人物，水印，文字，背景复杂，卡通',
  };
}
