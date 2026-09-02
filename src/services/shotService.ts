import apiClient from './apiClient';
import type { Shot, Keyframe, ApiResponse } from '../types';

export const shotService = {
  // 生成分镜
  generate: (
    episodeId: string,
    data: {
      textProvider: string;
      textModel: string;
      imageProvider?: string;
      imageModel?: string;
      shotDensity?: 'sparse' | 'normal' | 'dense';
      includeDialogue?: boolean;
    }
  ) => apiClient.post<unknown, ApiResponse<Shot[]>>(`/episodes/${episodeId}/shots/generate`, data),

  // 获取镜头列表
  list: (episodeId: string) =>
    apiClient.get<unknown, ApiResponse<Shot[]>>(`/episodes/${episodeId}/shots`),

  // 更新镜头
  update: (id: string, data: Partial<Shot>) =>
    apiClient.put<unknown, ApiResponse<Shot>>(`/shots/${id}`, data),

  // 删除镜头
  delete: (id: string) =>
    apiClient.delete<unknown, ApiResponse<void>>(`/shots/${id}`),

  // 生成关键帧
  generateKeyframes: (
    shotId: string,
    data: {
      provider: string;
      modelName: string;
      frameTypes?: Array<'first' | 'last' | 'middle'>;
      referenceCharacterIds?: string[];
      referenceSceneId?: string;
    }
  ) => apiClient.post<unknown, ApiResponse<Keyframe[]>>(
    `/shots/${shotId}/keyframes/generate`,
    data
  ),

  // 获取关键帧列表
  getKeyframes: (shotId: string) =>
    apiClient.get<unknown, ApiResponse<Keyframe[]>>(`/shots/${shotId}/keyframes`),

  // 重新生成单张关键帧
  regenerateKeyframe: (keyframeId: string) =>
    apiClient.post<unknown, ApiResponse<Keyframe>>(`/keyframes/${keyframeId}/regenerate`),
};
