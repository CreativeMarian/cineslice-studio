-- ============================================================
-- MOO-Director 数据库迁移 002
-- 版本: 002_project_config
-- 日期: 2026-08-17
-- 说明: 扩展 projects 表，增加项目配置字段（体裁/目标时长/语言/流水线步骤）
-- ============================================================

ALTER TABLE projects ADD COLUMN genre TEXT;
ALTER TABLE projects ADD COLUMN target_duration TEXT DEFAULT '3min';
ALTER TABLE projects ADD COLUMN language TEXT DEFAULT 'zh';
ALTER TABLE projects ADD COLUMN pipeline_step TEXT DEFAULT 'novel';
