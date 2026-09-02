// CineSlice Studio 后端共享类型定义
// v1.0

// ============ 通用 ============

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export type RunMode = 'local' | 'server';
export type ModelType = 'text' | 'image' | 'video' | 'audio';

// ============ 用户 ============

export interface User {
  id: string;
  username: string;
  password_hash: string | null;
  email: string | null;
  display_name: string;
  avatar_url: string | null;
  is_local: number;
  created_at: string;
  updated_at: string;
}

export interface AuthUser {
  id: string;
  username: string;
  isLocal: boolean;
}

// ============ 项目 ============

export type ProjectStage = 'script' | 'assets' | 'director' | 'export';
export type ProjectStatus = 'active' | 'archived';
export type PipelineMode = 'auto' | 'semi-auto';
export type PipelineStage = 'novel' | 'episodes' | 'script' | 'characters' | 'scenes' | 'shots' | 'keyframes' | 'audio' | 'video';
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
}

export interface Project {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  stage: ProjectStage;
  status: ProjectStatus;
  visual_style_id: string | null;
  novel_config: string | null;
  metadata: string | null;
  genre: string | null;
  target_duration: string | null;
  language: string | null;
  pipeline_step: string | null;
  mode: PipelineMode;
  pipeline_status: string | null;
  style_preset_id: string | null;
  model_preferences: string | null;
  created_at: string;
  updated_at: string;
}

// ============ 预设风格 ============

export interface StylePreset {
  id: string;
  name: string;
  description: string | null;
  category: string;
  visual_style: string;
  camera_language: string | null;
  color_palette: string | null;
  shot_rhythm: string | null;
  video_params: string | null;
  is_builtin: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

// ============ 小说章节 ============

export interface NovelChapter {
  id: string;
  user_id: string;
  project_id: string;
  chapter_number: number;
  title: string;
  content: string;
  word_count: number;
  source_file: string | null;
  created_at: string;
}

// ============ 剧集 ============

export type EpisodeStatus = 'draft' | 'generated' | 'edited';

export interface NovelEpisode {
  id: string;
  user_id: string;
  project_id: string;
  episode_number: number;
  title: string;
  chapter_range: string | null;
  script_content: string;
  status: EpisodeStatus;
  text_model_used: string | null;
  word_count: number;
  created_at: string;
  updated_at: string;
}

// ============ 角色 ============

export type Gender = 'male' | 'female' | 'other';
export type RoleType = 'protagonist' | 'supporting' | 'antagonist' | 'extra';

export interface ConceptImage {
  url: string;
  model: string;
  prompt: string;
}

export interface ScriptCharacter {
  id: string;
  user_id: string;
  episode_id: string;
  name: string;
  gender: Gender;
  role_type: RoleType;
  description: string;
  visual_description: string;
  reference_image_url: string | null;
  concept_images: string | null;
  four_view_images: string | null;
  selected_image_index: number;
  age?: string;
  appearance?: string;
  personality?: string;
  created_at: string;
  updated_at: string;
}

// ============ 角色变体（P1） ============

export interface CharacterVariation {
  id: string;
  user_id: string;
  character_id: string;
  name: string;
  description: string;
  visual_description: string;
  reference_image_url: string | null;
  concept_images: string | null;
  created_at: string;
}

// ============ 场景 ============

export type TimeOfDay = 'day' | 'night' | 'dawn' | 'dusk';

export interface ScriptScene {
  id: string;
  user_id: string;
  episode_id: string;
  name: string;
  location: string;
  time_of_day: TimeOfDay;
  atmosphere: string;
  description: string;
  concept_images: string | null;
  selected_image_index: number;
  weather?: string;
  created_at: string;
  updated_at: string;
}

// ============ 道具（P1） ============

export type PropCategory = 'weapon' | 'furniture' | 'vehicle' | 'other';

export interface ScriptProp {
  id: string;
  user_id: string;
  episode_id: string;
  name: string;
  category: PropCategory;
  description: string;
  concept_images: string | null;
  created_at: string;
}

// ============ 故事段落 ============

export interface StoryParagraph {
  id: string;
  user_id: string;
  episode_id: string;
  scene_id: string | null;
  paragraph_index: number;
  content: string;
  created_at: string;
}

// ============ 镜头 ============

export type ShotSize = 'closeup' | 'medium' | 'wide' | 'extreme_wide';
export type CameraMovement = 'static' | 'pan' | 'tilt' | 'dolly' | 'zoom';

export interface Shot {
  id: string;
  user_id: string;
  episode_id: string;
  scene_id: string | null;
  shot_number: number;
  shot_size: ShotSize;
  action_description: string;
  dialogue: string;
  camera_movement: CameraMovement;
  grid_position: string;
  duration_seconds: number;
  characters_in_shot: string | null;
  props_in_shot: string | null;
  notes: string | null;
  subject: string | null;
  lighting: string | null;
  mood: string | null;
  transition: string | null;
  pace: string | null;
  created_at: string;
  updated_at: string;
}

// ============ 关键帧 ============

export type FrameType = 'first' | 'last' | 'middle';

export interface ShotKeyframe {
  id: string;
  user_id: string;
  shot_id: string;
  frame_type: FrameType;
  prompt: string;
  negative_prompt: string | null;
  image_url: string | null;
  image_model_used: string | null;
  reference_characters: string | null;
  reference_scene: string | null;
  created_at: string;
}

// ============ 视频片段（P1） ============

export type VideoStatus = 'pending' | 'generating' | 'processing' | 'completed' | 'failed';

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
  status: VideoStatus;
  error_message: string | null;
  external_task_id: string | null;
  created_at: string;
  completed_at: string | null;
}

