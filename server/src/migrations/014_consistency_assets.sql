-- 014: 一致性资产扩展（导演级一致性重构）
-- 目标：低抽卡 + 人物/场景/道具/声音全链路一致性
-- 1) script_props 增加线索标记与关键词（跨镜头视觉连贯追踪，参考 ArcReel clue tracking）
-- 2) script_characters 增加音色档案（跨镜头/跨集声音一致，参考 NovelReel voice calibration）
-- 3) shot_keyframes 增加候选序号与选中标记（九宫格候选选首帧，参考 BigBanana）
-- 4) shots 增加尾帧衔接策略（首尾帧插值：下镜首帧作尾帧 / 显式尾帧 / 关闭，参考 VideoClaw）
-- 说明：本文件全部为幂等 DDL，由 sqliteDatabase.runMigrations 逐语句执行并跳过重复列。

ALTER TABLE script_props ADD COLUMN is_clue INTEGER DEFAULT 0;
ALTER TABLE script_props ADD COLUMN keywords TEXT DEFAULT '';

ALTER TABLE script_characters ADD COLUMN voice_profile TEXT DEFAULT '';

ALTER TABLE shot_keyframes ADD COLUMN candidate_index INTEGER DEFAULT 0;
ALTER TABLE shot_keyframes ADD COLUMN is_selected INTEGER DEFAULT 1;

ALTER TABLE shots ADD COLUMN use_next_first_frame INTEGER DEFAULT 1;
