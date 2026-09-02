-- 011_auto_pipeline_tasks.sql
-- 全自动流水线任务状态持久化

CREATE TABLE IF NOT EXISTS auto_pipeline_tasks (
  task_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running', -- running | completed | failed | cancelled
  current_stage TEXT NOT NULL DEFAULT 'novel',
  stage_progress TEXT NOT NULL DEFAULT '{}', -- JSON string
  error TEXT,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_auto_pipeline_project ON auto_pipeline_tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_auto_pipeline_status ON auto_pipeline_tasks(status);
