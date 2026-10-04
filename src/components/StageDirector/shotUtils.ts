// 分镜展示/编辑共享工具：标签映射、角色解析、模型记忆读取（ShotCard 与 ShotDetailPanel 共用）
import type { ModelConfig, Shot } from '../../types';

/** 画面位置选项（blocking 编辑） */
export const BLOCKING_POSITIONS = ['画面左侧', '画面中央', '画面右侧', '前景', '背景'];
/** 朝向选项（blocking 编辑） */
export const BLOCKING_FACINGS = ['左', '右', '镜头', '背对镜头'];

export const shotSizeLabels: Record<string, string> = {
  extreme_close_up: '大特写',
  extreme_closeup: '大特写',
  close_up: '特写',
  closeup: '特写',
  medium_close_up: '近景',
  medium_closeup: '近景',
  medium: '中景',
  medium_long: '中全景',
  long: '全景',
  full: '全景',
  extreme_long: '远景',
  extreme_wide: '大远景',
};

export const cameraLabels: Record<string, string> = {
  static: '固定',
  pan: '摇镜',
  tilt: '俯仰',
  dolly_in: '推进',
  dolly_out: '拉远',
  tracking: '跟拍',
  crane: '升降',
  handheld: '手持',
  zoom: '变焦',
};

/** 读取 localStorage 中的模型记忆（与批量工具栏共用同一存储键，单镜/批量模型选择一致） */
export function readStoredModelKey(key: string): string {
  try {
    return localStorage.getItem(key) || '';
  } catch {
    return '';
  }
}

/** 解析 characters_in_shot（后端已解析为角色名数组） */
export function parseShotCharacterNames(shot: Shot): string[] {
  if (!Array.isArray(shot.characters_in_shot)) return [];
  return shot.characters_in_shot.map((s: unknown) => String(s)).filter(Boolean);
}

/** 解析当前图像模型（记忆优先，缺省第一个已配置） */
export function resolveImageModel(configs: ModelConfig[] | undefined): { provider: string; modelName: string } | null {
  const stored = readStoredModelKey('moo:last_image_model');
  if (stored) {
    const [provider, modelName] = stored.split(':');
    if (provider && modelName) return { provider, modelName };
  }
  const models = configs?.filter((m) => m.is_active) || [];
  if (models.length === 0) return null;
  return { provider: models[0].provider, modelName: models[0].model_name };
}

/** 解析当前视频模型（记忆优先，缺省第一个已配置） */
export function resolveVideoModel(configs: ModelConfig[] | undefined): { provider: string; modelName: string } | null {
  const stored = readStoredModelKey('moo:last_video_model');
  if (stored) {
    const [provider, modelName] = stored.split(':');
    if (provider && modelName) return { provider, modelName };
  }
  const models = configs?.filter((m) => m.is_active) || [];
  if (models.length === 0) return null;
  return { provider: models[0].provider, modelName: models[0].model_name };
}
