-- ============================================================
-- MOO-Director 数据库迁移脚本 014
-- 版本: 014_cost_records_enhancement
-- 日期: 2026-08-21
-- 说明: 完善成本统计表，增加图像/视频/音频的详细用量字段
--   - image_count: 图像生成张数
--   - video_seconds: 视频生成秒数
--   - audio_chars: 音频生成字符数
-- ============================================================

ALTER TABLE cost_records ADD COLUMN image_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE cost_records ADD COLUMN video_seconds REAL NOT NULL DEFAULT 0;
ALTER TABLE cost_records ADD COLUMN audio_chars INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_cost_records_model_type ON cost_records(model_type);
