-- 016: 回填历史分镜的角色标记
-- 背景：分镜生成早期不写 characters_in_shot（约 44% 镜头为空），角色参考图收集不到。
-- 这里从 action_description / dialogue 按角色名匹配本集角色，回填为 JSON 数组。
-- 幂等：已有该角色名的镜头不重复插入；重跑安全。
UPDATE shots
SET characters_in_shot = CASE
  WHEN shots.characters_in_shot IS NULL OR shots.characters_in_shot = '' THEN json_array(sc.name)
  WHEN json_valid(shots.characters_in_shot) AND NOT EXISTS (
    SELECT 1 FROM json_each(shots.characters_in_shot) WHERE json_each.value = sc.name
  ) THEN json_insert(shots.characters_in_shot, '$[#]', sc.name)
  ELSE shots.characters_in_shot
END
FROM script_characters sc
WHERE shots.episode_id = sc.episode_id
  AND sc.name IS NOT NULL AND sc.name != ''
  AND (shots.action_description LIKE '%' || sc.name || '%' OR shots.dialogue LIKE '%' || sc.name || '%')
  AND (
    shots.characters_in_shot IS NULL
    OR shots.characters_in_shot = ''
    OR (json_valid(shots.characters_in_shot) AND NOT EXISTS (
      SELECT 1 FROM json_each(shots.characters_in_shot) WHERE json_each.value = sc.name
    ))
  );
