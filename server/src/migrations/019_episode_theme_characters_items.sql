-- 019: 给 novel_episodes 表增加主题、角色清单、关键物品清单字段
-- 解决剧集生成提示词没有主题、系统找不到角色或物品的问题
ALTER TABLE novel_episodes ADD COLUMN theme TEXT;
ALTER TABLE novel_episodes ADD COLUMN characters_json TEXT;
ALTER TABLE novel_episodes ADD COLUMN key_items_json TEXT;
