// 后端共享常量（P3-4）
// 集中定义散落在服务中的魔法数字，统一维护、避免硬编码漂移

/** 视频提示词最大长度（字符数，与 prompts/video.ts 对齐） */
export const VIDEO_PROMPT_MAX_LENGTH = 300;

/** 单个 segment 的最小时长（秒） */
export const SEGMENT_MIN_DURATION = 8;

/** 单个 segment 的最大时长（秒） */
export const SEGMENT_MAX_DURATION = 15;

/** 单个 segment 最少镜头数 */
export const SEGMENT_MIN_SHOTS = 2;

/** 单个 segment 最多镜头数 */
export const SEGMENT_MAX_SHOTS = 4;

/** 视频生成支持的 ratio 值（与 aiProxy.generateVideo 一致） */
export type VideoRatio = '1:1' | '4:3' | '3:4' | '21:9' | '9:16' | '16:9';

/**
 * P1-7: 项目宽高比 → 视频生成 ratio 完整映射表
 * 支持的视频比例：1:1 / 4:3 / 3:4 / 21:9 / 9:16；未知/空值默认 16:9
 */
export const ASPECT_RATIO_TO_VIDEO_RATIO: Record<string, VideoRatio> = {
  '1:1': '1:1',
  '4:3': '4:3',
  '3:4': '3:4',
  '21:9': '21:9',
  '9:16': '9:16',
};

/** P1-7: 项目宽高比 → 视频生成 ratio（未知比例回退 16:9） */
export function getVideoRatio(aspectRatio: string | null | undefined): VideoRatio {
  if (!aspectRatio) return '16:9';
  const key = String(aspectRatio).trim();
  return ASPECT_RATIO_TO_VIDEO_RATIO[key] || '16:9';
}

/** aiProxy.generateImage 支持的 size 白名单 */
export type KeyframeSize =
  | '512x512'
  | '1024x1024'
  | '1024x1792'
  | '1792x1024'
  | '2048x2048'
  | '2048x1152'
  | '2560x1440'
  | '1440x2560';

/**
 * P1-9: 关键帧尺寸（管线路径与手动路径统一入口）
 * 按项目宽高比映射；目标尺寸不在 aiProxy.generateImage 白名单时取最接近的受支持尺寸：
 * 9:16→1440x2560，1:1→2048x2048，4:3→1792x1024（目标 1920x1440 不在白名单，取最接近横版），
 * 3:4→1024x1792（目标 1440x1920 不在白名单，取最接近竖版），
 * 21:9→2560x1440（目标 2560x1080 不在白名单，取最接近横版），未知/空默认 2560x1440
 */
export function getKeyframeSize(aspectRatio: string | null | undefined): KeyframeSize {
  switch (String(aspectRatio || '').trim()) {
    case '9:16': return '1440x2560';
    case '1:1': return '2048x2048';
    case '4:3': return '1792x1024';
    case '3:4': return '1024x1792';
    case '21:9': return '2560x1440';
    default: return '2560x1440';
  }
}

/** 阶段名称（与分镜生成提示词保持一致；曾在 shotGenerator/videoComposer/autoPipeline 三处重复定义） */
export const PHASE_NAMES = ['开场引入', '矛盾升级', '高潮爆发', '收束悬念'] as const;

/** 云端视频任务超时窗口（毫秒）：通常 1-10 分钟出片，超过判定为失败 */
export const VIDEO_TASK_TIMEOUT_MS = 10 * 60 * 1000;

/** ComfyUI 本地渲染超时窗口（毫秒）：本地渲染（MiniMaxH3 等）单镜头可达 30 分钟以上，
 *  且队列按序渲染，排队时间计入等待，故用 24h 兜底，避免把健康任务误判失败 */
export const COMFY_LOCAL_VIDEO_TASK_TIMEOUT_MS = 24 * 60 * 60 * 1000;

