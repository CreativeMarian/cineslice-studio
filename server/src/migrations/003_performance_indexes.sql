-- 003_performance_indexes.sql
-- 性能优化：补全缺失的索引

-- 视频片段按分镜查询的索引
CREATE INDEX IF NOT EXISTS idx_video_intervals_shot 
ON shot_video_intervals(shot_id);

-- 视频片段按状态查询的索引（用于轮询处理中的任务）
CREATE INDEX IF NOT EXISTS idx_video_intervals_status 
ON shot_video_intervals(status);

-- 渲染日志按剧集查询的索引
CREATE INDEX IF NOT EXISTS idx_render_logs_episode 
ON render_logs(episode_id);
