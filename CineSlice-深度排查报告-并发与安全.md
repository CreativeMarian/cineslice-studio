# CineSlice Studio 第二轮深度排查报告 — 并发竞态 + 安全漏洞

- 排查时间：2026-10-04
- 排查范围：`server/src/routes/*`（13 个路由文件）、`server/src/models/*`、`server/src/services/*`（keyframeGenerator / videoGenerator / segmentService / autoPipeline / videoTaskPoller / importService / projectStorage / aiProxy / shotConsistencyService / videoComposer）、`src/components/StageDirector/*`、`src/components/StageScript/*`、`src/services/apiClient.ts`、`src/stores/useProjectStore.ts`、数据库迁移 schema
- 排查方法：以攻击者视角逐一阅读每个路由、每个 DAO 的读写路径、每个跨 await 的检查-设置窗口；前端追踪按钮 disabled 语义与请求生命周期。

---

## 严重度统计摘要

| 严重度 | 数量 | 代表问题 |
|---|---|---|
| P0（安全/阻塞） | 5 | local 模式全开放组合风险；章节 mass-assignment；章节 merge 跨用户删除；props 无归属写入；projectMemory/visualMemory 全量 IDOR |
| P1（功能/数据） | 11 | 双击生成首帧/视频重复任务；autoPipeline 覆盖用户手动分镜；分段聚合后新分镜被静默遗漏；loadShots 陈旧覆盖；completed 段可重复生成；角色参考图 URL 404；API Key 明文存储；静态资源无鉴权等 |
| P2（体验） | 8 | 无乐观锁丢更新；endFrameId 跨用户引用；HTML 导出自 XSS；segments 悬空引用等 |
| P3（代码质量） | 5 | sanitizeFileName 允许纯 `..`；FDX 引号未转义；getLatestCompose 无归属；轮询下载落错目录等 |

> 说明：本报告的所有行号均基于排查当日代码状态。`P2-3 / P0-1 / P0-2 / P1-6` 等修复点均已逐一核实，核实结果写入对应条目。

---

## 全局重大发现（须优先处理，组合放大所有单点问题）

### G-1 【P0】local 模式 = 完全无鉴权，且服务监听所有网卡 + CORS 全开放 + 静态资源绕过鉴权

- **文件：行号**
  - `server/src/middleware/auth.ts`：`runMode === 'local'` 时所有请求一律以 `local_user` 身份放行（无任何凭据校验）
  - `server/src/routes/auth.ts:46,76`：local 模式注册/登录直接被拒（等于确认无鉴权）
  - `server/src/index.ts`：`app.listen(actualPort)` 未绑定 host（默认 0.0.0.0），启动日志主动打印"局域网访问: http://{localIP}:{port}"
  - `server/src/index.ts:90`：`app.use(cors())` —— 允许任意 Origin 跨域读取响应
  - `server/src/index.ts:126-127`：`/data`、`/uploads` 静态托管在鉴权中间件（135-141 行）**之前**，仅挡 `*.db / *.sqlite / *.wal / *.shm` 扩展名
- **问题**：三项叠加后，**局域网内任意设备、或用户浏览器中任意恶意网页**（通过 `fetch('http://127.0.0.1:<port>/api/...')`，CORS 全放行）都可以：
  1. 列目录读取全部项目/小说/剧本/分镜（`GET /api/projects`、`GET /api/projects/:id/episodes` 等全部 IDOR 路由，见 3.2）；
  2. 任意写/删（POST / PUT / DELETE 全部可用）；
  3. 直接访问 `/data/<projectId>/...`、`/uploads/...` 拉取未鉴权的剧本、概念图、成品视频。
- **复现**：同一 WiFi 下，手机浏览器访问 `http://<PC-IP>:<port>/api/projects` → 返回全部项目数据；再 `DELETE /api/projects/<id>/permanent` → 项目被物理删除。
- **修复建议**：
  1. local 模式默认绑定 `127.0.0.1`（仅显式传 `--host 0.0.0.0` 才放开，并打印风险提示）；
  2. CORS 改为白名单（local 模式只允许 `http://localhost:*` 与 Electron 自定义 scheme），或为 local 模式下发一次性随机 token 放入请求头；
  3. `/data`、`/uploads` 静态资源移到鉴权中间件之后（前端图片可改用带签名/随机不可猜路径的方式），或至少对非图片扩展名（json/md/txt）做鉴权。

---

# 维度二：并发与竞态条件深度分析

## 2.1 同时点击多个"生成首帧"按钮

### 结论：后端无任何防护，双击可产生重复首帧（P1）；"重新生成首帧"还会出现新帧不生效的显示问题（P1）

