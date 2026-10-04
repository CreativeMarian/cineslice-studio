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
export type ModelType = 'text' | 'image' | 'video' | 'audio' | 'vision';

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
}

export type InputMode = 'one_liner' | 'outline' | 'novel';

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
  default_shot_duration: number | null;
  language: string | null;
  pipeline_step: string | null;
  mode: PipelineMode;
  pipeline_status: string | null;
  style_description: string | null;
  model_preferences: string | null;
  // P2-1: 项目级风格锁定（创建后不可改）
  visual_style?: string | null;   // 视觉风格：3D漫剧/写实/古风/赛博朋克等
  aspect_ratio?: string | null;   // 画面比例：16:9/9:16
  // 新增：输入模式
  input_mode?: InputMode | null;  // one_liner | outline | novel
  // shuohao 五段管线：大纲阶段产物（JSON 文本，NULL=未生成）
  adaptation_note?: string;      // 改编说明
  hook_list?: string;            // 爽点表 JSON
  episode_synopsis?: string;     // 分集梗概 JSON
  asset_list?: string;           // 资产清单 JSON（含叙事道具表）
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
  theme: string | null;
  characters_json: string | null;
  key_items_json: string | null;
  status: EpisodeStatus;
  text_model_used: string | null;
  word_count: number;
  enriched_script: string | null;
  enriched_skill: string | null;
  enriched_model: string | null;
  enriched_at: string | null;
  enrich_status: 'none' | 'pending' | 'approved' | 'rejected' | 'manual';
  enrich_feedback: string | null;
  enrich_reject_count: number;
  structured_script?: string;    // 结构化剧本 JSON（场次 + 节拍流）
  // 剧本版本追踪：每次剧本内容更新 +1 / 刷新时间戳，下游资产据此判断是否过期
  script_version?: number;
  script_updated_at?: string | null;
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

// ============ P0-1: 身份锁 + 服装（身份与服装分离） ============

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
  name: string;                    // 服装名称（如"日常便装"）
  description: string;             // 服装描述
  color: string;                   // 主色调
  scene_id?: string | null;        // 关联场景ID（null=通用）
  is_default?: number;             // 是否默认服装
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
  voice_profile?: string; // 音色档案 JSON：{ voice, speed }，跨镜头/跨集声音一致
  // P0-3: 结构化视觉锚点（100字内标准化，逐字复用到每个提示词）
  anchor_face_shape?: string;      // 脸型
  anchor_eye_color?: string;       // 瞳色
  anchor_hairstyle?: string;       // 发型
  anchor_hair_color?: string;      // 发色
  anchor_outfit?: string;          // 服装（标准化描述）
  anchor_accessories?: string;     // 配饰
  anchor_body_type?: string;       // 体型
  anchor_distinctive?: string;     // 标志性特征（痣/疤/纹身）
  anchor_standardized?: string;    // 标准化锚点（100字内，自动生成）
  expression_images?: string;      // P1-4: 九宫格表情图 JSON
  expression_status?: string;      // P1-4: 表情图生成状态
  // shuohao 角色三件套：画像/形象/音色 + 细节图
  character_profile?: string;      // 人物画像（性格/背景/动机/弧光）
  visual_prompt?: string;          // 形象提示词（发型/发色/服装/体型/标志特征，用于出图）
  voice_prompt?: string;           // 音色提示词（年龄/音色/语速/情绪，用于TTS）
  detail_images?: string;          // 细节图 JSON 数组（手部特写/服装细节/标志性物品等）
  // P0-1: 身份锁（全片不变）+ 服装列表（每场可换）
  identity_lock?: string | null;   // JSON: IdentityLock
  wardrobe?: string | null;        // JSON: WardrobeItem[]
  custom_image_prompt?: string | null; // 角色概念图自定义提示词（custom_prompt 落库）
  script_version?: number;         // 生成时对应的剧本版本（0 = 旧数据/未知）
  created_at: string;
  updated_at: string;
}

// ============ P0-1: 项目级长期记忆系统 ============

export type BibleType = 'character' | 'world' | 'story';

export interface ProjectBible {
  id: string;
  project_id: string;
  bible_type: BibleType;
  content: string;           // Markdown格式内容
  version: number;
  generated_by: string;      // system | ai | manual
  created_at: string;
  updated_at: string;
}

export type ForeshadowStatus = 'open' | 'resolved' | 'abandoned';

export interface StoryForeshadow {
  id: string;
  project_id: string;
  description: string;
  introduced_episode_id: string | null;
  introduced_shot_id: string | null;
  status: ForeshadowStatus;
  resolved_episode_id: string | null;
  resolution_note: string;
  importance: number;        // 1-5
  created_at: string;
  updated_at: string;
}

export type RelationType = 'family' | 'friend' | 'enemy' | 'lover' | 'colleague' | 'stranger' | 'other';

export interface CharacterRelationship {
  id: string;
  project_id: string;
  char_a_id: string;
  char_b_id: string;
  relation_type: RelationType;
  intensity: number;         // -100~100（负=敌对，正=亲密）
  description: string;
  last_updated_episode_id: string | null;
  created_at: string;
  updated_at: string;
}

// ============ P0-2: 视觉记忆库 ============

export type VisualMemoryType = 'character' | 'scene' | 'prop' | 'keyframe' | 'general';

export interface VisualMemory {
  id: string;
  project_id: string;
  episode_id: string;
  shot_id: string | null;
  keyframe_id: string | null;
  image_url: string;
  memory_type: VisualMemoryType;
  entity_name: string;
  entity_id: string | null;
  shot_number: number;
  frame_type: string;
  embedding: string;
  metadata: string;
  quality_score: number;
  is_reference: number;
  created_at: string;
  updated_at: string;
}

