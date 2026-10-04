# CineSlice Studio 第二轮深度排查报告 — 性能瓶颈 + 数据一致性

- 排查时间：2026-10-04
- 排查范围：`server/src`（路由 / 服务 / DAO / 迁移）+ `src`（导演台 / 角色 / 美术 / 状态管理）
- 方法：逐文件精读 31 张表建表脚本、全部 DAO 删除方法、批量生成链路（关键帧/视频/段）、导演台前端渲染路径，并对 `for` 循环内嵌 `db.prepare` / `getById` / `listByEpisode` 模式做全局扫描

---

## 维度四：性能瓶颈分析

### 4.1 N+1 查询

| # | 位置 | 问题 | 严重度 |
|---|------|------|--------|
| N1 | `server/src/routes/episodes.ts:544-553` GET /episodes/:id/videos/count | 逐镜 `ShotVideoIntervalDAO.listByShot`，N+1 | P1 |
| N2 | `server/src/services/segmentService.ts:100-105` `getShotsForSegment` | 每次调用都 `ShotDAO.listByEpisode` **全量加载整集镜头**再按 `segment_id` 过滤，被 4 处调用方复用 | P1 |
| N3 | `server/src/services/segmentService.ts:163-169` `getSegmentsByEpisode` | 每段调用 `refreshSegmentStatus` → 每段都**重复全量 listByEpisode** + 段内每镜 `listByShot`，段数×镜头数级查询 | P1 |
| N4 | `server/src/services/segmentService.ts:313-333` `composeEpisodeFromSegments` | 双层循环：每段全量 listByEpisode + 每镜 listByShot | P2 |
| N5 | `server/src/services/shotConsistencyService.ts:698-704` `calculateAllShotsReadiness` | 每镜调 `calculateShotReadiness`（618），内部 `listByShot`×3 + `listByEpisode(script_characters)` + `getById(scene)`，**O(N²)** | P1 |
| N6 | `server/src/services/videoGenerator.ts:495-600` `batchGenerateVideos` | 每镜 `listByShot`×3（497/525/539）+ `resolveLastFrameForShot` + `collectShotReferenceImages` + `buildPromptBuilderVideoPrompt` 内角色 `getById` 失败回退全量 `listByEpisode`（videoGenerator.ts:106-108、154-157），100 镜 ≈ 800~1200 次查询 | P1 |
| N7 | `server/src/services/keyframeGenerator.ts:62-67, 93-103` | 角色引用解析失败回退全量 `listByEpisode`；上下文衔接每镜全量 `listByEpisode` 找前镜。批量 100 镜 = 100 次全量加载 | P2 |
| N8 | `shot.ts:147-156` / `scriptCharacter.ts:35-44` / `scriptScene.ts:30-39` `batchCreate` | 循环调 `create`，每个 create 末尾 `getById` 回查一次（N 次额外 SELECT） | P2 |
| N9 | `server/src/services/autoPipeline/stages/keyframes.ts` 逐镜循环内 `ScriptSceneDAO.listByEpisode`（视觉记忆入库时反查场景名） | 每镜全量加载场景列表 | P2 |

**查询量级估算（100 镜 / 20 段剧集）**：

- 段列表刷新（N3）：20 段 ×（1 全量镜头 + 段内 2~4 镜 × 1 视频查询）≈ 20×105 ≈ **2100 次查询**，且每段重复加载同一份镜头数据。
- 就绪度检查（N5）：100 镜 ×（3 视频查询 + 1 全量角色 + 1 场景查询）≈ **500 次查询**，其中角色列表重复加载 100 次。
- 批量视频（N6）：100 镜 × 8~12 次 ≈ **1000 次查询**。
- 批量关键帧（N7）：100 镜 ×（1 全量镜头 + 可能 1 全量角色）≈ 200 次全量加载。

