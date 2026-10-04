-- 036: 自定义提示词列（提示词预览 + custom_prompt 支持）
-- 生成接口传入 custom_prompt 时：替代系统自动构建的提示词，并存入对应记录的自定义列
-- 预览接口优先展示已保存的自定义提示词（下次生成默认使用）
-- 新增列均允许 NULL，不影响现有数据
ALTER TABLE shots ADD COLUMN custom_keyframe_prompt TEXT;
ALTER TABLE shots ADD COLUMN custom_video_prompt TEXT;
ALTER TABLE script_characters ADD COLUMN custom_image_prompt TEXT;
ALTER TABLE script_scenes ADD COLUMN custom_image_prompt TEXT;
