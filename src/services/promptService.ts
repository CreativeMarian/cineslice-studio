// 提示词预览 API：9 个创作环节的提示词自动填入
// 所有预览端点返回 { success: true; data: { prompt: string; contextSummary: string } }，
// 本服务统一解包为 { prompt, contextSummary }，供 PromptEditor 直接使用。
import apiClient from './apiClient';
import { API_PATHS } from '../constants/api';
import type { ApiResponse } from '../types';

export interface PromptPreview {
  prompt: string;
  contextSummary: string;
}

type PromptPreviewResponse = ApiResponse<PromptPreview>;

/** 解包响应：失败（HTTP 200 + success:false）时返回空提示词，避免组件崩溃 */
function unwrap(res: PromptPreviewResponse): PromptPreview {
  if (res.success && res.data) {
    return { prompt: res.data.prompt ?? '', contextSummary: res.data.contextSummary ?? '' };
  }
  return { prompt: '', contextSummary: '' };
}

export interface ScriptPreviewConfig {
  project_style?: string;
  aspect_ratio?: string;
  target_duration?: string;
  genre?: string;
  input_mode?: string;
}

export interface ShotPreviewConfig {
  shot_density?: 'sparse' | 'normal' | 'dense';
  include_dialogue?: boolean;
}

export const promptService = {
  /** 剧本重写提示词（POST body: input + 项目风格/比例/时长/类型/输入模式） */
  previewScriptPrompt: (input: string, config: ScriptPreviewConfig = {}) =>
    apiClient
      .post<unknown, PromptPreviewResponse>(API_PATHS.projectScriptPreview, { input, ...config })
      .then(unwrap),

  /** 角色提取提示词 */
  previewCharacterPrompt: (episodeId: string) =>
    apiClient
      .get<unknown, PromptPreviewResponse>(API_PATHS.episodeCharacterPreview(episodeId))
      .then(unwrap),

  /** 场景提取提示词 */
  previewScenePrompt: (episodeId: string) =>
    apiClient
      .get<unknown, PromptPreviewResponse>(API_PATHS.episodeScenePreview(episodeId))
      .then(unwrap),

  /** 分镜生成提示词（query: shot_density / include_dialogue） */
  previewShotPrompt: (episodeId: string, config?: ShotPreviewConfig) =>
    apiClient
      .get<unknown, PromptPreviewResponse>(API_PATHS.episodeShotPreview(episodeId), {
        params: (config ?? {}) as Record<string, unknown>,
      })
      .then(unwrap),

  /** 角色概念图提示词（query: wardrobe_id） */
  previewCharacterImagePrompt: (characterId: string, wardrobeId?: string) =>
    apiClient
      .get<unknown, PromptPreviewResponse>(API_PATHS.characterImagePreview(characterId), {
        params: wardrobeId ? { wardrobe_id: wardrobeId } : undefined,
      })
      .then(unwrap),

  /** 场景概念图提示词 */
  previewSceneImagePrompt: (sceneId: string) =>
    apiClient
      .get<unknown, PromptPreviewResponse>(API_PATHS.sceneImagePreview(sceneId))
      .then(unwrap),

  /** 关键帧提示词 */
  previewKeyframePrompt: (shotId: string) =>
    apiClient
      .get<unknown, PromptPreviewResponse>(API_PATHS.shotKeyframePreview(shotId))
      .then(unwrap),

  /** 视频提示词 */
  previewVideoPrompt: (shotId: string) =>
    apiClient
      .get<unknown, PromptPreviewResponse>(API_PATHS.shotVideoPreview(shotId))
      .then(unwrap),

  /** 配音提示词 */
  previewAudioPrompt: (shotId: string) =>
    apiClient
      .get<unknown, PromptPreviewResponse>(API_PATHS.shotAudioPreview(shotId))
      .then(unwrap),
};