**修复建议**：
1. N1：改为单条聚合 SQL `SELECT COUNT(*) FROM shot_video_intervals WHERE shot_id IN (...) AND status='completed'`，或提供 `ShotVideoIntervalDAO.countCompletedByEpisode(episodeId)`（JOIN shots）。
2. N2：新增 `ShotDAO.listBySegment(episodeId, segmentNumber)`（`WHERE episode_id=? AND segment_id=?`），所有调用方改用；顺带给 `shots(episode_id, segment_id)` 建复合索引。
3. N3：`getSegmentsByEpisode` 改为一次 `listByEpisode` + 一次 `listByShot` 批量（`WHERE shot_id IN (...)`，用 `getByIds` 同款 IN 占位符）+ 按段分组；删除"每段全量加载"。
4. N5：`calculateAllShotsReadiness` 先一次性取全量角色/场景/视频（按 episode 或 shot_ids IN 批量），在内存中完成判定。
5. N6/N7：批量入口先一次性加载整集角色/场景/镜头到 Map，循环内只做内存查找；`resolveLastFrameForShot` 接收已加载的 `allShots` 参数（已有该参数，`calculateShotReadiness` 已传，`batchGenerateVideos` 未传，改传即可消除一次全量）。
6. N8：`batchCreate` 改为预生成 ID 后单事务批量 INSERT（better-sqlite3 支持多值 INSERT），省掉 N 次 getById。

---

### 4.2 大数据量性能

| # | 位置 | 问题 | 严重度 |
|---|------|------|--------|
| B1 | `src/components/StageDirector/StageDirectorPage.tsx:254-262, 459-507` | `loadShots` 一次性拉全部分镜，**无分页**；所有段默认展开（`expanded[key] !== false`，462 行），100+ 分镜时全部 ShotCard 同时渲染 | P1 |
| B2 | 全局 | **无虚拟滚动**（无 react-window / react-virtualized 依赖） | P2 |
| B3 | `StageDirectorPage.tsx:490` | 段内 map 中对每个 shot 执行 `sortedShots.findIndex(s => s.id === shot.id)`，**O(N²)**（100 镜≈1 万次比较，1000 镜≈100 万次） | P2 |
| B4 | `src/components/StageDirector/ShotCard.tsx:134-150` | **每张 ShotCard 挂载独立发 2 个请求**（getKeyframes + listByShot）。100 镜 = 200 请求 | P1 |
| B5 | `ShotCard.tsx:95-101` + `src/stores/useProjectStore.ts:142-158` | 每张 ShotCard 挂载都调 `loadCharacters`/`loadScenes`，store **无缓存无去重**，100 卡片 = 200 个重复请求。叠加 B4，**导演台加载一次发起约 400 个请求** | P1 |
| B6 | `ShotCard.tsx:451, 712-718` | 首帧 2560x1440 原图在列表直接渲染，100 张同屏加载易卡顿（video 已用 preload="metadata" 较好） | P1 |
| B7 | `src/components/StageCharacters/StageCharacters.tsx:200`、`CharacterDetailPage.tsx:515/536`、`StageArt` 系列页 | 角色/场景列表页所有概念图同时加载，无懒加载 | P2 |
| B8 | `ShotCard.tsx:195-204` | 视频生成中每卡片每秒 setState（elapsedTime），50 张生成中 = 50 次/秒全树重渲染 | P2 |

**修复建议**：
1. B4/B5：导演台批量接口合并——新增 `GET /episodes/:id/board` 一次返回 shots + 各镜 keyframes/videos 汇总；或至少前端在 store 层对 `loadCharacters/loadScenes` 做 episodeId 级请求去重（记忆最后加载的 episodeId + in-flight Promise）。
2. B1/B2：段折叠默认收起或按视口懒展开；100+ 镜头时引入 `react-window` 虚拟列表（ShotCard 高度不固定，可用 `VariableSizeList` 或简化固定行高）。
3. B3：用 `Map<id, index>` 一次构建，map 内 O(1) 查。
4. B6：`<img loading="lazy" decoding="async">` + 服务端缩略图（/data/... 支持 `?w=320` 之类参数或另存 thumb）。
5. B7：列表页同样加 lazy；或网格固定数量 + 翻页。
6. B8：计时改为组件内自绘或仅在生成中展示静态"已等待"，去掉每秒全局 setState。

