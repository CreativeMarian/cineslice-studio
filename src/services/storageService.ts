// localStorage 封装，统一 key 前缀与 JSON 序列化

const PREFIX = 'cineslice_studio_';

export const storageService = {
  get<T>(key: string, defaultValue: T): T {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      if (raw === null) return defaultValue;
      return JSON.parse(raw) as T;
    } catch {
      return defaultValue;
    }
  },

  set<T>(key: string, value: T): void {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch {
      // 存储已满或不可用，静默失败
    }
  },

  remove(key: string): void {
    localStorage.removeItem(PREFIX + key);
  },

  // 原始字符串操作（用于 token 等）
  getRaw(key: string): string | null {
    return localStorage.getItem(key);
  },

  setRaw(key: string, value: string): void {
    localStorage.setItem(key, value);
  },

  removeRaw(key: string): void {
    localStorage.removeItem(key);
  },

  clear(): void {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(PREFIX))
      .forEach((k) => localStorage.removeItem(k));
  },
};
