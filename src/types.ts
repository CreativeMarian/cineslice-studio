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
  default_vision_model?: string;
  preferences?: Record<string, unknown>;
}

// ---------- 项目 ----------

export type ProjectStage = 'script' | 'assets' | 'director' | 'export';
export type ProjectStatus = 'active' | 'archived';
export type PipelineMode = 'auto' | 'semi-auto';
export type PipelineStage = 'novel' | 'episodes' | 'script' | 'characters' | 'scenes' | 'shots' | 'keyframes' | 'video' | 'audio' | 'export';
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

export type InputMode = 'one_liner' | 'outline' | 'novel';

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
  default_shot_duration?: number;
  language?: string;
  pipeline_step?: 'novel' | 'episodes' | 'script' | 'shots';
  mode?: PipelineMode;
  pipeline_status?: string;
  style_description?: string;
  model_preferences?: Record<string, string>;
  // P2-1: 项目级风格锁定（创建后不可改）
  visual_style?: string | null;   // 视觉风格：3D漫剧/写实/古风/赛博朋克/日系动漫/美式漫画
  aspect_ratio?: string | null;   // 画面比例：16:9/9:16
  input_mode?: InputMode | null;  // 输入模式：one_liner | outline | novel
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
  enriched_script?: string | null;
  enriched_skill?: string | null;
  enriched_model?: string | null;
  enriched_at?: string | null;
  enrich_status?: 'none' | 'pending' | 'approved' | 'rejected' | 'manual';
}

// ---------- 加料重构（按集触发：规范前置 + 五层护栏） ----------

export interface EnrichShot {
  shot: number;
  seconds: number;
  size: string;
  camera: string;
  frame: string;
  action: string;
  line: string | null;
}

export interface AddedDetail {
  type: 'action' | 'environment' | 'emotion' | 'prop' | 'rhythm' | 'camera' | 'line_delivery';
  detail: string;
  source: 'quoted' | 'inferred';
  quote?: string;
}

export interface EnrichTableStatus {
  status: 'ok' | 'warn';
  missing: string[];
  added: string[];
}

export interface EnrichAlignment {
  events: EnrichTableStatus;
  characters: EnrichTableStatus;
  dialogues: EnrichTableStatus;
  differences: string[];
}

export interface EnrichStoryboard {
  seconds: number;
  shots: EnrichShot[];
  h3Prompt: string;
}

export interface EnrichResult {
  episodeId: string;
  episodeTitle: string;
  enrichedScript: string;
  storyboard: EnrichStoryboard;
  addedDetails: AddedDetail[];
  alignment: EnrichAlignment;
  meta: {
    skillId: string;
    skillName: string;
    textModel: string;
    videoModelUsed: string | null;
    retries: number;
    createdAt: string;
  };
}

// ---------- 角色 ----------

export type Gender = 'male' | 'female' | 'other';
export type RoleType = 'protagonist' | 'supporting' | 'antagonist' | 'extra';

export interface ConceptImage {
  url: string;
  model?: string;
  prompt?: string;
}

// ---------- P0-1: 身份锁 + 服装（身份与服装分离） ----------

export interface IdentityLock {
  age: string;                    // 年龄（如"25岁"）
  face_shape: string;             // 脸型（如"鹅蛋脸"）
  hairstyle: string;              // 发型（如"黑色短发，刘海偏左"）
  hair_color: string;             // 发色
  body_type: string;              // 体型（如"中等身材，偏瘦"）
  distinctive_features: string;   // 标志性特征（痣/疤/纹身/眼镜）
  prohibitions: string;           // 禁忌（全片不可变的特征约束）
}

export interface WardrobeItem {
  id: string;
  name: string;                   // 服装名称（如"日常便装"）
  description: string;            // 服装描述
  color: string;                  // 主色调
  scene_id?: string | null;       // 关联场景ID（null=通用）
  is_default?: number;            // 是否默认服装（1=是）
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
  voice_profile?: string;
  expression_images?: string; // P1-4: 九宫格表情图 JSON
  expression_status?: string; // P1-4: 表情图生成状态
  // P0-1: 身份锁（全片不变，JSON 字符串）+ 服装列表（每场可换，JSON 字符串）
  identity_lock?: string | null;  // JSON: IdentityLock
  wardrobe?: string | null;       // JSON: WardrobeItem[]
}

// ---------- 场景 ----------

export type TimeOfDay = 'day' | 'night' | 'dawn' | 'dusk';

// ---------- P1-2: 空间坐标体系 ----------