---

### 4.3 AI 调用性能

| # | 位置 | 问题 | 严重度 |
|---|------|------|--------|
| A1 | `server/src/services/autoPipeline/runner.ts:42-52` | DAG 仅 `['keyframes','audio']` 一个并行组，其余 7 个阶段全串行（顺序本身正确：scenes→characters 已按 P1-13 调整） | P2（设计） |
| A2 | `autoPipeline/stages/characters.ts:93-182` | 多角色**概念图+四视图全串行**：每角色 1 概念图 + 4 四视图 + 1 造型分析（194+）≈ 6 次 AI 调用。10 角色 = ~60 次串行调用 | P1 |
| A3 | `characters.ts:145-163` | 四视图内层循环（closeup/front/side/back）逐张串行 | P2 |
| A4 | `autoPipeline/stages/scenes.ts:88-137` | 场景概念图逐场景串行 | P2 |
| A5 | `server/src/services/keyframeGenerator.ts:261-308` `batchGenerateKeyframes` | 逐镜串行 + **每镜强制 20 秒间隔**（307 行，`BATCH_KEYFRAME_INTERVAL_MS` 默认 20000）。100 镜 ≈ 100×(AI 调用+20s) ≈ 40~60 分钟 | P1 |
| A6 | `server/src/services/videoGenerator.ts:495-600` `batchGenerateVideos` | 逐镜串行 + 每镜 5 秒间隔（599 行） | P2 |
| A7 | `server/src/services/autoPipeline/stages/video.ts:47,84` | `concurrency = Math.min(baseConcurrency, 1)` —— **`VIDEO_CONCURRENCY` 环境变量被 `Math.min(…,1)` 锁死为 1，配置永不生效（死代码）**；内部也仍是串行 await | P1 |
| A8 | AI 缓存（`aiProxy.ts:122-147, 228-240, 289-301`） | 文本仅 JSON 输出缓存（1h）；图片缓存 24h 且**关键帧显式 `skipCache: true`（keyframeGenerator.ts:158）**——改提示词必出新图，属有意设计；characters/scenes 概念图走缓存，相同提示词可命中 | 信息项 |

**耗时测算（100 镜批量关键帧，A5）**：串行 + 20s 间隔，仅间隔耗时 = 99×20s ≈ **33 分钟**，AI 调用另计 30~60 分钟；若支持并发窗口（如 3 并发 + 5s 间隔）可缩短至约 1/3~1/2。

**修复建议**：
1. A2：characters 阶段按小并发窗口（如 `Promise.all` 每批 2~3 角色）并行生成概念图；四视图内部 4 张可并行（受同一角色参考图约束，安全）。
2. A5：默认间隔降到 5s，并支持并发窗口（环境变量 `BATCH_KEYFRAME_CONCURRENCY`），限流时动态退避（已有 302 行退避逻辑可保留）。
3. A7：删除 `Math.min(baseConcurrency, 1)` 的下限锁死，改为 `Math.max(1, Number(process.env.VIDEO_CONCURRENCY) || 1)`，实现受控并发（注意首尾帧衔接依赖顺序提交，需保留 resolveLastFrameForShot 逻辑）。

---

### 4.4 图片加载性能

| # | 位置 | 问题 | 严重度 |
|---|------|------|--------|
| L1 | 全局搜索 `loading="lazy"` / `IntersectionObserver` | 仅 `LandingPage.tsx:40-43` 使用 IntersectionObserver；**业务页所有 `<img>` 均无懒加载**（ShotCard.tsx:451、ConceptImageGenerator.tsx:129-133、StageCharacters/StageArt 各列表） | P1 |
| L2 | `ShotCard.tsx:451` | 首帧 2560x1440 原图直渲列表 | P1 |
| L3 | `src/components/common/ConceptImageGenerator.tsx:129-133` | 角色/场景/道具概念图（1440x2560/2560x1440）直渲，无压缩、无 loading | P2 |
| L4 | 全局 | 无占位/骨架屏（图片加载中为空白区）；有 Spinner 但图片槽无 skeleton | P2 |

