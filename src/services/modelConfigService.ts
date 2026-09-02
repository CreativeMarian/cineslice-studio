import apiClient from './apiClient';
import type { ModelConfig, ModelType, ApiResponse } from '../types';
import type { ModelMeta } from '../types/model';

export const modelConfigService = {
  // 获取已配置模型列表（按类型分组）
  list: () =>
    apiClient.get<unknown, ApiResponse<Record<ModelType, ModelConfig[]>>>('/models'),

  // 获取系统支持的所有模型（内置元数据）
  available: () =>
    apiClient.get<unknown, ApiResponse<ModelMeta[]>>('/models/available'),

  // 添加/更新模型配置
  upsert: (data: {
    provider: string;
    model_name: string;
    model_type?: ModelType;
    model_types?: ModelType[];
    api_key: string;
    endpoint_url?: string;
    is_default?: boolean;
    config?: string;
    supports_audio?: boolean;
  }) => apiClient.post<unknown, ApiResponse<ModelConfig>>('/models', data),

  // 删除模型配置
  delete: (id: string) =>
    apiClient.delete<unknown, ApiResponse<void>>(`/models/${id}`),

  // 测试连接
  test: (id: string) =>
    apiClient.post<unknown, ApiResponse<{ status: 'success' | 'failed'; latencyMs: number; error?: string }>>(
      `/models/${id}/test`
    ),

  // 设为默认
  setDefault: (id: string) =>
    apiClient.put<unknown, ApiResponse<ModelConfig>>(`/models/${id}/default`),

  // 获取某阶段推荐模型
  getRecommended: (stage: string) =>
    apiClient.get<unknown, ApiResponse<ModelConfig[]> & { fallback?: boolean }>(
      `/models/recommended/${stage}`
    ),

  // 设置模型的推荐阶段
  setRecommendedFor: (id: string, stages: string[]) =>
    apiClient.put<unknown, ApiResponse<ModelConfig>>(`/models/${id}/recommended-for`, { stages }),
};
