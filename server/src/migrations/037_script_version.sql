-- 037: 剧本版本追踪（剧本数据流一致性）
-- episodes.script_version / script_updated_at：每次剧本内容更新 +1 / 刷新时间戳，供前端判断下游资产是否过期
-- script_characters / script_scenes / shots.script_version：记录生成时对应的剧本版本（0 = 旧数据/未知）
ALTER TABLE novel_episodes ADD COLUMN script_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE novel_episodes ADD COLUMN script_updated_at TEXT;
ALTER TABLE script_characters ADD COLUMN script_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE script_scenes ADD COLUMN script_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE shots ADD COLUMN script_version INTEGER NOT NULL DEFAULT 0;