**修复建议**：列表缩略图统一走服务端缩略（或前端 `object-fit` + `loading="lazy" decoding="async"`）；大图详情页才用原图；图片槽加 skeleton 占位。

---

### 4.5 数据库索引

**全量 CREATE INDEX 清单（001-035 迁移）**：

| 表 | 索引 | 覆盖高频查询 |
|----|------|------------|
| shots | `uq_shots_episode_num(episode_id, shot_number)`、`idx_shots_episode_id`、`idx_shots_scene_id` | 镜头列表/排序 ✓ |
| script_characters | `idx_script_characters_episode_id`、`idx_script_characters_user_ep(user_id, episode_id)` | ✓ |
| script_scenes | `idx_script_scenes_episode_id` | ✓ |
| shot_keyframes | `idx_shot_keyframes_shot_id` | ✓ |
| shot_video_intervals | `idx_shot_video_intervals_shot_id`、`idx_shot_video_intervals_status` | ✓ |
| segments | `idx_segments_episode(episode_id)`、`idx_segments_project(project_id)`（035） | ✓ |
| novel_episodes | `uq_novel_episodes_proj_num(project_id, episode_number)`、`idx_novel_episodes_project_id` | ✓ |
| projects | `idx_projects_user_status(user_id, status)`、`idx_projects_user_updated(user_id, updated_at)` | ✓ |
| render_logs | `idx_render_logs_user_created(user_id, created_at)`、`idx_render_logs_project_id` | ✓ |
| generation_tasks | `idx_gen_tasks_user_status`、`idx_gen_tasks_project_id`、`idx_gen_tasks_status` | ✓ |
| shot_audio | `idx_shot_audio_episode`、`idx_shot_audio_shot`、`idx_shot_audio_shot_number(episode_id, shot_number)` | ✓ |
| subtitles / script_analysis / script_props / character_outfits / character_variations / visual_memory / ai_cache | 各自 episode / character / project 索引（见 001/003/007/015/029） | ✓ |

**缺失索引**：

| # | 缺失 | 影响 | 严重度 |
|---|------|------|--------|
| I1 | **`shots(episode_id, segment_id)` 复合索引** | `getShotsForSegment` 目前全量 listByEpisode 再内存过滤，索引未被利用；一旦按 4.1-N2 新增 `listBySegment` DAO，必须配此索引 | P2 |
| I2 | `segments(episode_id, status)` | 段状态轮询按 episode+status 过滤时缺复合索引（当前 5s 轮询走 episode_id 单列索引，量级小可接受） | P3 |

其余高频字段均有覆盖，`ai_cache(cache_key)` 为主键直查，无问题。

---

### 4.6 前端渲染性能

| # | 位置 | 问题 | 严重度 |
|---|------|------|--------|
| R1 | `ShotCard.tsx:71` | **ShotCard 未用 React.memo**（全局无 memo 包裹的业务组件），且 `onDeleted`/`showToast` 每次渲染新建引用，memo 化也难生效；父组件 `setShots` 后全量重渲染 | P2 |
| R2 | `StageDirectorPage.tsx:294-298` | sortedShots / segments 已 useMemo ✓（好实践），但 `segments.map` 内全量渲染 ShotCard 无任何隔离 | P2 |
| R3 | `src/stores/useProjectStore.ts:160-167` | `loadShots` 全量替换 `shots` 数组；`updateShot`（185-188）存在但导演台未使用——镜头更新依赖 `window` 事件 + 重新 loadShots 全量刷新 | P2 |
| R4 | `ShotCard.tsx:110-118, 121-124` | `parsedBlocking`/`sceneName` 已 useMemo ✓；`characterNameOf` useCallback ✓；render 内无大 JSON.parse（合规） | 无问题 |
| R5 | `ShotCard.tsx:152-155` | `keyframes.find`/`videos.find` 每渲染执行，量级小可忽略 | P3 |

