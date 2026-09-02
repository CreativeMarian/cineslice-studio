// 视频质量增强提示词模块 v3.0
// 深度优化：剧情一致性 + 物理生活常识 + 电影镜头语言 + 100+条分类负面词 + 分场景正面词
// 所有视频适配器共用，减少 AI 生成痕迹、提升画面稳定性、剧情贴合度与真实感

// ═══════════════════════════════════════════════════════════════
// 类型定义
// ═══════════════════════════════════════════════════════════════

/** 场景类型，用于自动适配正面/负面提示词 */
export type SceneType = 'fight' | 'dialogue' | 'emotional' | 'action' | 'environment';

/** 角色描述（用于一致性提示词） */
export interface CharacterRef {
  name?: string;
  /** 外观关键特征：服装、发色、体型、配饰等 */
  appearance?: string;
}

/** 场景描述（用于一致性提示词） */
export interface SceneRef {
  /** 地点/环境 */
  location?: string;
  /** 时间：白天/夜晚/黄昏等 */
  timeOfDay?: string;
  /** 天气/氛围 */
  atmosphere?: string;
  /** 关键道具 */
  props?: string[];
}

/** 增强选项（向后兼容） */
export interface EnhanceVideoOptions {
  /** 调用方额外追加的负面提示词，会与默认负面词合并 */
  negativePrompt?: string;
  /** 是否追加一致性约束，默认 true */
  includeConsistency?: boolean;
  /** 是否追加画质增强描述，默认 true */
  includeQuality?: boolean;
  /** 是否为动作/打斗场景（自动追加动作相关正面/负面词），默认 false */
  isActionScene?: boolean;
  /** 场景类型（优先于 isActionScene），用于精细适配 */
  sceneType?: SceneType;
  /** 角色引用（用于一致性提示词） */
  characters?: CharacterRef[];
  /** 场景引用（用于一致性提示词） */
  scene?: SceneRef;
}

/** 增强后返回结构 */
export interface EnhancedVideoPrompt {
  /** 追加了一致性与画质约束的正向提示词 */
  prompt: string;
  /** 合并后的负面提示词 */
  negativePrompt: string;
}

// ═══════════════════════════════════════════════════════════════
// 负面提示词（100+ 条，按 7 大类整理）
// ═══════════════════════════════════════════════════════════════

// ── A. 身体解剖类（20条）──
const NEGATIVE_ANATOMY = [
  '多余手指', '多余肢体', '多余脚趾', '手指融合', '手部畸形',
  '面部扭曲', '五官错位', '双眼不对称', '斜视', '耳朵畸形',
  '关节扭曲', '肢体断裂', '肢体漂浮', '身体穿透', '穿模',
  '比例失调', '脊椎弯曲异常', '缺胳膊少腿', '多长一只眼', '嘴巴变形',
  'extra fingers', 'extra limbs', 'deformed hands', 'fused fingers',
  'distorted face', 'asymmetric eyes', 'cross-eyed', 'malformed ears',
  'dislocated joints', 'broken anatomy', 'floating limbs', 'body clipping',
  'intersection', 'wrong proportions', 'twisted spine', 'missing limbs',
  'extra eyes', 'deformed mouth', 'mutated body', 'detached body parts',
];

// ── B. 物理异常类（15条）──
const NEGATIVE_PHYSICS = [
  '反重力', '物体漂浮', '液体逆流', '水往高处流', '火焰不上升',
  '烟雾下沉', '无惯性运动', '瞬间加速', '无反作用力', '碰撞无反应',
  '物体凭空消失', '物体凭空出现', '不可能的平衡', '悬空停滞', '穿透固体',
  'anti-gravity', 'floating objects', 'liquid defying gravity',
  'water flowing upward', 'fire not rising', 'smoke going down',
  'no inertia', 'instant acceleration', 'no reaction force',
  'no collision response', 'objects disappearing', 'teleportation',
  'impossible balance', 'frozen mid-air', 'passing through solid',
];

