// 自由创作工作台 API
// 文生图 / 图生图 / 文生视频 / 图生视频 / 参考图上传 / 视频任务轮询
import apiClient from './apiClient';
import type { ApiResponse } from '../types';

export interface ImageGenResult {
  images: { url: string; prompt: string }[];
  model: string;
}

export interface VideoGenResult {
  taskId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  videoUrl?: string;
  estimatedTimeSeconds?: number;
  error?: string;
}

export type VideoRatio = '16:9' | '9:16' | '1:1' | '4:3' | '3:4' | '21:9';
export type VideoResolution = '720p' | '1080p' | '2k' | '4k';

const IMAGE_SIZES = ['512x512', '1024x1024', '1024x1792', '1792x1024', '2048x2048', '2048x1152', '2560x1440', '1440x2560'] as const;
export type ImageSize = (typeof IMAGE_SIZES)[number];

export const createService = {
  /** 上传参考图（图生图 / 图生视频），返回可访问 URL */
  uploadReference: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return apiClient.post<unknown, ApiResponse<{ url: string; name: string }>>('/create/upload', form);
  },

  /** 文生图 */
  generateImage: (data: {
    provider: string;
    modelName: string;
    prompt: string;
    negativePrompt?: string;
    size?: ImageSize;
    count?: number;
    style?: string;
  }) => apiClient.post<unknown, ApiResponse<ImageGenResult>>('/create/image', data),

  /** 图生图（至少 1 张参考图） */
  editImage: (data: {
    provider: string;
    modelName: string;
    prompt: string;
    negativePrompt?: string;
    size?: ImageSize;
    count?: number;
    style?: string;
    referenceImages: string[];
  }) => apiClient.post<unknown, ApiResponse<ImageGenResult>>('/create/image-edit', data),

  /** 文生视频（异步任务） */
  generateVideo: (data: {
    provider: string;
    modelName: string;
    prompt?: string;
    duration?: number;
    ratio?: VideoRatio;
    resolution?: VideoResolution;
    subtitles?: boolean;
  }) => apiClient.post<unknown, ApiResponse<VideoGenResult>>('/create/video', data),

  /** 图生视频（首帧必传，尾帧/参考图可选） */
  generateVideoFromImage: (data: {
    provider: string;
    modelName: string;
    prompt?: string;
    duration?: number;
    ratio?: VideoRatio;
    resolution?: VideoResolution;
    subtitles?: boolean;
    firstFrameImageUrl: string;
    lastFrameImageUrl?: string;
    referenceImages?: string[];
  }) => apiClient.post<unknown, ApiResponse<VideoGenResult>>('/create/video-from-image', data),

  /** 查询视频任务状态 */
  getVideoStatus: (data: { provider: string; modelName: string; taskId: string }) =>
    apiClient.post<unknown, ApiResponse<VideoGenResult>>('/create/video/status', data, { silent: true }),
};
