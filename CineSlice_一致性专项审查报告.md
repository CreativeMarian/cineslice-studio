# CineSlice Studio 一致性专项深度审查报告

> 审查范围：分镜视频一致性（首帧→视频）/ 分镜连贯性（镜头之间）/ 剧情连贯性（剧本→分镜→视频）
> 审查方式：只读代码审查（未修改任何代码），逐文件阅读，追踪真实数据流
> 审查日期：2026-10-04

---

## 审查文件清单（已全部逐行阅读）

| 模块 | 文件 |
|---|---|
| 视频生成 | `server/src/services/videoGenerator.ts`（674 行） |
| 提示词 | `server/src/services/promptBuilder.ts`、`prompts/video.ts` |
| 一致性服务 | `server/src/services/shotConsistencyService.ts`（858 行） |
| 关键帧 | `server/src/services/keyframeGenerator.ts`、`visualMemoryService.ts` |
| 分镜生成 | `server/src/services/shotGenerator.ts`、`episodeEnrichService.ts` |
| 分段 | `server/src/models/segment.ts`、`services/segmentService.ts` |
| 合成/配音 | `server/src/services/videoComposer.ts`、`audioComposer.ts`、`dubbingService.ts` |
| 质量门 | `server/src/services/videoQualityGate.ts` |
| 管线 | `autoPipeline/runner.ts`、`stages/{scenes,characters,shots,keyframes,video,audio,export}.ts` |
| 适配器 | `adapters/{base,index,registry}.ts`、`adapters/video/{doubao,kling,jimeng,hailuo,minimax,happyhorse,agnes,custom-openai,comfyui}.ts` |
| 其他 | `constants.ts`、`aiProxy.ts`（generateVideo/getVideoTask）、`projectMemoryService.ts`、`migrations/001_init.sql` |

---

# 一、分镜视频一致性（首帧→视频）

## 1.1 数据流图

```
┌─ 首帧来源（优先级）───────────────────────────────────────────────┐
│ ① explicitFirstFrame（前端显式覆盖，如手动选帧）                    │
│ ② resolvePreviousShotTailFrame（上一镜成品视频尾帧，ffmpeg 抽帧）    │
│    └─ 仅非 flf2v 模式；被继承时本镜关键帧降为参考图首位               │
│ ③ resolveFirstFrame（本镜 first 关键帧；comfyui 允许无帧→文生视频）   │
└──────────────────────────────┬────────────────────────────────────┘
                               ▼
                     imageToDataUrl → base64 data URL
                               │
┌─ 尾帧来源 ──────────────────┤
│ ① endFrameId 显式            │
│ ② resolveLastFrameForShot    │
│    a. 本镜 end/last 关键帧    │
│    b. 同场景下一镜首帧（VideoClaw，use_next_first_frame≠0 时）│
└──────────────┬───────────────┘
               ▼
┌─ 参考图链 ────────────────────────────────────────────────────────┐
│ collectShotReferenceImages（角色造型图≥2 + 场景 1 + 道具，最多 4）   │
│ + visualMemoryService.retrieveReferenceImages（历史帧+前3镜首帧）   │
│ + collectExpressionReferenceImages（情绪→表情图）                   │
│ + resolvePreviousShotVideoUrl（上一镜成品视频 → ref_videos）         │
└──────────────────────────────┬────────────────────────────────────┘
               ▼
      aiProxy.generateVideo（无自动重试，计费任务）
               ▼
      adapter.generate（图生视频 / 尾帧 / 参考图支持度各异）
               ▼
      ShotVideoIntervalDAO.create（external_task_id 落库）
      → getVideoStatus / stageVideo 轮询 → 下载 → VLM 质量门
      → completed / failed（超时：云端 10min，ComfyUI 24h）
```

**提示词链**：`buildPromptBuilderVideoPrompt` → `buildFullVideoPrompt`（300 字上限）
保留块 = 风格 + 每角色身份锁（超限压缩）+ 禁令行；可截断块 = `[记忆注入+动作, blocking, 场景]` 从头保留（即从末尾截断）。

## 1.2 发现的问题

### P0-1【新发现】记忆注入把动作描述挤出视频提示词——"动作优先保留"被破坏