// ── C. 环境错乱类（15条）──
const NEGATIVE_ENVIRONMENT = [
  '背景闪烁', '背景变形', '家具移动', '墙壁扭曲', '物体复制',
  '光照不一致', '阴影方向错误', '时间错乱', '天气突变', '季节错乱',
  '透视错误', '建筑漂浮', '不可能建筑', '天空变化', '地面不平',
  'flickering background', 'background warping', 'moving furniture',
  'warping walls', 'duplicated objects', 'lighting inconsistency',
  'wrong shadow direction', 'time of day mismatch', 'weather inconsistency',
  'season mismatch', 'wrong perspective', 'floating buildings',
  'impossible architecture', 'changing sky', 'uneven ground',
];

// ── D. 画质问题类（15条）──
const NEGATIVE_QUALITY = [
  '模糊', '低分辨率', '低质量', '噪点', '压缩痕迹',
  '色带', '锯齿', '画面撕裂', '抖动', '像素化',
  '过曝', '欠曝', '褪色', '水印', '文字乱码',
  'blurry', 'low resolution', 'low quality', 'noise',
  'compression artifacts', 'banding', 'aliasing', 'video artifacts',
  'jittery motion', 'pixelated', 'overexposed', 'underexposed',
  'washed out', 'watermark', 'text artifacts',
];

// ── E. 剧情错位类（15条）──
const NEGATIVE_PLOT = [
  '角色错位', '换脸', '角色不匹配', '服装错误', '发型错误',
  '年龄错误', '场景错误', '时代错乱', '武器错误', '地点错误',
  '角色重复', '角色消失', '多余角色', '表情错误', '动作与剧情不符',
  'wrong character', 'face swap', 'character mismatch', 'wrong costume',
  'wrong hairstyle', 'wrong age', 'wrong scene', 'anachronism',
  'wrong weapon', 'wrong location', 'character duplication',
  'missing character', 'extra character', 'wrong expression',
  'action mismatch',
];

// ── F. 镜头问题类（10条）──
const NEGATIVE_CINEMATOGRAPHY = [
  '错误镜头角度', '糟糕构图', '平光', '无景深', '动作场景固定镜头',
  '手持过度抖动', '跳切', '对焦错误', '镜头畸变', '高光溢出',
  'wrong camera angle', 'bad composition', 'flat lighting', 'no depth',
  'static camera for action', 'shaky cam', 'jump cuts', 'wrong focus',
  'lens distortion', 'blown highlights',
];

// ── G. AI痕迹类（10条）──
const NEGATIVE_AI = [
  '塑料皮肤', '蜡像质感', '恐怖谷', '过度光滑', 'AI伪影',
  '数字绘画感', 'CG感', '不自然对称', '完美皮肤', '生成痕迹',
  'plastic skin', 'waxy texture', 'uncanny valley', 'over-smoothed',
  'AI artifacts', 'digital painting look', 'CGI look', 'unnatural symmetry',
  'perfect skin', 'generated look',
];

/** 全部负面词（去重后合并） */
const ALL_NEGATIVE = [
  ...NEGATIVE_ANATOMY,
  ...NEGATIVE_PHYSICS,
  ...NEGATIVE_ENVIRONMENT,
  ...NEGATIVE_QUALITY,
  ...NEGATIVE_PLOT,
  ...NEGATIVE_CINEMATOGRAPHY,
  ...NEGATIVE_AI,
];

// ── 打斗场景额外负面词 ──
const FIGHT_EXTRA_NEGATIVE = [
  '慢动作打斗', '假打', '提前反应', '动作无力', '缺乏爆发力',
  '无重量转移', '无动量', '打击无反馈', '武器穿透', '血滴悬浮',
  'slow motion fight', 'fake hit', 'premature reaction', 'weak impact',
  'lack of momentum', 'no weight transfer', 'no impact feedback',
  'weapon clipping', 'floating blood drops',
];

// ═══════════════════════════════════════════════════════════════
// 正面提示词（按场景类型适配）
// ═══════════════════════════════════════════════════════════════

// ── 公共电影级画质基础 ──
const CINEMATIC_BASE =
  '电影级画质，cinematic quality，8K，ultra-detailed，professional cinematography，' +
  'ARRI Alexa，RED camera，cinematic color grading，film grain，anamorphic lens flare，' +
  'realistic lighting，global illumination，physically based rendering，' +
  'shallow depth of field，bokeh，高清晰度，细节丰富，真实感强，画面稳定';

