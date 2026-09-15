-- 024: 剧本分析缓存增加视频模型 Skill 记录
-- 背景：提示词 Skill 机制下，换视频模型后需按新模型的官方规范重新分析剧本。
-- 原缓存只按剧集+文本模型判断，无法感知视频模型变化，导致换模型后仍用旧分析。
-- 增加 video_skill 列记录分析时所用的提示词 Skill id；不一致时强制重分析。
ALTER TABLE script_analysis ADD COLUMN video_skill TEXT;
