-- 027_episode_enrichment.sql
-- 加料重构（按集触发）：只加血肉不动骨架，产出官方格式分镜剧本
-- 用户选择第 x 集后触发，大模型带所选视频模型的官方提示词规范做加料重构

ALTER TABLE novel_episodes ADD COLUMN enriched_script TEXT;      -- 加料重构结果 JSON（含 enrichedScript/storyboard/addedDetails/alignment）
ALTER TABLE novel_episodes ADD COLUMN enriched_skill TEXT;       -- 使用的视频模型提示词 skill id（如 minimax-h3）
ALTER TABLE novel_episodes ADD COLUMN enriched_model TEXT;       -- 使用的文本模型（provider/modelName）
ALTER TABLE novel_episodes ADD COLUMN enriched_at TEXT;          -- 生成时间
ALTER TABLE novel_episodes ADD COLUMN enrich_status TEXT NOT NULL DEFAULT 'none'; -- none | pending | approved | rejected | manual
