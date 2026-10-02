-- 032_enrich_feedback.sql
-- 加料重构打回反馈：用户打回时记录不满意原因，重新加料时携带反馈上下文针对性改进

ALTER TABLE novel_episodes ADD COLUMN enrich_feedback TEXT;  -- 打回反馈内容（用户不满意的原因/改进要求）
ALTER TABLE novel_episodes ADD COLUMN enrich_reject_count INTEGER NOT NULL DEFAULT 0;  -- 累计打回次数
