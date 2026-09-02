// 模型配置相关工具函数

// 解析模型配置中的 config 字段，获取模型名覆盖（如火山引擎接入点 ID）
export function resolveModelName(modelConfig: { config?: string | null }, defaultName: string): string {
  if (modelConfig.config) {
    try {
      const cfg = JSON.parse(modelConfig.config);
      if (cfg.modelOverride && typeof cfg.modelOverride === 'string') {
        return cfg.modelOverride;
      }
    } catch {
      // 解析失败，使用默认模型名
    }
  }
  return defaultName;
}
