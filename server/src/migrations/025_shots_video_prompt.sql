-- 025: 分镜表加"官方格式视频提示词成品"与"重构所用 Skill"
-- 重构式提示词链路：分镜生成后按视频模型 Skill 官方公式重构出成品提示词落库，
-- 视频生成直接消费成品（不二次包装）；换模型时按 video_skill 失效触发重跑重构。
ALTER TABLE shots ADD COLUMN video_prompt TEXT;
ALTER TABLE shots ADD COLUMN video_skill TEXT;
