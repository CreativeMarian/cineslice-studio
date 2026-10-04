import apiClient, { type RequestConfig } from './apiClient';
import { API_PATHS } from '../constants/api';
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
  progress?: number | null;
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

/** 批量生成单镜结果（NDJSON 流式推送与最终汇总共用） */
export interface BatchKeyframesResult {
  shotId: string;
  success: boolean;
  error?: string;
}

export interface BatchKeyframesData {
  total: number;
  success: number;
  skipped: number;
  failed: number;
  results: BatchKeyframesResult[];
}

export interface BatchVideosData {
  total: number;
  created: number;
  skipped: number;
  createdVideos: Array<{ shotId: string; videoId: string; taskId: string }>;
  skippedShots: Array<{ shotId: string; reason: string }>;
}

/** 批量生成 NDJSON 流事件：done=true 携带最终汇总，否则为单镜进度 */
interface BatchStreamEvent {
  done?: boolean;
  data?: unknown;
  index?: number;
  total?: number;
  shotId?: string;
  status?: string;
}

/**
 * 通用 NDJSON 流式解析：逐行读取，done 事件作为最终结果，其余事件回调 onProgress。
 * @param resp      已发起的 fetch Response
 * @param onProgress 单镜进度回调
 */
async function readNdjsonStream<T>(
  resp: Response,
  onProgress?: (p: { index: number; total: number; shotId: string; status: string }) => void
): Promise<ApiResponse<T>> {
  if (!resp.body) throw new Error('浏览器不支持流式响应');
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let finalData: T | null = null;
  let parseError: string | null = null;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      try {
        const evt = JSON.parse(line) as BatchStreamEvent;
        if (evt.done) {
          finalData = evt.data as T;
        } else if (evt.index !== undefined) {
          onProgress?.({ index: evt.index, total: evt.total ?? 0, shotId: evt.shotId ?? '', status: evt.status ?? '' });
        }
      } catch {
        parseError = line.slice(0, 120);
      }
    }
  }
  if (parseError) return { success: false, error: { code: 'STREAM_PARSE_ERROR', message: `流式响应解析失败: ${parseError}` } };
  return { success: true, data: finalData as T };
}

export const videoService = {
  generate: (
    shotId: string,
    data: {
      provider: string;
      modelName: string;
      keyframeId?: string;
      /** 显式指定尾帧关键帧 id：支持首尾帧的模型将做首尾帧插值（起止画面双锁定） */
      endFrameId?: string;
      motionPrompt?: string;
      duration?: number;
      ratio?: '16:9' | '9:16' | '1:1' | '4:3' | '3:4' | '21:9';
      resolution?: '720p' | '1080p' | '2k' | '4k';
      subtitles?: boolean;
      /** 用户编辑后的视频提示词 */
      custom_prompt?: string;
    }
  ) =>
    apiClient.post<unknown, ApiResponse<ShotVideoInterval>>(
      API_PATHS.shotVideoGenerate(shotId),
      data
    ),

  getStatus: (videoId: string, config?: RequestConfig) =>
    apiClient.get<unknown, ApiResponse<ShotVideoInterval>>(
      API_PATHS.videoStatus(videoId),
      config
    ),

  listByShot: (shotId: string) =>
    apiClient.get<unknown, ApiResponse<ShotVideoInterval[]>>(
      API_PATHS.shotVideos(shotId)
    ),

  delete: (videoId: string) =>
    apiClient.delete<unknown, ApiResponse<{ message: string }>>(
      API_PATHS.video(videoId)
    ),

  getKeyframes: (shotId: string) =>
    apiClient.get<unknown, ApiResponse<ShotKeyframe[]>>(
      API_PATHS.shotKeyframes(shotId)
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
      API_PATHS.shotKeyframesGenerate(shotId),
      data
    ),

  // 批量生成首帧关键帧（流式：后端 NDJSON 逐镜推送真实进度）
  batchGenerateKeyframesStream: async (
    episodeId: string,
    data: {
      provider: string;
      modelName: string;
      shotIds?: string[];
    },
    onProgress?: (p: { index: number; total: number; shotId: string; status: string }) => void
  ): Promise<ApiResponse<BatchKeyframesData>> => {
    // 原生 fetch 需显式携带 /api 前缀（与 projectService.generateEpisodesStream 一致）
    const resp = await fetch(`/api${API_PATHS.episodeKeyframesBatch(episodeId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, stream: true }),
    });
    return readNdjsonStream<BatchKeyframesData>(resp, onProgress);
  },

  // 批量生成视频（流式：后端 NDJSON 逐镜推送真实进度）
  batchGenerateVideosStream: async (
    episodeId: string,
    data: {
      provider: string;
      modelName: string;
      shotIds?: string[];
      duration?: number;
      ratio?: string;
      resolution?: string;
    },
    onProgress?: (p: { index: number; total: number; shotId: string; status: string }) => void
  ): Promise<ApiResponse<BatchVideosData>> => {
    const resp = await fetch(`/api${API_PATHS.episodeVideosBatch(episodeId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, stream: true }),
    });
    return readNdjsonStream<BatchVideosData>(resp, onProgress);
  },

  // 批量生成首帧关键帧（非流式）
  batchGenerateKeyframes: (
    episodeId: string,
    data: {
      provider: string;
      modelName: string;
      shotIds?: string[];
    }
  ) =>
    apiClient.post<unknown, ApiResponse<BatchKeyframesData>>(
      API_PATHS.episodeKeyframesBatch(episodeId),
      data
    ),

  // 批量生成视频（非流式）
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
    apiClient.post<unknown, ApiResponse<BatchVideosData>>(
      API_PATHS.episodeVideosBatch(episodeId),
      data
    ),

  // 获取当前剧集视频数量统计（判断是否全部镜头都有视频）
  getEpisodeVideoCount: (episodeId: string) =>
    apiClient.get<unknown, ApiResponse<{ count: number; totalShots: number }>>(
      API_PATHS.episodeVideosCount(episodeId)
    ),

  // 获取字幕（SRT格式）
  getSubtitles: (episodeId: string) =>
    apiClient.get<unknown, ApiResponse<{
      subtitles: Array<{ index: number; start: string; end: string; text: string; speaker?: string }>;
      srtContent: string;
      count: number;
    }>>(
      API_PATHS.episodeSubtitles(episodeId)
    ),
};
