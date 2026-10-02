-- 029_visual_memory.sql
-- P0-2: 视觉记忆库
-- 借鉴 StoryMem（Memory to Video）：所有关键帧自动入库，按角色/场景/道具索引
-- 生成新镜时自动检索同角色/同场景的历史关键帧作为多参考图输入
-- 幂等：runMigrations 对 duplicate column 错误自动跳过，重跑安全。

-- 视觉记忆表（所有关键帧自动入库）
CREATE TABLE IF NOT EXISTS visual_memory (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  episode_id TEXT NOT NULL,
  shot_id TEXT,
  keyframe_id TEXT,              -- 关联 shot_keyframes.id
  image_url TEXT NOT NULL,       -- 图片路径
  memory_type TEXT NOT NULL,     -- character | scene | prop | keyframe | general
  entity_name TEXT DEFAULT '',   -- 角色名/场景名/道具名
  entity_id TEXT,                -- 关联 script_characters.id / script_scenes.id / script_props.id
  shot_number INTEGER DEFAULT 0, -- 所属镜头号（用于时序检索）
  frame_type TEXT DEFAULT '',    -- first | last | candidate | general
  embedding TEXT DEFAULT '',     -- 可选：图像特征向量（JSON）
  metadata TEXT DEFAULT '',      -- 元数据 JSON（提示词、模型、时间等）
  quality_score REAL DEFAULT 0,  -- 质量评分（VLM打分）
  is_reference INTEGER DEFAULT 0,-- 是否为优质参考图（1=可作为参考）
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_visual_memory_project ON visual_memory(project_id);
CREATE INDEX IF NOT EXISTS idx_visual_memory_type ON visual_memory(project_id, memory_type);
CREATE INDEX IF NOT EXISTS idx_visual_memory_entity ON visual_memory(project_id, entity_name);
CREATE INDEX IF NOT EXISTS idx_visual_memory_shot ON visual_memory(project_id, shot_id);
CREATE INDEX IF NOT EXISTS idx_visual_memory_ref ON visual_memory(project_id, is_reference);
