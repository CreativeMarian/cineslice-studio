import apiClient from './apiClient';

export interface ComposeOptions {
  transition?: 'none' | 'fade' | 'crossfade';
  transitionDuration?: number;
  outputResolution?: string;
  fps?: number;
  bgmPath?: string;
  bgmVolume?: number;
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