export interface SpatialLayoutItem {
  id: string;            // 前端唯一标识（后端 JSON 存储时忽略该字段，仅用于前端增删改定位）
  name: string;          // 家具/道具名称
  position: string;      // 文字位置描述（如"画面左侧"）
  x: number;             // 相对X坐标 0-1
  y: number;             // 相对Y坐标 0-1
}

export interface LightSource {
  position: string;      // 光源位置（如"画面左上方45度"）
  color: string;         // 光源颜色（如"暖白色"）
  intensity: string;     // 强度描述（如"柔和"、"强烈"）
}

export interface LightingConfig {
  key_light: LightSource;    // 主光源
  fill_light?: LightSource;  // 补光
  rim_light?: LightSource;   // 轮廓光
  ambient?: string;          // 环境光描述
}

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
  // P1-2: 空间布局 + 灯光体系（JSON 字符串）
  spatial_layout?: string | null;  // JSON: SpatialLayoutItem[]
  lighting?: string | null;        // JSON: LightingConfig
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
  selected_image_index?: number;
  is_clue?: number;
  keywords?: string;
}

// ---------- 衣橱（多套造型） ----------

export interface CharacterOutfit {
  id: string;
  user_id: string;
  character_id: string;
  name: string;
  description: string;
  image_url: string | null;
  is_default: number;
  created_at: string;
  updated_at: string;
}

// ---------- 镜头 ----------

export type ShotSize = 'closeup' | 'medium' | 'wide' | 'extreme_wide' | 'extreme_closeup' | 'long' | 'full' | 'medium_closeup';
export type CameraMovement = 'static' | 'pan' | 'tilt' | 'dolly' | 'zoom' | 'push_in' | 'pull_out' | 'truck' | 'crane' | 'handheld' | 'steadicam';

// ---------- P0-2: 分镜角色调度 ----------

export interface BlockingItem {
  character_id: string;    // 角色ID（引用式，不重复描述外貌）
  position: string;        // 画面位置（如"画面左侧"、"画面中央"、"画面右侧"、"前景"、"背景"）
  facing: string;          // 朝向（如"左"、"右"、"镜头"、"背对镜头"）
  action: string;          // 动作描述
}

export interface Shot extends BaseEntity {
  user_id: string;
  episode_id: string;
  scene_id?: string | null;
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
  use_next_first_frame?: number;
  phase?: number | null;    // 阶段编号（1-4）：每集按4个剧情阶段划分，每阶段独立成视频
  phase_name?: string | null; // 阶段名称（如"开场引入""矛盾升级"等）
  segment_id?: number | null; // 所属段编号（每段≤15秒）
  character_outfits?: string | null; // 造型调度：该镜头各角色应穿的造型，JSON {"角色名":"造型名"}
  video_prompt?: string | null;
  video_skill?: string | null;
  // P0-2: 角色调度（位置/朝向/动作），引用式不重复描述外貌（JSON 字符串）
  blocking?: string | null;     // JSON: BlockingItem[]
}

// ---------- 分段（P2-2: Segment） ----------

export type SegmentStatus = 'pending' | 'generating' | 'completed' | 'failed';

export interface Segment extends BaseEntity {
  user_id: string;
  project_id?: string | null;
  episode_id: string;
  segment_number: number;
  name: string;
  start_shot_id?: string | null;
  end_shot_id?: string | null;
  start_shot_number?: number | null;
  end_shot_number?: number | null;
  duration_seconds: number;
  status: SegmentStatus;
  video_url?: string | null;
  video_model_used?: string | null;
  error_message?: string | null;
}

// ---------- 关键帧 ----------

export type FrameType = 'first' | 'last' | 'middle' | 'end' | 'candidate';

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
  quality_check?: 'passed' | 'failed' | null;
  quality_score?: number | null;
  quality_issues?: string | null;
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

// ---------- 成本统计 ----------

export interface CostSummary {
  total_tokens: number;
  total_cost: number;
  call_count: number;
  by_type: Array<{ model_type: string; tokens: number; cost: number; count: number }>;
  by_model: Array<{ provider: string; model_name: string; tokens: number; cost: number; count: number }>;
  daily: Array<{ date: string; tokens: number; cost: number }>;
}

export interface CostRecord {
  id: string;
  user_id: string;
  provider: string;
  model_name: string;
  model_type: string;
  tokens: number;
  cost: number;
  image_count?: number;
  video_seconds?: number;
  audio_chars?: number;
  created_at: string;
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

export type ModelType = 'text' | 'image' | 'video' | 'audio' | 'vision';
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
