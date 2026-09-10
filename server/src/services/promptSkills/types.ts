// 提示词 Skill 类型定义
// 每个视频模型/图像模型对应一个 PromptSkill：封装官方提示词规范、模板与规则，
// 在【剧本解析后 → 生成分镜/提取资产前】按用户预选的模型加载，指导后续所有提示词构造。

export interface PromptSkillVideoParams {
  /** 镜头动作描述（动作弧三段式） */
  actionDescription: string;
  /** 景别：extreme_wide/long/full/medium/medium_closeup/closeup/extreme_closeup */
  shotSize?: string;
  /** 运镜：push_in/pull_out/pan/truck/crane/handheld/steadicam/static */
  cameraMovement?: string;
  /** 时长（秒） */
  duration?: number;
  /** 画幅：16:9 / 9:16 / 1:1 / 4:3 / 3:4 / 21:9 */
  ratio?: string;
  /** 镜头角色名 */
  charactersInShot?: string[];
  /** 场景名 */
  sceneName?: string;
  /** 台词 */
  dialogue?: string;
  /** 风格提示词（预设风格） */
  stylePrompt?: string;
  /** 首帧画面描述（动作起始状态） */
  firstFrameDesc?: string;
  /** 尾帧画面描述（动作结束状态） */
  lastFrameDesc?: string;
  /** 是否图生视频/首尾帧模式 */
  isImageToVideo?: boolean;
  /** 是否首尾帧模式（有首帧+尾帧） */
  isFirstLastFrame?: boolean;
}

export interface PromptSkill {
  /** 唯一 id，如 'minimax-h3' */
  id: string;
  /** 展示名 */
  displayName: string;
  /** 适配的 provider（注册表中的 provider 名，可多个） */
  providers: string[];
  /** 模型关键字（modelName 包含任一即命中，不区分大小写） */
  modelKeys: string[];
  /** 官方文档 URL */
  docsUrl: string;
  /** 官方 skill 仓库/资源 URL（可选） */
  skillUrl?: string;
  /** 简介 */
  description: string;
  /** 支持的生成模式说明 */
  modes?: string[];
  /** ═══ 各阶段官方提示词规范（注入 systemPrompt）═══ */
  /** 分镜生成阶段：镜头动作/画面描述应遵循的官方写法 */
  shotRule: string;
  /** 资产提取阶段（角色/场景概念图）：官方参考图/一致性写法 */
  assetRule: string;
  /** 关键帧生成阶段：官方首帧/尾帧锚定写法 */
  keyframeRule: string;
  /** 视频生成阶段：官方视频提示词结构 */
  videoRule: string;
  /** ═══ 模板函数 ═══ */
  /** 按官方结构构造视频提示词（motion prompt） */
  buildVideoPrompt(params: PromptSkillVideoParams): string;
  /** 关键帧官方锚定句（追加到关键帧提示词末尾，如 I2VA 锚定句） */
  keyframeAnchor?: (frameType: 'first' | 'last' | 'middle') => string;
}