// ============ 角色衣橱（多套造型，BigBanana Base Look 方案） ============

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

// ============ P1-2: 空间坐标体系 ============

export interface SpatialLayoutItem {
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
  // shuohao 场景美术字段（出图 / 跨镜头一致性）
  visual_prompt?: string;          // 场景形象提示词（布局/家具/灯光/氛围，用于出图）
  lighting_variants?: string;      // 光照变体 JSON {"day":"...","dusk":"...","night":"..."}
  scale_reference?: string;        // 尺度参照描述
  consistency_anchor?: string;     // 一致性锚点描述（最核心的不变特征）
  // P1-2: 空间布局 + 灯光体系
  spatial_layout?: string | null;  // JSON: SpatialLayoutItem[]
  lighting?: string | null;        // JSON: LightingConfig
  custom_image_prompt?: string | null; // 场景概念图自定义提示词（custom_prompt 落库）
  script_version?: number;         // 生成时对应的剧本版本（0 = 旧数据/未知）
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
  selected_image_index?: number;  // 当前选中的概念图索引（DB 默认 0）
  is_clue: number;      // 线索标记：跨镜头保持视觉连贯（ArcReel clue tracking）
  keywords: string;     // 关键词（逗号分隔），用于镜头匹配道具
  visual_prompt?: string;   // 道具形象提示词（用于出图）
  is_narrative?: number;    // 1=叙事道具（推动剧情），0=普通道具
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

// ============ P0-2: 分镜角色调度 ============

export interface BlockingItem {
  character_id: string;    // 角色ID（引用式，不重复描述外貌）；未匹配时为空串
  character_name?: string; // 角色名（character_id 未匹配到库内角色时保留原始名，供提示词回退）
  position: string;        // 画面位置（如"画面左侧"）
  facing: string;          // 朝向（如"右"、"镜头"）
  action: string;          // 动作描述
}

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
  characters_in_shot: string[] | null; // DAO 已解析为角色名数组（JSON 字符串历史兼容 parseCharactersInShot）
  props_in_shot: string[] | null;      // DAO 已解析为道具名数组
  notes: string | null;
  subject: string | null;
  lighting: string | null;
  mood: string | null;
  transition: string | null;
  pace: string | null;
  character_outfits: string | null; // 造型调度：该镜头各角色应穿的造型，JSON {"角色名":"造型名"}
  phase: number | null;     // 阶段编号（1-4）：每集按剧情分4个阶段，每阶段生成一段视频后拼接
  phase_name: string | null; // 阶段名称（如"开场冲突""矛盾升级""高潮爆发""悬念收尾"）
  use_next_first_frame: number; // 1=视频生成时自动用下一镜首帧作尾帧（首尾帧插值）
  first_frame_description: string | null; // 首帧画面描述（动作弧起始状态，用于首帧关键帧生成）
  last_frame_description: string | null;  // 尾帧画面描述（动作弧结束状态，用于尾帧关键帧生成）
  video_prompt: string | null;  // 提示词重构成品：分镜生成后按视频模型 Skill 官方公式重构，视频生成直接消费
  video_skill: string | null;   // 重构该成品时使用的提示词 Skill id（换模型时据此失效重跑重构）
  segment_id?: number;          // 所属段编号（每段≤15秒）
  frame_timestamps?: string;    // 分镜图时间戳 JSON
  // P0-2: 角色调度（位置/朝向/动作），引用式不重复描述外貌
  blocking?: string | null;     // JSON: BlockingItem[]
  // 自定义提示词：生成接口传入 custom_prompt 时替代系统自动构建，并落库供预览/下次生成默认使用
  custom_keyframe_prompt?: string | null;  // 关键帧生成自定义提示词
  custom_video_prompt?: string | null;     // 视频生成自定义提示词
  script_version?: number;         // 生成时对应的剧本版本（0 = 旧数据/未知）
  created_at: string;
  updated_at: string;
}

// ============ P2-2: 分段（Segment） ============

export type SegmentStatus = 'pending' | 'generating' | 'completed' | 'failed';

export interface Segment {
  id: string;
  user_id: string;
  project_id: string | null;
  episode_id: string;
  segment_number: number;
  name: string;
  start_shot_id: string | null;
  end_shot_id: string | null;
  start_shot_number: number | null;
  end_shot_number: number | null;
  duration_seconds: number;
  status: SegmentStatus;
  video_url: string | null;
  video_model_used: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

// ============ 关键帧 ============

export type FrameType = 'first' | 'last' | 'middle' | 'end' | 'candidate';

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
  candidate_index?: number; // 九宫格候选序号（frame_type='candidate' 时）
  is_selected?: number;     // 候选是否被选中升级为首帧
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
  quality_check: string | null;
  quality_score: number | null;
  quality_issues: string | null;
  external_task_id: string | null;
  progress: number | null;
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

// ============ 字幕 ============

export interface Subtitle {
  id: string;
  user_id: string;
  episode_id: string;
  shot_id: string | null;
  start_time: number;
  end_time: number;
  text: string;
  speaker: string | null;
  style: string;
  created_at: string;
}

// ============ 配音记录 ============

export interface ShotAudio {
  id: string;
  user_id: string;
  project_id: string;
  episode_id: string;
  shot_id: string;
  shot_number: number | null;
  file_name: string | null;
  voice: string | null;
  speed: number | null;
  duration_seconds: number | null;
  source: string;
  status: string;
  created_at: string;
  updated_at: string;
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
default_vision_model: string | null;
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
