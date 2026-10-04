// 提示词构建服务 — 身份锁 + 服装 + 场景 + 空间坐标 + 调度 + 动作 + 禁令
// P0-1: 身份锁与服装分离，逐字输出、不可二次描述
// P1-2: 空间坐标体系（spatial_layout）+ 灯光体系（lighting）+ 角色调度（blocking）
// 核心原则：模块化拼接；旧数据（无 identity_lock/wardrobe/blocking）向后兼容回退

import type {
  ScriptCharacter,
  ScriptScene,
  Shot,
  Project,
  IdentityLock,
  WardrobeItem,
  SpatialLayoutItem,
  LightingConfig,
  BlockingItem,
} from '../types';
import { safeJsonParse } from '../utils/json';
import { VIDEO_PROMPT_MAX_LENGTH } from '../constants';

/** 系列禁令行：全片完全一致（固定字符串，不可修改） */
export const SERIES_PROHIBITION_LINE =
  '【系列禁令】同一角色全片一致，不换服装除非指定，不变年龄，不出现第二个人，无文字叠加，无突兀切换';

/** 视觉风格 → 风格描述映射（visual_style 键值 → 可直接用于提示词的描述） */
const VISUAL_STYLE_DESCRIPTIONS: Record<string, string> = {
  '3d': '3D漫剧风格，赛璐璐渲染，鲜明色彩',
  '3d漫剧': '3D漫剧风格，赛璐璐渲染，鲜明色彩',
  '3D漫剧': '3D漫剧风格，赛璐璐渲染，鲜明色彩',
  '3D漫剧风': '3D漫剧风格，赛璐璐渲染，鲜明色彩',
  '写实': '写实电影风格，真实光影，自然色调',
  '写实风': '写实电影风格，真实光影，自然色调',
  '写实电影': '写实电影风格，真实光影，自然色调',
  'realistic': '写实电影风格，真实光影，自然色调',
  '古风': '中国古风风格，水墨意境，传统服饰',
  '古装': '中国古风风格，水墨意境，传统服饰',
  '仙侠': '东方仙侠风格，飘逸灵动，云雾缭绕',
  '赛博朋克': '赛博朋克风格，霓虹光影，未来都市',
  'cyberpunk': '赛博朋克风格，霓虹光影，未来都市',
  '二次元': '日式二次元动漫风格，明快线条，鲜明色彩',
  '动漫': '日式二次元动漫风格，明快线条，鲜明色彩',
  '国漫': '国漫风格，精致线条，鲜明色彩',
  '像素风': '像素艺术风格，复古游戏质感',
  '水墨': '水墨国画风格，留白意境，淡雅墨色',
};

// ============ 内部工具：安全 JSON 解析（P3-1: 复用 utils/json.safeJsonParse） ============

/** 安全 JSON 解析：解析失败返回 fallback（默认 null），见 utils/json.safeJsonParse */
function parseJson<T>(raw: string | null | undefined, fallback: T | null = null): T | null {
  return safeJsonParse<T | null>(raw, fallback);
}

/** 解析角色身份锁 JSON → IdentityLock | null（兼容对象/数组包裹） */
function parseIdentityLock(character: ScriptCharacter): IdentityLock | null {
  const lock = parseJson<IdentityLock | IdentityLock[]>(character.identity_lock);
  if (Array.isArray(lock)) return lock[0] || null;
  return lock;
}

/** 解析角色服装 JSON → WardrobeItem[]（非数组返回空数组） */
function parseWardrobe(character: ScriptCharacter): WardrobeItem[] {
  const wardrobe = parseJson<WardrobeItem[]>(character.wardrobe);
  return Array.isArray(wardrobe) ? wardrobe : [];
}

/** 解析场景空间布局 JSON → SpatialLayoutItem[] */
function parseSpatialLayout(scene: ScriptScene): SpatialLayoutItem[] {
  const layout = parseJson<SpatialLayoutItem[]>(scene.spatial_layout);
  return Array.isArray(layout) ? layout : [];
}

