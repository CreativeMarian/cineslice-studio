-- 028_project_memory.sql
-- P0-1: 项目级长期记忆系统
-- 借鉴 ManjuForge 三文件思路：角色圣经 / 世界观 / 剧情摘要 + 伏笔追踪 + 角色关系图谱
-- 幂等：runMigrations 对 duplicate column 错误自动跳过，重跑安全。

-- 1. 项目圣经表（角色圣经/世界观/剧情摘要三类，跨剧集持久化）
CREATE TABLE IF NOT EXISTS project_bible (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  bible_type TEXT NOT NULL,           -- character | world | story
  content TEXT NOT NULL DEFAULT '',   -- 内容（Markdown格式）
  version INTEGER NOT NULL DEFAULT 1,
  generated_by TEXT DEFAULT '',       -- system | ai | manual
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_project_bible_project ON project_bible(project_id);
CREATE INDEX IF NOT EXISTS idx_project_bible_type ON project_bible(project_id, bible_type);

-- 2. 伏笔追踪表（自动识别剧本伏笔，后续剧集自动提醒回收）
CREATE TABLE IF NOT EXISTS story_foreshadow (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  description TEXT NOT NULL,          -- 伏笔描述
  introduced_episode_id TEXT,         -- 首次出现的剧集
  introduced_shot_id TEXT,            -- 首次出现的分镜
  status TEXT NOT NULL DEFAULT 'open', -- open | resolved | abandoned
  resolved_episode_id TEXT,           -- 回收的剧集
  resolution_note TEXT DEFAULT '',    -- 回收说明
  importance INTEGER DEFAULT 1,       -- 重要性 1-5
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_foreshadow_project ON story_foreshadow(project_id);
CREATE INDEX IF NOT EXISTS idx_foreshadow_status ON story_foreshadow(project_id, status);

-- 3. 角色关系图谱表（随剧情演进自动更新关系状态）
CREATE TABLE IF NOT EXISTS character_relationship (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  char_a_id TEXT NOT NULL,
  char_b_id TEXT NOT NULL,
  relation_type TEXT NOT NULL,        -- family | friend | enemy | lover | colleague | stranger | other
  intensity INTEGER DEFAULT 0,        -- 关系强度 -100~100（负=敌对，正=亲密）
  description TEXT DEFAULT '',        -- 关系描述
  last_updated_episode_id TEXT,       -- 最后更新的剧集
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_relationship_project ON character_relationship(project_id);
CREATE INDEX IF NOT EXISTS idx_relationship_chars ON character_relationship(project_id, char_a_id, char_b_id);

-- 4. 角色结构化视觉锚点字段（P0-3，将 visual_description 升级为结构化字段）
ALTER TABLE script_characters ADD COLUMN anchor_face_shape TEXT DEFAULT '';      -- 脸型
ALTER TABLE script_characters ADD COLUMN anchor_eye_color TEXT DEFAULT '';       -- 瞳色
ALTER TABLE script_characters ADD COLUMN anchor_hairstyle TEXT DEFAULT '';       -- 发型
ALTER TABLE script_characters ADD COLUMN anchor_hair_color TEXT DEFAULT '';      -- 发色
ALTER TABLE script_characters ADD COLUMN anchor_outfit TEXT DEFAULT '';          -- 服装（标准化描述）
ALTER TABLE script_characters ADD COLUMN anchor_accessories TEXT DEFAULT '';     -- 配饰
ALTER TABLE script_characters ADD COLUMN anchor_body_type TEXT DEFAULT '';       -- 体型
ALTER TABLE script_characters ADD COLUMN anchor_distinctive TEXT DEFAULT '';     -- 标志性特征（痣/疤/纹身）
ALTER TABLE script_characters ADD COLUMN anchor_standardized TEXT DEFAULT '';    -- 标准化锚点（100字内，自动生成）