// ============ 异步生成任务（P1） ============

export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface GenerationTask {
  id: string;
  user_id: string;
  project_id: string;
  task_type: ModelType;
  status: TaskStatus;
  model_used: string | null;
  input_params: string | null;
  result: string | null;
  error_message: string | null;
  progress: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

// ============ 渲染日志 ============

export interface RenderLog {
  id: string;
  user_id: string;
  episode_id: string | null;
  shot_id: string | null;
  action: string;
  details: string | null;
  created_at: string;
}

// ============ 共享资产库（P2） ============

export type AssetType = 'character' | 'scene' | 'prop';

export interface AssetLibrary {
  id: string;
  user_id: string;
  asset_type: AssetType;
  name: string;
  description: string;
  image_url: string | null;
  source_project_id: string | null;
  tags: string | null;
  metadata: string | null;
  created_at: string;
}

// ============ 模型配置 ============

export interface ModelRegistry {
  id: string;
  user_id: string;
  provider: string;
  model_name: string;
  model_type: ModelType;
  api_key: string;
  endpoint_url: string | null;
  is_active: number;
  is_default: number;
  config: string | null;
  recommended_for: string | null;
  last_test_status: string | null;
  last_test_at: string | null;
  supports_audio: number;
  created_at: string;
  updated_at: string;
}

export interface ModelMetadata {
  provider: string;
  modelName: string;
  modelType: ModelType;
  displayName: string;
  description: string;
  supportsJson: boolean;
  supportsReferenceImages: boolean;
  maxTokens?: number;
  costPer1K?: number;
  costPerImage?: number;
  costPerVideo?: number;
  costPerSecond?: number;
  supportsAudio?: boolean;
  defaultVoice?: string;
  /** 是否需要接入点ID（如火山方舟的ep-xxx） */
  requiresEndpointId?: boolean;
  /** 是否需要AppID（如豆包TTS） */
  requiresAppId?: boolean;
  /** 配置提示文本，指导用户如何配置 */
  configHint?: string;
  /** 官方文档链接 */
  docsUrl?: string;
  /** 支持的自定义Endpoint */
  supportsCustomEndpoint?: boolean;
}

// ============ 用户偏好 ============

export interface UserPreference {
  id: string;
  user_id: string;
  theme: string;
  onboarding_completed: number;
  default_text_model: string | null;
  default_image_model: string | null;
  default_video_model: string | null;
  default_audio_model: string | null;
  preferences: string | null;
  created_at: string;
  updated_at: string;
}

// ============ 视觉风格（P1） ============

export interface VisualStyle {
  id: string;
  user_id: string;
  name: string;
  description: string;
  style_prompt: string;
  negative_prompt: string | null;
  thumbnail_url: string | null;
  is_global: number;
  created_at: string;
  updated_at: string;
}

// ============ AI 适配器相关 ============
// 统一从 adapters/base re-export，避免重复定义导致不一致
export {
  TextGenerateParams,
  TextGenerateResult,
  ImageGenerateParams,
  ImageGenerateResult,
  VideoGenerateParams,
  VideoGenerateResult,
  AudioGenerateParams,
  AudioGenerateResult,
  TextAdapter,
  ImageAdapter,
  VideoAdapter,
  AudioAdapter,
  AIError,
} from '../services/adapters/base';

// ============ 数据库统一接口 ============

export interface DatabaseStatement {
  run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint };
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
}

export interface Database {
  prepare(sql: string): DatabaseStatement;
  exec(sql: string): void;
  transaction<T>(fn: () => T): () => T;
  close?(): void;
}

// ============ 成本统计 ============

export interface CostRecord {
  id: string;
  user_id: string;
  provider: string;
  model_name: string;
  model_type: ModelType;
  tokens: number;
  cost: number;
  image_count?: number;
  video_seconds?: number;
  audio_chars?: number;
  created_at: string;
}