- **位置**：`autoPipeline/stages/video.ts` L196-207（记忆拼到动作**前面**）；`promptBuilder.ts` L383-388（`middleText.slice(0, available)` 保留**开头**）
- **问题**：P1-4 修复把记忆文本（角色圣经/世界观/视觉记忆）拼到 `action_description` 前面，而截断策略保留开头 → 记忆文本优先级高于动作。实测预算：
  - 单角色：风格 20 + 身份锁 90 + 禁令 55 ≈ 167 → `available ≈ 133`。角色圣经通常 200-800 字 → `slice(0,133)` 只保留圣经开头，**动作/blocking/场景全被截断**；
  - 双角色：`available < 50` → `middleText = ''`（L384-386），动作 100% 丢失。
- **对一致性影响**：视频模型拿到的提示词只有"身份锁 + 圣经片段 + 禁令"，没有动作描述 → 视频动作完全靠首帧+参考图脑补，镜头语言失控。P0-6"动作优先保留"的修复前提（无记忆注入）被 P1-4 改变。
- **修复建议**：记忆注入放到动作**之后**（如 middleText = [action, blocking, sceneBlock, memoryText]），或为动作预留最小预算（如 `min(80, available*0.4)` 先分给动作），或限制注入文本长度（如 characterBible 截 120 字）。

### P0-2【新发现】豆包 r2v 模式时长修正 → 视频实际时长 ≠ 分镜 duration_seconds → 字幕/分段时间轴漂移

- **位置**：`adapters/video/doubao-video.ts` L60-75；`stages/video.ts` L239/L252（提交 `shot.duration_seconds`，记录同值）；`stages/video.ts` L441-466（字幕 `currentTime += shot.duration_seconds`）
- **问题**：Seedance r2v 仅支持 5/10/15（2.0）或 5/10/11（2.5），其他值修正到最接近档：分镜 7s → 实际 5s，8s → 10s。但 `videoInterval.duration_seconds`、整集 SRT 时间轴、segments `autoAggregate` 全部按**理论值** `shot.duration_seconds` 累加。
- **对一致性影响**：整集字幕对白与画面错位（下一镜字幕提前/延后）；段理论时长与实际时长不符；配音烧录（按实际视频）与整集 SRT（按理论值）两套时间轴打架。
- **修复建议**：adapter 返回实际 duration；完成下载后用 ffprobe 实测时长回写 interval；字幕/分段累加一律用实测时长。

### P0-3【新发现】手动/批量视频路径 duration 固定 5 秒，不取分镜时长

- **位置**：`videoGenerator.ts` L295/L316、L574/L586（`duration: duration || 5`）；`routes/episodes.ts` generateSegmentVideo 的 duration 为可选参数
- **问题**：`generateVideoForShot` / `batchGenerateVideos` 在未显式传 duration 时一律 5 秒，与管线路径（`stages/video.ts` 用 `shot.duration_seconds`）不一致。前端按段生成、批量生成时若未传时长，8 秒镜头出 5 秒视频。
- **对一致性影响**：视频内容被压缩（动作/台词密度与时长不匹配），segments 理论时长失真。
- **修复建议**：`generateVideoForShot` 内 `duration = opts.duration ?? shot.duration_seconds ?? 5`；batch 同理。

### P1-1【新发现】关键帧尺寸与项目比例不一致（4:3 / 3:4 / 21:9）

- **位置**：`keyframeGenerator.ts` L113-121（4:3→1792x1024=1.75:1、3:4→1024x1792=0.57:1、21:9→2560x1440=16:9）；管线 `stages/keyframes.ts` L87 仅区分 9:16/其他（4:3 项目关键帧 16:9 横屏）
- **问题**：关键帧比例 ≠ 视频输出比例。豆包/Minimax(adaptive)/海螺(自适应) 等以首帧图定比例的视频，画面会被裁剪或留黑边；ComfyUI 虽强制 pad 补边（`comfyui.ts` L298），但大比例差时模型需凭空补上下区域。
- **对一致性影响**：首帧构图边缘丢失，动作/道具可能被裁出画外。
- **修复建议**：关键帧尺寸按项目比例映射表补齐（4:3/3:4/21:9 增加适配尺寸），管线与手动路径统一。

### P1-2 候选帧/显式尾帧固定 2560x1440

