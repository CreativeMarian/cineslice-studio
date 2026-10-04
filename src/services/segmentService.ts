// 分段（Segment）服务
// 一个 segment = 8-15 秒 = 2-4 个镜头，视频按 segment 提交生成，可单独重试
import apiClient, { type RequestConfig } from './apiClient';
import { API_PATHS } from '../constants/api';
import type { Segment, ApiResponse } from '../types';

export const segmentService = {
  /** 获取某集的分段列表（轮询场景可传 { silent: true } 避免断网 toast 刷屏） */
  getSegments: (episodeId: string, config?: RequestConfig) =>
    apiClient.get<unknown, ApiResponse<Segment[]>>(API_PATHS.segments(episodeId), config),

  /** 重新聚合该集分段（按 ≤15 秒规则合并镜头） */
  aggregateSegments: (episodeId: string) =>
    apiClient.post<unknown, ApiResponse<Segment[]>>(API_PATHS.segments(episodeId), {}),

  /** 生成段视频 */
  generateSegmentVideo: (
    segmentId: string,
    data: { provider?: string; modelName?: string } = {}
  ) => apiClient.post<unknown, ApiResponse<Segment>>(API_PATHS.segmentVideo(segmentId), data),

  /** 重试段视频（使用段记录或用户默认模型，无需传参） */
  retrySegment: (segmentId: string) =>
    apiClient.post<unknown, ApiResponse<Segment>>(API_PATHS.segmentRetry(segmentId), {}),
};
