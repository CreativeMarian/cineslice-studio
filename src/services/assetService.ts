import apiClient from './apiClient';
import type { Character, Scene, Prop, ApiResponse } from '../types';

// ---------- 角色 ----------

export const characterService = {
  extract: (episodeId: string, data: { provider: string; modelName: string }) =>
    apiClient.post<unknown, ApiResponse<Character[]>>(
      `/episodes/${episodeId}/characters/extract`,
      data
    ),

  list: (episodeId: string) =>
    apiClient.get<unknown, ApiResponse<Character[]>>(`/episodes/${episodeId}/characters`),

  update: (id: string, data: Partial<Pick<Character, 'name' | 'description' | 'visual_description' | 'gender' | 'role_type' | 'voice_profile'>>) =>
    apiClient.put<unknown, ApiResponse<Character>>(`/characters/${id}`, data),

  generateImage: (
    id: string,
    data: { provider: string; modelName: string; count?: number; referenceImageUrl?: string; prompt?: string }
  ) => apiClient.post<unknown, ApiResponse<Character>>(`/characters/${id}/generate-image`, data),

  // 生成角色四视图（面部特写 + 三视图：正面/侧面/背面）
  generateFourView: (
    id: string,
    data: { provider: string; modelName: string; referenceImageUrl?: string; prompt?: string }
  ) => apiClient.post<unknown, ApiResponse<Character>>(`/characters/${id}/generate-four-view`, data),

  uploadReference: (id: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return apiClient.post<unknown, ApiResponse<Character>>(
      `/characters/${id}/upload-reference`,
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    );
  },

  deleteImage: (id: string, index: number) =>
    apiClient.delete<unknown, ApiResponse<{ message: string; remaining: number }>>(`/characters/${id}/images/${index}`),
};

// ---------- 场景 ----------

export const sceneService = {
  extract: (episodeId: string, data: { provider: string; modelName: string }) =>
    apiClient.post<unknown, ApiResponse<Scene[]>>(
      `/episodes/${episodeId}/scenes/extract`,
      data
    ),

  list: (episodeId: string) =>
    apiClient.get<unknown, ApiResponse<Scene[]>>(`/episodes/${episodeId}/scenes`),

  update: (id: string, data: Partial<Scene>) =>
    apiClient.put<unknown, ApiResponse<Scene>>(`/scenes/${id}`, data),

  generateImage: (
    id: string,
    data: { provider: string; modelName: string; count?: number; prompt?: string }
  ) => apiClient.post<unknown, ApiResponse<Scene>>(`/scenes/${id}/generate-image`, data),

  deleteImage: (id: string, index: number) =>
    apiClient.delete<unknown, ApiResponse<{ message: string; remaining: number }>>(`/scenes/${id}/images/${index}`),
};

// ---------- 道具 ----------

export const propService = {
  list: (episodeId: string) =>
    apiClient.get<unknown, ApiResponse<Prop[]>>(`/episodes/${episodeId}/props`),

  extract: (episodeId: string, data: { provider: string; modelName: string }) =>
    apiClient.post<unknown, ApiResponse<Prop[]>>(
      `/episodes/${episodeId}/props/extract`,
      data
    ),

  create: (episodeId: string, data: { name: string; category?: string; description?: string }) =>
    apiClient.post<unknown, ApiResponse<Prop>>(`/episodes/${episodeId}/props`, data),

  update: (id: string, data: Partial<Prop>) =>
    apiClient.put<unknown, ApiResponse<Prop>>(`/props/${id}`, data),

  delete: (id: string) =>
    apiClient.delete<unknown, ApiResponse<void>>(`/props/${id}`),
};