- **位置**：`shotConsistencyService.ts` L639（generateKeyframeCandidates）、L718（generateEndFrameForShot）
- **影响**：竖屏（9:16）项目的手动候选帧、显式尾帧是横屏 → 作为首尾帧输入时比例错乱。
- **修复建议**：按项目 aspect_ratio 传 size。

### P1-3 视频提示词无 extraContext 参数（prevShotContext 进不了视频提示词）

- **位置**：`promptBuilder.ts` L344-349（buildFullVideoPrompt 签名无 extraContext，对比 L270-275 buildFullKeyframePrompt 有）
- **影响**：前镜→后镜的"位置/朝向/状态衔接"文字指令只注入关键帧，不注入视频。视频生成缺失该约束（图像层有尾帧/参考视频补偿，但文本层缺失）。
- **修复建议**：buildFullVideoPrompt 增加 `extraContext` 参数，管线/手动路径把 prevShotContext 传入（并注意与 P0-1 的预算问题）。

### P1-4 视频提示词不含服装块

- **位置**：`promptBuilder.ts` L330 注释明确"不含服装块，控制长度"
- **影响**：服装一致性只能靠参考图（collectShotReferenceImages 造型优先），非参考图适配器（见 P1-5）下服装漂移无文本兜底。

### P1-5【新发现】多数视频适配器不消费 referenceImages（角色/场景/道具锚定失效）

- **位置**：`adapters/video/kling-video.ts`、`jimeng-video.ts`、`hailuo-video.ts`、`minimax-video.ts`、`happyhorse-video.ts`、`agnes-video.ts`、`custom-openai-video.ts`——均未读取 `params.referenceImages`；仅 `doubao-video.ts` L36-43（限 2 张）和 `comfyui.ts` L82-97 支持
- **影响**：切换到 Kling/即梦/海螺/MiniMax/Agnes 等模型时，角色/场景/道具参考图全部丢失，一致性只剩首帧+尾帧硬锚定；角色外观漂移概率上升。
- **修复建议**：各 adapter 按 API 语义注入参考图（或至少首帧后附加 1-2 张角色图）；无法支持的在文档中明示降级。

### P1-6 上一镜尾帧抽帧缓存不过期（风险中低）

- **位置**：`shotConsistencyService.ts` L472-474（`if (!fs.existsSync(out))` 复用 tail.png）
- **影响**：视频文件路径含 `Date.now()`（`stages/video.ts` L289），重生成通常产生新文件名 → 新 tail，主路径规避；但同一 URL 重复下载到同名文件时 tail 会陈旧。
- **修复建议**：缓存键加入视频文件 mtime。

### P2 级问题

| 位置 | 问题 | 影响 |
|---|---|---|
| `hailuo-video.ts` | resolution='2k'/'4k' 原样透传（仅 720p/1080p 映射） | API 400 报错 |
| `jimeng-video.ts` | duration 无 clamp；'2k'/'4k' 透传 | 非法参数 |
| `kling-video.ts` | mode 固定 'std'（720P），resolution 无效；duration 无校验 | 1080p 请求无效 |
| `agnes-video.ts` | duration 量化 3/5/10/18s；21:9 落回 16:9 | 时长/比例不一致（供应商维度） |
| `minimax-video.ts` | 图生视频 ratio 恒 'adaptive'（比例=首帧） | 首帧比例问题传导 |
| `hailuo-video.ts` / `happyhorse-video.ts` | 未传 ratio，自适应首帧 | 同上 |
| `shotConsistencyService.ts` L276/L403 | 注释"上限 3 张"与实际 `slice(0,4)` 不符 | 文档误导 |
| `videoGenerator.ts` L408-412 | 手动路径质量门失败仅标记 failed，无自动重试（管线有） | 手动路径需人工干预 |
| `stages/video.ts` L222-375 | 质量门重试无 seed 随机化 | 3 次重试可能复现同一缺陷 |
| `doubao-video.ts` L44-48 | 首帧与参考图同为 `role:'reference_image'` | r2v 首帧语义依赖 API 内部规则（低风险） |

---

# 二、分镜连贯性（镜头之间）

## 2.1 数据流图

