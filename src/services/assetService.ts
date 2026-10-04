import apiClient from './apiClient';
import { API_PATHS } from '../constants/api';
import type { Character, Scene, Prop, ApiResponse } from '../types';

// ---------- 角色 ----------

export const characterService = {
  extract: (episodeId: string, data: { provider: string; modelName: string }) =>
    apiClient.post<unknown, ApiResponse<Character[]>>(
      API_PATHS.charactersExtract(episodeId),
      data
    ),

  list: (episodeId: string) =>
    apiClient.get<unknown, ApiResponse<Character[]>>(API_PATHS.charactersList(episodeId)),

  update: (id: string, data: Partial<Pick<Character, 'name' | 'description' | 'visual_description' | 'gender' | 'role_type' | 'voice_profile' | 'identity_lock' | 'wardrobe' | 'selected_image_index'>>) =>
    apiClient.put<unknown, ApiResponse<Character>>(API_PATHS.character(id), data),

  generateImage: (
    id: string,
    data: { provider: string; modelName: string; count?: number; referenceImageUrl?: string; prompt?: string }
  ) => apiClient.post<unknown, ApiResponse<Character>>(API_PATHS.characterGenerateImage(id), data),

  // 生成角色四视图（面部特写 + 三视图：正面/侧面/背面）
  generateFourView: (
    id: string,
    data: { provider: string; modelName: string; referenceImageUrl?: string; prompt?: string }
  ) => apiClient.post<unknown, ApiResponse<Character>>(API_PATHS.characterGenerateFourView(id), data),

  uploadReference: (id: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return apiClient.post<unknown, ApiResponse<Character>>(
      API_PATHS.characterUploadReference(id),
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    );
  },

  deleteImage: (id: string, index: number) =>
    apiClient.delete<unknown, ApiResponse<{ message: string; remaining: number }>>(API_PATHS.characterDeleteImage(id, index)),

  // 删除角色四视图（接口由后端子任务实现；未实现时返回 404，前端降级提示）
  deleteFourView: (id: string) =>
    apiClient.delete<unknown, ApiResponse<{ message: string }>>(API_PATHS.characterDeleteFourView(id), { silent: true }),

  delete: (id: string) =>
    apiClient.delete<unknown, ApiResponse<void>>(API_PATHS.character(id)),
};

// ---------- 场景 ----------

export const sceneService = {
  extract: (episodeId: string, data: { provider: string; modelName: string }) =>
    apiClient.post<unknown, ApiResponse<Scene[]>>(
      API_PATHS.scenesExtract(episodeId),
      data
    ),

  list: (episodeId: string) =>
    apiClient.get<unknown, ApiResponse<Scene[]>>(API_PATHS.scenesList(episodeId)),

  update: (id: string, data: Partial<Scene>) =>
    apiClient.put<unknown, ApiResponse<Scene>>(API_PATHS.scene(id), data),

  generateImage: (
    id: string,
    data: { provider: string; modelName: string; count?: number; prompt?: string }
  ) => apiClient.post<unknown, ApiResponse<Scene>>(API_PATHS.sceneGenerateImage(id), data),

  deleteImage: (id: string, index: number) =>
    apiClient.delete<unknown, ApiResponse<{ message: string; remaining: number }>>(API_PATHS.sceneDeleteImage(id, index)),

  delete: (id: string) =>
    apiClient.delete<unknown, ApiResponse<void>>(API_PATHS.scene(id)),
};

// ---------- 道具 ----------

export const propService = {
  list: (episodeId: string) =>
    apiClient.get<unknown, ApiResponse<Prop[]>>(API_PATHS.props(episodeId)),

  extract: (episodeId: string, data: { provider: string; modelName: string }) =>
    apiClient.post<unknown, ApiResponse<Prop[]>>(
      API_PATHS.propsExtract(episodeId),
      data
    ),

  create: (episodeId: string, data: { name: string; category?: string; description?: string }) =>
    apiClient.post<unknown, ApiResponse<Prop>>(API_PATHS.props(episodeId), data),

  update: (id: string, data: Partial<Prop>) =>
    apiClient.put<unknown, ApiResponse<Prop>>(API_PATHS.prop(id), data),

  delete: (id: string) =>
    apiClient.delete<unknown, ApiResponse<void>>(API_PATHS.prop(id)),

  generateImage: (
    id: string,
    data: { provider: string; modelName: string; count?: number; referenceImageUrl?: string; prompt?: string }
  ) => apiClient.post<unknown, ApiResponse<Array<{ url: string; model: string; prompt: string }>>>(API_PATHS.propGenerateImage(id), data),

  deleteImage: (id: string, index: number) =>
    apiClient.delete<unknown, ApiResponse<{ message: string; remaining: number }>>(API_PATHS.propDeleteImage(id, index)),
};