/** 解析场景灯光配置 JSON → LightingConfig | null */
function parseLighting(scene: ScriptScene): LightingConfig | null {
  return parseJson<LightingConfig>(scene.lighting);
}

/** 解析镜头调度 JSON → BlockingItem[] */
function parseBlocking(shot: Shot): BlockingItem[] {
  const blocking = parseJson<BlockingItem[]>(shot.blocking);
  return Array.isArray(blocking) ? blocking : [];
}

// ============ 身份锁定块 ============

/**
 * 构建身份锁定块（逐字输出，不可二次描述）
 * 格式：【身份锁定】{name}：{age}，{face_shape}，{hairstyle}，{hair_color}，{body_type}，标志特征：{distinctive_features}。禁忌：{prohibitions}
 * 向后兼容：identity_lock 为空时回退到 visual_prompt / visual_description
 * P1-2: compact=true 时只保留核心字段（年龄/脸型/发型/标志性特征），跳过 body_type/hair_color/prohibitions，
 *       用于提示词保留块超限时的压缩回退
 * @param character 角色实体（必须含 name；identity_lock 为 JSON 字符串）
 * @param compact 是否压缩（默认 false）
 * @returns 身份锁定块文本；角色为空或无可描述信息时返回空串
 * @sideEffects 无（纯函数）
 */
export function buildIdentityLockBlock(character: ScriptCharacter, compact = false): string {
  if (!character || !character.name) return '';
  const lock = parseIdentityLock(character);
  if (lock) {
    const core = compact
      ? [lock.age, lock.face_shape, lock.hairstyle, lock.distinctive_features].filter(Boolean).join('，')
      : [lock.age, lock.face_shape, lock.hairstyle, lock.hair_color, lock.body_type].filter(Boolean).join('，');
    const distinctive = !compact && lock.distinctive_features ? `，标志特征：${lock.distinctive_features}` : '';
    const prohibitions = !compact && lock.prohibitions ? `。禁忌：${lock.prohibitions}` : '';
    return `【身份锁定】${character.name}：${core}${distinctive}${prohibitions}`;
  }
  // 回退：无 identity_lock 时用 visual_prompt（其次 visual_description / description）
  const fallback = character.visual_prompt || character.visual_description || character.description || '';
  if (!fallback) return '';
  return `【身份锁定】${character.name}：${fallback}`;
}

// ============ 服装块 ============

/**
 * 构建服装块
 * 优先匹配 scene_id 对应服装 → 默认服装（is_default=1）→ 第一套
 * 无匹配返回空字符串（提示词中不出现服装描述）
 * @param character 角色实体（wardrobe 为 JSON 字符串：WardrobeItem[]）
 * @param sceneId 场景 ID，用于按场景匹配服装（可选）
 * @returns 服装块文本；无服装数据或无匹配时返回空串
 * @sideEffects 无（纯函数）
 */
export function buildWardrobeBlock(character: ScriptCharacter, sceneId?: string): string {
  if (!character || !character.name) return '';
  const wardrobe = parseWardrobe(character);
  if (wardrobe.length === 0) return '';
  let outfit: WardrobeItem | undefined;
  if (sceneId) outfit = wardrobe.find(w => w.scene_id && w.scene_id === sceneId);
  if (!outfit) outfit = wardrobe.find(w => w.is_default === 1) || wardrobe[0];
  if (!outfit) return '';
  const color = outfit.color ? `，主色${outfit.color}` : '';
  return `【服装】${outfit.name}：${outfit.description || ''}${color}`;
}

// ============ 场景块（含空间坐标 + 灯光体系） ============

/**
 * 构建场景块：场景描述 + 空间布局（坐标）+ 灯光体系
 * 格式：空间布局：{name}在画面{position}(x={x},y={y})，...
 *       灯光：主光{position}，{color}，{intensity}
 * @param scene 场景实体（visual_prompt/description/location 取描述；spatial_layout/lighting 为 JSON 字符串）
 * @returns 场景块文本（多行）；场景为空或无名时返回空串
 * @sideEffects 无（纯函数）
 */
