# 前端重构方案 — 对齐 shuohao-skills 五段管线

## 一、现状分析

### 当前路由结构
```
/                          → Dashboard
/onboarding                → Onboarding
/models                    → 模型配置
/create                    → CreateStudio（自由创作）❌ 删除
/mindmap                   → MindMapPage（思维导图）❌ 删除
/settings                  → 设置
/costs                     → CostAnalyticsPage（成本统计）❌ 删除
/projects/:id/script       → StageScript（小说/剧集/剧本/分镜 4 Tab）
/projects/:id/assets       → StageAssets（角色/场景/道具 3 Tab）
/projects/:id/director     → StageDirector（视频/音频 2 Tab）
/projects/:id/export       → StageExport（合成/导出）
```

### 当前侧边栏
- 创作阶段：剧本 → 资产 → 导演 → 导出（4段）
- 系统：自由创作、模型配置、项目思维导图、成本统计、设置、返回首页

### 冗余组件/页面清单（需删除）
| 组件 | 路径 | 原因 |
|------|------|------|
| CreateStudio | components/CreateStudio/ | 自由创作，非五段管线 |
| MindMapPage | components/MindMap/ | 思维导图，非五段管线 |
| CostAnalyticsPage | components/CostAnalytics/ | 成本统计，非五段管线 |
| StageExport | components/StageExport/ | 导出合并到导演台 |
| ConfigPanel | components/StageScript/ConfigPanel.tsx | 提取配置弹窗，简化为直接调用 |
| ProjectConfigBar | components/StageScript/ProjectConfigBar.tsx | 项目配置栏，冗余 |
| VideoParamsPanel | components/StageDirector/VideoParamsPanel.tsx | 参数面板，简化 |
| AudioPanel | components/StageDirector/AudioPanel.tsx | 音频合成，合并到导演台 |
| PipelineProgress | components/Pipeline/PipelineProgress.tsx | 复杂流水线进度，简化为五段指示器 |

### 需保留但重构的组件
| 组件 | 重构方向 |
|------|----------|
| StageScript → 大纲页+剧本页 | 拆分为两个独立页面 |
| StageAssets → 角色页+美术页 | 拆分为角色列表/详情 + 美术(场景/道具) |
| StageDirector → 导演台 | 增加段→分镜结构，合并导出功能 |
| NovelManager | 重构为大纲页的小说上传部分 |
| EpisodeManager | 重构为大纲页的分集梗概部分 |
| ScriptEditor | 重构为剧本页的场次流编辑器 |
| SceneBreakdown | 重构为导演台的分镜列表 |
| CharacterCard | 保留，用于角色列表 |
| CharacterDetail | 重构为独立路由页面 |
| ShotCard | 保留，用于导演台分镜卡片 |
| BatchToolbar | 保留，用于导演台批量操作 |

## 二、新路由结构

```
/                                    → Dashboard（项目列表）
/models                              → 模型配置（保留）
/settings                            → 设置（保留）

/project/:id                         → 第1段：大纲页（默认）
/project/:id/characters              → 第2段：角色列表页
/project/:id/character/:characterId  → 第2段：角色详情页
/project/:id/art                     → 第3段：美术页（场景+道具 Tab）
/project/:id/art/scene/:sceneId      → 第3段：场景详情页
/project/:id/art/prop/:propId        → 第3段：道具详情页
/project/:id/script                  → 第4段：剧本页（场次流+台词本）
/project/:id/director                → 第5段：导演台（段→分镜→导出）
```

## 三、新导航结构（侧边栏）

```
📋 项目大纲      /project/:id
👤 角色设定      /project/:id/characters
🎨 美术设定      /project/:id/art
📝 剧本          /project/:id/script
🎬 导演台        /project/:id/director
─────────────
⚙️ 模型配置      /models
⚙️ 设置          /settings
🏠 返回首页      /
```

- 当前阶段高亮（accent色）
- 已完成阶段显示 ✅
- 移除：自由创作、思维导图、成本统计

## 四、通用组件（新建/抽取）

### 1. ConceptImageGenerator（新建）
- 路径：`src/components/common/ConceptImageGenerator.tsx`
- 功能：传入 entityId、类型、提示词，显示概念图预览 + 生成/重新生成/删除按钮
- Props：`{ entityId, entityType: 'character'|'scene'|'prop', prompt, images, selectedIndex, onGenerated, onDeleted }`

### 2. QualityGateBadge（新建）
- 路径：`src/components/common/QualityGateBadge.tsx`
- 功能：显示质量门状态（通过/警告/失败）
- Props：`{ status: 'pass'|'warning'|'fail', label? }`

### 3. SectionHeader（新建）
- 路径：`src/components/common/SectionHeader.tsx`
- 功能：页面标题 + 描述 + 操作按钮区
- Props：`{ icon, title, description, actions? }`

### 4. ProgressSteps（新建）
- 路径：`src/components/common/ProgressSteps.tsx`
- 功能：五段进度指示器，显示当前阶段和完成状态
- Props：`{ current: number, completed: boolean[] }`

### 5. EpisodeSelector（抽取）
- 路径：`src/components/common/EpisodeSelector.tsx`
- 从 StageAssets 中抽取，复用于需要选剧集的页面

## 五、各页面详细设计

### 第1段：大纲页 `/project/:id`
**核心按钮（3个）：**
1. 上传小说 / 重新生成大纲
2. 编辑大纲（展开编辑模式）
3. 确认并进入角色设定

