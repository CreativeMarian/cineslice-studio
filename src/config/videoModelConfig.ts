// 视频模型参数配置表
// 根据各模型官方文档整理，用于前端动态显示可用选项和推荐

export interface VideoModelParamConfig {
  ratios: { value: string; label: string; platform?: string }[];
  resolutions: { value: string; label: string }[];
  durations: { value: number; label: string }[];
  supportsSubtitles: boolean;
  recommendation: string;
  defaultRatio: string;
  defaultResolution: string;
  defaultDuration: number;
}

// 通用比例选项
const COMMON_RATIOS = [
  { value: '16:9', label: '横屏 16:9', platform: 'YouTube/B站/横屏视频' },
  { value: '9:16', label: '竖屏 9:16', platform: '抖音/快手/短视频' },
  { value: '1:1', label: '方形 1:1', platform: 'Instagram/朋友圈' },
  { value: '4:3', label: '标准 4:3', platform: '传统视频' },
  { value: '3:4', label: '竖版 3:4', platform: '小红书/IG Reels' },
  { value: '21:9', label: '宽屏 21:9', platform: '电影/宽银幕' },
];

export const VIDEO_MODEL_CONFIGS: Record<string, VideoModelParamConfig> = {
  // ========== 豆包 Seedance 系列 ==========
  'doubao:doubao-seedance-1-0-pro-250528': {
    ratios: COMMON_RATIOS,
    resolutions: [
      { value: '720p', label: '720p (快速)' },
      { value: '1080p', label: '1080p (推荐)' },
    ],
    durations: [
      { value: 5, label: '5秒' },
      { value: 10, label: '10秒' },
    ],
    supportsSubtitles: false,
    recommendation: 'Seedance 1.0 Pro：横屏用16:9，竖屏用9:16；默认1080p/5秒平衡质量与速度；首尾帧插值效果更佳',
    defaultRatio: '16:9',
    defaultResolution: '1080p',
    defaultDuration: 5,
  },
  'doubao:doubao-seedance-2-0-260128': {
    ratios: COMMON_RATIOS,
    resolutions: [
      { value: '720p', label: '720p (快速)' },
      { value: '1080p', label: '1080p (推荐)' },
      { value: '2k', label: '2K (超清)' },
    ],
    durations: [
      { value: 5, label: '5秒' },
      { value: 10, label: '10秒' },
      { value: 15, label: '15秒' },
    ],
    supportsSubtitles: false,
    recommendation: 'Seedance 2.0：支持2K分辨率和15秒长视频；运动连贯性更强，适合复杂运镜场景',
    defaultRatio: '16:9',
    defaultResolution: '1080p',
    defaultDuration: 5,
  },
  'doubao:doubao-seedance-2-5-260628': {
    ratios: COMMON_RATIOS,
    resolutions: [
      { value: '720p', label: '720p (快速)' },
      { value: '1080p', label: '1080p (推荐)' },
      { value: '2k', label: '2K (超清)' },
      { value: '4k', label: '4K (超高清)' },
    ],
    durations: [
      { value: 5, label: '5秒' },
      { value: 10, label: '10秒' },
      { value: 15, label: '15秒' },
      { value: 30, label: '30秒' },
    ],
    supportsSubtitles: false,
    recommendation: 'Seedance 2.5：旗舰模型，支持4K和30秒长视频；单段2-30秒，总时长不超30秒；适合高质量成片',
    defaultRatio: '16:9',
    defaultResolution: '1080p',
    defaultDuration: 5,
  },

  // ========== 可灵 Kling 系列 ==========
  'kling:kling-v1': {
    ratios: COMMON_RATIOS.filter(r => ['16:9', '9:16', '1:1'].includes(r.value)),
    resolutions: [
      { value: '720p', label: '720p (标准)' },
      { value: '1080p', label: '1080p (高清)' },
    ],
    durations: [
      { value: 5, label: '5秒' },
      { value: 10, label: '10秒' },
    ],
    supportsSubtitles: false,
    recommendation: '可灵 Kling V1：仅支持16:9/9:16/1:1三种比例；1080p需Pro模式；人物动作和物理模拟出色',
    defaultRatio: '16:9',
    defaultResolution: '720p',
    defaultDuration: 5,
  },
  'kling:kling-v2': {
    ratios: COMMON_RATIOS.filter(r => ['16:9', '9:16', '1:1'].includes(r.value)),
    resolutions: [
      { value: '720p', label: '720p (标准)' },
      { value: '1080p', label: '1080p (高清)' },
    ],
    durations: [
      { value: 5, label: '5秒' },
      { value: 10, label: '10秒' },
    ],
    supportsSubtitles: false,
    recommendation: '可灵 Kling V2：支持首尾帧和运镜控制；1080p画质提升明显；适合快手风格短视频',
    defaultRatio: '16:9',
    defaultResolution: '720p',
    defaultDuration: 5,
  },
  'kling:kling-v3': {
    ratios: COMMON_RATIOS.filter(r => ['16:9', '9:16', '1:1'].includes(r.value)),
    resolutions: [
      { value: '720p', label: '720p (快速)' },
      { value: '1080p', label: '1080p (推荐)' },
      { value: '4k', label: '4K (旗舰)' },
    ],
    durations: [
      { value: 5, label: '5秒' },
      { value: 10, label: '10秒' },
      { value: 15, label: '15秒' },
    ],
    supportsSubtitles: true,
    recommendation: '可灵 Kling V3：最新旗舰，支持4K和15秒；支持声音生成和字幕；多主体一致性大幅提升',
    defaultRatio: '16:9',
    defaultResolution: '1080p',
    defaultDuration: 5,
  },

  // ========== 即梦 Dreamina 系列 ==========
  'jimeng:jimeng-video-3-0': {
    ratios: COMMON_RATIOS,
    resolutions: [
      { value: '720p', label: '720p (标准)' },
      { value: '1080p', label: '1080p (高清)' },
    ],
    durations: [
      { value: 5, label: '5秒' },
      { value: 10, label: '10秒' },
    ],
    supportsSubtitles: false,
    recommendation: '即梦 3.0：支持全部6种比例；1080p仅文生视频和首尾帧模式；运镜模式限720p',
    defaultRatio: '16:9',
    defaultResolution: '720p',
    defaultDuration: 5,
  },

  // ========== MiniMax 海螺系列 ==========
  'minimax:MiniMax-Hailuo-02': {
    ratios: COMMON_RATIOS,
    resolutions: [
      { value: '512p', label: '512p (极速)' },
      { value: '720p', label: '720p (标准)' },
      { value: '768p', label: '768p (推荐)' },
      { value: '1080p', label: '1080p (高清)' },
    ],
    durations: [
      { value: 6, label: '6秒' },
      { value: 10, label: '10秒' },
    ],
    supportsSubtitles: false,
    recommendation: '海螺 02：6秒可选512P/768P/1080P，10秒可选512P/768P；自带立体声，适合带音效场景',
    defaultRatio: '16:9',
    defaultResolution: '768p',
    defaultDuration: 6,
  },
  'minimax:MiniMax-H3': {
    ratios: COMMON_RATIOS,
    resolutions: [
      { value: '768p', label: '768p (标准)' },
      { value: '2k', label: '2K (原生推荐)' },
    ],
    durations: [
      { value: 4, label: '4秒' },
      { value: 5, label: '5秒' },
      { value: 10, label: '10秒' },
      { value: 15, label: '15秒' },
    ],
    supportsSubtitles: false,
    recommendation: '海螺 H3：原生2K分辨率，4-15秒可调；始终带立体声；电影感运镜和光影效果出色',
    defaultRatio: '16:9',
    defaultResolution: '2k',
    defaultDuration: 5,
  },

  // ========== 本地 ComfyUI MiniMax H3 首尾帧（推荐：免费、无额度、一致性最强） ==========
  'comfyui:minimax-h3-flf2v.json': {
    ratios: [
      { value: '16:9', label: '横屏 16:9（推荐）', platform: '剧集/横屏视频' },
    ],
    resolutions: [
      { value: '720p', label: '1280×704（本机最优）' },
    ],
    durations: [
      { value: 5, label: '5秒（固定）' },
    ],
    supportsSubtitles: false,
    recommendation: '本地 ComfyUI + MiniMax H3 首尾帧：首帧+尾帧双端硬锁定，人物/场景/道具一致性最强；免费无额度；固定 1280×704/5秒，每镜约20分钟（本机推理）。已在 ComfyUI 运行并配好 flf2v 工作流即可选用',
    defaultRatio: '16:9',
    defaultResolution: '704p',
    defaultDuration: 5,
  },

  // ========== 通义万相 ==========
  'qwen:qwen-video': {
    ratios: COMMON_RATIOS.filter(r => ['16:9', '9:16', '1:1'].includes(r.value)),
    resolutions: [
      { value: '720p', label: '720p' },
      { value: '1080p', label: '1080p' },
    ],
    durations: [
      { value: 5, label: '5秒' },
      { value: 10, label: '10秒' },
    ],
    supportsSubtitles: false,
    recommendation: '通义万相：阿里出品，中文理解能力强；适合中文场景和电商视频',
    defaultRatio: '16:9',
    defaultResolution: '720p',
    defaultDuration: 5,
  },
};

