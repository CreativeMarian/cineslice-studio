-- 017: 剧本分析结果落库缓存
-- 背景：剧本分析此前每次关键帧/视频生成都重新调用 AI（手动路径每镜一次全量分析），
-- 且硬编码 doubao/default 模型导致分析必然失败。此迁移建表，分析结果按剧集缓存，
-- 命中直接复用，剧集更新后失效。
CREATE TABLE IF NOT EXISTS script_analysis (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  episode_id TEXT NOT NULL UNIQUE,
  analysis_json TEXT NOT NULL,
  model_used TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_script_analysis_episode ON script_analysis(episode_id);