- **证据**
  - `server/src/services/keyframeGenerator.ts:34` `generateKeyframesForShot`：开头仅做 `ShotDAO.getByIdAndUser` 与 keyframe 收集，**没有**"该镜头是否已有生成中/已有同类型关键帧"的检查，直接 `ShotKeyframeDAO.create` 插入新帧。
  - 数据库层**没有**唯一约束兜底：迁移文件 `shot_keyframes` 表注释明确写着"文档提到 UNIQUE(shot_id, frame_type)，但 middle 帧可有多张，故使用普通索引而非唯一约束，由应用层控制 first/last 唯一性"——而应用层（单镜头路径）恰恰没有控制。
  - 前端 `src/components/StageDirector/ShotCard.tsx:656` `disabled={isGeneratingKeyframe}`（状态定义在 :75）：仅靠 React 状态在渲染提交后才生效，快速双击（dblclick）第二个 click 可能落在 re-render 提交之前；且即使按钮禁用，**后端路由本身不检查**，绕过前端直接 POST 也会建双任务。
- **复现**：对任一无关键帧的镜头快速双击"生成首帧"→ `shot_keyframes` 出现两条 `frame_type='first'` 记录。
- **附加问题（同场景）**：单镜头"重新生成首帧"路径（`generateKeyframesForShot` 的 frameTypes=['first']）**只新建、不删除旧帧**；`ShotKeyframeDAO.listByShot` 按 `created_at ASC` 排序（`shotKeyframe.ts:29`），前端 `ShotCard.tsx:152` `keyframes.find(k => k.frame_type === 'first')` 取到的是**最旧**的 first 帧 → 重新生成后缩略图仍显示旧帧，新帧不生效。`batchGenerateKeyframes`（keyframeGenerator.ts ~L240-300）虽有"新帧成功后删旧帧"逻辑，但两次批量并发时会互相把对方刚生成的新帧当作"旧帧"删除，最坏情况首帧归零。
- **修复建议**：
  1. 后端加幂等/去重：生成前在**同一事务**内 `SELECT COUNT(*) WHERE shot_id=? AND frame_type='first' AND image_url IS NOT NULL`，已有则先标记旧帧 `superseded` 再插入（或直接拒绝并返回已有帧）；
  2. 数据库为 `(shot_id, frame_type)` 加唯一约束，middle 帧改用 `frame_type='middle_<n>'` 或多帧表；
  3. 前端双击防抖 + `disabled` 语义保留，并在提交后再次置位；
  4. 重新生成时显式删除/降级旧 first 帧，保证 `find('first')` 即新帧。

## 2.2 同时点击"生成视频"和"删除分镜"

### 结论：DB 级联删除是健全的，但存在"重复任务"与"外部任务悬空烧配额"两个问题（P1）；极端时序下有文件落错目录（P3）

- **证据**
  - `server/src/services/videoGenerator.ts:189` `generateVideoForShot`：`ShotDAO.getByIdAndUser` → 解析首尾帧 → `:280` 直接 `ShotVideoIntervalDAO.create` 插入 `status='processing'` 记录——**没有**检查该镜头是否已有处理中视频。单镜头路由 `POST /shots/:id/video/generate`（episodes.ts:343）直接调用它。双击/重复提交 → 同一镜头多条 processing 记录、多次调用外部模型、多次扣费。
  - 前端 `ShotCard.tsx:154` `processingVideo = videos.find(status in processing/pending/generating)`，`:669` 生成视频按钮 `disabled={!firstKeyframe || !!processingVideo || isGeneratingVideo}`——该判断依赖**已加载的 videos 列表**；镜头列表刚挂载、`useEffect` 尚未拉回视频列表时按钮可用，此时点击会绕过本可生效的禁用（后端同样不拦）。
  - 删除分镜：`ShotDAO.delete`（shot.ts:189）只删一行，`shot_keyframes` 与 `shot_video_intervals` 均有 `FOREIGN KEY ... ON DELETE CASCADE`（迁移已确认）→ **DB 无悬空记录** ✓。
  - 但外部任务无法取消：`videoTaskPoller.ts:25` `listPendingExternal(db, 10)` 只轮询**现存**记录；分镜删除后记录随级联消失，供应商侧已提交的视频任务继续运行到完成——费用照烧、结果无人下载（"悬空 external_task_id"的实质是：ID 随行删除，但外部任务仍在计费执行）。
  - 极端时序：轮询器已取出任务 → 用户删除分镜 → `getVideoStatus`（videoGenerator.ts:333-369）中 `ShotDAO.getById(video.shot_id)` 返回 null → `episode` null → `projectId=''` → 视频被下载到 `<dataDir>/videos` 根目录（projectStorage.getDataDir('') 解析到 dataDir 根），`ShotVideoIntervalDAO.update` 静默影响 0 行。文件污染 + 无报错。
- **复现**：① 双击"生成视频"→ 两条 processing 记录、两次扣费；② 生成中删除分镜 → 供应商侧任务仍跑完并计费。
- **修复建议**：
  1. `generateVideoForShot` 增加"已有 processing/pending 记录则 409 或复用"的后端检查（事务内）；
  2. 删除分镜前检查是否存在处理中视频，存在则提示或先调供应商取消接口（ComfyUI 等支持 cancel 的协议）；
  3. 下载前二次校验 shot/项目仍存在，不存在则跳过落盘；
  4. 前端删除按钮在 `processingVideo` 存在时禁用并提示。

## 2.3 autoPipeline 运行中用户手动修改分镜

### 结论：无项目级锁，shots 阶段"全删重建"会抹掉用户手动修改（P1 数据丢失）

