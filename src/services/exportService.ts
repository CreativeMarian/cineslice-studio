import apiClient from './apiClient';

export type ExportFormat = 'zip' | 'pdf' | 'docx' | 'txt' | 'fdx' | 'xlsx' | 'json' | 'mp4' | 'html' | 'csv';
export type ExportType = 'project' | 'script' | 'storyboard' | 'characters' | 'scenes' | 'video';

export interface ExportOptions {
  type: ExportType;
  format: ExportFormat;
  episodeId?: string;
  includeImages?: boolean;
  includeVideos?: boolean;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}

export const exportService = {
  // 导出完整项目 ZIP
  exportProject: async (projectId: string): Promise<void> => {
    const response = await apiClient.post(`/projects/${projectId}/export`, null, {
      responseType: 'blob',
    });
    const blob = response as unknown as Blob;
    triggerDownload(blob, `moo-project-${projectId}.zip`);
  },

  // 通用导出（剧本/分镜/角色/场景）
  export: async (projectId: string, options: ExportOptions): Promise<void> => {
    const params = new URLSearchParams();
    params.set('type', options.type);
    params.set('format', options.format);
    if (options.episodeId) params.set('episodeId', options.episodeId);
    if (options.includeImages !== undefined) params.set('includeImages', String(options.includeImages));
    if (options.includeVideos !== undefined) params.set('includeVideos', String(options.includeVideos));

    const response = await apiClient.get(
      `/projects/${projectId}/export-custom?${params.toString()}`,
      { responseType: 'blob' }
    );
    const blob = response as unknown as Blob;
    const ext = options.format;
    triggerDownload(blob, `moo-${options.type}-${projectId}.${ext}`);
  },

  // 导入项目 ZIP
  importProject: (file: File): Promise<{ success: boolean; data: { project: any; chaptersCount: number; episodesCount: number } }> => {
    const formData = new FormData();
    formData.append('file', file);
    return apiClient.post('/projects/import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }) as Promise<{ success: boolean; data: { project: any; chaptersCount: number; episodesCount: number } }>;
  },
};
