-- 031: 项目单镜时长配置
-- 允许用户在前端设置每个镜头的默认时长（5-60秒，每5秒递增），默认5秒
-- 分镜生成时按此时长计算台词容量（4.5字/秒 × 时长），并在提示词阶段要求AI自动拆分超长台词

ALTER TABLE projects ADD COLUMN default_shot_duration INTEGER DEFAULT 5;