- **证据**
  - `server/src/services/autoPipeline/stages/shots.ts`：
    - 走 AI 生成分支（约 L155-231）与"加料重构"分支（约 L51-88）时，都在 `db.transaction` 内 `listByEpisode` → 逐个 `ShotDAO.delete` → `create`——**删除全部旧镜头并重建**。只要该阶段被触发（首次生成、恢复、重跑），用户手动新增/编辑过的分镜全部被 AI 输出覆盖，无任何"手动修改保护"。
    - 唯一防线是"shots 已存在则跳过"（约 L38-42），一旦用户删了任意一个镜头导致 `shots.length < expected` 或手动触发重跑，防线即失效。
  - 无项目级写锁：`autoPipeline/state.ts`、`taskStore.ts` 只维护**任务状态**（Map + 库表 `auto_pipeline_tasks`），没有任何"该项目的其他写操作（手动改分镜/删分镜/批量生成）与流水线互斥"的机制。`AutoPipelineService.start` 只防"两个 autoPipeline 同时跑"，不防"autoPipeline 与手动操作并发"。
  - 生成关键帧阶段（stages/keyframes.ts）与视频阶段（stages/video.ts）中途用户删除镜头：DAO 写入触发 FK 违约，被阶段内 try/catch 吞掉并跳过该镜头——不崩溃，但该镜头漏帧/漏视频且无提示。
  - 视频阶段（stages/video.ts）只跳过 `completed` 镜头，**不跳过 `processing`**——若用户手动已提交了生成中的视频，流水线会再提交一条，重复扣费。
- **复现**：① 半自动模式生成分镜后，手动修改某镜头台词 → 触发 autoPipeline resume 从 shots 重跑 → 修改丢失；② 流水线跑关键帧阶段时删除某镜头 → 该镜头被静默跳过。
- **修复建议**：
  1. 为项目加"流水线运行中写锁"：内存 `Map<projectId, {lockedAt}>` + 中间件在 PUT/DELETE shots、批量生成、聚合等写路由检查并返回 409；或 DB 状态位 + 原子抢占；
  2. shots 阶段改为**增量补缺**（只生成缺失镜头），删除重建仅在 `forceRefresh` 显式开启时执行，且执行前快照对比用户手动修改（`updated_at` 晚于 AI 生成时间的镜头跳过/告警）；
  3. 视频/关键帧阶段跳过 `processing` 中的镜头；
  4. 取消语义细化到镜头粒度（当前 cancel 标志在阶段边界生效，阶段内已提交任务无法回收，与 2.2 相同的外部悬空问题）。

## 2.4 分段聚合进行中用户添加新分镜

### 结论：聚合后新增的分镜（segment_id=NULL）会被 compose 静默遗漏，成片缺镜头且无任何提示（P1）

- **证据**
  - `server/src/models/segment.ts` `autoAggregate`：同步事务内完成全部段重建（含把每个分镜的 `segment_id` 写成 `segment_number`）。
  - 聚合**之后**用户新增/重新生成的分镜：`shot.segment_id = NULL`。
  - `server/src/services/segmentService.ts:100` `getShotsForSegment` 按 `s.segment_id === segment.segment_number` 过滤 → NULL 分镜不属于任何段；`:314` `composeEpisodeFromSegments` 遍历段、对每段取镜头，`missingShots` 只统计"有 segment_id 但段不存在"的镜头 → **NULL segment_id 的分镜既不在任何段里、也不在 missingShots 里，静默消失**。
- **复现**：分段聚合 → 新增一个分镜 → 直接"按段合成"→ 成片不含新分镜，无警告。
- **附带设计缺陷（P1）**：`segment.ts` 中 `shots.segment_id` 存的是**整数 segment_number**，而 `segments.id` 是 `'seg_xxx'` 文本——两列类型不一致，任何"按 id 关联 shots↔segments"的 SQL 都会失配；当前全靠 `segment_number` 同名过滤才能工作，脆弱且易被重聚合打乱（重聚合会重写所有 segment_id，若某次聚合失败中途退出，分镜与段的关联即损坏）。
- **修复建议**：
  1. compose 前检测 `segment_id IS NULL` 的分镜并提示"有 N 个分镜未纳入分段，请重新聚合"；或检测到新增分镜自动把对应段标记 `dirty`；
  2. 将 `shots.segment_id` 改为存 `segments.id`（并加 FK），消除类型失配；
  3. 重聚合使用事务 + 失败回滚，避免半截重写。

## 2.5 前端快速切换页面时未完成的 API 请求

### 结论：无请求取消机制；存在真实的"旧请求覆盖新数据"竞态（P1 展示错误 + P3 资源浪费）

