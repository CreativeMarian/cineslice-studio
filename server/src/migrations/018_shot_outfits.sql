-- 018: 造型调度系统——镜头级角色服装匹配
-- 每个镜头记录该镜头中各角色应穿的造型，关键帧生成时按造型匹配定妆照
ALTER TABLE shots ADD COLUMN character_outfits TEXT;
-- JSON 格式：{"角色名": "造型名", "角色2": "造型名2"}
CREATE INDEX IF NOT EXISTS idx_shots_outfits ON shots(episode_id);