// ── 物理与生活常识（所有场景通用）──
const PHYSICS_COMMON =
  'accurate physics，正确重力，自然惯性，真实碰撞反应，液体自然流动，' +
  '衣物自然摆动，头发自然飘动，真实光影，人体解剖正确，自然呼吸，' +
  'weight and mass，momentum conservation，follow-through motion，' +
  'realistic cloth simulation，realistic hair dynamics，natural lighting';

// ── 场景1：打斗场景 ──
const POSITIVE_FIGHT =
  'dynamic camera movement，快节奏剪辑，impact frames，motion blur on fast movement，' +
  'dust and debris particles，weapon trail effects，sweat droplets，strained muscles，' +
  'realistic impact reaction，weight transfer，momentum，follow-through，' +
  'environmental interaction（破坏、碎片），tense atmosphere，dramatic lighting，' +
  '动态镜头，有力打击，真实受击反应，汗水飞溅，肌肉紧绷，碎片飞溅，紧张氛围';

// ── 场景2：对话场景 ──
const POSITIVE_DIALOGUE =
  'medium shot，over-the-shoulder angle，eye-line match，natural conversational rhythm，' +
  'subtle facial expressions，micro-expressions，natural blinking，lip sync accuracy，' +
  'shallow depth of field，soft key light，warm/cool tone matching emotion，' +
  '中景镜头，过肩视角，视线匹配，自然对话节奏，微妙表情，微表情，自然眨眼，口型准确';

// ── 场景3：情感场景 ──
const POSITIVE_EMOTIONAL =
  'close-up shot，extreme close-up for eyes，shallow depth of field，soft diffused lighting，' +
  'tear details，trembling lips，subtle breathing，emotional buildup，' +
  'warm color palette for tenderness，cool blue for sorrow，golden hour for nostalgia，' +
  '特写镜头，眼部大特写，浅景深，柔和漫射光，泪光细节，嘴唇微颤，呼吸细微，情感递进';

// ── 场景4：动作场景（非打斗，如奔跑、跳跃、飞行）──
const POSITIVE_ACTION =
  'tracking shot，dynamic angle，follow camera，speed lines（subtle），' +
  'wind effect on clothes and hair，environmental motion blur，' +
  'natural acceleration and deceleration，landing impact with dust，' +
  'weight in movement，gravity accurate，follow-through motion，' +
  '追踪镜头，动态角度，跟随拍摄，衣物头发随风，环境运动模糊，自然加减速，落地扬尘';

// ── 场景5：环境/空镜场景 ──
const POSITIVE_ENVIRONMENT =
  'wide establishing shot，grand composition，atmospheric perspective，' +
  'volumetric lighting，god rays，fog/mist layers，texture detail（stone, wood, fabric），' +
  'environmental storytelling，ambient particles（dust, pollen, snow），' +
  'natural color palette，time-appropriate lighting，slow camera pan/tilt，' +
  '全景远景，宏大构图，大气透视，体积光，丁达尔效应，雾气层次，材质细节，环境叙事';

const SCENE_POSITIVE_MAP: Record<SceneType, string> = {
  fight: POSITIVE_FIGHT,
  dialogue: POSITIVE_DIALOGUE,
  emotional: POSITIVE_EMOTIONAL,
  action: POSITIVE_ACTION,
  environment: POSITIVE_ENVIRONMENT,
};

// ═══════════════════════════════════════════════════════════════
// 剧情一致性提示词
// ═══════════════════════════════════════════════════════════════

const CONSISTENCY_BASE =
  '人物身份一致，角色外观一致，服装一致，发型发色一致，场景一致，' +
  '物体位置一致，光照方向一致，色彩基调一致，透视准确，' +
  '前后镜头动作状态连贯，情绪连贯，时间线连贯';

/**
 * 生成剧情一致性提示词。
 * @param characters 角色列表（名称+外观特征）
 * @param scene 场景信息（地点/时间/天气/道具）
 */
