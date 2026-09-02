import { create } from 'zustand';
import type { ModelConfig, ModelType } from '../types';
import { modelConfigService } from '../services/modelConfigService';

interface ModelState {
  configs: Record<ModelType, ModelConfig[]>;
  isLoading: boolean;

  loadConfigs: () => Promise<void>;
  upsertConfig: (data: {
    provider: string;
    model_name: string;
    model_type: ModelType;
    api_key: string;
    endpoint_url?: string;
    is_default?: boolean;
    config?: string;
    supports_audio?: boolean;
  }) => Promise<void>;
  deleteConfig: (id: string) => Promise<void>;
  testConfig: (id: string) => Promise<{ status: string; latencyMs: number; error?: string } | null>;
  setDefault: (id: string) => Promise<void>;
  getConfiguredModels: (type: ModelType) => ModelConfig[];
  getDefaultModel: (type: ModelType) => ModelConfig | undefined;
}

const emptyConfigs: Record<ModelType, ModelConfig[]> = {
  text: [],
  image: [],
  video: [],
  audio: [],
};

export const useModelStore = create<ModelState>((set, get) => ({
  configs: { ...emptyConfigs },
  isLoading: false,

  loadConfigs: async () => {
    set({ isLoading: true });
    try {
      const res = await modelConfigService.list();
      if (res.success && res.data) {
        set({ configs: res.data });
      }
    } catch {
      set({ configs: { ...emptyConfigs } });
    } finally {
      set({ isLoading: false });
    }
  },

  upsertConfig: async (data) => {
    try {
      const res = await modelConfigService.upsert(data);
      if (res.success && res.data) {
        const model = res.data;
        set((state) => {
          const typeConfigs = state.configs[model.model_type];
          const existing = typeConfigs.find((m) => m.id === model.id);
          const updated = existing
            ? typeConfigs.map((m) => (m.id === model.id ? model : m))
            : [...typeConfigs, model];
          return {
            configs: { ...state.configs, [model.model_type]: updated },
          };
        });
      }
    } catch {
      // 错误已由拦截器处理
    }
  },

  deleteConfig: async (id) => {
    try {
      await modelConfigService.delete(id);
      set((state) => {
        const configs = { ...state.configs };
        (Object.keys(configs) as ModelType[]).forEach((type) => {
          configs[type] = configs[type].filter((m) => m.id !== id);
        });
        return { configs };
      });
    } catch {
      // 错误已由拦截器处理
    }
  },

  testConfig: async (id) => {
    try {
      const res = await modelConfigService.test(id);
      if (res.success && res.data) {
        // 测试后更新对应配置的 last_test_status
        set((state) => {
          const newConfigs = { ...state.configs };
          for (const type of Object.keys(newConfigs) as ModelType[]) {
            newConfigs[type] = newConfigs[type].map((c) =>
              c.id === id ? { ...c, last_test_status: res.data!.status, last_test_at: new Date().toISOString() } : c
            );
          }
          return { configs: newConfigs };
        });
        return res.data;
      }
      return null;
    } catch {
      return null;
    }
  },

  setDefault: async (id) => {
    try {
      const res = await modelConfigService.setDefault(id);
      if (res.success && res.data) {
        const model = res.data;
        set((state) => {
          const typeConfigs = state.configs[model.model_type].map((m) => ({
            ...m,
            is_default: m.id === model.id,
          }));
          return {
            configs: { ...state.configs, [model.model_type]: typeConfigs },
          };
        });
      }
    } catch {
      // 错误已由拦截器处理
    }
  },

  getConfiguredModels: (type) => get().configs[type] || [],

  getDefaultModel: (type) => {
    const models = get().configs[type] || [];
    return models.find((m) => m.is_default) || models[0];
  },
}));
