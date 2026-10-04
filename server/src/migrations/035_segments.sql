-- 035: 分段（Segment）聚合表
-- 一个 segment = 8-15秒 = 2-4个镜头
-- 视频生成按 segment 提交，可单独重试
-- 最终合成按 segment concat
CREATE TABLE IF NOT EXISTS segments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  project_id TEXT,
  episode_id TEXT NOT NULL,
  segment_number INTEGER NOT NULL DEFAULT 1,
  name TEXT NOT NULL DEFAULT '',
  start_shot_id TEXT,
  end_shot_id TEXT,
  start_shot_number INTEGER,
  end_shot_number INTEGER,
  duration_seconds REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending | generating | completed | failed
  video_url TEXT,
  video_model_used TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_segments_episode ON segments(episode_id);
CREATE INDEX IF NOT EXISTS idx_segments_project ON segments(project_id);
