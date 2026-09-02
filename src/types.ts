// ============================================================
// CineSlice Studio 通用类型定义
// 对应数据库表结构与 API 响应格式
// ============================================================

// ---------- 通用 ----------

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

export interface BaseEntity {
  id: string;
  created_at: string;
  updated_at: string;
}

// ---------- 用户 ----------

export interface User extends BaseEntity {
  username: string;
  email?: string;
  display_name: string;
  avatar_url?: string;
  is_local: boolean;
}

export interface UserPreferences {
  id: string;
  user_id: string;
  theme: 'light' | 'dark' | 'system';
  onboarding_completed: boolean;
  default_text_model?: string;
  default_image_model?: string;
  default_video_model?: string;
  default_audio_model?: string;
  preferences?: Record<string, unknown>;
}

// ---------- 项目 ----------

export type ProjectStage = 'script' | 'assets' | 'director' | 'export';
export type ProjectStatus = 'active' | 'archived';
export type PipelineMode = 'auto' | 'semi-auto';
export type PipelineStage = 'novel' | 'episodes' | 'script' | 'characters' | 'scenes' | 'shots' | 'keyframes' | 'video';
export type StageStatus = 'pending' | 'running' | 'done' | 'failed' | 'awaiting_confirmation';
export type RecommendedStage = 'episodes' | 'script' | 'characters' | 'scenes' | 'shots' | 'images' | 'video' | 'audio';

export interface PipelineStageStatus {
  stage: PipelineStage;
  status: StageStatus;
  started_at?: string | null;
  completed_at?: string | null;
  error?: string | null;
  model_used?: string | null;
}

export interface PipelineStatusData {
  current_stage: PipelineStage;
  stages: PipelineStageStatus[];
  overall_status: StageStatus;
  last_updated: string;
  mode?: PipelineMode;
  stage_labels?: Record<string, string>;
  stage_order?: PipelineStage[];
}

export interface StylePreset extends BaseEntity {
  name: string;
  description?: string;
  category: string;
  visual_style: string;
  camera_language?: string;
  color_palette?: string;
  shot_rhythm?: string;
  video_params?: Record<string, unknown>;
  is_builtin: boolean;
  sort_order: number;
}

export interface Project extends BaseEntity {
  user_id: string;
  title: string;
  description?: string;
  stage: ProjectStage;
  status: ProjectStatus;
  visual_style_id?: string;
  novel_config?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  genre?: string;
  target_duration?: string;
  language?: string;
  pipeline_step?: 'novel' | 'episodes' | 'script' | 'shots';
  mode?: PipelineMode;
  pipeline_status?: string;
  style_preset_id?: string;
  model_preferences?: Record<string, string>;
}

// ---------- 小说章节 ----------

export interface NovelChapter extends BaseEntity {
  user_id: string;
  project_id: string;
  chapter_number: number;
  title: string;
  content: string;
  word_count: number;
  source_file?: string;
}

// ---------- 剧集 ----------

export type EpisodeStatus = 'draft' | 'generated' | 'edited';

export interface Episode extends BaseEntity {
  user_id: string;
  project_id: string;
  episode_number: number;
  title: string;
  chapter_range?: string;
  script_content: string;
  status: EpisodeStatus;
  text_model_used?: string;
  word_count: number;
}

// ---------- 角色 ----------

export type Gender = 'male' | 'female' | 'other';
export type RoleType = 'protagonist' | 'supporting' | 'antagonist' | 'extra';

export interface ConceptImage {
  url: string;
  model?: string;
  prompt?: string;
}

export interface Character extends BaseEntity {
  user_id: string;
  episode_id: string;
  name: string;
  gender: Gender;
  role_type: RoleType;
  description: string;
  visual_description: string;
  reference_image_url?: string;
  concept_images: ConceptImage[];
  four_view_images?: ConceptImage[];
  selected_image_index: number;
}

// ---------- 场景 ----------

