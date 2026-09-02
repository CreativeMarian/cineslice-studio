-- ============================================================
-- MOO-Director 数据库迁移脚本 008
-- 版本: 008_dao_column_alignment
-- 日期: 2026-08-19
-- 说明: 对齐 DAO 层与数据库 schema 的字段差异
--   - novel_episodes: 补充 text_model_used
--   - shot_keyframes: 补充 image_model_used / reference_characters / reference_scene
-- ============================================================

ALTER TABLE novel_episodes ADD COLUMN text_model_used TEXT;

ALTER TABLE shot_keyframes ADD COLUMN image_model_used TEXT;
ALTER TABLE shot_keyframes ADD COLUMN reference_characters TEXT;
ALTER TABLE shot_keyframes ADD COLUMN reference_scene TEXT;
