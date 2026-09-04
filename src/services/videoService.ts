import apiClient from './apiClient';
import type { ApiResponse } from '../types';

export interface ShotVideoInterval {
  id: string;
  user_id: string;
  shot_id: string;
  start_frame_id: string | null;
  end_frame_id: string | null;
  duration_seconds: number;
  video_url: string | null;
  video_model_used: string | null;
  motion_prompt: string | null;
  status: 'pending' | 'generating' | 'processing' | 'completed' | 'failed';
  error_message: string | null;
  external_task_id: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface ShotKeyframe {
  id: string;
  user_id: string;
  shot_id: string;
  frame_type: string;
  prompt: string;
  negative_prompt: string | null;
  image_url: string | null;
  image_model_used: string | null;
  reference_characters: string | null;
  reference_scene: string | null;
  candidate_index?: number | null;
  is_selected?: number | null;
  created_at: string;
}

export const videoService = {
  generate: (
    shotId: string,
    data: {
      provider: string;
      modelName: string;
      keyframeId?: string;
      motionPrompt?: string;
      duration?: number;
      ratio?: '16:9' | '9:16' | '1:1' | '4:3' | '3:4' | '21:9';
      resolution?: '720p' | '1080p' | '2k' | '4k';
      subtitles?: boolean;
    }
  ) =>
    apiClient.post<unknown, ApiResponse<ShotVideoInterval>>(
      `/shots/${shotId}/video/generate`,
      data
    ),

  getStatus: (videoId: string) =>
    apiClient.get<unknown, ApiResponse<ShotVideoInterval>>(
      `/videos/${videoId}/status`
    ),

  listByShot: (shotId: string) =>
    apiClient.get<unknown, ApiResponse<ShotVideoInterval[]>>(
      `/shots/${shotId}/videos`
    ),

  delete: (videoId: string) =>
    apiClient.delete<unknown, ApiResponse<{ message: string }>>(
      `/videos/${videoId}`
    ),

  getKeyframes: (shotId: string) =>
    apiClient.get<unknown, ApiResponse<ShotKeyframe[]>>(
      `/shots/${shotId}/keyframes`
    ),

  generateKeyframe: (
    shotId: string,
    data: {
      provider: string;
      modelName: string;
      frameTypes?: string[];
      referenceCharacterIds?: string[];
      referenceSceneId?: string;
    }
  ) =>
    apiClient.post<unknown, ApiResponse<ShotKeyframe[]>>(
      `/shots/${shotId}/keyframes/generate`,
      data
    ),

  // 批量生成首帧关键帧
  batchGenerateKeyframes: (
    episodeId: string,
    data: {
      provider: string;
      modelName: string;
      shotIds?: string[];
    }
  ) =>
    apiClient.post<unknown, ApiResponse<{
      total: number;
      success: number;
      skipped: number;
      failed: number;
      results: any[];
    }>>(
      `/episodes/${episodeId}/keyframes/batch`,
      data
    ),

  // 批量生成视频
  batchGenerateVideos: (
    episodeId: string,
    data: {
      provider: string;
      modelName: string;
      shotIds?: string[];
      duration?: number;
      ratio?: string;
      resolution?: string;
    }
  ) =>
    apiClient.post<unknown, ApiResponse<{
      total: number;
      created: number;
      skipped: number;
      createdVideos: Array<{ shotId: string; videoId: string; taskId: string }>;
      skippedShots: Array<{ shotId: string; reason: string }>;
    }>>(
      `/episodes/${episodeId}/videos/batch`,
      data
    ),

  // 获取字幕（SRT格式）
  getSubtitles: (episodeId: string) =>
    apiClient.get<unknown, ApiResponse<{
      subtitles: Array<{ index: number; start: string; end: string; text: string; speaker?: string }>;
      srtContent: string;
      count: number;
    }>>(
      `/episodes/${episodeId}/subtitles`
    ),
};
