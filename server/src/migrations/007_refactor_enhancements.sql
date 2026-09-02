-- ============================================================
-- MOO-Director 数据库迁移脚本 007
-- 版本: 007_refactor_enhancements
-- 日期: 2026-08-18
-- 说明: 对齐《AI短剧制作全流程手册》重构增强
--   - 角色四视图字段
--   - 分镜场景关联（用于视频生成时自动匹配场景参考图）
--   - 字幕表
-- ============================================================

-- 角色四视图图片（面部特写 + 三视图）
ALTER TABLE script_characters ADD COLUMN four_view_images TEXT;

-- 分镜关联场景ID（用于视频生成时自动匹配场景参考图）
CREATE INDEX IF NOT EXISTS idx_shots_scene_id ON shots(scene_id);

-- 字幕表
CREATE TABLE IF NOT EXISTS subtitles (
    id            TEXT PRIMARY KEY,
    user_id       TEXT NOT NULL,
    episode_id    TEXT NOT NULL,
    shot_id       TEXT,
    start_time    REAL NOT NULL DEFAULT 0,
    end_time      REAL NOT NULL DEFAULT 0,
    text          TEXT NOT NULL,
    speaker       TEXT,
    style         TEXT DEFAULT 'default',
    created_at    TEXT NOT NULL,
    FOREIGN KEY (user_id)    REFERENCES users(id)          ON DELETE CASCADE,
    FOREIGN KEY (episode_id) REFERENCES novel_episodes(id) ON DELETE CASCADE,
    FOREIGN KEY (shot_id)    REFERENCES shots(id)          ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_subtitles_episode_id ON subtitles(episode_id);
CREATE INDEX IF NOT EXISTS idx_subtitles_shot_id    ON subtitles(shot_id);