```
前镜 ──► 后镜 衔接机制（按作用顺序）
┌──────────────────────────────────────────────────────────────────┐
│ ① 尾帧锁定（resolveLastFrameForShot v2.1）                        │
│    本镜 end/last 关键帧（动作弧定格）                               │
│    否则：同场景 且 use_next_first_frame≠0 → 下一镜首帧作尾帧        │
│    → 视频模型只做"首帧→尾帧"插值，落点硬锁定                        │
│ ② 首帧继承（resolvePreviousShotTailFrame，非 flf2v）              │
│    上一镜成品视频末帧 → 本镜首帧（真实画面锚定起点）                │
│    → 被继承时本镜关键帧降为参考图首位                              │
│ ③ 参考视频续写（resolvePreviousShotVideoUrl → ref_videos）        │
│    ComfyUI 非 flf2v 工作流注入上一镜成品视频                        │
│ ④ prevShotContext 文本（keyframeGenerator.ts）                    │
│    "上一镜：{动作前200字} 本镜必须同场景，位置/朝向/状态连贯"       │
│    → 注入 buildFullKeyframePrompt 的 extraContext（禁令行之前）    │
│    ⚠ 手动关键帧路径注入；管线关键帧路径不注入（P1-7）               │
│ ⑤ 视觉记忆（visualMemoryService，project 级）                     │
│    同角色历史帧(≤2/角色) + 同场景历史帧(≤2) + 前3镜首帧            │
│    → 注入视频参考图 + contextText 文本                             │
│ ⑥ 场景/道具锚定：同 scene_id → 同一 spatial_layout / lighting /    │
│    道具概念图（buildSceneBlock 逐镜重建，场景级一致）               │
└──────────────────────────────────────────────────────────────────┘
```

## 2.2 已确认修复到位（"之前修过"验证）

| 修复点 | 验证结果 |
|---|---|
| **prevShotContext 从禁令行之后移到禁令行之前** | ✅ `promptBuilder.ts` L323：`[reservedHead, extra, middleText, prohibition]`，extraContext 在禁令行前；`keyframeGenerator.ts` L150 传入 |
| **分镜重建级联删除 segments（管线路径）** | ✅ `stages/shots.ts` L63/L175 事务内 `SegmentDAO.deleteByEpisode` |
| **尾帧优先本镜显式帧、同场景才用下一镜首帧（v2.1 过场镜头修复）** | ✅ `shotConsistencyService.ts` L550-586（`sameScene` 判断 + `use_next_first_frame`） |
| **上一镜尾帧继承在 flf2v 模式禁用** | ✅ `videoGenerator.ts` L261-265 |

## 2.3 发现的问题

### P0-4【之前修过但可能没修到位】手动/加料分镜重建不删除旧 segments

- **位置**：`shotGenerator.ts` L190-192（加料路径）、L296-298（普通路径）——事务内只 `ShotDAO.delete`，**无 `SegmentDAO.deleteByEpisode`**；对比管线路径 `stages/shots.ts` L63/L175 有删
- **问题**：segments 表不是 shots 子表（无 FK/级联），手动重建分镜后旧段残留（`start_shot_id/end_shot_id` 指向已删镜头 id）。只有下次 `autoAggregate`（或 compose 时 `unsegmentedCount>0` 触发）才清理；期间 UI 段列表、投产包分段（`exportProductionService.ts` L143-156 按 `segment_id` 分组）展示过期结构。
- **修复建议**：`generateShotsForEpisode` 的两个路径（加料/普通）事务内补 `SegmentDAO.deleteByEpisode(db, episode.id)`，与管线对齐。

### P1-7 管线关键帧不注入 prevShotContext / 项目记忆

- **位置**：`stages/keyframes.ts` L94-95（`buildFullKeyframePrompt(...)` 无 extraContext）；对比手动路径 `keyframeGenerator.ts` L150
- **影响**：全自动模式下，前镜→后镜的"位置/朝向/状态衔接"文字指令缺失（仅剩尾帧锁定 + 视觉记忆图），关键帧角色位置跳跃风险高于手动路径。
- **修复建议**：管线 keyframes 阶段调用 `keyframeGenerator.buildPrevShotContext` 并传入。

### P1-8 prevShotContext 仅文字、无图像，且截断 200 字

