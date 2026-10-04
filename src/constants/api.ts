// API 路径常量（统一管理，避免各 service 硬编码路径不一致）
// 注意：路径不含 /api 前缀（apiClient 会自动拼接 BASE_URL），
// 仅 projectService.generateEpisodesStream 使用原生 fetch 且显式携带 /api 前缀，保持不变。
export const API_PATHS = {
  // ---------- 认证 ----------
  authRegister: '/auth/register',
  authLogin: '/auth/login',
  authMe: '/auth/me',
  authProfile: '/auth/profile',
  authPassword: '/auth/password',

  // ---------- 项目 ----------
  projects: '/projects',
  project: (id: string) => `/projects/${id}`,
  createFromInput: '/projects/from-input',
  projectRestore: (id: string) => `/projects/${id}/restore`,
  projectPermanent: (id: string) => `/projects/${id}/permanent`,
  projectNovelUpload: (projectId: string) => `/projects/${projectId}/novel/upload`,
  projectChapters: (projectId: string) => `/projects/${projectId}/chapters`,
  projectChapter: (projectId: string, chapterId: string) => `/projects/${projectId}/chapters/${chapterId}`,
  projectEpisodes: (projectId: string) => `/projects/${projectId}/episodes`,
  projectEpisodesGenerate: (projectId: string) => `/projects/${projectId}/episodes/generate`,
  projectEpisodesBatchDelete: (projectId: string) => `/projects/${projectId}/episodes/batch-delete`,

  // ---------- 剧集 ----------
  episodes: '/episodes',
  episode: (episodeId: string) => `/episodes/${episodeId}`,
  episodeRegenerate: (episodeId: string) => `/episodes/${episodeId}/regenerate`,
  episodePolish: (episodeId: string) => `/episodes/${episodeId}/polish`,
  episodeEnrich: (episodeId: string) => `/episodes/${episodeId}/enrich`,
  episodeEnrichApprove: (episodeId: string) => `/episodes/${episodeId}/enrich/approve`,
  episodeEnrichReject: (episodeId: string) => `/episodes/${episodeId}/enrich/reject`,

  // ---------- 分段 ----------
  segments: (episodeId: string) => `/episodes/${episodeId}/segments`,
  segmentVideo: (segmentId: string) => `/segments/${segmentId}/video`,
  segmentRetry: (segmentId: string) => `/segments/${segmentId}/retry`,

  // ---------- 角色 ----------
  characters: '/characters',
  character: (id: string) => `/characters/${id}`,
  charactersExtract: (episodeId: string) => `/episodes/${episodeId}/characters/extract`,
  charactersList: (episodeId: string) => `/episodes/${episodeId}/characters`,
  characterGenerateImage: (id: string) => `/characters/${id}/generate-image`,
  characterGenerateFourView: (id: string) => `/characters/${id}/generate-four-view`,
  characterUploadReference: (id: string) => `/characters/${id}/upload-reference`,
  characterDeleteImage: (id: string, index: number) => `/characters/${id}/images/${index}`,
  characterDeleteFourView: (id: string) => `/characters/${id}/four-view-images`,

  // ---------- 场景 ----------
  scenes: '/scenes',
  scene: (id: string) => `/scenes/${id}`,
  scenesExtract: (episodeId: string) => `/episodes/${episodeId}/scenes/extract`,
  scenesList: (episodeId: string) => `/episodes/${episodeId}/scenes`,
  sceneGenerateImage: (id: string) => `/scenes/${id}/generate-image`,
  sceneDeleteImage: (id: string, index: number) => `/scenes/${id}/images/${index}`,

  // ---------- 道具 ----------
  props: (episodeId: string) => `/episodes/${episodeId}/props`,
  prop: (id: string) => `/props/${id}`,
  propsExtract: (episodeId: string) => `/episodes/${episodeId}/props/extract`,
  propGenerateImage: (id: string) => `/props/${id}/generate-image`,
  propDeleteImage: (id: string, index: number) => `/props/${id}/images/${index}`,

  // ---------- 镜头 / 关键帧 / 视频 ----------
  shots: (episodeId: string) => `/episodes/${episodeId}/shots`,
  shotsGenerate: (episodeId: string) => `/episodes/${episodeId}/shots/generate`,
  shot: (id: string) => `/shots/${id}`,
  shotKeyframes: (shotId: string) => `/shots/${shotId}/keyframes`,
  shotKeyframesGenerate: (shotId: string) => `/shots/${shotId}/keyframes/generate`,
  keyframe: (keyframeId: string) => `/keyframes/${keyframeId}`,
  keyframeRegenerate: (keyframeId: string) => `/keyframes/${keyframeId}/regenerate`,
  shotVideos: (shotId: string) => `/shots/${shotId}/videos`,
  shotVideoGenerate: (shotId: string) => `/shots/${shotId}/video/generate`,
  videoStatus: (videoId: string) => `/videos/${videoId}/status`,
  video: (videoId: string) => `/videos/${videoId}`,
  episodeKeyframesBatch: (episodeId: string) => `/episodes/${episodeId}/keyframes/batch`,
  episodeVideosBatch: (episodeId: string) => `/episodes/${episodeId}/videos/batch`,
  episodeVideosCount: (episodeId: string) => `/episodes/${episodeId}/videos/count`,
  episodeSubtitles: (episodeId: string) => `/episodes/${episodeId}/subtitles`,

  // ---------- 语音 / TTS ----------
  episodeTts: (episodeId: string) => `/episodes/${episodeId}/tts`,
  aiAudio: '/ai/audio',

  // ---------- 视频合成 ----------
  ffmpegStatus: '/ffmpeg/status',
  episodeCompose: (episodeId: string) => `/episodes/${episodeId}/compose`,
  composeTask: (taskId: string) => `/compose/${taskId}`,
  episodeLatestCompose: (episodeId: string) => `/episodes/${episodeId}/latest-compose`,

  // ---------- 全自动流水线 ----------
  pipelineProgress: (projectId: string) => `/projects/${projectId}/pipeline/progress`,
  pipelineStatus: (projectId: string) => `/projects/${projectId}/pipeline/status`,
  pipelineMode: (projectId: string) => `/projects/${projectId}/pipeline/mode`,
  pipelineStart: (projectId: string) => `/projects/${projectId}/pipeline/start`,
  pipelineNext: (projectId: string) => `/projects/${projectId}/pipeline/next`,
  pipelineRetry: (projectId: string) => `/projects/${projectId}/pipeline/retry`,
  pipelineRollback: (projectId: string) => `/projects/${projectId}/pipeline/rollback`,
  pipelineReset: (projectId: string) => `/projects/${projectId}/pipeline/reset`,
  pipelineStageComplete: (projectId: string, stage: string) => `/projects/${projectId}/pipeline/stage/${stage}/complete`,
  pipelineStageFail: (projectId: string, stage: string) => `/projects/${projectId}/pipeline/stage/${stage}/fail`,
  pipelineAutoRun: (projectId: string) => `/projects/${projectId}/pipeline/auto-run`,
  pipelineAutoRunStatus: (projectId: string, taskId: string) => `/projects/${projectId}/pipeline/auto-run/${taskId}`,
  pipelineAutoRunCurrent: (projectId: string) => `/projects/${projectId}/pipeline/auto-run/current`,
  pipelineAutoRunCancel: (projectId: string, taskId: string) => `/projects/${projectId}/pipeline/auto-run/${taskId}/cancel`,
  pipelineAutoRunResume: (projectId: string, taskId: string) => `/projects/${projectId}/pipeline/auto-run/${taskId}/resume`,

  // ---------- 导出 / 导入 ----------
  projectExport: (projectId: string) => `/projects/${projectId}/export`,
  projectExportCustom: (projectId: string) => `/projects/${projectId}/export-custom`,
  projectImport: '/projects/import',
  projectEpisodeExport: (projectId: string, episodeId: string) => `/projects/${projectId}/episodes/${episodeId}/export`,

  // ---------- 项目记忆 / 视觉记忆 ----------
  projectMemory: (projectId: string) => `/projects/${projectId}/memory`,
  projectMemoryGenerate: (projectId: string) => `/projects/${projectId}/memory/generate`,
  projectVisualMemory: (projectId: string) => `/projects/${projectId}/visual-memory`,
  projectVisualMemoryStats: (projectId: string) => `/projects/${projectId}/visual-memory/stats`,
  projectVisualMemoryIndex: (projectId: string) => `/projects/${projectId}/visual-memory/index`,
  visualMemoryReference: (visualMemoryId: string) => `/visual-memory/${visualMemoryId}/reference`,
  visualMemoryItem: (visualMemoryId: string) => `/visual-memory/${visualMemoryId}`,

  // ---------- 用户偏好 ----------
  preferences: '/preferences',

  // ---------- 提示词预览（PromptEditor：各环节自动填入完整提示词） ----------
  projectScriptPreview: '/projects/preview-script-prompt',
  episodeCharacterPreview: (episodeId: string) => `/episodes/${episodeId}/preview-character-prompt`,
  episodeScenePreview: (episodeId: string) => `/episodes/${episodeId}/preview-scene-prompt`,
  episodeShotPreview: (episodeId: string) => `/episodes/${episodeId}/preview-shot-prompt`,
  characterImagePreview: (characterId: string) => `/characters/${characterId}/preview-image-prompt`,
  sceneImagePreview: (sceneId: string) => `/scenes/${sceneId}/preview-image-prompt`,
  shotKeyframePreview: (shotId: string) => `/shots/${shotId}/preview-keyframe-prompt`,
  shotVideoPreview: (shotId: string) => `/shots/${shotId}/preview-video-prompt`,
  shotAudioPreview: (shotId: string) => `/shots/${shotId}/preview-audio-prompt`,
} as const;
