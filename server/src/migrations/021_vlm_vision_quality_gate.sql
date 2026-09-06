-- 021_vlm_vision_quality_gate.sql
-- 视觉模型（VLM）支持：视频质量门 / 一致性 Critic
-- 1. preferences 增加默认视觉模型字段
ALTER TABLE user_preferences ADD COLUMN default_vision_model TEXT;
-- 2. 视频质量门检查状态（幂等，若已存在则忽略）
ALTER TABLE shot_video_intervals ADD COLUMN quality_check TEXT;
ALTER TABLE shot_video_intervals ADD COLUMN quality_score REAL;
ALTER TABLE shot_video_intervals ADD COLUMN quality_issues TEXT;
