-- ============================================================
-- 006_model_audio_capability
-- 模型配置增加音频能力标记（视频模型是否自带音频）
-- ============================================================

ALTER TABLE model_registry ADD COLUMN supports_audio INTEGER DEFAULT 0;