export type TimeOfDay = 'day' | 'night' | 'dawn' | 'dusk';

export interface Scene extends BaseEntity {
  user_id: string;
  episode_id: string;
  name: string;
  location: string;
  time_of_day: TimeOfDay;
  atmosphere: string;
  description: string;
  concept_images: ConceptImage[];
  selected_image_index: number;
}

// ---------- 道具 ----------

export type PropCategory = 'weapon' | 'furniture' | 'vehicle' | 'other';

export interface Prop extends BaseEntity {
  user_id: string;
  episode_id: string;
  name: string;
  category: PropCategory;
  description: string;
  concept_images: ConceptImage[];
}

// ---------- 镜头 ----------

export type ShotSize = 'closeup' | 'medium' | 'wide' | 'extreme_wide' | 'extreme_closeup' | 'long' | 'full' | 'medium_closeup';
export type CameraMovement = 'static' | 'pan' | 'tilt' | 'dolly' | 'zoom' | 'push_in' | 'pull_out' | 'truck' | 'crane' | 'handheld' | 'steadicam';

export interface Shot extends BaseEntity {
  user_id: string;
  episode_id: string;
  scene_id?: string;
  shot_number: number;
  shot_size: ShotSize;
  action_description: string;
  dialogue?: string;
  camera_movement: CameraMovement;
  grid_position: string;
  duration_seconds: number;
  characters_in_shot: string[];
  props_in_shot: string[];
  notes?: string;
  subject?: string | null;
  lighting?: string | null;
  mood?: string | null;
  transition?: string | null;
  pace?: string | null;
}

// ---------- 关键帧 ----------

export type FrameType = 'first' | 'last' | 'middle';

export interface Keyframe extends BaseEntity {
  user_id: string;
  shot_id: string;
  frame_type: FrameType;
  prompt: string;
  negative_prompt?: string;
  image_url: string;
  image_model_used?: string;
  reference_characters: string[];
  reference_scene?: string;
}

// ---------- 视频片段 ----------

export type VideoStatus = 'pending' | 'generating' | 'completed' | 'failed';

export interface VideoInterval extends BaseEntity {
  user_id: string;
  shot_id: string;
  start_frame_id?: string;
  end_frame_id?: string;
  duration_seconds: number;
  video_url?: string;
  video_model_used?: string;
  motion_prompt?: string;
  status: VideoStatus;
  error_message?: string;
  completed_at?: string;
}

// ---------- 异步任务 ----------

export type TaskType = 'text' | 'image' | 'video' | 'audio';
export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface GenerationTask extends BaseEntity {
  user_id: string;
  project_id: string;
  task_type: TaskType;
  status: TaskStatus;
  model_used?: string;
  input_params?: Record<string, unknown>;
  result?: Record<string, unknown>;
  error_message?: string;
  progress: number;
  started_at?: string;
  completed_at?: string;
}

// ---------- 视觉风格 ----------

export interface VisualStyle extends BaseEntity {
  user_id: string;
  name: string;
  description: string;
  style_prompt: string;
  negative_prompt?: string;
  thumbnail_url?: string;
  is_global: boolean;
}

// ---------- 模型配置 ----------

export type ModelType = 'text' | 'image' | 'video' | 'audio';
export type TestStatus = 'success' | 'failed' | 'untested';

export interface ModelConfig extends BaseEntity {
  user_id: string;
  provider: string;
  model_name: string;
  model_type: ModelType;
  api_key: string;
  endpoint_url?: string;
  is_active: boolean;
  is_default: boolean;
  config?: Record<string, unknown>;
  recommended_for?: RecommendedStage[];
  last_test_status: TestStatus;
  last_test_at?: string;
  supports_audio?: boolean;
}

// ---------- 渲染日志 ----------

export interface RenderLog extends BaseEntity {
  user_id: string;
  episode_id?: string;
  shot_id?: string;
  action: string;
  details?: Record<string, unknown>;
}