function buildSceneBlock(scene: ScriptScene): string {
  if (!scene || !scene.name) return '';
  const desc = scene.visual_prompt || scene.description || scene.location || '';
  const lines = [`【场景】${scene.name}：${desc}`];

  const layout = parseSpatialLayout(scene);
  if (layout.length > 0) {
    const layoutDesc = layout
      .map(i => `${i.name}在画面${i.position || '中'}(x=${i.x},y=${i.y})`)
      .join('，');
    lines.push(`空间布局：${layoutDesc}`);
  }

  const lighting = parseLighting(scene);
  if (lighting) {
    const parts: string[] = [];
    if (lighting.key_light) {
      const kl = lighting.key_light;
      parts.push(`主光${kl.position || '前方'}，${kl.color || '白色'}，${kl.intensity || '适中'}`);
    }
    if (lighting.fill_light) {
      const fl = lighting.fill_light;
      parts.push(`补光${fl.position || ''}，${fl.color || ''}，${fl.intensity || ''}`);
    }
    if (lighting.rim_light) {
      const rl = lighting.rim_light;
      parts.push(`轮廓光${rl.position || ''}，${rl.color || ''}`);
    }
    if (lighting.ambient) parts.push(`环境光${lighting.ambient}`);
    if (parts.length > 0) lines.push(`灯光：${parts.join('，')}`);
  }

  return lines.join('\n');
}

// ============ 角色调度块 ============

/** 从动作描述回退解析调度（简单提取：角色名 + 位置关键词） */
function parseBlockingFromAction(shot: Shot, characters: ScriptCharacter[]): string {
  const text = shot.action_description || '';
  if (!text || characters.length === 0) return '';
  const positionKeywords = [
    '画面左侧', '画面右边', '画面右侧', '画面中央', '画面中间', '画面中心',
    '左侧', '右侧', '中央', '中间', '前景', '背景', '居中',
  ];
  const lines: string[] = [];
  for (const c of characters) {
    if (!c.name || !text.includes(c.name)) continue;
    const pos = positionKeywords.find(k => text.includes(k)) || '画面中';
    lines.push(`【调度】${c.name}位于${pos}，朝向镜头`);
  }
  return lines.join('\n');
}

/**
 * 构建角色调度块
 * blocking JSON 优先：{角色名}位于{position}，朝向{facing}，{action}
 * 向后兼容：blocking 为空时从 action_description 简单提取角色名+位置
 * @param shot 镜头实体（blocking 为 JSON 字符串：BlockingItem[]；空时回退 action_description 解析）
 * @param characters 出场角色列表（用于 blocking.character_id 反查角色名）
 * @returns 调度块文本；无调度数据时返回空串
 * @sideEffects 无（纯函数）
 */
function buildBlockingBlock(shot: Shot, characters: ScriptCharacter[]): string {
  if (!shot) return '';
  const blocking = parseBlocking(shot);
  if (blocking.length > 0) {
    const lines = blocking.map(b => {
      const char = characters.find(c => c.id === b.character_id)
        || (b.character_id ? characters.find(c => c.name === b.character_id) : undefined);
      // P1-25: 找不到角色时回退到 character_name 或通用名"角色"，绝不输出 UUID/内部 ID 进提示词
      const name = char?.name || b.character_name || '角色';
      return `【调度】${name}位于${b.position || '画面中'}，朝向${b.facing || '镜头'}，${b.action || ''}`;
    });
    return lines.join('\n');
  }
  return parseBlockingFromAction(shot, characters);
}

// ============ 系列禁令行 ============

/** 系列禁令行：全片完全一致，固定输出 */
export function buildSeriesProhibitionBlock(): string {
  return SERIES_PROHIBITION_LINE;
}

// ============ 项目风格块 ============

