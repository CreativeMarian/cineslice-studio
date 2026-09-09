-- ============================================================
-- MOO-Director 数据库迁移脚本
-- 版本: 023_shot_audio
-- 说明: 配音记录结构化入库（手动 TTS / compose 自动配音统一记录），
--       支撑 audio 阶段完成度判定与跨刷新恢复
-- 兼容: SQLite 3.x
-- ============================================================
CREATE TABLE IF NOT EXISTS shot_audio (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  episode_id TEXT NOT NULL,
  shot_id TEXT NOT NULL,
  shot_number INTEGER,
  file_name TEXT,
  voice TEXT,
  speed REAL,
  duration_seconds REAL,
  source TEXT DEFAULT 'manual',
  status TEXT DEFAULT 'completed',
  created_at TEXT NOT NULL,
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_shot_audio_episode ON shot_audio(episode_id);
CREATE INDEX IF NOT EXISTS idx_shot_audio_shot ON shot_audio(shot_id);
CREATE INDEX IF NOT EXISTS idx_shot_audio_shot_number ON shot_audio(episode_id, shot_number);
