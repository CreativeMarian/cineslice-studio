-- 015: 角色衣橱（多套造型）——BigBanana Base Look 方案
-- 每个角色可维护多套造型（定妆照），默认造型图在生成镜头关键帧/视频时
-- 作为角色参考图注入，实现"保险换装"与跨镜服装一致
CREATE TABLE IF NOT EXISTS character_outfits (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  character_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  image_url TEXT,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_character_outfits_character ON character_outfits(character_id);