- **位置**：`keyframeGenerator.ts` L92-104
- **影响**：衔接指令是"上一镜动作的前 200 字"文本，不含上一镜尾帧图（尾帧图只走视频层）。长动作被截断后位置信息可能丢失；角色"从左边跳到右边"无硬校验机制。
- **修复建议**：contextText 中补"上一镜尾帧角色位置摘要"（从 blocking 提取），并把上一镜尾帧加入关键帧参考图（若适配器支持）。

### P1-9 同场景镜头角色位置连续性无硬保证

- **位置**：`shotConsistencyService.ts` L550-586（尾帧同场景判定只管场景 id，不校验角色位置）；`promptBuilder.ts` buildBlockingBlock（blocking 由 AI 生成，无后置校验）
- **影响**：同一场景连续镜头，角色仍可能左右跳位；机制是概率性的（参考图+文字），不是确定性的。
- **修复建议**：可加"空间连续性校验"质量门（对比本镜首帧与上一镜尾帧的角色位置差异，超阈值标记），或把上一镜 blocking 注入本镜 prompt 作位置锚点。

### P2 级问题

| 位置 | 问题 | 影响 |
|---|---|---|
| `stages/shots.ts` L369-445 fixLongDialogueShots | 拆镜后旧 visual_memory 的 shot_number 与新分镜错位（不清理） | 前序镜头参考可能取到错位帧 |
| `constants.ts` L8 + `segment.ts` L119-195 | `SEGMENT_MIN_DURATION=8` 定义但从未使用；2×3s=6s 也成段（注释声称 8-15s） | 分段粒度与文档不符 |
| `segment.ts` L184-187 | `shots.segment_id` 存段号（1,2,3…）而非 segment id（字段名歧义，getShotsForSegment 注释确认为设计） | 可读性/联表易错 |
| `segmentService.ts` L288+ | compose 归一化 `-shortest` 可能按音轨截断画面 | 极端时长差时丢画面 |
| `videoComposer.ts` L336-346 | xfade 转场时音频 acrossfade，-shortest 截断 | 转场处配音可能被削尾 |

---

# 三、剧情连贯性（剧本→分镜→视频）

## 3.1 数据流图

```
剧本 script_content
  │
  ├─► episodeEnrichService 加料重构（约束：只加血肉不动骨架、台词保真、
  │     三表对账、熔断）→ storyboard（每镜固定 5s、段级 h3Prompt）
  │
  └─► shotGenerator.generateShotsForEpisode
         ├─ 加料路径：storyboard 直接落库（台词 [角色名]：台词 → dialogue）
         │    视频_prompt ← splitSegmentPromptByShot(h3Prompt)  【P1-13 未被视频生成消费】
         └─ 普通路径：AI 生成 JSON（台词保真由 prompt 约束）
         统一：buildShotAssetAssociations（scene_id/blocking/服装/角色关联）
               duration clamp [3,15]；shot_number 顺序去重
  │
  ├─► 关键帧生成（首/尾帧，prevShotContext 手动路径注入）
  ├─► 视频生成（buildFullVideoPrompt：身份锁+动作+禁令；参考图锚定）
  │
  ├─► TTS 配音（dubbingService：SRT 从 0 开始，tpad 补帧/apad 垫静音）
  ├─► 合成（videoComposer：逐镜 dubVideo 烧字幕+配音 → concat/xfade）
  └─► 整集字幕（stages/video.ts L441-466：currentTime += shot.duration_seconds）
  │
  ▼
多剧集衔接：
  project_bible（characterBible/worldSetting/storySummary，project 级）
  + story_foreshadow（关键词规则识别，open 状态回收）
  + visual_memory（project 级：同角色名/场景名检索跨集历史帧）
  + character_anchors（角色视觉锚点）
  ⚠ 角色/场景/道具表均为 episode_id 级（P1-11）
```

## 3.2 已确认修复到位

| 修复点 | 验证结果 |
|---|---|
| **fixLongDialogueShots 拆镜保留 blocking/characters_in_shot/character_outfits** | ✅ `stages/shots.ts` L420-439 逐字段深拷贝 |
| **拆镜后段号继承（聚合前 segment_id 为 null）** | ✅ 拆镜发生在聚合前，segment_id 保留原值无副作用 |
| **记忆注入不再追加在 prompt 后（避免挤掉禁令行）** | ✅ `stages/video.ts` L190-207 拼到动作前，禁令行由 buildFullVideoPrompt 固定末尾（但引入 P0-1） |

