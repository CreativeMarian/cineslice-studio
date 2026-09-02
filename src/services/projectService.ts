import apiClient from './apiClient';
import type { Project, Episode, NovelChapter, ApiResponse } from '../types';

// ---------- 项目 CRUD ----------

export const projectService = {
  list: (params?: { page?: number; limit?: number; status?: string }) =>
    apiClient.get<unknown, ApiResponse<{ items: Project[]; total: number }>>('/projects', { params }),

  create: (data: { title: string; description?: string; mode?: 'auto' | 'semi-auto'; style_preset_id?: string }) =>
    apiClient.post<unknown, ApiResponse<Project>>('/projects', data),

  get: (id: string) =>
    apiClient.get<unknown, ApiResponse<Project>>(`/projects/${id}`),

  update: (id: string, data: Partial<Pick<Project, 'title' | 'description' | 'stage' | 'visual_style_id' | 'genre' | 'target_duration' | 'language' | 'pipeline_step'>>) =>
    apiClient.put<unknown, ApiResponse<Project>>(`/projects/${id}`, data),

  delete: (id: string) =>
    apiClient.delete<unknown, ApiResponse<void>>(`/projects/${id}`),

  restore: (id: string) =>
    apiClient.post<unknown, ApiResponse<void>>(`/projects/${id}/restore`),

  deletePermanent: (id: string) =>
    apiClient.delete<unknown, ApiResponse<void>>(`/projects/${id}/permanent`),

  // ---------- 小说 ----------

  uploadNovel: (projectId: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    // 注意：不要手动设置 Content-Type，让浏览器自动添加带 boundary 的 multipart/form-data 头
    return apiClient.post<unknown, ApiResponse<{ chapters: NovelChapter[]; total_chapters: number }>>(
      `/projects/${projectId}/novel/upload`,
      formData
    );
  },

  getChapters: (projectId: string) =>
    apiClient.get<unknown, ApiResponse<NovelChapter[]>>(`/projects/${projectId}/chapters`),

  updateChapter: (projectId: string, chapterId: string, data: Partial<NovelChapter>) =>
    apiClient.put<unknown, ApiResponse<NovelChapter>>(
      `/projects/${projectId}/chapters/${chapterId}`,
      data
    ),

  // ---------- 剧集 ----------

  generateEpisodes: (
    projectId: string,
    data: { chapter_ids: string[]; modelKey: string; episodes_count?: number; style?: string }
  ) => {
    const [provider, modelName] = data.modelKey.split(':');
    return apiClient.post<unknown, ApiResponse<Episode[]>>(
      `/projects/${projectId}/episodes/generate`,
      {
        chapter_ids: data.chapter_ids,
        provider,
        modelName,
        episodes_count: data.episodes_count,
        style: data.style,
      }
    );
  },

  getEpisodes: (projectId: string) =>
    apiClient.get<unknown, ApiResponse<Episode[]>>(`/projects/${projectId}/episodes`),

  getEpisode: (episodeId: string) =>
    apiClient.get<unknown, ApiResponse<Episode>>(`/episodes/${episodeId}`),

  updateEpisode: (episodeId: string, data: Partial<Pick<Episode, 'title' | 'script_content'>>) =>
    apiClient.put<unknown, ApiResponse<Episode>>(`/episodes/${episodeId}`, data),

  regenerateEpisode: (episodeId: string, data: { text_model: string }) => {
    const [provider, modelName] = data.text_model.split(':');
    return apiClient.post<unknown, ApiResponse<Episode>>(`/episodes/${episodeId}/regenerate`, {
      provider,
      modelName,
    });
  },

  // 润色某集剧本（不改变剧情，只优化文字）
  polishEpisode: (episodeId: string, data: { text_model: string }) => {
    const [provider, modelName] = data.text_model.split(':');
    return apiClient.post<unknown, ApiResponse<Episode>>(`/episodes/${episodeId}/polish`, {
      provider,
      modelName,
    });
  },

  // 批量删除剧集
  batchDeleteEpisodes: (projectId: string, episodeIds: string[]) =>
    apiClient.post<unknown, ApiResponse<{ deleted: number }>>(
      `/projects/${projectId}/episodes/batch-delete`,
      { episode_ids: episodeIds }
    ),
};
