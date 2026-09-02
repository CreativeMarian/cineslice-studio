-- ============================================================
-- MOO-Director 数据库迁移脚本 009
-- 版本: 009_missing_tables
-- 日期: 2026-08-19
-- 说明: 创建缺失的表（DAO已存在但表从未创建，导致AI调用后500错误）
--   - cost_records: 成本统计表
--   - ai_cache: AI调用缓存表
-- ============================================================

CREATE TABLE IF NOT EXISTS cost_records (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  model_name TEXT NOT NULL,
  model_type TEXT NOT NULL,
  tokens INTEGER NOT NULL DEFAULT 0,
  cost REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cost_records_user ON cost_records(user_id);
CREATE INDEX IF NOT EXISTS idx_cost_records_created ON cost_records(created_at);

CREATE TABLE IF NOT EXISTS ai_cache (
  cache_key TEXT PRIMARY KEY,
  result TEXT NOT NULL,
  model_type TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_cache_expires ON ai_cache(expires_at);