**修复建议**：R1/R2——ShotCard 包 `React.memo` 并把 `onDeleted` 改为 `useCallback`（父级用稳定的 `onShotDeleted`）；镜头编辑保存后改走 store `updateShot` 局部更新而非全量重拉。R3——导演台监听 `shot-updated` 时仅更新对应镜头对象。

---

## 维度五：数据一致性与完整性

### 5.1 删除角色后（复现：删除角色 → 检查导演台/提示词）

**DAO 行为**：`ScriptCharacterDAO.delete`（scriptCharacter.ts:77-79）仅执行 `DELETE FROM script_characters WHERE id=?`，**无任何关联清理**。

| 引用方 | 引用方式 | 删除后行为 | 严重度 |
|--------|---------|-----------|--------|
| `character_variations` | 外键（001 迁移 `ON DELETE CASCADE`） | ✓ 自动级联删除 | — |
| **`character_outfits`** | **无外键**（015 迁移仅建表+索引） | **孤儿行残留**，`listByCharacter` 仍返回已删角色服装 | **P1** |
| `shots.characters_in_shot`（角色名数组 JSON） | 非外键 | 悬空角色名。前端 ShotCard 显示为"旧数据角色（保留）"（ShotCard.tsx:343-355、566-570），**不崩但无法从下拉移除**，保存时原样写回 | P2 |
| `shots.blocking`（JSON 内 character_id） | 非外键 | 悬空 ID。**promptBuilder `buildBlockingBlock`（promptBuilder.ts:210-214）回退链：id 匹配 → 名称匹配 → 原样输出 character_id（UUID）** → 重新生成首帧/视频时提示词出现 UUID 垃圾文本 | **P1** |
| `shot_keyframes.reference_characters`（JSON ID 数组） | 非外键 | 悬空 ID；`collectShotReferenceImages` getById 返回 null 静默跳过，不崩 | P2 |
| `assets.ts:152-153` 重新提取角色 | 循环 `ScriptCharacterDAO.delete` | 同样产生上述孤儿 | P1（随上述） |

**复现步骤**：角色页删除"小明" → 导演台分镜徽章仍显示"小明"（characters_in_shot）→ 有 blocking 的镜头调度徽章显示 UUID 字符串 → 点击"重新生成首帧"，AI 提示词含 `【调度】char_xxx…位于…` 垃圾片段。

**修复建议**：
1. `ScriptCharacterDAO.delete` 改为事务：删除角色前先 `DELETE FROM character_outfits WHERE character_id=?`（或 015 迁移补外键）。
2. 服务层在删除角色时扫描该集 shots：`characters_in_shot` / `blocking` / `reference_characters` 中移除对应项并更新（一次性全量扫描+批量 UPDATE，量级小）。
3. `buildBlockingBlock` 回退链最终兜底改为 `characters[0]?.name || '角色'`，**禁止输出原始 UUID**。

---

### 5.2 删除场景后（复现：删除场景 → 检查镜头/服装）

**DAO 行为**：`ScriptSceneDAO.delete`（scriptScene.ts:72-74）仅删除本行。

| 引用方 | 引用方式 | 删除后行为 | 严重度 |
|--------|---------|-----------|--------|
| `shots.scene_id` | 外键（001 `ON DELETE SET NULL`） | ✓ 自动置 NULL，无悬空 | — |
| `story_paragraphs.scene_id` | 外键（001 `ON DELETE SET NULL`） | ✓ 自动置 NULL | — |
| **`script_characters.wardrobe[].scene_id`**（JSON） | **非外键** | **悬空字符串**。`buildWardrobeBlock`（promptBuilder.ts:126-127）场景匹配失败 → 回退 `is_default` 或第一套——**不崩但服装可能用错**（场景装被默认装替代） | **P2** |
| 前端 ShotCard 场景下拉 | — | `editingSceneId` 指向已删场景时 Select 无对应项（ShotCard.tsx:576-581），显示空白，需手动重选 | P2 |

