-- 020: 给 shots 表增加"阶段"字段
-- 每集按 4 个剧情阶段划分，每个阶段生成一段视频，最后拼接成完整一集
-- phase: 阶段编号（1-4）
-- phase_name: 阶段名称（如"开场冲突""矛盾升级""高潮爆发""悬念收尾"）
ALTER TABLE shots ADD COLUMN phase INTEGER;
ALTER TABLE shots ADD COLUMN phase_name TEXT;
