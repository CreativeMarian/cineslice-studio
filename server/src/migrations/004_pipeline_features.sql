-- ============================================================
-- MOO-Director 数据库迁移 004
-- 版本: 004_pipeline_features
-- 日期: 2026-08-18
-- 说明: 新增全自动/半自动流水线、预设风格系统、阶段模型推荐
--
-- 回滚方案 (Rollback):
--   DROP TABLE IF EXISTS style_presets;
--   ALTER TABLE projects DROP COLUMN mode;
--   ALTER TABLE projects DROP COLUMN pipeline_status;
--   ALTER TABLE projects DROP COLUMN style_preset_id;
--   ALTER TABLE projects DROP COLUMN model_preferences;
--   ALTER TABLE model_registry DROP COLUMN recommended_for;
-- ============================================================

-- ----------------------------------------------------------
-- 1. projects 表扩展：流水线模式与状态
-- ----------------------------------------------------------
ALTER TABLE projects ADD COLUMN mode TEXT NOT NULL DEFAULT 'semi-auto';
ALTER TABLE projects ADD COLUMN pipeline_status TEXT;
ALTER TABLE projects ADD COLUMN style_preset_id TEXT;
ALTER TABLE projects ADD COLUMN model_preferences TEXT;

-- ----------------------------------------------------------
-- 2. style_presets 表：预设风格系统
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS style_presets (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    description     TEXT,
    category        TEXT NOT NULL DEFAULT 'custom',
    visual_style    TEXT NOT NULL,
    camera_language TEXT,
    color_palette   TEXT,
    shot_rhythm     TEXT,
    video_params    TEXT,
    is_builtin      INTEGER NOT NULL DEFAULT 0,
    sort_order      INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_style_presets_builtin ON style_presets(is_builtin);
CREATE INDEX IF NOT EXISTS idx_style_presets_category ON style_presets(category);

-- ----------------------------------------------------------
-- 3. model_registry 表扩展：阶段推荐字段
-- ----------------------------------------------------------
ALTER TABLE model_registry ADD COLUMN recommended_for TEXT;

-- ----------------------------------------------------------
-- 4. 内置预设风格种子数据（6种）
-- ----------------------------------------------------------
INSERT OR IGNORE INTO style_presets (id, name, description, category, visual_style, camera_language, color_palette, shot_rhythm, video_params, is_builtin, sort_order, created_at, updated_at)
VALUES
('sp_guxian', '古风仙侠', '古典仙侠风格，仙气缭绕，衣袂飘飘，山水意境', 'fantasy',
 '工笔水墨画风，云雾缭绕，仙山楼阁，古风服饰，飘逸长发，法器灵光',
 '缓慢推拉镜头，俯瞰山水，特写法器与眼神，慢动作打斗',
 '青绿山水色调，朱砂点缀，金色光晕，淡雅留白',
 '舒缓长镜头为主，打斗时快速剪辑，每镜3-5秒',
 '{"motion":"smooth","duration":5,"resolution":"1080p","fps":24}',
 1, 1, '2026-08-18T00:00:00Z', '2026-08-18T00:00:00Z'),

('sp_dushi', '现代都市', '现代都市风格，都市夜景，时尚穿搭，现实主义', 'modern',
 '现代都市写实风，高楼大厦，霓虹灯光，时尚穿搭，咖啡馆与写字楼',
 '手持跟拍，快速切换，都市空镜转场，人物特写',
 '冷暖对比色调，霓虹蓝紫，暖黄室内，高饱和度',
 '快节奏剪辑，MTV风格，每镜2-3秒，大量空镜',
 '{"motion":"dynamic","duration":4,"resolution":"1080p","fps":30}',
 1, 2, '2026-08-18T00:00:00Z', '2026-08-18T00:00:00Z'),

('sp_cyberpunk', '赛博朋克', '赛博朋克风格，霓虹雨夜，义体改造，反乌托邦', 'scifi',
 '赛博朋克霓虹风，雨夜街道，全息广告，义体改造，高科技低生活',
 '低角度仰拍，霓虹反射，无人机航拍，故障艺术转场',
 '青橙对比色调，霓虹粉紫，雨夜反光，高对比度',
 '快速剪辑配合电子乐， glitch 效果，每镜1.5-3秒',
 '{"motion":"fast","duration":3,"resolution":"1080p","fps":30}',
 1, 3, '2026-08-18T00:00:00Z', '2026-08-18T00:00:00Z'),

('sp_xuanyi', '悬疑推理', '悬疑推理风格，阴暗色调，伏笔镜头，紧张氛围', 'mystery',
 '悬疑写实风，阴暗走廊，侦探事务所，线索特写，迷雾森林',
 '缓慢推进镜头，主观视角，线索特写，阴影遮罩',
 '低饱和冷色调，暗绿与灰蓝，局部暖光，大量阴影',
 '缓慢节奏，长镜头制造紧张，关键线索特写定格',
 '{"motion":"slow","duration":6,"resolution":"1080p","fps":24}',
 1, 4, '2026-08-18T00:00:00Z', '2026-08-18T00:00:00Z'),

('sp_tianchong', '甜宠恋爱', '甜宠恋爱风格，明亮温暖，浪漫氛围，少女心', 'romance',
 '明亮甜美风，樱花飘落，咖啡厅约会，夕阳背影，暖心微笑',
 '柔和推拉，过肩双人镜头，手部特写，慢动作浪漫瞬间',
 '暖粉与蜜橙色调，柔光滤镜，低对比，明亮通透',
 '舒缓浪漫节奏，慢动作点缀，每镜3-4秒，温馨转场',
 '{"motion":"gentle","duration":5,"resolution":"1080p","fps":24}',
 1, 5, '2026-08-18T00:00:00Z', '2026-08-18T00:00:00Z'),

('sp_rexue', '热血战斗', '热血战斗风格，激烈动作，燃爆场面，青春励志', 'action',
 '热血少年漫风格，战斗场景，能量爆发，汗水与决心，团队羁绊',
 '快速运动镜头，低角度英雄登场，360度环绕，爆炸慢动作',
 '高饱和红橙色调，能量蓝光，对比强烈，暗部深沉',
 '极快节奏剪辑，战斗帧定格，能量爆发慢动作，每镜1-2秒',
 '{"motion":"intense","duration":3,"resolution":"1080p","fps":30}',
 1, 6, '2026-08-18T00:00:00Z', '2026-08-18T00:00:00Z');
