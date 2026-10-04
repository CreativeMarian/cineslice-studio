-- 034: 角色圣经重构 + 分镜引用式 + 空间坐标 + 项目级风格锁定
-- 核心设计理念（huobao-drama）：
--   1. 一致性前置：资产阶段锁死身份
--   2. 引用优于展开：用ID引用角色/场景
--   3. 身份与服装分离：身份全片不变，服装每场可换
--   4. 模块化提示词：身份锁 + 服装 + 场景 + 动作 + 禁令行
--   5. 项目级固定配置：比例和风格创建后锁定
-- 全部 ALTER TABLE ADD COLUMN，幂等安全。

-- 1. script_characters — 身份锁 + 服装列表
-- identity_lock: JSON { age, face_shape, hairstyle, hair_color, body_type, distinctive_features, prohibitions }
-- wardrobe: JSON [{ id, name, description, color, scene_id, is_default }]
ALTER TABLE script_characters ADD COLUMN identity_lock TEXT;
ALTER TABLE script_characters ADD COLUMN wardrobe TEXT;

-- 2. script_scenes — 空间布局 + 灯光体系
-- spatial_layout: JSON [{ name, position, x, y }]
-- lighting: JSON { key_light: {position, color, intensity}, fill_light: {...}, rim_light: {...} }
ALTER TABLE script_scenes ADD COLUMN spatial_layout TEXT;
ALTER TABLE script_scenes ADD COLUMN lighting TEXT;

-- 3. shots — 角色调度（位置/朝向/动作）
-- blocking: JSON [{ character_id, position, facing, action }]
ALTER TABLE shots ADD COLUMN blocking TEXT;

-- 4. projects — 项目级风格锁定 + 输入模式
-- visual_style: 创建后不可改（3D漫剧/写实/古风/赛博朋克等）
-- aspect_ratio: 创建后不可改（16:9/9:16）
-- input_mode: 'one_liner' | 'outline' | 'novel'
ALTER TABLE projects ADD COLUMN visual_style TEXT;
ALTER TABLE projects ADD COLUMN aspect_ratio TEXT;
ALTER TABLE projects ADD COLUMN input_mode TEXT;
