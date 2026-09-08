import apiClient from './apiClient';

export interface ComposeOptions {
  transition?: 'none' | 'fade' | 'crossfade';
  transitionDuration?: number;
  outputResolution?: string;
  fps?: number;
  bgmPath?: string;
  bgmVolume?: number;
  /** 两级合成：true 时先按阶段合成再拼接整集 */
  byPhase?: boolean;
  /** 跳过无视频镜头，不生成黑屏占位 */
  skipMissingClips?: boolean;
  /** 只合成指定阶段（1-4） */
  phase?: number;
}

export interface PhaseVideo {
  phase: number;
  phaseName: string | null;
  url: string;
  path: string;
}

export interface ComposeResult {
  taskId: string;
  status: 'processing' | 'completed' | 'failed';
  outputUrl?: string;
  outputPath?: string;
  progress?: number;
  error?: string;
  totalClips: number;
  completedClips: number;
  /** 两级合成完成后的阶段视频列表 */
  phaseVideos?: PhaseVideo[];
}

export const videoComposeService = {
  checkFfmpeg: () =>
    apiClient.get<unknown, { success: boolean; data: { available: boolean } }>('/ffmpeg/status'),

  compose: (episodeId: string, options?: ComposeOptions) =>
    apiClient.post<unknown, { success: boolean; data: ComposeResult }>(
      `/episodes/${episodeId}/compose`,
      options || {}
    ),

  getStatus: (taskId: string) =>
    apiClient.get<unknown, { success: boolean; data: ComposeResult }>(`/compose/${taskId}`),
};