**复现步骤**：美术页删除"办公室" → 该场景所有镜头 `scene_id=NULL`（场景徽章消失）→ 删除后再次生成首帧，凡 wardrobe 指定"办公室场景装"的角色改穿默认装。

**修复建议**：删除场景路由（assets.ts:707-712）内先扫描该集 `script_characters.wardrobe`，把匹配 `scene_id` 的项置 `null`（通用服装）；或在 `buildWardrobeJson` 阶段不落 scene_id 到已不存在场景（已有 scene_name→id 映射校验，补充删除场景后的回写清理即可）。

---

### 5.3 删除分镜后（复现：删除第 5 镜 → 检查段/音频/字幕）

**DAO 行为**：`ShotDAO.delete`（shot.ts:189-191）仅执行 `DELETE FROM shots WHERE id=?`。

| 引用方 | 引用方式 | 删除后行为 | 严重度 |
|--------|---------|-----------|--------|
| `shot_keyframes` | 外键（001 `ON DELETE CASCADE`） | ✓ 级联删除 | — |
| `shot_video_intervals` | 外键（001 `ON DELETE CASCADE`） | ✓ 级联删除 | — |
| **`shot_audio`** | **无外键**（023 迁移） | **孤儿行残留**。且前端删除确认文案（ShotCard.tsx:302）"会同时删除该镜的首帧、视频与音频" **与后端实际不符** | **P1** |
| **`segments.start_shot_id / end_shot_id`** | **无外键**（035 迁移） | **悬空引用**；`start_shot_number/end_shot_number` 过期不准确。段视图仍显示旧镜头号范围；`getShotsForSegment` 按 `segment_id` 匹配（该镜已删 → 段内镜头减少甚至为空） | **P1** |
| `subtitles.shot_id` | 外键（007 `ON DELETE SET NULL`） | 字幕保留但关联丢失（对白仍显示在导出） | P3 |
| `render_logs.shot_id` | 外键（001 `ON DELETE SET NULL`） | 日志保留，关联丢失 | P3 |
| `story_foreshadow.introduced_shot_id` | 非外键（028） | 悬空引用（伏笔指向已删镜头），量级小 | P3 |

**复现步骤**：导演台删除第 5 镜 → 前端 confirm 提示连带删音频，但 `shot_audio` 行仍在 → 分段视图该段 `start_shot_number-end_shot_number` 仍含 5 → 该段重新聚合前 `getShotsForSegment` 空/少镜，段状态可能误判。

**修复建议**：
1. `ShotDAO.delete` 改为事务：`DELETE FROM shot_audio WHERE shot_id=?` + `DELETE FROM shots WHERE id=?`（或 023 补外键 CASCADE）。
2. 删除分镜后同步刷新所在 segments：重算 `start/end_shot_id` 与 `start/end_shot_number`（可复用 `SegmentDAO.autoAggregate` 幂等重建该集），或直接置 NULL 并在下次聚合时修正。
3. 对齐 UI 文案或后端行为，二选一。

---

### 5.4 删除项目后

`ProjectDAO.deleteCascade`（project.ts:84-110，P2-2 已补全）**逐表比对结论：覆盖完整，无遗漏**。

| 类别 | 表 | 处理 |
|------|----|------|
| 已删除 | character_variations / character_outfits / shot_keyframes / shot_video_intervals / shot_audio / render_logs / generation_tasks / story_paragraphs / subtitles / shots / script_characters / script_scenes / script_props / segments / script_analysis / visual_memory / novel_episodes / novel_chapters / auto_pipeline_tasks / project_bible / story_foreshadow / character_relationship | ✓ 全部显式 DELETE |
| 用户级共享（正确保留） | users / user_preferences / visual_styles / style_presets / cost_records / model_registry / ai_cache | ✓ 不删除 |
| 特殊 | `asset_library.source_project_id` | 外键 `ON DELETE SET NULL`（001），共享资产保留、来源解绑 ✓ |
| **遗漏** | 无 | — |