- **证据**
  - `src/services/apiClient.ts:91-99`：每个请求**自建** `AbortController`，仅用于超时（`DEFAULT_TIMEOUT=600000`）；`request()` 签名**不接受外部 AbortSignal** → 组件卸载/页面切换无法取消在途请求。
  - `src/stores/useProjectStore.ts:160-167` `loadShots`：**没有剧集 id 守卫**（对比 `loadProjectData` 有 `_loadProjectSeq` 序号守卫）。快速在剧集 A/B 间切换：A 的慢响应后到 → 把 A 的镜头列表写进 store，而 `currentEpisodeId` 已是 B → 界面显示 B 的剧集 + A 的镜头列表。
  - `StageDirectorPage.tsx` 只有 `cancelled` flag 保护 loading 状态（`loadShots(...).finally` 前判断），**不保护数据写入**；分段轮询 interval 有 cleanup（清 interval 本身），但轮询回调 `setSegmentList` 本身无守卫。
  - React 18 对"已卸载组件 setState"不再告警 → 无崩溃，但**陈旧数据覆盖**是真实正确性问题，且每次切换都白跑一遍大请求。
- **复现**：剧集 A（大剧本）加载中立即切到剧集 B → B 列表短暂显示后又跳回 A 的内容。
- **修复建议**：
  1. `apiClient.request` 支持透传外部 `signal`（config 增加 `signal` 字段并与内部 controller 合并/组合）；
  2. store 内 `loadShots(episodeId)` 记录 `episodeId + seq`，回调时校验仍是当前剧集才写入（与 `loadProjectData` 同一模式）；
  3. 页面卸载时 `abort()` 所有在途请求。

## 2.6 数据库写入竞态：两个请求同时更新同一个 shot

### 结论：存在 last-write-wins 丢失更新；前端无乐观锁（P2，本地单窗口概率低、双开/多窗口真实）

- **证据**
  - `server/src/models/shot.ts:180-187` `update`：`Object.keys(data)` 动态 SET，整行覆盖语义；SQLite（better-sqlite3）为同步单写者，**单条 UPDATE 原子**，但"读-改-写"跨请求（前端先 GET 拉表单 → 用户编辑 → PUT）没有任何隔离 → 两个窗口各编辑不同字段，后提交者把先提交者的字段覆盖回旧值。
  - `updateShotSchema`（episodes.ts:286-308）无 `version`/`updated_at` 字段；前端提交的是整份表单字段；全链路无乐观锁。
- **复现**：两个浏览器窗口打开同一镜头 → 窗口 A 改台词、窗口 B 改时长 → A 保存后再 B 保存 → A 的台词被 B 提交时的旧台词覆盖。
- **修复建议**：
  1. `shots` 表加 `updated_at`（或 `version`），PUT 时前端回传，DAO 用 `UPDATE ... SET ... WHERE id=? AND version=?`，`changes===0` 返回 409 让用户刷新；
  2. 前端在编辑开始时记录基线版本，保存时校验。

## 2.7 generateSegmentVideo 并发（check-then-act 分析）

### 结论：P1-6 的 status==='generating' 检查在**当前单进程内是安全的**（检查与设置之间无 await，同步窗口）；但存在"completed 段可重复生成"与"多入口并发无兜底"两个真实问题（P1）

- **证据（关键论证）**
  - `server/src/services/segmentService.ts:186-200` `generateSegmentVideo`：`SegmentDAO.getById`（L186）→ `status==='generating'` 检查（L190）→ `getShotsForSegment`（L195，同步）→ `SegmentDAO.update(status='generating')`（L199-200）。**全程无 `await`**，better-sqlite3 为同步 API，Node 单线程事件循环内这串调用不可打断 → 请求 A 完成"检查+置位"后请求 B 才进入，B 读到 `generating` 抛 409。因此**同进程双击/并发提交不会双跑**，P1-6 修复有效 ✓（不需要 `UPDATE ... WHERE status='pending'` 也能防住当前部署形态）。
  - 但存在两个绕过：
    1. `L190` 只拦 `generating`，**`completed` 段不拦** → 对已完成段再点"生成视频"→ 逐镜头调 `generateVideoForShot`（该函数无去重，见 2.2）→ 每镜头堆积多条 completed 视频，成片拼接时会取哪条不可预期；
    2. **多入口并发无兜底**：同一镜头既在"分段生成"又在"单镜头生成/批量生成"中被提交时，两条路径都无互斥（`generateVideoForShot` 无检查）→ 重复任务。
  - `retrySegment`（L255-285）：先删 failed 记录再调 `generateSegmentVideo`；若并发下状态已被置为 `generating`，由 409 正确兜底 ✓。
- **修复建议**：
  1. 保留现有同步窗口检查；**再加一层防御**：用 `UPDATE segments SET status='generating' WHERE id=? AND status NOT IN ('generating')` 的原子条件更新 + `changes` 判断（对未来多进程/集群化部署同样正确）；
  2. `generateSegmentVideo` 对 `completed` 段返回"已有完成视频"或先重置状态再走生成；
  3. 单镜头/批量/分段三条生成路径统一收敛到带幂等检查的入口（与 2.2 修复同源）。

---

# 维度三：安全漏洞深度扫描

## 3.1 所有 PUT/POST/PATCH 路由的 zod schema 校验

