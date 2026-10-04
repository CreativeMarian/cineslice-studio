import apiClient from './apiClient';
import { API_PATHS } from '../constants/api';
import type { Shot, Keyframe, ApiResponse } from '../types';

/**
 * 镜头更新载荷：characters_in_shot 以 JSON 字符串提交（后端按 JSON 字符串入库并解析回数组，
 * 传数组会被 better-sqlite3 展开为多个绑定值导致 "Too many parameter values"）；
 * scene_id 传 null 可清空场景关联（后端 schema 允许 nullable）
 */
export type ShotUpdateData = Partial<Omit<Shot, 'characters_in_shot' | 'scene_id'>> & {
  characters_in_shot?: string;
  scene_id?: string | null;
};

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
  ) => apiClient.post<unknown, ApiResponse<Shot[]>>(API_PATHS.shotsGenerate(episodeId), data),

  // 获取镜头列表
  list: (episodeId: string) =>
    apiClient.get<unknown, ApiResponse<Shot[]>>(API_PATHS.shots(episodeId)),

  // 更新镜头
  update: (id: string, data: ShotUpdateData) =>
    apiClient.put<unknown, ApiResponse<Shot>>(API_PATHS.shot(id), data),

  // 删除镜头
  delete: (id: string) =>
    apiClient.delete<unknown, ApiResponse<void>>(API_PATHS.shot(id)),

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
    API_PATHS.shotKeyframesGenerate(shotId),
    data
  ),

  // 获取关键帧列表
  getKeyframes: (shotId: string) =>
    apiClient.get<unknown, ApiResponse<Keyframe[]>>(API_PATHS.shotKeyframes(shotId)),

  // 重新生成单张关键帧
  regenerateKeyframe: (keyframeId: string) =>
    apiClient.post<unknown, ApiResponse<Keyframe>>(API_PATHS.keyframeRegenerate(keyframeId)),

  // 删除关键帧（只删首帧图片，不删除镜头）
  deleteKeyframe: (keyframeId: string) =>
    apiClient.delete<unknown, ApiResponse<void>>(API_PATHS.keyframe(keyframeId)),

  // 批量删除该集所有镜头（含级联的关键帧/视频/音频）
  deleteAllShots: (episodeId: string) =>
    apiClient.delete<unknown, ApiResponse<{ deleted: number }>>(API_PATHS.shots(episodeId)),
};