**页面结构：**
- 顶部：SectionHeader（标题"项目大纲" + 操作按钮）
- 小说上传区：拖拽/点击上传，显示已上传小说信息
- 大纲五件套（Tab或折叠面板）：
  - 改编说明
  - 人物表
  - 爽点表
  - 分集梗概
  - 资产清单（含叙事道具表）
- 底部：确认进入下一步按钮

**复用：** NovelManager（小说上传）、EpisodeManager（分集梗概）

### 第2段：角色列表页 `/project/:id/characters`
**核心按钮（2个）：**
1. 重新提取角色（AI）
2. 手动添加角色

**页面结构：**
- 顶部：SectionHeader + 集数选择器
- 角色卡片网格（CharacterCard）
- 点击角色 → 跳转 `/project/:id/character/:characterId`

### 第2段：角色详情页 `/project/:id/character/:characterId`
**核心按钮（5个）：**
1. 编辑形象提示词
2. 编辑音色提示词
3. 生成概念图 / 重新生成 / 删除
4. 生成四视图 / 重新生成 / 删除
5. 返回列表

**页面结构：**
- 顶部：返回按钮 + 角色名 + 操作按钮
- 左侧：角色信息（人物画像、形象提示词、音色提示词）
- 右侧：概念图（正面全身锚点图）+ 四视图（大头照+正面+侧面+背面）
- 使用 ConceptImageGenerator 组件

### 第3段：美术页 `/project/:id/art`
**核心按钮（2个）：**
1. 重新提取场景/道具（AI，按当前Tab）
2. 手动添加

**页面结构：**
- 顶部：SectionHeader + 集数选择器
- Tab：场景 / 道具
- 场景列表：卡片网格（场景概念图 + 名称 + 地点/时段/氛围标签）
- 道具列表：卡片网格（道具名 + 类别 + 线索标记）
- 点击 → 跳转详情页

### 第3段：场景/道具详情页
**核心按钮（3个）：**
1. 编辑形象提示词
2. 生成概念图 / 重新生成 / 删除
3. 返回列表

**页面结构：**
- 顶部：返回 + 名称 + 操作
- 左侧：设定信息（描述、提示词）
- 右侧：概念图（使用 ConceptImageGenerator）

### 第4段：剧本页 `/project/:id/script`
**核心按钮（3个）：**
1. 重新生成剧本（AI）
2. 切换视图：场次流 / 台词本
3. 确认并进入导演台

**页面结构：**
- 顶部：SectionHeader + 集数选择器 + 视图切换
- 场次流视图：
  - 场次列表（可展开）
  - 每个场次内：节拍流（动作与台词交替）
  - 台词可 inline 编辑
- 台词本视图：
  - 按角色聚合台词
  - 带音色提示词
  - 直接对接 TTS

### 第5段：导演台 `/project/:id/director`
**核心按钮（4个）：**
1. 批量生成首帧
2. 批量生成视频
3. 导出投产包
4. （每个分镜）生成首帧 / 生成视频 / 删除

**页面结构：**
- 顶部：SectionHeader + 集数选择器 + 批量操作按钮
- 段列表（≤15秒/段）：
  - 可展开/收起
  - 每段内：分镜列表（2-5秒/镜）
  - 分镜卡片（ShotCard）：首帧图 + 景别 + 动作 + 台词 + 操作按钮
- 导出投产包：一键导出 prompt.md + f1..fN.png

## 六、状态管理方案

### Zustand（全局状态）
- `useProjectStore`：保留，扩展 props 状态管理
- `useUIStore`：保留（侧边栏折叠、Toast）
- `useModelStore`：保留
- `useAuthStore`：保留
- `useTaskStore`：保留（任务中心）

### 本地状态（useState）
- 各页面的 Tab 切换、展开/收起
- 编辑模式状态
- 图片生成中状态
- 弹窗状态

### 移除
- `pipelineStep` 状态（改为路由驱动）
- 复杂的 PipelineStatus 状态（简化为五段进度）

## 七、ProjectLayout 简化

**移除：**
- 全自动/半自动模式切换
- 一键全自动按钮
- 流水线状态机（next/retry/rollback/reset）
- 复杂的 PipelineProgress 组件
- 全自动任务轮询
- 下一步引导条（改为侧边栏进度指示）

**保留：**
- Sidebar + Topbar 布局
- 项目数据加载（loadProjectData）
- 简单的五段进度指示器（ProgressSteps）
- 集数选择器（移到各页面内）

## 八、执行顺序

1. **基础设施**：App.tsx 路由、Sidebar 导航、ProjectLayout 简化、通用组件
2. **第1段+第2段**：大纲页、角色列表页、角色详情页
3. **第3段+第4段**：美术页、场景/道具详情页、剧本页
4. **第5段**：导演台（合并导出功能）
5. **清理**：删除冗余文件、编译验证、提交推送

## 九、验收标准

1. 路由严格对齐五段管线
2. 侧边栏按五段顺序排列，显示进度状态
3. 每个页面只保留核心操作按钮（3-5个）
4. 通用组件已抽取复用
5. 角色详情页：概念图+四视图，编辑提示词，生成/删除齐全
6. 美术页：场景+道具两个Tab，详情页概念图生成
7. 剧本页：场次流+台词本两个视图，台词可编辑
8. 导演台：段→分镜结构，批量生成首帧/视频，导出投产包
9. 所有冗余按钮已删除
10. 前端编译零错误
11. 代码已提交推送
