-- 030_character_expressions.sql
-- P1-4: 角色九宫格表情图资产
-- 特写镜头自动选用对应表情图作为参考，增强情绪一致性
-- 幂等：runMigrations 对 duplicate column 错误自动跳过，重跑安全。

ALTER TABLE script_characters ADD COLUMN expression_images TEXT DEFAULT '';  -- 九宫格表情图 JSON：{ happy: url, angry: url, sad: url, ... }
ALTER TABLE script_characters ADD COLUMN expression_status TEXT DEFAULT 'none'; -- none | generating | completed | failed
