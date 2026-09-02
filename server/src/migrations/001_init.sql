-- ============================================================
-- MOO-Director 数据库初始化迁移脚本
-- 版本: 001_init
-- 日期: 2026-08-16
-- 兼容: SQLite 3.x (本地模式) / MySQL 8.x (服务端模式)
-- 说明: 所有主键使用 TEXT UUID; JSON 字段统一用 TEXT;
--       时间戳统一用 TEXT 存 ISO 8601 字符串; 布尔值用 INTEGER 0/1
-- ============================================================

-- ----------------------------------------------------------
-- 0. 迁移记录表
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS _migrations (
    version     TEXT PRIMARY KEY,
    executed_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ----------------------------------------------------------
-- 1. users — 用户表
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    username      TEXT NOT NULL UNIQUE,
    password_hash TEXT,
    email         TEXT,
    display_name  TEXT NOT NULL,
    avatar_url    TEXT,
    is_local      INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL
);

-- ----------------------------------------------------------
-- 2. user_preferences — 用户偏好 (1:1)
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_preferences (
    id                    TEXT PRIMARY KEY,
    user_id               TEXT NOT NULL UNIQUE,
    theme                 TEXT NOT NULL DEFAULT 'dark',
    onboarding_completed  INTEGER NOT NULL DEFAULT 0,
    default_text_model    TEXT,
    default_image_model   TEXT,
    default_video_model   TEXT,
    default_audio_model   TEXT,
    preferences           TEXT,
    created_at            TEXT NOT NULL,
    updated_at            TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ----------------------------------------------------------
-- 3. visual_styles — 视觉风格
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS visual_styles (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL,
    name            TEXT NOT NULL,
    description     TEXT,
    style_prompt    TEXT NOT NULL,
    negative_prompt TEXT,
    thumbnail_url   TEXT,
    is_global       INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_visual_styles_user_id ON visual_styles(user_id);

-- ----------------------------------------------------------
-- 4. projects — 项目表
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS projects (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL,
    title           TEXT NOT NULL,
    description     TEXT,
    stage           TEXT NOT NULL DEFAULT 'script',
    status          TEXT NOT NULL DEFAULT 'active',
    visual_style_id TEXT,
    novel_config    TEXT,
    metadata        TEXT,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL,
    FOREIGN KEY (user_id)         REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (visual_style_id) REFERENCES visual_styles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_projects_user_status   ON projects(user_id, status);
CREATE INDEX IF NOT EXISTS idx_projects_user_updated  ON projects(user_id, updated_at);

-- ----------------------------------------------------------
-- 5. novel_chapters — 小说章节
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS novel_chapters (
    id             TEXT PRIMARY KEY,
    user_id        TEXT NOT NULL,
    project_id     TEXT NOT NULL,
    chapter_number INTEGER NOT NULL,
    title          TEXT NOT NULL,
    content        TEXT NOT NULL,
    word_count     INTEGER NOT NULL,
    source_file    TEXT,
    created_at     TEXT NOT NULL,
    FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE CASCADE,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_novel_chapters_proj_num ON novel_chapters(project_id, chapter_number);
CREATE INDEX IF NOT EXISTS idx_novel_chapters_project_id      ON novel_chapters(project_id);

-- ----------------------------------------------------------
-- 6. novel_episodes — 剧集
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS novel_episodes (
    id                  TEXT PRIMARY KEY,
    user_id             TEXT NOT NULL,
    project_id          TEXT NOT NULL,
    episode_number      INTEGER NOT NULL,
    title               TEXT NOT NULL,
    chapter_range       TEXT NOT NULL,
    script_content      TEXT,
    status              TEXT NOT NULL DEFAULT 'draft',
    text_model_provider TEXT,
    text_model_name     TEXT,
    word_count          INTEGER DEFAULT 0,
    created_at          TEXT NOT NULL,
    updated_at          TEXT NOT NULL,
    FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE CASCADE,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_novel_episodes_proj_num ON novel_episodes(project_id, episode_number);
CREATE INDEX IF NOT EXISTS idx_novel_episodes_project_id      ON novel_episodes(project_id);

-- ----------------------------------------------------------
-- 7. script_characters — 角色
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS script_characters (
    id                   TEXT PRIMARY KEY,
    user_id              TEXT NOT NULL,
    episode_id           TEXT NOT NULL,
    name                 TEXT NOT NULL,
    gender               TEXT NOT NULL DEFAULT 'other',
    role_type            TEXT NOT NULL DEFAULT 'supporting',
    description          TEXT,
    visual_description   TEXT,
    reference_image_url  TEXT,
    concept_images       TEXT,
    selected_image_index INTEGER DEFAULT 0,
    created_at           TEXT NOT NULL,
    updated_at           TEXT NOT NULL,
    FOREIGN KEY (user_id)    REFERENCES users(id)          ON DELETE CASCADE,
    FOREIGN KEY (episode_id) REFERENCES novel_episodes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_script_characters_episode_id ON script_characters(episode_id);
CREATE INDEX IF NOT EXISTS idx_script_characters_user_ep    ON script_characters(user_id, episode_id);

-- ----------------------------------------------------------
-- 8. character_variations — 角色变体
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS character_variations (
    id                  TEXT PRIMARY KEY,
    user_id             TEXT NOT NULL,
    character_id        TEXT NOT NULL,
    name                TEXT NOT NULL,
    description         TEXT,
    visual_description  TEXT,
    reference_image_url TEXT,
    concept_images      TEXT,
    created_at          TEXT NOT NULL,
    FOREIGN KEY (user_id)      REFERENCES users(id)             ON DELETE CASCADE,
    FOREIGN KEY (character_id) REFERENCES script_characters(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_character_variations_char_id ON character_variations(character_id);

-- ----------------------------------------------------------
-- 9. script_scenes — 场景
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS script_scenes (
    id                   TEXT PRIMARY KEY,
    user_id              TEXT NOT NULL,
    episode_id           TEXT NOT NULL,
    name                 TEXT NOT NULL,
    location             TEXT,
    time_of_day          TEXT,
    atmosphere           TEXT,
    description          TEXT,
    concept_images       TEXT,
    selected_image_index INTEGER DEFAULT 0,
    created_at           TEXT NOT NULL,
    updated_at           TEXT NOT NULL,
    FOREIGN KEY (user_id)    REFERENCES users(id)          ON DELETE CASCADE,
    FOREIGN KEY (episode_id) REFERENCES novel_episodes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_script_scenes_episode_id ON script_scenes(episode_id);

-- ----------------------------------------------------------
-- 10. script_props — 道具
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS script_props (
    id             TEXT PRIMARY KEY,
    user_id        TEXT NOT NULL,
    episode_id     TEXT NOT NULL,
    name           TEXT NOT NULL,
    category       TEXT NOT NULL DEFAULT 'other',
    description    TEXT,
    concept_images TEXT,
    created_at     TEXT NOT NULL,
    FOREIGN KEY (user_id)    REFERENCES users(id)          ON DELETE CASCADE,
    FOREIGN KEY (episode_id) REFERENCES novel_episodes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_script_props_episode_category ON script_props(episode_id, category);

-- ----------------------------------------------------------
-- 11. story_paragraphs — 故事段落
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS story_paragraphs (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL,
    episode_id      TEXT NOT NULL,
    scene_id        TEXT,
    paragraph_index INTEGER NOT NULL,
    content         TEXT NOT NULL,
    created_at      TEXT NOT NULL,
    FOREIGN KEY (user_id)    REFERENCES users(id)          ON DELETE CASCADE,
    FOREIGN KEY (episode_id) REFERENCES novel_episodes(id) ON DELETE CASCADE,
    FOREIGN KEY (scene_id)   REFERENCES script_scenes(id)  ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_story_paragraphs_ep_idx ON story_paragraphs(episode_id, paragraph_index);

-- ----------------------------------------------------------
-- 12. shots — 镜头
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS shots (
    id                 TEXT PRIMARY KEY,
    user_id            TEXT NOT NULL,
    episode_id         TEXT NOT NULL,
    scene_id           TEXT,
    shot_number        INTEGER NOT NULL,
    shot_size          TEXT NOT NULL DEFAULT 'medium',
    action_description TEXT,
    dialogue           TEXT,
    camera_movement    TEXT,
    grid_position      INTEGER,
    duration_seconds   REAL DEFAULT 3.0,
    characters_in_shot TEXT,
    props_in_shot      TEXT,
    notes              TEXT,
    created_at         TEXT NOT NULL,
    updated_at         TEXT NOT NULL,
    FOREIGN KEY (user_id)    REFERENCES users(id)          ON DELETE CASCADE,
    FOREIGN KEY (episode_id) REFERENCES novel_episodes(id) ON DELETE CASCADE,
    FOREIGN KEY (scene_id)   REFERENCES script_scenes(id)  ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_shots_episode_num ON shots(episode_id, shot_number);
CREATE INDEX IF NOT EXISTS idx_shots_episode_id        ON shots(episode_id);
CREATE INDEX IF NOT EXISTS idx_shots_scene_id          ON shots(scene_id);

-- ----------------------------------------------------------
-- 13. shot_keyframes — 关键帧
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS shot_keyframes (
    id                      TEXT PRIMARY KEY,
    user_id                 TEXT NOT NULL,
    shot_id                 TEXT NOT NULL,
    frame_type              TEXT NOT NULL,
    prompt                  TEXT NOT NULL,
    negative_prompt         TEXT,
    image_url               TEXT,
    image_provider          TEXT,
    image_model_name        TEXT,
    reference_character_ids TEXT,
    reference_scene_id      TEXT,
    created_at              TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (shot_id) REFERENCES shots(id) ON DELETE CASCADE
);

-- 注: 文档提到 UNIQUE(shot_id, frame_type), 但 middle 帧可有多张,
-- 故此处使用普通索引而非唯一约束, 由应用层控制 first/last 唯一性
CREATE INDEX IF NOT EXISTS idx_shot_keyframes_shot_id ON shot_keyframes(shot_id);

-- ----------------------------------------------------------
-- 14. shot_video_intervals — 视频片段
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS shot_video_intervals (
    id               TEXT PRIMARY KEY,
    user_id          TEXT NOT NULL,
    shot_id          TEXT NOT NULL,
    start_frame_id   TEXT,
    end_frame_id     TEXT,
    duration_seconds REAL DEFAULT 5.0,
    video_url        TEXT,
    video_provider   TEXT,
    video_model_name TEXT,
    motion_prompt    TEXT,
    status           TEXT NOT NULL DEFAULT 'pending',
    error_message    TEXT,
    external_task_id TEXT,
    created_at       TEXT NOT NULL,
    completed_at     TEXT,
    FOREIGN KEY (user_id)        REFERENCES users(id)          ON DELETE CASCADE,
    FOREIGN KEY (shot_id)        REFERENCES shots(id)          ON DELETE CASCADE,
    FOREIGN KEY (start_frame_id) REFERENCES shot_keyframes(id) ON DELETE SET NULL,
    FOREIGN KEY (end_frame_id)   REFERENCES shot_keyframes(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_shot_video_intervals_shot_id ON shot_video_intervals(shot_id);
CREATE INDEX IF NOT EXISTS idx_shot_video_intervals_status  ON shot_video_intervals(status);

-- ----------------------------------------------------------
-- 15. generation_tasks — 异步生成任务
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS generation_tasks (
    id            TEXT PRIMARY KEY,
    user_id       TEXT NOT NULL,
    project_id    TEXT NOT NULL,
    task_type     TEXT NOT NULL,
    status        TEXT NOT NULL DEFAULT 'pending',
    provider      TEXT,
    model_name    TEXT,
    input_params  TEXT NOT NULL,
    result        TEXT,
    error_message TEXT,
    progress      INTEGER DEFAULT 0,
    created_at    TEXT NOT NULL,
    started_at    TEXT,
    completed_at  TEXT,
    FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE CASCADE,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_gen_tasks_user_status ON generation_tasks(user_id, status);
CREATE INDEX IF NOT EXISTS idx_gen_tasks_project_id  ON generation_tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_gen_tasks_status      ON generation_tasks(status);

-- ----------------------------------------------------------
-- 16. render_logs — 渲染日志
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS render_logs (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL,
    project_id TEXT,
    episode_id TEXT,
    shot_id    TEXT,
    action     TEXT NOT NULL,
    details    TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id)    REFERENCES users(id)          ON DELETE CASCADE,
    FOREIGN KEY (project_id) REFERENCES projects(id)       ON DELETE SET NULL,
    FOREIGN KEY (episode_id) REFERENCES novel_episodes(id) ON DELETE SET NULL,
    FOREIGN KEY (shot_id)    REFERENCES shots(id)          ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_render_logs_user_created ON render_logs(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_render_logs_project_id   ON render_logs(project_id);

-- ----------------------------------------------------------
-- 17. asset_library — 共享资产库
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS asset_library (
    id                TEXT PRIMARY KEY,
    user_id           TEXT NOT NULL,
    asset_type        TEXT NOT NULL,
    name              TEXT NOT NULL,
    description       TEXT,
    image_url         TEXT,
    source_project_id TEXT,
    tags              TEXT,
    metadata          TEXT,
    created_at        TEXT NOT NULL,
    FOREIGN KEY (user_id)           REFERENCES users(id)    ON DELETE CASCADE,
    FOREIGN KEY (source_project_id) REFERENCES projects(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_asset_library_user_type ON asset_library(user_id, asset_type);

-- ----------------------------------------------------------
-- 18. model_registry — 模型配置
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS model_registry (
    id                 TEXT PRIMARY KEY,
    user_id            TEXT NOT NULL,
    provider           TEXT NOT NULL,
    model_name         TEXT NOT NULL,
    model_type         TEXT NOT NULL,
    api_key            TEXT,
    endpoint_url       TEXT,
    is_active          INTEGER NOT NULL DEFAULT 1,
    is_default         INTEGER NOT NULL DEFAULT 0,
    config             TEXT,
    last_test_status   TEXT,
    last_test_message  TEXT,
    last_test_at       TEXT,
    created_at         TEXT NOT NULL,
    updated_at         TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_model_registry_user_provider_model ON model_registry(user_id, provider, model_name);
CREATE INDEX IF NOT EXISTS idx_model_registry_user_type                 ON model_registry(user_id, model_type);
CREATE INDEX IF NOT EXISTS idx_model_registry_user_default              ON model_registry(user_id, is_default);

-- 注: 迁移记录 (_migrations) 由应用层 migrate.ts 在执行完本文件后插入,
--     以保证 SQLite / MySQL 双引擎兼容。