/**
 * 构建项目风格描述
 * visual_style 优先（映射为风格描述），为空回退 style_description，再为空返回空串
 */
function buildProjectStyleBlock(project: Project | null): string {
  if (!project) return '';
  if (project.visual_style && project.visual_style.trim()) {
    const key = project.visual_style.trim();
    return VISUAL_STYLE_DESCRIPTIONS[key] || key;
  }
  if (project.style_description && project.style_description.trim()) {
    return project.style_description.trim();
  }
  return '';
}

// ============ 完整提示词 ============

/** P1-3: 关键帧提示词上限（比视频宽松——图像模型上下文更大），默认 1000 字 */
const KEYFRAME_PROMPT_MAX_LENGTH = 1000;

/**
 * 构建完整首帧关键帧提示词
 * P1-3: 保留块（风格 + 身份锁 + 禁令行）完整保留 + 超限压缩身份锁；
 *       剩余长度给 动作/blocking/场景/服装（从末尾截断，动作优先保留）
 * P1-5: extraContext（如 prevShotContext）插入到禁令行之前（属于保留块）
 * 拼接顺序：项目风格 → 身份锁定块（每角色）→ extraContext → 动作 → 调度块 → 场景块 → 服装块 → 禁令行
 * @param shot 镜头实体（action_description 为画面主体动作描述）
 * @param characters 出场角色列表（逐角色拼接身份锁；服装块可截断）
 * @param scene 场景实体（可空；为空时跳过场景块）
 * @param project 项目实体（可空；用于视觉风格描述）
 * @param extraContext 额外上下文（可选；插到禁令行之前）
 * @returns 完整关键帧提示词（按块拼接，过滤空块，总长 ≤ KEYFRAME_PROMPT_MAX_LENGTH）
 * @sideEffects 输出一条构建日志（console.log）
 */
export function buildFullKeyframePrompt(
  shot: Shot,
  characters: ScriptCharacter[],
  scene: ScriptScene | null,
  project: Project | null,
  extraContext?: string,
): string {
  const style = buildProjectStyleBlock(project);
  const prohibition = buildSeriesProhibitionBlock();

  const buildIdentityBlocks = (compact: boolean): string[] => {
    const blocks: string[] = [];
    if (characters && characters.length > 0) {
      for (const c of characters) {
        const identity = buildIdentityLockBlock(c, compact);
        if (identity) blocks.push(identity);
      }
    }
    return blocks;
  };

  // 保留块 = 风格 + 身份锁（超限时压缩身份锁）+ extraContext + 禁令行
  let identityBlocks = buildIdentityBlocks(false);
  let reservedHead = [style, ...identityBlocks].filter(Boolean).join('\n');
  if (reservedHead.length > KEYFRAME_PROMPT_MAX_LENGTH) {
    identityBlocks = buildIdentityBlocks(true);
    reservedHead = [style, ...identityBlocks].filter(Boolean).join('\n');
  }
  const extra = (extraContext || '').trim();
  const reservedLen = (reservedHead.length > 0 ? reservedHead.length + 1 : 0)
    + (extra ? extra.length + 1 : 0)
    + (prohibition ? prohibition.length : 0);
  const sepOverhead = (reservedHead ? 1 : 0) + (extra ? 1 : 0) + (prohibition ? 1 : 0);
  const available = KEYFRAME_PROMPT_MAX_LENGTH - reservedLen - sepOverhead;

  // 可截断块：动作 → blocking → 场景 → 服装（从末尾截断，动作优先保留）
  const sceneBlock = scene ? buildSceneBlock(scene) : '';
  const blocking = buildBlockingBlock(shot, characters || []);
  const action = shot.action_description && shot.action_description.trim() ? shot.action_description.trim() : '';
  const wardrobeBlocks: string[] = [];
  if (characters && characters.length > 0) {
    for (const c of characters) {
      const wardrobe = buildWardrobeBlock(c, scene?.id);
      if (wardrobe) wardrobeBlocks.push(wardrobe);
    }
  }

  let middleText = [action, blocking, sceneBlock, ...wardrobeBlocks].filter(Boolean).join('\n');
  if (available < 50) {
    middleText = '';
  } else if (middleText.length > available) {
    middleText = middleText.slice(0, available);
  }

  const prompt = [reservedHead, extra, middleText, prohibition].filter(Boolean).join('\n');
  console.log(`[${new Date().toISOString()}] [PromptBuilder] 构建首帧提示词，长度=${prompt.length}（上限=${KEYFRAME_PROMPT_MAX_LENGTH}）`);
  return prompt;
}