### 已核实为安全的范围（证据）
- **无 `.passthrough()`**：全局搜索 `passthrough` 无命中（除 `validateBody` 实现内部）。P0-1 修复确认：`updateShotSchema`（episodes.ts:286-308）显式声明全部可写字段（含 blocking、first/last_frame_description 等新字段）；`updatePropSchema`（assets.ts:818-826）同模式。
- **已有完整 schema 且字段白名单化**：projects create/update/from-input/batch-delete、episodes update/regenerate/polish/generate-shots/keyframes/batch/videos/batch/enrich/segment-video、assets character/scene 更新、outfits create/update、models、preferences、visualStyles、auth register/login/profile/password、ai、tasks、costs、audio tts/compose/merge、pipeline mode/stage-fail、dataTransfer import。

### 发现的问题（按严重度）

| # | 文件:行号 | 问题 | 严重度 |
|---|---|---|---|
| 3.1-1 | `projects.ts:334` `PUT /:id/chapters/:cid` | **无 validateBody**，`NovelChapterDAO.update(db, cid, req.body)` 透传原始 body。该 DAO 是动态 SET（novelChapter.ts:50-59），`Object.keys(data)` 直接成为列名 → **mass-assignment**：可写 `user_id`（转移章节归属）、`project_id`（把章节挪进他人项目）、`chapter_number`、`word_count` 等任意列。归属校验只查了"项目属于我"，章节属于该项目也校验了（L339），但**可写字段未白名单**。 | P0 |
| 3.1-2 | `assets.ts:811` `POST /episodes/:id/props` | **无 validateBody、无剧集归属校验**：`{ user_id: req.user.id, episode_id: req.params.id, ...req.body }` 直接把 body 展开进 create——可向**任意人的剧集**注入道具（IDOR 写），且字段未白名单。 | P0 |
| 3.1-3 | `projectMemory.ts:55` `PUT /:projectId/memory/bible/:bibleId` | 无 schema（body 仅解构 `content/generated_by`，弱风险），但**无归属校验**（见 3.2）。 | P1 |
| 3.1-4 | `projects.ts:345` `POST /:id/chapters/merge` | 无 schema；`chapterIds` 仅做 `Array.isArray` 检查，元素未校验为 string。 | P2 |
| 3.1-5 | `episodes.ts:529` `enrich/reject` | `req.body?.feedback` 未校验类型/长度。 | P3 |

- **底层放大器**：`server/src/models/` 下 23 个 DAO 的 `update` 均为 `SET ${f} = ?` 动态列名模式（shot.ts:180、novelChapter.ts:50、modelRegistry、scriptCharacter、scriptScene、scriptProp、segment、shotKeyframe、shotVideoInterval、visualMemory、characterOutfit、novelEpisode、project、userPreference、user、visualStyle、generationTask、projectBible、storyForeshadow、characterRelationship 等）。这不是 SQL 注入（better-sqlite3 `prepare` 对非法列名直接抛错，单语句限制也无法注入），但**任何透传 req.body 的路由都会被放大为任意列写**——根因修复应在路由层全部白名单化。
- **修复建议**：3.1-1/3.1-2 补 zod schema（白名单字段）＋归属校验；3.1-4/3.1-5 补 schema；长期对 DAO update 增加"列名白名单断言"（`assertAllowedColumns(fields, table)`），从根上消除 mass-assignment。

## 3.2 所有 GET 路由的 IDOR（越权读取）

### 已核实为安全的范围（证据）
- 使用 `getByIdAndUser` 的 GET：`GET /projects/:id`（projects.ts:208）、`GET /shots/:id`（episodes.ts:182）、`GET /characters/:id`（assets.ts:202）、`GET /scenes/:id`（assets.ts:613）、`GET /videos/:id/status`（episodes.ts:384，内部再查 `user_id`）、`GET /episodes/:id/segments`（episodes.ts:558-565，**P2-3 修复确认：已加 `getByIdAndUser`**）、`GET /episodes/:id/subtitles`（episodes.ts:537，service 内校验）、consistency-report（episodes.ts:175，service 内传 userId）。
- `POST /episodes/:id/shots/generate`、keyframes/videos 各批量路由内部均走 `getByIdAndUser`（batchGenerateKeyframes 等）。

### 发现的问题（全部为"只校验了资源本身存在、未校验归属"）

