-- ============================================================
-- 005_shot_enhancements
-- 增强分镜表字段：镜头主体、光影、氛围、转场、节奏
-- ============================================================

ALTER TABLE shots ADD COLUMN subject TEXT;
ALTER TABLE shots ADD COLUMN lighting TEXT;
ALTER TABLE shots ADD COLUMN mood TEXT;
ALTER TABLE shots ADD COLUMN transition TEXT DEFAULT 'cut';
ALTER TABLE shots ADD COLUMN pace TEXT DEFAULT 'normal';