/**
 * 构建完整视频提示词（类似首帧但更简洁，控制在 VIDEO_PROMPT_MAX_LENGTH 字内）
 * 保留：项目风格 + 身份锁定块（每个角色）+ 场景块 + 调度块 + 动作 + 禁令行（不含服装块，控制长度）
 * P1-4 截断策略"保头尾"：
 *   1. 必须保留块 = 项目风格 + 所有角色身份锁块 + 禁令行（完整保留）
 *   2. 剩余可用长度 = VIDEO_PROMPT_MAX_LENGTH - reservedLen（剩余 < 50 时只保留必须块）
 *   3. 动作(含记忆注入) / blocking块 / 场景块 按剩余长度从末尾截断
 *   4. 最终拼接顺序：风格 → 身份锁(每角色) → 动作(截断) → blocking(截断) → 场景(截断) → 禁令行
 * P0-6: middleText 顺序为 [动作, blocking, 场景]，从末尾截断时动作最晚被切（动作+记忆优先保留）
 * @param shot 镜头实体（action_description 为动作描述，可能被截断）
 * @param characters 出场角色列表（身份锁块完整保留，不可截断）
 * @param scene 场景实体（可空；场景块属于可截断部分）
 * @param project 项目实体（可空；风格块完整保留）
 * @returns 完整视频提示词；禁令行始终位于末尾
 * @sideEffects 输出一条构建日志（console.log）
 */
export function buildFullVideoPrompt(
  shot: Shot,
  characters: ScriptCharacter[],
  scene: ScriptScene | null,
  project: Project | null,
): string {
  // 必须保留块：风格 + 身份锁 + 禁令行
  const style = buildProjectStyleBlock(project);
  const prohibition = buildSeriesProhibitionBlock();

  const buildIdentityBlocks = (compact: boolean): string[] => {
    const blocks: string[] = [];
    if (characters && characters.length > 0) {
      for (const c of characters) {
        const identity = buildIdentityLockBlock(c, compact);
        if (identity) blocks.push(identity);
      }
    }
    return blocks;
  };

  let identityBlocks = buildIdentityBlocks(false);
  let reservedHead = [style, ...identityBlocks].filter(Boolean).join('\n');
  // P1-2: 保留块超限保护——身份锁完整版超过上限时压缩（只保留核心字段），绝不输出超限文本
  if (reservedHead.length > VIDEO_PROMPT_MAX_LENGTH) {
    identityBlocks = buildIdentityBlocks(true);
    reservedHead = [style, ...identityBlocks].filter(Boolean).join('\n');
  }
  const reservedLen = (reservedHead.length > 0 ? reservedHead.length + 1 : 0)
    + (prohibition ? prohibition.length : 0);
  // 预算计入 join('\n') 分隔符开销：middleText 与首/尾块相邻处各需一个换行（首/尾为空时相应减少）
  const sepOverhead = (reservedHead ? 1 : 0) + (prohibition ? 1 : 0);
  const available = VIDEO_PROMPT_MAX_LENGTH - reservedLen - sepOverhead;

  // P0-6/P1-1: 可截断块顺序 = 动作 → blocking → 场景（从末尾截断时动作最晚被切，动作+记忆优先保留）
  const sceneBlock = scene ? buildSceneBlock(scene) : '';
  const blocking = buildBlockingBlock(shot, characters || []);
  const action = shot.action_description && shot.action_description.trim() ? shot.action_description.trim() : '';

  let middleText = [action, blocking, sceneBlock].filter(Boolean).join('\n');
  if (available < 50) {
    // 剩余空间不足，只保留必须块
    middleText = '';
  } else if (middleText.length > available) {
    middleText = middleText.slice(0, available);
  }

  const prompt = [reservedHead, middleText, prohibition].filter(Boolean).join('\n');
  console.log(`[${new Date().toISOString()}] [PromptBuilder] 构建视频提示词，长度=${prompt.length}（上限=${VIDEO_PROMPT_MAX_LENGTH}）`);
  return prompt;
}