export function getVideoConsistencyPrompt(
  characters?: CharacterRef[],
  scene?: SceneRef
): string {
  let prompt = CONSISTENCY_BASE;

  if (characters && characters.length > 0) {
    const charDescs = characters
      .map(c => {
        const parts: string[] = [];
        if (c.name) parts.push(c.name);
        if (c.appearance) parts.push(c.appearance);
        return parts.join('：');
      })
      .filter(Boolean)
      .join('；');
    if (charDescs) {
      prompt += `。角色设定：${charDescs}`;
    }
  }

  if (scene) {
    const sceneParts: string[] = [];
    if (scene.location) sceneParts.push(`地点=${scene.location}`);
    if (scene.timeOfDay) sceneParts.push(`时间=${scene.timeOfDay}`);
    if (scene.atmosphere) sceneParts.push(`氛围=${scene.atmosphere}`);
    if (scene.props && scene.props.length > 0) sceneParts.push(`道具=${scene.props.join('、')}`);
    if (sceneParts.length > 0) {
      prompt += `。场景设定：${sceneParts.join('，')}`;
    }
  }

  return prompt;
}

// ═══════════════════════════════════════════════════════════════
// 导出函数
// ═══════════════════════════════════════════════════════════════

/**
 * 获取电影级画质正面提示词（公共函数，向后兼容）
 */
export function getVideoQualityPrompt(): string {
  return CINEMATIC_BASE;
}

/**
 * 获取高质量负面提示词（100+条，按7大类整理）
 * @param sceneType 可选场景类型，打斗场景追加动作相关负面词
 * @returns 逗号分隔的负面提示词字符串
 */
export function getVideoNegativePrompt(sceneType?: SceneType): string {
  const negatives = [...ALL_NEGATIVE];
  if (sceneType === 'fight') {
    negatives.push(...FIGHT_EXTRA_NEGATIVE);
  }
  // 去重
  return [...new Set(negatives)].join(', ');
}

/**
 * 获取分场景正面提示词
 * @param sceneType 场景类型：fight/dialogue/emotional/action/environment
 * @returns 该场景的正面提示词（含公共画质+物理常识+场景专属）
 */
export function getVideoPositivePrompt(sceneType?: SceneType): string {
  const parts = [CINEMATIC_BASE, PHYSICS_COMMON];
  if (sceneType && SCENE_POSITIVE_MAP[sceneType]) {
    parts.push(SCENE_POSITIVE_MAP[sceneType]);
  }
  return parts.join('，');
}

/**
 * 增强视频生成提示词
 * - 正向提示词追加一致性约束、分场景正面词、电影级画质描述
 * - 负面提示词合并100+条分类负面词 + 场景专属负面词
 * - 向后兼容 isActionScene（等价于 sceneType='fight'）
 *
 * @param prompt  原始正向提示词
 * @param options 增强选项
 * @returns 增强后的正向提示词与负面提示词
 */
export function enhanceVideoPrompt(
  prompt: string,
  options?: EnhanceVideoOptions
): EnhancedVideoPrompt {
  const opts = options || {};
  // 兼容旧参数 isActionScene
  const sceneType: SceneType | undefined =
    opts.sceneType || (opts.isActionScene ? 'fight' : undefined);

  // 合并负面提示词
  let negativePrompt = getVideoNegativePrompt(sceneType);
  if (opts.negativePrompt) {
    negativePrompt = `${opts.negativePrompt}, ${negativePrompt}`;
  }

  // 构建正向提示词
  let enhanced = (prompt || '').trim();

  // 一致性约束
  if (opts.includeConsistency !== false) {
    const consistency = getVideoConsistencyPrompt(opts.characters, opts.scene);
    enhanced = enhanced ? `${enhanced}。${consistency}` : consistency;
  }

  // 分场景正面词
  if (sceneType) {
    enhanced = `${enhanced}，${SCENE_POSITIVE_MAP[sceneType]}`;
  }

  // 公共物理常识
  enhanced = `${enhanced}，${PHYSICS_COMMON}`;

  // 电影级画质
  if (opts.includeQuality !== false) {
    enhanced = `${enhanced}，${CINEMATIC_BASE}`;
  }

  return { prompt: enhanced, negativePrompt };
}