| # | 文件:行号 | 路由 | 问题 | 严重度 |
|---|---|---|---|---|
| 3.2-1 | `projects.ts:327` | `GET /:id/chapters` | 任意用户可按项目 id 读取**任何项目**的章节全文（小说内容） | P1 |
| 3.2-2 | `projects.ts:560` | `GET /:id/episodes` | 任意用户可读任何项目的全部剧集（含剧本全文） | P1 |
| 3.2-3 | `episodes.ts:161` | `GET /episodes/:id/shots` | 任意用户可读任何剧集的全部分镜 | P1 |
| 3.2-4 | `episodes.ts:168` | `GET /episodes/:id/shots/readiness` | 同上，还泄露关键帧/视频完成度 | P1 |
| 3.2-5 | `episodes.ts:227` | `GET /shots/:id/keyframes` | 任意用户可读任何镜头的关键帧列表（含图片 URL） | P1 |
| 3.2-6 | `episodes.ts:391` | `GET /shots/:id/videos` | 任意用户可读任何镜头的视频记录 | P1 |
| 3.2-7 | `episodes.ts:544` | `GET /episodes/:id/videos/count` | 任意用户可读任何剧集的视频完成数 | P2 |
| 3.2-8 | `assets.ts:195` | `GET /episodes/:id/characters` | 任意用户可读任何剧集的角色设定（含 visual_prompt/wardrobe） | P1 |
| 3.2-9 | `assets.ts:606` | `GET /episodes/:id/scenes` | 同上，场景设定 | P1 |
| 3.2-10 | `assets.ts:805` | `GET /episodes/:id/props` | 同上，道具设定 | P1 |
| 3.2-11 | `projectMemory.ts:17,29,63,79,86` | `GET /:projectId/memory*` 全部 5 条 | **无任何归属校验**：任意用户可读任何项目的人设 bible/伏笔/关系网/记忆注入 | P0 |
| 3.2-12 | `visualMemory.ts:11,22` | `GET /:projectId/visual-memory*` | 同上，视觉记忆 | P1 |
| 3.2-13 | `videoComposer.ts:827` | `getLatestCompose`（经 `GET /episodes/:id/latest-compose`） | 无用户校验，可读他人 render_logs | P2 |
| 3.2-14 | `videoGenerator.ts:226` | `generateVideoForShot` 的 `endFrameId` 解析用 `ShotKeyframeDAO.getById`（无归属） | 传他人关键帧 id 可被当尾帧引用（图片被读取/进参考） | P2 |

- **修复建议**：以上 GET 统一改为"资源 → 向上归属链 → 当前用户"校验（复用 assets.ts 的 `requirePropOwnership`/`requireOutfitOwnership` 模式，抽成通用 `assertEpisodeOwnership(db, episodeId, userId)` 帮助函数）；shot/keyframe 级 GET 先 `getByIdAndUser` 校验再 listBy。

## 3.3 所有 DELETE 路由的越权删除

### 已核实为安全的范围（证据）
- 归属校验健全：`DELETE /projects/:id`（projects.ts:225）、`/projects/:id/permanent`（:243）、`/episodes/:id`（episodes.ts:122，getByIdAndUser + deleteCascade）、`/shots/:id`（:190）、批量删 shots（:199，校验剧集归属）、`/keyframes/:id`（:318）、`/videos/:id`（:398，校验 user_id + 删本地文件）、`/characters/:id`、`/scenes/:id`、`/props/:id`（assets.ts，全部 getByIdAndUser / requirePropOwnership）、`/outfits/:id`（requireOutfitOwnership）、`/visual-memory/:id`（visualMemory.ts:60，**无校验，见 3.2-12 同源问题**）。
- 级联删除：`shot_keyframes` / `shot_video_intervals` 对 shots 有 `ON DELETE CASCADE`（迁移确认）✓；`episode.deleteCascade`（novelEpisode.ts）手动覆盖了 segments / shot_audio / character_outfits 等无 FK 表 ✓；`project.deleteCascade`（project.ts）覆盖 segments、script_analysis、visual_memory、project_bible、story_foreshadow、character_relationship、auto_pipeline_tasks 等 ✓（P2-2 修复确认）。

### 发现的问题

| # | 文件:行号 | 问题 | 严重度 |
|---|---|---|---|
| 3.3-1 | `projects.ts:345,353,364-366` `POST /:id/chapters/merge` | `getByIds(db, chapterIds)` **不校验章节属于当前项目/用户**，随后 `NovelChapterDAO.delete(db, chapters[i].id)` 删除 chapters[1..] ——传入他人项目的章节 id 即可**跨项目读取内容并物理删除他人章节**（IDOR 写+删），还把他人内容合并进自己章节。 | P0 |
| 3.3-2 | `visualMemory.ts:60` `DELETE /visual-memory/:id` | 无归属校验，可删任意用户的视觉记忆记录。 | P1 |
| 3.3-3 | `segments` 表无 FK | `segments.start_shot_id / end_shot_id` 指向 shots 无外键；删除分镜后段记录保留悬空引用，`composeEpisodeFromSegments` 对"指向已删镜头"的段行为未定义（`getShotsForSegment` 查不到该 shot，可能静默少一段）。 | P2 |
| 3.3-4 | `project.deleteCascade` 无事务包裹 | 多条 DELETE 语句未包在 `db.transaction` 内（project.ts），中途失败会留下半删状态（与 2.4 同源）。 | P3 |

- **修复建议**：3.3-1 在 merge 前校验 `chapters.every(c => c.project_id === req.params.id)`；3.3-2 补归属链校验；3.3-3 删除分镜时同步清理/置空段引用或给 segments 补 FK；3.3-4 包事务。

## 3.4 文件上传安全