// 支持首尾帧（起止画面双锁定）的视频模型 key 集合：
// - comfyui:minimax-h3-flf2v.json：本地 ComfyUI 首尾帧工作流（已验证，推荐）
// - jimeng:jimeng-video-3-0：即梦 image_urls=[首帧,尾帧] 双帧上传
// - kling:kling-v2 / kling:kling-v3：可灵 image2video 的 image_tail 尾帧
export const FLF2V_MODEL_KEYS = new Set<string>([
  'comfyui:minimax-h3-flf2v.json',
  'jimeng:jimeng-video-3-0',
  'kling:kling-v2',
  'kling:kling-v3',
]);



// ═══════════════════════════════════════════════════════════════
// 提示词 Skill（官方提示词模板）支持判定
// 每个视频模型一个官方提示词 skill：解析剧本后、生成分镜/提取资产前自动加载，
// 用大模型官网的提示词规范指导分镜/关键帧/视频各阶段提示词构造。
// 后端命中集合与 server/src/services/promptSkills/ 一致：
//   minimax-h3 → providers: minimax/comfyui, modelKeys: minimax-h3/h3/flf2v...
// ═══════════════════════════════════════════════════════════════
const PROMPT_SKILL_MODEL_KEYS: Array<{ providers: string[]; keys: string[]; skillName: string }> = [
  { providers: ['minimax', 'comfyui'], keys: ['minimax-h3', 'minimaxh3', 'h3', 'flf2v', 'hailuo3'], skillName: 'MiniMax H3 官方提示词' },
  // 后续模型追加：如 kling / jimeng / seedance 官方 skill
];