/**
 * 构建角色概念锚点图提示词（使用身份锁，不含服装——锚点图只锁定面容/体型/发型）
 */
export function buildCharacterConceptPromptWithIdentity(
  character: ScriptCharacter,
  project: Project | null,
): string {
  const style = buildProjectStyleBlock(project) || '电影级画质，写实风格，超高清细节';
  const identity = buildIdentityLockBlock(character) || '';
  return `${style}
角色概念锚点图：${character.name}
${identity}

【画面要求】
- 正面全身像，人物居中，双脚并拢或自然分开与肩同宽
- 双手自然下垂于身体两侧，不拿任何物品，手指自然伸直
- 表情自然，目光平视前方
- 纯白背景（#FFFFFF），无任何阴影、道具、装饰
- 画面只有一个人，绝对不能出现第二个人
- 标准解剖比例，无变形
- 高清细节，皮肤质感真实`;
}

// ============ 数据归一化工具（AI 提取输出 → 库字段） ============

/**
 * 将 AI 返回的身份锁对象归一化为 IdentityLock（过滤空值）
 * 兼容中英文键名；全部字段为空返回 null
 */
export function normalizeIdentityLock(raw: any): IdentityLock | null {
  if (!raw || typeof raw !== 'object') return null;
  const lock: IdentityLock = {
    age: String(raw.age ?? raw.年龄 ?? ''),
    face_shape: String(raw.face_shape ?? raw.faceShape ?? raw.脸型 ?? ''),
    hairstyle: String(raw.hairstyle ?? raw.发型 ?? ''),
    hair_color: String(raw.hair_color ?? raw.hairColor ?? raw.发色 ?? ''),
    body_type: String(raw.body_type ?? raw.bodyType ?? raw.体型 ?? ''),
    distinctive_features: String(raw.distinctive_features ?? raw.distinctiveFeatures ?? raw.标志性特征 ?? raw.标志特征 ?? ''),
    prohibitions: String(raw.prohibitions ?? raw.禁忌 ?? ''),
  };
  const hasValue = Object.values(lock).some(v => v.trim().length > 0);
  return hasValue ? lock : null;
}

/**
 * 将 AI 返回的服装列表归一化为基础数组（不含 id/scene_id，由 buildWardrobeJson 补充）
 */
export function normalizeWardrobe(raw: any): Array<{ name: string; description: string; color: string; scene_name?: string }> {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((w: any) => w && typeof w === 'object')
    .map((w: any) => ({
      name: String(w.name ?? w.服装名 ?? w.名称 ?? ''),
      description: String(w.description ?? w.desc ?? w.描述 ?? ''),
      color: String(w.color ?? w.主色 ?? w.主色调 ?? ''),
      scene_name: w.scene_name ?? w.sceneName ?? w.场景名 ?? undefined,
      // P1-4: 透传 AI 返回的 is_default（buildWardrobeJson 尊重该值）
      is_default: typeof w.is_default === 'number' ? w.is_default : undefined,
    }))
    .filter(w => w.name || w.description);
}

/**
 * 构建 wardrobe JSON 字符串（含 id / scene_id / is_default），供批量入库使用
 * scene_name → scene_id 由调用方传入映射；未匹配的场景服装 scene_id 置 null（通用服装）
 */
