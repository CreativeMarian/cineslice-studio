-- ============================================================
-- MOO-Director 数据库迁移脚本 010
-- 版本: 010_ai_cache
-- 日期: 2026-08-19
-- 说明: 创建AI调用缓存表（JSON输出缓存，缺失导致剧集生成500错误）
-- ============================================================

CREATE TABLE IF NOT EXISTS ai_cache (
  cache_key TEXT PRIMARY KEY,
  result TEXT NOT NULL,
  model_type TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_cache_expires ON ai_cache(expires_at);