## 3.3 发现的问题

### P0-5【新发现】整集字幕时间轴与视频实际时长脱钩（两套时间轴）

- **位置**：`stages/video.ts` L441-466（`currentTime += shot.duration_seconds`）；`videoGenerator.ts` L639-673（getEpisodeSubtitles 同样用理论值）；`dubbingService.ts`（镜内 SRT 从 0 开始）
- **问题**：① 整集 SRT 按分镜理论时长累加，而实际视频时长被 adapter 修正（P0-2）或 dubVideo tpad 补帧延长 → 字幕对白与画面错位；② 镜内烧录字幕（配音同步）与整集 SRT（理论同步）两套时间轴，导出时可能不一致。
- **修复建议**：以 ffprobe 实测每镜视频时长回写 interval，字幕/分段/导出统一用实测值累加；镜内字幕生成与整集 SRT 共用同一时间基准。

### P1-10 台词配音同步依赖"从 0 开始 + 补帧"，无时长强制校验

- **位置**：`dubbingService.ts`（dubVideo：语音长→tpad 定格补帧、短→apad 垫静音）；`shotGenerator.ts` 台词容量规则（4.5 字/秒）只是生成期约束
- **影响**：台词超长时视频被定格延长（节奏被破坏）；TTS 实际语速与 4.5 字/秒假设偏差大时同步失准；`audioComposer.ts` `-shortest` 合成时配音可能被削尾。
- **修复建议**：TTS 后校验语音时长，超限时二次拆镜/压缩语速/提前报错，而非静默补帧。

### P1-11【新发现】多剧集角色/场景资产为每集独立行，跨集外观锚定断裂

- **位置**：`migrations/001_init.sql` L142/L185/L207（script_characters/script_scenes/script_props 均 `episode_id` 级，无 project_id）；`stages/characters.ts` L21-29 与 `stages/scenes.ts` L21-25（只处理 `episodes[0]`，第二集跳过/为空）；`shotConsistencyService.ts` L289/L299（collectShotReferenceImages 只查本集角色）
- **问题**：① 角色表没有 project 级复用——第 2 集角色是新行，无概念图/四视图；② 管线各阶段固定 `episodes[0]`，多集自动生成实质未支持；③ 跨集一致性目前只靠 project_bible 文字 + visual_memory 按角色名跨集检索（`visualMemoryService.ts` L203 按 projectId+entity_name 检索）——无图像资产兜底。
- **影响**：跨集同角色外观漂移风险高（尤其未生成锚点或圣经不完整时）。
- **修复建议**：角色表增加项目级（project_id）或跨集复制机制；collectShotReferenceImages 在剧集角色缺失时回退项目级角色。

### P1-12【新发现】visual_memory 不随分镜重建清理

- **位置**：`shotGenerator.ts` L296-298（重建只删 shot，级联删 keyframes，但 visual_memory 表独立）；`visualMemoryService.ts` L226（`listBeforeShot` 按 shot_number 检索）
- **影响**：分镜重建后 shot_number 重新编号，旧 visual_memory 记录（携带旧 shot_number/keyframe_id）仍可被检索 → "前 3 镜首帧"可能取到**旧分镜的帧**，且 `keyframe_id` 指向已删行。
- **修复建议**：分镜重建事务内清理该集 visual_memory；或检索时 join shots 校验存在性。

### P1-13【新发现】加料 h3Prompt 切分的 video_prompt 落库但不被视频生成消费

- **位置**：`shotGenerator.ts` L226-229（`video_prompt: splitSegmentPromptByShot(en.h3Prompt, ...)`）；`videoGenerator.ts` L279-287（`motionPrompt` 缺省时走 `buildPromptBuilderVideoPrompt`，**不读 video_prompt 列**）
- **影响**：加料分镜带有导演级镜头语言（h3Prompt），但视频生成实际用的是重新构建的通用提示词 → 加料的运镜/氛围设计在视频层丢失，剧情表达降级。
- **修复建议**：generateVideoForShot 优先消费 `shot.video_prompt`（若存在且非空），再回退 promptBuilder；或明确两套提示词的差异策略。

### P2 级问题