export function buildWardrobeJson(
  items: Array<{ name: string; description: string; color: string; scene_name?: string; is_default?: number }>,
  sceneNameToId: Record<string, string>,
  prefix = 'outfit',
): string | null {
  if (!items || items.length === 0) return null;
  const wardrobe: WardrobeItem[] = items.map((w, i) => {
    const sceneId = (w.scene_name && sceneNameToId[w.scene_name]) || null;
    // P1-4: is_default 只在无场景归属（scene_name 为空或未匹配到场景）时置 1；
    //       若 AI 显式返回 is_default 则尊重 AI 的值（不再默认首套服装为默认服装）
    let isDefault: number;
    if (typeof w.is_default === 'number') {
      isDefault = w.is_default ? 1 : 0;
    } else {
      isDefault = sceneId ? 0 : 1;
    }
    return {
      id: `${prefix}_${i + 1}`,
      name: w.name || `造型${i + 1}`,
      description: w.description || '',
      color: w.color || '',
      scene_id: sceneId,
      is_default: isDefault,
    };
  });
  return JSON.stringify(wardrobe);
}

/** 将 AI 返回的空间布局数组归一化（过滤无效项，x/y 兜底 0.5） */
export function normalizeSpatialLayout(raw: any): SpatialLayoutItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((i: any) => i && typeof i === 'object' && (i.name || i.物品名 || i.物体名))
    .map((i: any) => ({
      name: String(i.name ?? i.物品名 ?? i.物体名 ?? ''),
      position: String(i.position ?? i.位置 ?? '画面中'),
      x: Number(i.x ?? 0.5),
      y: Number(i.y ?? 0.5),
    }))
    .filter(i => i.name);
}

/** 将 AI 返回的灯光配置归一化为 LightingConfig（全部为空返回 null） */
export function normalizeLighting(raw: any): LightingConfig | null {
  if (!raw || typeof raw !== 'object') return null;
  const toSource = (s: any) => {
    if (!s || typeof s !== 'object') return undefined;
    return {
      position: String(s.position ?? s.位置 ?? ''),
      color: String(s.color ?? s.颜色 ?? ''),
      intensity: String(s.intensity ?? s.强度 ?? ''),
    };
  };
  const lighting: LightingConfig = {
    key_light: toSource(raw.key_light ?? raw.keyLight ?? raw.主光) as NonNullable<LightingConfig['key_light']>,
    fill_light: toSource(raw.fill_light ?? raw.fillLight ?? raw.补光),
    rim_light: toSource(raw.rim_light ?? raw.rimLight ?? raw.轮廓光),
    ambient: String(raw.ambient ?? raw.环境光 ?? '') || undefined,
  };
  if (!lighting.key_light && !lighting.fill_light && !lighting.rim_light && !lighting.ambient) return null;
  if (!lighting.key_light) lighting.key_light = { position: '前方', color: '白色', intensity: '适中' };
  return lighting;
}

/**
 * 将 AI 分镜输出的 blocking（character_name 引用）解析为 BlockingItem（character_id 引用）
 * P1-10: 未匹配到角色 ID 的条目不再丢弃——保留条目，character_id 置空串、保留 character_name，
 *        由 buildBlockingBlock 按名字反查角色（查不到时回退 character_name / '角色'）
 */
export function resolveBlockingCharacterIds(
  blocking: Array<{ character_name?: string; characterName?: string; position?: string; facing?: string; action?: string }>,
  nameToId: Record<string, string>,
): BlockingItem[] {
  if (!Array.isArray(blocking)) return [];
  return blocking
    .map(b => {
      const name = (b.character_name || b.characterName || '').trim();
      const characterId = (nameToId[name] || '').trim();
      return {
        character_id: characterId,
        character_name: name || undefined,
        position: b.position || '画面中',
        facing: b.facing || '镜头',
        action: b.action || '',
      } as BlockingItem;
    })
    .filter(b => b.character_id || b.character_name);
}