### 已核实为安全的范围（证据）
- `server/src/middleware/upload.ts`：
  - **类型校验**：`imageUpload` 按扩展名 + mimetype 白名单（图片）；`novelUpload` 允许 txt/md/novel 及 text 类 mimetype；`zipUpload` 限 zip；`creativeUpload`（create.ts）同样校验。
  - **大小限制**：图片 10MB、小说 100MB、zip 100MB、TTS 下载 50MB（audio.ts:97）。
  - **路径穿越防护**：上传目录参数经 `isValidResourceId`（`/^[\w][\w-]{0,63}$/`，utils/filename.ts）校验后才用于 `path.resolve`；文件名经 `sanitizeFileName` 清洗（`/`、`\`、`:` 等替换为 `_`）。
  - **zip 解压无 zip-slip**：`importService.ts` 从不按 zip 条目路径落盘，只按 `path.basename(oldUrl)` 重命名写入（importAssetFile）——已逐行核实 ✓。
  - 上传目录 `uploads/` 不在代码执行路径内，无脚本执行风险（.php/.exe 会被类型白名单挡下）。

### 发现的问题

| # | 文件:行号 | 问题 | 严重度 |
|---|---|---|---|
| 3.4-1 | `assets.ts:350-359` `POST /characters/:id/upload-reference` | **存储目录与返回 URL 不一致**：multer destination 用 `req.params.id`（=角色 id，upload.ts:17），文件落在 `uploads/{characterId}/`；返回 URL 却拼 `character.episode_id`（L356）→ `/uploads/{episodeId}/<file>` 不存在 → 参考图 404，角色一致性参考链路断裂。 | P1 |
| 3.4-2 | `utils/filename.ts` `sanitizeFileName` | 允许保留 `.` 与 `-`，因此**纯 `..` / `.` 文件名不会被替换**。audio.ts:195/213/228/245 与 :343-354 用 `path.resolve(dir, sanitizeFileName(name))`——`name='..'` 时解析到父目录，`fs.existsSync` 通过后把目录当媒体文件喂给 ffmpeg（报错/拒绝服务）；`outputFileName='..'` 会把输出路径解析到错误目录。非任意文件写，但属校验缺陷。 | P3 |
| 3.4-3 | `index.ts:126-127` 静态托管 `/data`、`/uploads` 位于鉴权中间件之前 | server 模式下，凡拿到资源 URL（或能猜出 project id 路径）即可免鉴权拉取小说/剧本/图片/视频（见 G-1）。 | P1 |

- **修复建议**：3.4-1 统一用 `episode_id` 作上传目录（与 URL 一致）或返回真实的 `characterId` 目录；3.4-2 `sanitizeFileName` 显式拒绝 `.`/`..`（先 `basename` 再校验）；3.4-3 见 G-1。

## 3.5 AI API Key 安全

### 已核实为安全的范围（证据）
- **GET 响应剥离**：`models.ts:163,203,212,250,266,269,280` 所有返回模型配置的响应均 `const { api_key, ...safe } = m` 剥离 ✓（前端拿不到完整 Key）。
- **无日志泄露**：全库 grep `console.*api_key` / 日志中拼 key 的调用——无命中 ✓。
- **传递方式**：`aiProxy.ts` 各 adapter 以 `Authorization: Bearer <key>` / `x-api-key` 头传递，未打进日志或错误消息；供应商错误响应回传的 `err.message` 中若含请求体，也因 key 在 header 而不会泄露 ✓。

### 发现的问题

| # | 文件:行号 | 问题 | 严重度 |
|---|---|---|---|
| 3.5-1 | `modelRegistry.ts`（upsert/create）+ 迁移 `model_registry` 表 | **api_key 明文落库**（TEXT 列，无加密）。本地单机可接受，但结合 G-1（local 无鉴权 + LAN 可达 + 静态 `/data` 仅挡 db 扩展名）——`*.db` 被静态托管挡住，但**同一 LAN 下任何进程/服务可直连 SQLite 文件或通过 API 读库**（API 不返回 key，但 DB 文件本身无防护）。server 模式多租户下这是直接泄密面。 | P1 |
| 3.5-2 | `modelRegistry.ts` update 动态 SET | 与 3.1 同源的 mass-assignment 放大器（models.ts POST/PUT 有 schema 兜底，风险可控）。 | P3 |

- **修复建议**：api_key 用环境变量主密钥 AES-256-GCM 加密后落库（解密仅在 aiProxy 调用时于内存进行）；数据库文件加权限限制；local 模式至少绑定 127.0.0.1（见 G-1）。

## 3.6 SQL 注入

### 结论：未发现直接 SQL 注入点（P0 排除），但有 mass-assignment 面（见 3.1）

- **证据**
  - 全部查询/更新均使用 better-sqlite3 参数占位符（`prepare('... ? ...').run/get/all`），包括动态 `IN (...)` 列表（`pipeline.ts:42-50` 的 `inList` + `...epArgs`、`novelChapter.ts:44-47` 的 `getByIds`）。
  - `db.exec(` 仅用于**静态迁移脚本**与 index.ts 里拼接固定列名/表名的 ALTER（无用户输入参与）。
  - 动态 `SET ${f}=?`（23 个 DAO）列名来自 `Object.keys(data)`——若路由透传 req.body（已发现 3.1-1/3.1-2），可写任意**合法列名**（mass-assignment），但因 better-sqlite3 `prepare` 对非法标识符直接抛错且单次 prepare 只允许一条语句，**无法构成注入**（无法注入 `; DROP` 等）。
  - `pipeline.ts:31-34` 的 `count` 辅助函数与 `render_logs.details LIKE '%"status":"completed"%'` 均为常量 SQL。
- **修复建议**：在 DAO update 增加列名白名单断言（防未来新路由透传 req.body 时演变成任意列写），并消灭 3.1-1/3.1-2 两个透传点。

## 3.7 XSS

### 已核实为安全的范围（证据）
- 前端全库 grep `dangerouslySetInnerHTML`：**0 命中**。
- 前端无 markdown 渲染库（无 marked / react-markdown / innerHTML 写入），剧本/角色描述/分镜动作全部经 React 默认转义渲染（`StageScriptPage.tsx` 等仅 text/textarea 渲染）✓。
- 后端 JSON 响应经 Express 正常序列化，无注入。

### 发现的问题

| # | 文件:行号 | 问题 | 严重度 |
|---|---|---|---|
| 3.7-1 | `dataTransfer.ts` export-custom 的 HTML 分支（约 :82-94、:120-130、:147-157、:174-184） | 用户可编辑内容（`ep.script_content`、`project.title`、角色名/描述、分镜 action_description/dialogue 等）**未做 HTML 转义**直接拼进导出 HTML（`${(ep.script_content||'').replace(/\n/g,'<br>')}`）。剧本里写 `<img src=x onerror=...>` 或 `<script>` 即被原样导出；下载后打开 → stored self-XSS（本地单用户场景危害有限，但导出文件会传播给协作者）。 | P2 |
| 3.7-2 | 同上文件 FDX 分支 | XML 转义只做 `<>&`，未转义引号（元素文本内无碍，但若字段被用于属性值则存在注入面）。 | P3 |
| 3.7-3 | `dataTransfer.ts` 导出文件名 | `Content-Disposition: attachment; filename="moo-${type}-${req.params.id}.${format}"` 中 `type/format` 来自 query 未白名单——Node 对 header 值含 CR/LF 会抛错（不可利用），但 filename 可注入引号/垃圾字符（仅文件名篡改）。 | P3 |

- **修复建议**：HTML 导出统一走转义函数（`escapeHtml`：`& < > " '`），或改用安全模板；type/format 加枚举白名单。

---

# 修复优先级总览（按影响排序）

| 优先级 | 条目 | 一句话修复 |
|---|---|---|
| P0-1 | G-1 local 无鉴权 + 0.0.0.0 + CORS 全开 + 静态资源裸奔 | 绑定 127.0.0.1、CORS 白名单、静态资源鉴权/随机路径 |
| P0-2 | 3.1-1 `PUT /chapters/:cid` 透传 body | 补 zod 白名单 schema |
| P0-3 | 3.1-2 `POST /episodes/:id/props` 无归属无 schema | 补归属链校验 + schema |
| P0-4 | 3.3-1 `chapters/merge` 跨项目删章节 | merge 前校验章节归属 |
| P0-5 | 3.2-11 projectMemory 全量 IDOR（含付费 AI 触发） | 全部补归属链校验（generate 路由尤其要防他人项目烧 token） |
| P1 | 2.1/2.2/2.7 重复任务（首帧/视频/段） | 后端幂等检查 + (shot_id, frame_type) 唯一约束 + 单镜头视频去重 |
| P1 | 2.3 autoPipeline 覆盖手动分镜 | 项目级写锁 + shots 增量补缺 |
| P1 | 2.4 NULL segment 分镜被遗漏 | compose 前检测 + segment_id 改存 segments.id |
| P1 | 2.5 loadShots 陈旧覆盖 | episode 守卫 + apiClient 支持外部 signal |
| P1 | 3.4-1 角色参考图 404 | 统一上传目录与 URL |
| P1 | 3.5-1 API Key 明文 | 加密落库 |
| P1 | 3.2 其余 12 处 IDOR GET | 统一归属链校验帮助函数 |
| P2 | 2.6 丢失更新 / 3.7-1 导出 XSS / 3.3-3 悬空引用 / 3.2-13/14 等 | 乐观锁 / HTML 转义 / FK 补齐 / 单点校验 |

---

## 排查声明

- 本次排查逐文件阅读了：全部 13 个路由文件（projects/episodes/assets/create/pipeline/audio/costs/dataTransfer/models/preferences/projectPatch/projectMemory/visualMemory/videoCompose/tasks/ai/visualStyles/auth）、23 个 DAO 的 update 路径、keyframeGenerator/videoGenerator/segmentService/autoPipeline（runner/state/taskStore/helpers/shots/keyframes/video stages）/videoTaskPoller/importService/projectStorage/aiProxy/videoComposer/shotConsistencyService、前端 apiClient/useProjectStore/StageDirectorPage/ShotCard/StageScriptPage、数据库迁移 schema。
- 未覆盖（超出本轮范围，供后续）：`services/dubbingService`、`services/audioComposer`、`services/exportProductionService`、`services/characterExpressionService`、`services/episodeEnrichService` 的内部实现细节（本次仅核对了其路由入口归属）；Electron 主进程的 IPC/协议 handler；`server` 对外网部署时的 TLS/反代配置。
- 本报告所有"已核实/确认修复"的条目均给出代码行号证据；所有严重度均为静态代码审查结论，未做动态渗透验证。
