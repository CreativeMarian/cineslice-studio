-- 013: DAO 列对齐与索引约束修正
-- 1) shot_video_intervals 补充 video_model_used 列（DAO 已写入但建表缺失，导致视频生成在新库必 500）
-- 2) model_registry 唯一索引加入 model_type —— 业务支持"同一模型多类型记录"，
--    原 UNIQUE(user_id, provider, model_name) 会让同模型第二类型插入必然报 UNIQUE 冲突

ALTER TABLE shot_video_intervals ADD COLUMN video_model_used TEXT;

-- 重建唯一索引：SQLite 不能直接修改索引，需换名建新索引
DROP INDEX IF EXISTS uq_model_registry_user_provider_model;
CREATE UNIQUE INDEX IF NOT EXISTS uq_model_registry_user_provider_model_type
  ON model_registry(user_id, provider, model_name, model_type);
