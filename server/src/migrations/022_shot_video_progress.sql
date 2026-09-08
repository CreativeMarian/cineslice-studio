-- ============================================================
-- MOO-Director 数据库迁移脚本
-- 版本: 022_shot_video_progress
-- 说明: 单镜头视频生成接入真实渲染进度（ComfyUI /progress）
-- 兼容: SQLite 3.x
-- ============================================================
ALTER TABLE shot_video_intervals ADD COLUMN progress INTEGER DEFAULT 0;
