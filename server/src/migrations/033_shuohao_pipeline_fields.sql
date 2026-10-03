-- 033_shuohao_pipeline_fields.sql
-- shuohao-skills 五段管线字段扩展（大纲→角色→美术→剧本→分镜）
-- 提示词系统已重写，输出更丰富的字段，这里为 6 张表补齐存储列。
-- 全部使用 ALTER TABLE ADD COLUMN：不删旧字段、不改旧列、不破坏已有数据。
-- 新增列一律允许 NULL 或带合理默认值。
-- 幂等：runMigrations 对 duplicate column 错误自动跳过（PRAGMA table_info 校验列已存在），重跑安全。

-- 1. projects — 项目级五段管线产物（大纲阶段输出）
ALTER TABLE projects ADD COLUMN adaptation_note TEXT;
ALTER TABLE projects ADD COLUMN hook_list TEXT;
ALTER TABLE projects ADD COLUMN episode_synopsis TEXT;
ALTER TABLE projects ADD COLUMN asset_list TEXT;

-- 2. script_characters — 角色三件套（画像/形象/音色）+ 细节图
ALTER TABLE script_characters ADD COLUMN character_profile TEXT;
ALTER TABLE script_characters ADD COLUMN visual_prompt TEXT;
ALTER TABLE script_characters ADD COLUMN voice_prompt TEXT;
ALTER TABLE script_characters ADD COLUMN detail_images TEXT;

-- 3. script_scenes — 场景形象提示词 / 光照变体 / 尺度参照 / 一致性锚点
ALTER TABLE script_scenes ADD COLUMN visual_prompt TEXT;
ALTER TABLE script_scenes ADD COLUMN lighting_variants TEXT;
ALTER TABLE script_scenes ADD COLUMN scale_reference TEXT;
ALTER TABLE script_scenes ADD COLUMN consistency_anchor TEXT;

-- 4. script_props — 道具形象提示词 + 叙事道具标记
ALTER TABLE script_props ADD COLUMN visual_prompt TEXT;
ALTER TABLE script_props ADD COLUMN is_narrative INTEGER NOT NULL DEFAULT 0;

-- 5. novel_episodes — 结构化剧本（场次 + 节拍流）
ALTER TABLE novel_episodes ADD COLUMN structured_script TEXT;

-- 6. shots — 所属段编号 + 分镜图时间戳
ALTER TABLE shots ADD COLUMN segment_id INTEGER;
ALTER TABLE shots ADD COLUMN frame_timestamps TEXT;
