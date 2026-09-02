// 通用工具函数

export function cn(...classes: Array<unknown>): string {
  return classes.filter((c) => typeof c === 'string' && c.length > 0).join(' ');
}

export function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return '刚刚';
  if (diffMin < 60) return `${diffMin}分钟前`;
  if (diffHour < 24) return `${diffHour}小时前`;
  if (diffDay < 7) return `${diffDay}天前`;
  return formatDate(dateStr);
}

export function generateId(): string {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function debounce<T extends (...args: unknown[]) => void>(fn: T, delay: number): T {
  let timer: ReturnType<typeof setTimeout>;
  return ((...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  }) as T;
}

export function downloadFile(url: string, filename: string): void {
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function copyToClipboard(text: string): Promise<void> {
  return navigator.clipboard.writeText(text);
}

// 景别中文映射
export const SHOT_SIZE_LABELS: Record<string, string> = {
  extreme_wide: '大远景',
  long: '远景',
  full: '全景',
  medium: '中景',
  medium_closeup: '近景',
  closeup: '特写',
  extreme_closeup: '大特写',
  wide: '广角',
};

// 镜头运动中文映射
export const CAMERA_MOVEMENT_LABELS: Record<string, string> = {
  static: '固定',
  pan: '摇镜',
  tilt: '俯仰',
  dolly: '推拉',
  zoom: '变焦',
  push_in: '推镜',
  pull_out: '拉镜',
  truck: '移镜',
  crane: '升降镜',
  handheld: '手持',
  steadicam: '稳定器',
};

// 转场方式中文映射
export const TRANSITION_LABELS: Record<string, string> = {
  cut: '硬切',
  fade: '淡入淡出',
  dissolve: '叠化',
  wipe: '划像',
  match_cut: '匹配剪辑',
};

// 节奏中文映射
export const PACE_LABELS: Record<string, string> = {
  fast: '快速',
  normal: '中速',
  slow: '慢速',
  slow_motion: '慢动作',
  fast_motion: '快动作',
  long_take: '长镜头',
};

// 角色类型中文映射
export const ROLE_TYPE_LABELS: Record<string, string> = {
  protagonist: '主角',
  supporting: '配角',
  antagonist: '反派',
  extra: '路人',
};

// 性别中文映射
export const GENDER_LABELS: Record<string, string> = {
  male: '男',
  female: '女',
  other: '其他',
};

// 时段中文映射
export const TIME_OF_DAY_LABELS: Record<string, string> = {
  day: '白天',
  night: '夜晚',
  dawn: '黎明',
  dusk: '黄昏',
};