**问题**：

| # | 位置 | 问题 | 严重度 |
|---|------|------|--------|
| D1 | `project.ts:84-110` | **28 条 DELETE 未包事务**，中途失败（FK 冲突/锁/IO）会残留半删数据（例如 shots 已删、segments 未删） | **P1** |
| D2 | 同上 | `episodeIdsSub`/`shotIdsSub` 子查询在每条 DELETE 中重复执行，数据量大时略低效（可一次查出后拼 IN） | P3 |

**修复建议**：D1——用 `db.transaction(() => { … })` 包裹全部 DELETE（项目删除是低频操作，事务开销可忽略）。

---

### 5.5 wardrobe.scene_id 引用完整性

见 5.2 展开：

- `wardrobe` 存于 `script_characters.wardrobe` JSON（034 迁移新增列，非外键）。
- **无清理机制**：`ScriptSceneDAO.delete` / 场景删除路由均不扫描 wardrobe。
- `buildWardrobeBlock`（promptBuilder.ts:121-131）回退链：`scene_id` 精确匹配 → `is_default=1` → 第一套 → 空。场景删除后：
  - 不崩，但**服装选择静默降级**（场景装 → 默认装/第一套），可能造成关键帧/视频中角色服装与场景不匹配（一致性退化，不报错难发现）。
- **复现**：删除"办公室"场景 → 角色"小明" wardrobe 中 `{scene_id:"办公室"}` 项永远无法命中 → 该角色在"办公室"镜头中穿默认装。

**修复建议**（与 5.2 合并）：删除场景时扫描该集角色 wardrobe，`scene_id` 命中则置 `null`（升级为通用服装，仍可被 is_default 逻辑正确选择）。

---

### 5.6 blocking.character_id 引用完整性

见 5.1 展开：

- `blocking` 存于 `shots.blocking` JSON（034 新增列，非外键）。
- `buildBlockingBlock`（promptBuilder.ts:206-219）回退链：`characters.find(c => c.id === b.character_id)` → `characters.find(c => c.name === b.character_id)` → **`b.character_id` 原样输出**。
- 角色删除后：
  - **服务端**：提示词中出现原始 UUID（`【调度】char_xxx位于…`），**影响生成质量且无报错**——P1。
  - **前端**：`characterNameOf`（ShotCard.tsx:104-107）返回原始 ID 显示在调度徽章/编辑器（ShotCard.tsx:591-622）；保存时原样写回，不丢数据但持续污染。
  - `resolveBlockingCharacterIds`（promptBuilder.ts:475-493）生成时已按 name→id 映射并丢弃未匹配项 ✓（新数据安全，问题仅出现在删除角色后）。
- **复现**：删除"小明" → 含小明 blocking 的镜头 → 重新生成首帧，提示词含 UUID → 出图可能忽略该调度或产生怪名。

**修复建议**：
1. `buildBlockingBlock` 兜底改为：名称未匹配时输出 `characters[0]?.name` 或跳过该条（`b.character_id` 形如 `char_/uuid` 即为失效引用）。
2. 删除角色服务层（5.1）同步从 `shots.blocking` 移除对应条目。
3. 前端编辑器对悬空 `character_id` 显示"已删除角色"而非 UUID，并提供一键清理。

---

### 5.7 数据库迁移兼容性

