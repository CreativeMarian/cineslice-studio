import apiClient from './apiClient';
import type { StylePreset, ApiResponse } from '../types';

export const stylePresetService = {
  list: () =>
    apiClient.get<unknown, ApiResponse<StylePreset[]>>('/style-presets'),

  listBuiltin: () =>
    apiClient.get<unknown, ApiResponse<StylePreset[]>>('/style-presets/builtin'),

  get: (id: string) =>
    apiClient.get<unknown, ApiResponse<StylePreset>>(`/style-presets/${id}`),

  create: (data: {
    name: string;
    description?: string;
    category?: string;
    visual_style: string;
    camera_language?: string;
    color_palette?: string;
    shot_rhythm?: string;
    video_params?: string;
  }) =>
    apiClient.post<unknown, ApiResponse<StylePreset>>('/style-presets', data),

  update: (id: string, data: Partial<StylePreset>) =>
    apiClient.put<unknown, ApiResponse<StylePreset>>(`/style-presets/${id}`, data),

  delete: (id: string) =>
    apiClient.delete<unknown, ApiResponse<void>>(`/style-presets/${id}`),

  applyToProject: (presetId: string, projectId: string) =>
    apiClient.post<unknown, ApiResponse<{ message: string; preset: StylePreset }>>(
      `/style-presets/${presetId}/apply-to-project/${projectId}`
    ),
};