| 位置 | 问题 | 影响 |
|---|---|---|
| `projectMemoryService.ts` L211 | 剧情摘要只取前 10 镜动作前 50 字 | 摘要信息量有限，跨集上下文弱 |
| `projectMemoryService.ts` L246-270 | 伏笔识别仅关键词规则（10 个词） | 漏检/误检，跨集伏笔回收弱 |
| `stages/video.ts` L456 | 整集字幕只处理 `episode_id: first.id` | 与单集管线假设一致，多集场景受限 |
| `episodeEnrichService.ts` | 加料台词"保真"是 AI 软约束，无硬校验台词与剧本逐字一致 | 台词微改可能发生 |

---

# 四、三维度评分

| 维度 | 评分 | 核心短板 |
|---|---|---|
| **分镜视频一致性（首帧→视频）** | **6 / 10** | 视频时长被 adapter 修正但字幕/分段用理论时长（P0-2）；记忆注入挤占动作描述（P0-1）；手动/批量路径时长固定 5s（P0-3）；非豆包/ComfyUI 适配器参考图锚定失效（P1-5）；关键帧比例与项目比例错位（P1-1） |
| **分镜连贯性（镜头之间）** | **7 / 10** | 尾帧锁定/首帧继承/参考视频/视觉记忆机制齐全且 v2.1 修复到位；但手动分镜重建不删旧段（P0-4）、管线关键帧缺 prevShotContext（P1-7）、位置连续无硬保证（P1-9） |
| **剧情连贯性（剧本→分镜→视频）** | **6 / 10** | 剧本保真约束强、拆镜/加料护栏到位；但字幕时间轴漂移（P0-5）、跨集角色资产断裂（P1-11）、加料 h3Prompt 未被视频消费（P1-13） |

---

# 五、最影响一致性的 Top 5 问题

1. **P0-2 / P0-5：视频实际时长 ≠ 分镜理论时长，字幕/分段/配音时间轴整体漂移**（`doubao-video.ts` L60-75 + `stages/video.ts` L441-466 + `dubbingService.ts`）
   影响面最大：直接造成"台词配音与视频画面不同步"这一用户最敏感的体验问题，且贯穿字幕、分段、导出三条链路。

2. **P0-1：记忆注入挤占视频提示词动作描述**（`stages/video.ts` L196-207 + `promptBuilder.ts` L383-388）
   多集项目几乎必然触发（角色圣经存在时 available < 动作长度），导致视频动作失控——违反"动作优先保留"的既定修复原则。

3. **P0-3：手动/批量视频路径 duration 固定 5 秒**（`videoGenerator.ts` L295/L316/L574/L586）
   三条生成路径（手动/批量/管线）时长行为不一致，前端未传 duration 时所有分镜时长被抹平成 5 秒。

4. **P0-4：手动/加料分镜重建不删旧 segments**（`shotGenerator.ts` L190-192/L296-298）
   "之前修过（管线路径）但没修到位"——手动重建后段结构与分镜脱节，投产包分段引用已删镜头。

5. **P1-11：多剧集角色/场景资产每集独立、管线只处理第一集**（`migrations/001_init.sql` L142 + `stages/characters.ts` L21-29）
   跨集一致性目前仅剩文字圣经 + 视觉记忆图，无图像资产兜底，长剧集项目外观漂移风险最高。

---

## 附：审查过程中确认无误的关键点（防止误报）

- `shots.segment_id` 存段号是**设计**（`segmentService.ts` L67 注释明确），非 bug
- 视频创建无自动重试是**设计**（`aiProxy.ts` L428-429 注释：计费任务重试会重复扣费）
- ComfyUI 无首帧时切换文生视频（`comfyui.ts` L77-80/L99-100）与 `resolveFirstFrame` 的 `allowNoKeyframe`（`videoGenerator.ts` L226）一致
- `resolveLastFrameForShot` v2.1 的过场镜头修复（同场景限定 + use_next_first_frame）验证到位
- flf2v 模式禁用上一镜尾帧继承（`videoGenerator.ts` L261-265）验证到位
- 管线视频重试使用相同首帧/尾帧/参考图/提示词（`stages/video.ts` L222-252，均在循环外计算）验证到位
- 超时处理（云端 10min / ComfyUI 24h）在 `getVideoStatus`（L351-362）、`batchGenerateVideos`（L535-547）、`stages/video.ts`（L266-269）三处一致