| # | 检查项 | 结论 | 严重度 |
|---|--------|------|--------|
| M1 | 034 新列默认值 | 全部 `ALTER TABLE … ADD COLUMN` TEXT，**默认 NULL**，旧行安全 ✓ | — |
| M2 | 旧角色无 identity_lock/wardrobe | `buildIdentityLockBlock`（promptBuilder.ts:93-108）回退 visual_prompt → visual_description → description ✓；`buildWardrobeBlock` 空数据返回空串 ✓ | — |
| M3 | 旧分镜无 blocking | `buildBlockingBlock` 回退 `parseBlockingFromAction`（181-195）从动作描述提取角色名+位置关键词 ✓ | — |
| M4 | 旧项目无 segments | GET /segments 返回空数组 → 前端引导"重新聚合"（`aggregateSegments` 幂等重建）✓；`composeEpisodeFromSegments` 无段时自动聚合（segmentService.ts:303-306）✓ | — |
| M5 | `runMigrations`（sqliteDatabase.ts:86-110） | 逐语句拆分执行 + **duplicate column 幂等跳过**（100-103，`isDuplicateColumnError`+`isColumnExists` 校验）+ 整文件事务（92）——重复列/重复执行安全；`CREATE TABLE/INDEX IF NOT EXISTS` 天然幂等 ✓ | — |
| M6 | `PRAGMA foreign_keys = ON`（sqliteDatabase.ts:24） | 已启用，5.1-5.3 中的 FK 级联/SET NULL 全部生效 ✓ | — |

**结论**：迁移兼容性整体正确，无 P0/P1 问题。唯一注意事项：035 之后新增列/表若包含 `ADD COLUMN`，`runMigrations` 的幂等跳过仅匹配 `ALTER TABLE … ADD COLUMN` 语句（128-129 正则），其他 DDL 形态需保持 `IF NOT EXISTS` 写法。

---

## 优先级汇总

| 级别 | 编号 | 一句话 |
|------|------|--------|
| **P0** | 无 | 本轮未发现 P0 级（数据丢失/服务不可用）问题 |
| **P1** | A2 / A5 / A7 | AI 批量链路全串行 + 关键帧 20s 强制间隔 + VIDEO_CONCURRENCY 被锁死为 1 |
| **P1** | B1 / B4 / B5 | 导演台全量加载 + 每卡片 4 个请求（400 请求风暴） |
| **P1** | N2 / N3 / N5 / N6 | 段/就绪度/批量视频的 O(N²) 查询模式 |
| **P1** | D1 | deleteCascade 无事务，中途失败残留半删数据 |
| **P1** | 5.1 / 5.6 | 删除角色 → blocking UUID 进提示词 + character_outfits 孤儿 |
| **P1** | 5.3 | 删除分镜 → shot_audio 孤儿 + segments 悬空引用（与 UI 文案不符） |
| **P2** | N1 / N7 / N8 / B3 / B6 / B7 / B8 / R1 / R2 / R3 / L1 / L3 / I1 / 5.2 / 5.5 | 各类 N+1、无懒加载、缺复合索引、wardrobe 悬空、无 memo 等 |
| **P3** | B2 / I2 / R5 / D2 / M 系列 / 5.3 字幕/日志 | 低风险或信息项 |

---

## 建议实施顺序（按性价比）

1. **P1-数据一致性先修**（低风险高收益）：删除角色/场景/分镜的孤儿清理（5.1/5.2/5.3/5.5/5.6）+ `deleteCascade` 事务化（D1）——均为服务层小改动。
2. **P1-查询模式**：`getShotsForSegment` 新增 `listBySegment` DAO + `shots(episode_id, segment_id)` 索引（N2/N3）；`calculateAllShotsReadiness` 批量取数（N5）；videos/count 聚合 SQL（N1）。
3. **P1-前端请求风暴**：store 层角色/场景加载去重 + 导演台合并接口（B4/B5）→ 请求数从 ~400 降到 ~10。
4. **P1-AI 并行化**：characters 概念图并发窗口（A2）、关键帧间隔降为 5s+并发窗口（A5）、修复 VIDEO_CONCURRENCY（A7）。
5. **P2 收尾**：懒加载、虚拟滚动、React.memo、缩略图、复合索引。
