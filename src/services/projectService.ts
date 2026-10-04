import apiClient from './apiClient';
import { API_PATHS } from '../constants/api';
import type { Project, Episode, NovelChapter, ApiResponse, EnrichResult, InputMode } from '../types';

// ---------- 项目 CRUD ----------

export interface CreateProjectData {
  title: string;
  description?: string;
  mode?: 'auto' | 'semi-auto';
  style_description?: string;
  /** P2-1: 项目级视觉风格（创建后锁定） */
  visual_style?: string;
  /** P2-1: 画面比例（创建后锁定） */
  aspect_ratio?: string;
  /** 输入模式 */
  input_mode?: InputMode;
}

/** POST /api/projects/from-input 的响应：创建的项目 + AI 生成的剧本预览 */
export interface CreateFromInputResult {
  project: Project;
  /** AI 生成的剧本内容（可编辑预览） */
  script?: string;
  /** 同步生成的剧集列表（首集 id 用于回写编辑后的剧本） */
  episodes: Array<{ id: string; script_content: string }>;
}

export const projectService = {
  list: (params?: { page?: number; limit?: number; status?: string }) =>
    apiClient.get<unknown, ApiResponse<{ items: Project[]; total: number }>>(API_PATHS.projects, { params }),

  create: (data: CreateProjectData) =>
    apiClient.post<unknown, ApiResponse<Project>>(API_PATHS.projects, data),

  /** 三步新建流程：AI 根据输入内容生成剧本并创建项目（custom_prompt 使用用户编辑后的提示词） */
  createFromInput: (data: {
    input_mode: InputMode;
    content: string;
    title: string;
    visual_style: string;
    aspect_ratio: string;
    custom_prompt?: string;
  }) =>
    apiClient.post<unknown, ApiResponse<CreateFromInputResult>>(API_PATHS.createFromInput, data),

  get: (id: string) =>
    apiClient.get<unknown, ApiResponse<Project>>(API_PATHS.project(id)),

  update: (id: string, data: Partial<Pick<Project, 'title' | 'description' | 'stage' | 'visual_style_id' | 'genre' | 'target_duration' | 'default_shot_duration' | 'language' | 'pipeline_step' | 'style_description'>>) =>
    apiClient.put<unknown, ApiResponse<Project>>(API_PATHS.project(id), data),

  delete: (id: string) =>
    apiClient.delete<unknown, ApiResponse<void>>(API_PATHS.project(id)),

  restore: (id: string) =>
    apiClient.post<unknown, ApiResponse<void>>(API_PATHS.projectRestore(id)),

  deletePermanent: (id: string) =>
    apiClient.delete<unknown, ApiResponse<void>>(API_PATHS.projectPermanent(id)),

  // ---------- 小说 ----------

  uploadNovel: (projectId: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    // 注意：不要手动设置 Content-Type，让浏览器自动添加带 boundary 的 multipart/form-data 头
    return apiClient.post<unknown, ApiResponse<{ chapters: NovelChapter[]; total_chapters: number }>>(
      API_PATHS.projectNovelUpload(projectId),
      formData
    );
  },

  getChapters: (projectId: string) =>
    apiClient.get<unknown, ApiResponse<NovelChapter[]>>(API_PATHS.projectChapters(projectId)),

  updateChapter: (projectId: string, chapterId: string, data: Partial<NovelChapter>) =>
    apiClient.put<unknown, ApiResponse<NovelChapter>>(
      API_PATHS.projectChapter(projectId, chapterId),
      data
    ),

  // ---------- 剧集 ----------

  generateEpisodesStream: (
    projectId: string,
    data: { chapter_ids: string[]; modelKey: string; episodes_count?: number; style?: string },
    onProgress?: (p: { completed: number; total: number; stage: string }) => void
  ): Promise<ApiResponse<Episode[]>> => {
    const [provider, modelName] = data.modelKey.split(':');
    return new Promise((resolve, reject) => {
      // NDJSON 流式接口：原生 fetch 需手动拼 /api 前缀（与 apiClient 自动加前缀规则不同）
      fetch(`/api${API_PATHS.projectEpisodesGenerate(projectId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chapter_ids: data.chapter_ids,
          provider,
          modelName,
          episodes_count: data.episodes_count,
          style: data.style,
          stream: true,
        }),
      })
        .then(async (resp) => {
          if (!resp.body) throw new Error('浏览器不支持流式响应');
          const reader = resp.body.getReader();
          const decoder = new TextDecoder();
          let buf = '';
          let finalData: Episode[] | null = null;
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
              let evt: any;
              try { evt = JSON.parse(line); } catch { continue; }
              if (evt.done) {
                if (evt.error) parseError = evt.error;
                finalData = evt.data;
              } else if (evt.error) {
                parseError = evt.error;
              } else if (typeof evt.completed === 'number' && onProgress) {
                onProgress({ completed: evt.completed, total: evt.total || 0, stage: evt.stage || '' });
              }
            }
          }
          if (parseError) {
            reject({ response: { data: { message: parseError } } });
            return;
          }
          resolve({ success: true, data: finalData ?? undefined });
        })
        .catch((err) => reject(err));
    });
  },

  generateEpisodes: (
    projectId: string,
    data: { chapter_ids: string[]; modelKey: string; episodes_count?: number; style?: string }
  ) => {
    const [provider, modelName] = data.modelKey.split(':');
    return apiClient.post<unknown, ApiResponse<Episode[]>>(
      API_PATHS.projectEpisodesGenerate(projectId),
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
    apiClient.get<unknown, ApiResponse<Episode[]>>(API_PATHS.projectEpisodes(projectId)),

  getEpisode: (episodeId: string) =>
    apiClient.get<unknown, ApiResponse<Episode>>(API_PATHS.episode(episodeId)),

  updateEpisode: (episodeId: string, data: Partial<Pick<Episode, 'title' | 'script_content'>>) =>
    apiClient.put<unknown, ApiResponse<Episode>>(API_PATHS.episode(episodeId), data),

  regenerateEpisode: (episodeId: string, data: { text_model: string; custom_prompt?: string }) => {
    const [provider, modelName] = data.text_model.split(':');
    return apiClient.post<unknown, ApiResponse<Episode>>(API_PATHS.episodeRegenerate(episodeId), {
      provider,
      modelName,
      ...(data.custom_prompt !== undefined ? { custom_prompt: data.custom_prompt } : {}),
    });
  },

  // 润色某集剧本（不改变剧情，只优化文字）
  polishEpisode: (episodeId: string, data: { text_model: string }) => {
    const [provider, modelName] = data.text_model.split(':');
    return apiClient.post<unknown, ApiResponse<Episode>>(API_PATHS.episodePolish(episodeId), {
      provider,
      modelName,
    });
  },

  // 批量删除剧集
  batchDeleteEpisodes: (projectId: string, episodeIds: string[]) =>
    apiClient.post<unknown, ApiResponse<{ deleted: number }>>(
      API_PATHS.projectEpisodesBatchDelete(projectId),
      { episode_ids: episodeIds }
    ),

  // ═══ 加料重构（按集触发：规范前置 + 只加血肉不动骨架 + 五层护栏） ═══

  // 生成加料重构结果（预览态）
  enrichEpisode: (episodeId: string, data?: { provider?: string; modelName?: string; forceRefresh?: boolean }) =>
    apiClient.post<unknown, ApiResponse<EnrichResult>>(API_PATHS.episodeEnrich(episodeId), data || {}),

  // 获取已落库的加料重构结果
  getEnrichment: (episodeId: string) =>
    apiClient.get<unknown, ApiResponse<{ result: EnrichResult | null; status: string; skill: string | null; model: string | null; at: string | null; feedback: string | null; rejectCount: number }>>(
      API_PATHS.episodeEnrich(episodeId)
    ),

  // 通过加料结果
  approveEnrichment: (episodeId: string) =>
    apiClient.post<unknown, ApiResponse<{ message: string }>>(API_PATHS.episodeEnrichApprove(episodeId)),

  // 打回重改（携带不满意反馈，重新加料时针对性改进）
  rejectEnrichment: (episodeId: string, feedback?: string) =>
    apiClient.post<unknown, ApiResponse<{ message: string }>>(API_PATHS.episodeEnrichReject(episodeId), feedback ? { feedback } : {}),
};