/** 该模型是否配置了官方提示词 Skill（前端据此显示“官方提示词模板”标识） */
export function hasPromptSkillForModel(provider: string, modelName: string): boolean {
  const p = (provider || '').toLowerCase();
  const m = (modelName || '').toLowerCase();
  return PROMPT_SKILL_MODEL_KEYS.some((entry) => {
    const providerHit = entry.providers.some((pr) => p.includes(pr) || pr.includes(p));
    const keyHit = entry.keys.some((k) => m.includes(k) || k.includes(m));
    return providerHit && keyHit;
  });
}

/** 获取模型的提示词 Skill 名称（用于 UI 展示） */
export function getPromptSkillName(provider: string, modelName: string): string | null {
  const p = (provider || '').toLowerCase();
  const m = (modelName || '').toLowerCase();
  for (const entry of PROMPT_SKILL_MODEL_KEYS) {
    const providerHit = entry.providers.some((pr) => p.includes(pr) || pr.includes(p));
    const keyHit = entry.keys.some((k) => m.includes(k) || k.includes(m));
    if (providerHit && keyHit) return entry.skillName;
  }
  return null;
}
/** 该视频模型是否支持首尾帧（前端据此显示备注，提示用户首尾帧出片质量更稳） */
export function supportsFLF2V(modelKey: string): boolean {
  if (!modelKey) return false;
  if (FLF2V_MODEL_KEYS.has(modelKey)) return true;
  const modelName = (modelKey.split(':')[1] || '').toLowerCase();
  // 兜底：模型名含 flf2v / 首尾帧 关键字
  return modelName.includes('flf2v');
}

export const DEFAULT_VIDEO_CONFIG: VideoModelParamConfig = {
  ratios: COMMON_RATIOS,
  resolutions: [
    { value: '720p', label: '720p' },
    { value: '1080p', label: '1080p' },
  ],
  durations: [
    { value: 5, label: '5秒' },
    { value: 10, label: '10秒' },
  ],
  supportsSubtitles: false,
  recommendation: '通用配置：横屏用16:9，竖屏用9:16；默认1080p/5秒；具体参数支持请参考模型官方文档',
  defaultRatio: '16:9',
  defaultResolution: '1080p',
  defaultDuration: 5,
};

export function getVideoModelConfig(modelKey: string): VideoModelParamConfig {
  // 精确匹配
  if (VIDEO_MODEL_CONFIGS[modelKey]) {
    return VIDEO_MODEL_CONFIGS[modelKey];
  }
  // provider 前缀匹配（按优先级：高版本优先）
  const provider = modelKey.split(':')[0];
  const providerConfigs = Object.entries(VIDEO_MODEL_CONFIGS)
    .filter(([key]) => key.startsWith(provider + ':'))
    .sort(([a], [b]) => {
      // H3 > Hailuo-02, v3 > v2 > v1, 2.5 > 2.0 > 1.0
      const priority = (k: string) => {
        if (k.includes('H3') || k.includes('2-5') || k.includes('v3')) return 3;
        if (k.includes('2-0') || k.includes('v2') || k.includes('Hailuo-02')) return 2;
        return 1;
      };
      return priority(b) - priority(a);
    });
  if (providerConfigs.length > 0) {
    return providerConfigs[0][1];
  }
  // 模型名关键词匹配（不区分大小写）
  const modelName = (modelKey.split(':')[1] || '').toLowerCase();
  if (modelName.includes('seedance')) {
    return VIDEO_MODEL_CONFIGS['doubao:doubao-seedance-1-0-pro-250528'];
  }
  if (modelName.includes('kling')) {
    return VIDEO_MODEL_CONFIGS['kling:kling-v3'];
  }
  if (modelName.includes('hailuo') || modelName.includes('minimax') || modelName.includes('海螺') || modelName.includes('h3')) {
    return VIDEO_MODEL_CONFIGS['minimax:MiniMax-H3'];
  }
  if (modelName.includes('jimeng') || modelName.includes('即梦') || modelName.includes('dreamina')) {
    return VIDEO_MODEL_CONFIGS['jimeng:jimeng-video-3-0'];
  }
  return DEFAULT_VIDEO_CONFIG;
}
