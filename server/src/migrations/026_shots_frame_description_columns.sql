-- 026: shots 表补齐分镜首尾帧描述列（DAO 已写入但建表/迁移缺失）
-- 背景：shot.ts 的 INSERT/UPDATE 使用 first_frame_description / last_frame_description，
-- 但 001 建表与 001–025 迁移均未创建这两列；新库（测试/新部署/重建）执行 INSERT 必报
-- "table shots has no column named first_frame_description"。
-- 幂等：runMigrations 对 duplicate column 错误自动跳过，重跑安全。
ALTER TABLE shots ADD COLUMN first_frame_description TEXT;
ALTER TABLE shots ADD COLUMN last_frame_description TEXT;
