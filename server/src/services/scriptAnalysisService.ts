// 剧本分析服务 v1.0
// 在生成分镜/关键帧/视频之前，分析剧本的剧情、场景、角色、情绪、节奏等
// 基于分析结果优化提示词，提升生成质量

import type { Database } from '../types';
import { aiProxy } from './aiProxy';
import { NovelEpisodeDAO, ScriptCharacterDAO, ScriptSceneDAO, ShotDAO, ModelRegistryDAO, UserPreferenceDAO } from '../models';
import { getPromptSkillForVideoModel, applySkillRules } from './promptSkills';
import { parseAiJsonOrThrow } from '../utils/aiJsonParser';
import { generateId, now } from '../models/index';

// ═══════════════════════════════════════════════════════════════
// 类型定义
// ═══════════════════════════════════════════════════════════════

export interface ScriptAnalysisResult {
  /** 分析时间 */
  analyzedAt: string;
  /** 剧集ID */
  episodeId: string;
  /** 剧情结构分析 */
  plotStructure: {
    /** 三幕结构：建置/对抗/解决 */
    threeActStructure: {
      act1: string;  // 第一幕：建置（背景、人物、初始冲突）
      act2: string;  // 第二幕：对抗（冲突升级、转折点）
      act3: string;  // 第三幕：解决（高潮、结局）
    };
    /** 关键情节节点（3-7个） */
    plotPoints: Array<{
      index: number;
      description: string;
      type: 'setup' | 'inciting_incident' | 'rising_action' | 'midpoint' | 'climax' | 'falling_action' | 'resolution';
      emotionalWeight: 'low' | 'medium' | 'high' | 'critical';
    }>;
    /** 主题 */
    theme: string;
    /** 叙事视角 */
    narrativePerspective: 'first_person' | 'third_person_limited' | 'third_person_omniscient' | 'objective';
    /** 时间线 */
    timeline: string;
  };
  /** 场景分析 */
  sceneAnalysis: Array<{
    sceneName: string;
    location: string;
    timeOfDay: 'day' | 'night' | 'dawn' | 'dusk' | 'unknown';
    atmosphere: string[];  // 氛围标签
    keyProps: string[];     // 关键道具
    lighting: string;       // 光线描述
    emotionalTone: string;  // 情绪基调
    plotFunction: string;   // 剧情功能
  }>;
  /** 角色分析 */
  characterAnalysis: Array<{
    characterName: string;
    role: 'protagonist' | 'antagonist' | 'supporting' | 'minor';
    personality: string;
    emotionalArc: string;   // 情绪弧线
    keyScenes: string[];    // 关键出场场景
    visualTraits: string;   // 视觉特征（用于一致性）
    relationshipDynamics: string;  // 关系动态
  }>;
  /** 情绪曲线 */
  emotionalCurve: Array<{
    sceneIndex: number;
    sceneName: string;
    emotion: string;        // 主导情绪
    intensity: number;       // 情绪强度 1-10
    pacing: 'slow' | 'medium' | 'fast';  // 节奏
  }>;
  /** 视觉风格建议 */
  visualStyleSuggestion: {
    recommendedStyle: string;  // 推荐风格预设
    colorPalette: string;      // 推荐色调
    lightingMood: string;      // 光线氛围
    cameraLanguage: string;    // 镜头语言建议
    keyMotifs: string[];       // 关键视觉母题（重复出现的视觉元素）
  };
  /** 节奏分析 */
  rhythmAnalysis: {
    overallPacing: 'slow' | 'medium' | 'fast';
    beatStructure: string;     // 节拍结构
    recommendedShotDuration: string;  // 推荐镜头时长
    actionVsDialogueRatio: string;    // 动作与对话比例
  };
  /** 对话分析 */
  dialogueAnalysis: {
    totalDialogues: number;
    keyDialogues: Array<{
      speaker: string;
      content: string;
      emotion: string;
      importance: 'low' | 'medium' | 'high' | 'critical';
    }>;
    dialogueStyle: string;     // 对话风格
  };
}

// ═══════════════════════════════════════════════════════════════
// 分析提示词
// ═══════════════════════════════════════════════════════════════

const ANALYSIS_PROMPT = `你是一位专业的影视剧本分析师和导演。请深入分析以下剧本，从多个维度进行专业拆解。

## 分析要求

请严格按照以下JSON格式输出分析结果，不要输出任何其他文字：

{
  "plotStructure": {
    "threeActStructure": {
      "act1": "第一幕：建置（背景、人物、初始冲突），100字以内",
      "act2": "第二幕：对抗（冲突升级、转折点），100字以内",
      "act3": "第三幕：解决（高潮、结局），100字以内"
    },
    "plotPoints": [
      {
        "index": 1,
        "description": "情节节点描述",
        "type": "setup|inciting_incident|rising_action|midpoint|climax|falling_action|resolution",
        "emotionalWeight": "low|medium|high|critical"
      }
    ],
    "theme": "剧本主题，50字以内",
    "narrativePerspective": "first_person|third_person_limited|third_person_omniscient|objective",
    "timeline": "时间线描述，50字以内"
  },
  "sceneAnalysis": [
    {
      "sceneName": "场景名称",
      "location": "具体地点",
      "timeOfDay": "day|night|dawn|dusk|unknown",
      "atmosphere": ["氛围标签1", "氛围标签2"],
      "keyProps": ["关键道具1", "关键道具2"],
      "lighting": "光线描述，如：昏暗烛光、明亮日光、霓虹灯光",
      "emotionalTone": "情绪基调",
      "plotFunction": "该场景的剧情功能"
    }
  ],
  "characterAnalysis": [
    {
      "characterName": "角色名",
      "role": "protagonist|antagonist|supporting|minor",
      "personality": "性格特征",
      "emotionalArc": "情绪弧线变化",
      "keyScenes": ["关键场景1", "关键场景2"],
      "visualTraits": "视觉特征（发型、服装、标志性物品，用于人物一致性）",
      "relationshipDynamics": "与其他角色的关系动态"
    }
  ],
  "emotionalCurve": [
    {
      "sceneIndex": 1,
      "sceneName": "场景名",
      "emotion": "主导情绪",
      "intensity": 1-10的数字,
      "pacing": "slow|medium|fast"
    }
  ],
  "visualStyleSuggestion": {
    "recommendedStyle": "推荐的视觉风格（如：电影写实风、赛博朋克风、古风国风韵、日系动漫风）",
    "colorPalette": "推荐色调描述",
    "lightingMood": "光线氛围描述",
    "cameraLanguage": "镜头语言建议",
    "keyMotifs": ["关键视觉母题1", "关键视觉母题2"]
  },
  "rhythmAnalysis": {
    "overallPacing": "slow|medium|fast",
    "beatStructure": "节拍结构描述",
    "recommendedShotDuration": "推荐镜头时长（如：动作场景2-3秒，情感场景5-8秒）",
    "actionVsDialogueRatio": "动作与对话比例（如：60%动作40%对话）"
  },
  "dialogueAnalysis": {
    "totalDialogues": 数字,
    "keyDialogues": [
      {
        "speaker": "说话者",
        "content": "对话内容（关键对话）",
        "emotion": "情绪",
        "importance": "low|medium|high|critical"
      }
    ],
    "dialogueStyle": "对话风格描述"
  }
}

## 分析原则

1. **剧情结构**：准确识别三幕结构和关键情节节点，标注情绪权重
2. **场景分析**：每个场景都要分析氛围、道具、光线、情绪、剧情功能
3. **角色分析**：重点角色要有详细的情绪弧线和视觉特征（用于人物一致性）
4. **情绪曲线**：按场景标注情绪强度和节奏，为后续镜头时长分配提供依据
5. **视觉风格**：基于剧本内容推荐最合适的视觉风格、色调、光线、镜头语言
6. **节奏分析**：分析整体节奏、节拍结构、推荐镜头时长
7. **对话分析**：识别关键对话，标注情绪和重要性

## 剧本内容

`;

// ═══════════════════════════════════════════════════════════════
// 服务实现
// ═══════════════════════════════════════════════════════════════

export const scriptAnalysisService = {
  /**
   * 分析剧本
   * @param db 数据库实例
   * @param episodeId 剧集ID
   * @param userId 用户ID
   * @returns 分析结果
   */
  async analyzeScript(
    db: Database,
    episodeId: string,
    userId: string,
    opts?: { provider?: string; modelName?: string; forceRefresh?: boolean }
  ): Promise<ScriptAnalysisResult> {
    console.log(`[ScriptAnalysis] 开始分析剧本 episode=${episodeId}`);

    // ── 提示词 Skill：AI 分析剧情之前，按用户预选视频模型自动传入并适配官方提示词规范 ──
    const videoModelUsed = UserPreferenceDAO.getByUser(db, userId)?.default_video_model;
    const promptSkill = getPromptSkillForVideoModel(videoModelUsed);
    if (promptSkill) console.log(`[ScriptAnalysis] 注入官方提示词 skill: ${promptSkill.displayName}（视频模型: ${videoModelUsed || '未设置'}）`);

    // 获取剧集内容
    const episode = NovelEpisodeDAO.getById(db, episodeId);
    if (!episode) {
      throw new Error(`剧集不存在: ${episodeId}`);
    }

    // 落库缓存命中：直接复用（剧集剧本更新后自动失效重分析）
    // v2.0：此前每次关键帧/视频生成都全量重分析，手动路径每镜一次 AI 调用，浪费且慢
    const cachedRow = db.prepare('SELECT analysis_json, updated_at, model_used, video_skill FROM script_analysis WHERE episode_id = ?').get(episodeId) as any;
    if (cachedRow && !opts?.forceRefresh) {
      const episodeUpdated = new Date(episode.updated_at || 0).getTime();
      const cachedUpdated = new Date(cachedRow.updated_at || 0).getTime();
      // 重构式：分析保持纯导演视角，不随视频模型变化重分析（换模型只重跑提示词重构层，省额度）
      if (episodeUpdated <= cachedUpdated) {
        try {
          const parsed = JSON.parse(cachedRow.analysis_json);
          if (parsed && parsed.plotStructure) {
            console.log(`[ScriptAnalysis] 命中缓存（${cachedRow.model_used || '未知模型'}）`);
            return parsed as ScriptAnalysisResult;
          }
        } catch {
          // 缓存损坏，重新分析
        }
      } else {
        console.log('[ScriptAnalysis] 剧本已更新，重新分析');
      }
    }

    // 模型解析：优先显式传入，否则取用户第一个文本模型
    // v2.0：此前硬编码 doubao/default，用户未配置该模型名时 MODEL_NOT_CONFIGURED 必然抛错，
    // 手动路径的剧本分析优化从未真正生效
    let provider = opts?.provider;
    let modelName = opts?.modelName;
    if (!provider || !modelName) {
      const textModels = ModelRegistryDAO.listByUserAndType(db, userId, 'text');
      const preferred = textModels.find(m => ['doubao', 'deepseek', 'zhipu', 'qwen', 'minimax'].includes(m.provider))
        || textModels[0];
      if (preferred) {
        provider = preferred.provider;
        modelName = preferred.model_name;
      }
    }
    if (!provider || !modelName) {
      throw new Error('未配置文本模型，无法进行剧本分析');
    }

    // 获取角色和场景信息（辅助分析）
    const characters = ScriptCharacterDAO.listByEpisode(db, episodeId);
    const scenes = ScriptSceneDAO.listByEpisode(db, episodeId);

    // 构建上下文
    let context = '';
    if (characters.length > 0) {
      context += '\n\n## 已提取角色\n';
      characters.forEach(c => {
        context += `- ${c.name} (${c.gender || '未知'}): ${c.description || c.visual_description || '无描述'}\n`;
      });
    }
    if (scenes.length > 0) {
      context += '\n## 已提取场景\n';
      scenes.forEach(s => {
        context += `- ${s.name}: ${s.location || ''} (${s.time_of_day || '未知时段'})\n`;
      });
    }

    const fullPrompt = ANALYSIS_PROMPT + episode.script_content + context;

    // 调用AI分析 + JSON 解析失败自动重试（AI 输出偶发含未转义引号/裸换行导致解析失败）
    // 最多 3 次尝试：重新生成通常能得到规范 JSON，比无限加固解析器更可靠
    const MAX_AI_TRIES = 3;
    let analysis: ScriptAnalysisResult | null = null;
    let lastParseError = '';
    for (let attempt = 1; attempt <= MAX_AI_TRIES && !analysis; attempt++) {
      if (attempt > 1) {
        console.log(`[ScriptAnalysis] JSON 解析失败，第 ${attempt}/${MAX_AI_TRIES} 次重试: ${lastParseError.slice(0, 100)}`);
      }
      const result = await aiProxy.generateText({
        db,
        userId,
        provider,
        modelName,
        prompt: fullPrompt,
        systemPrompt: applySkillRules(
          '你是一位专业的影视剧本分析师，擅长从剧情、场景、角色、情绪、节奏、视觉风格等多个维度深度拆解剧本。输出严格的JSON格式。',
          promptSkill, 'shotRule'
        ) + '\n\n【转换质量硬性要求】以上分析结果将直接转化为当前视频模型的官方提示词输入：1) 所有描述语句必须通顺完整，禁止碎片化关键词堆砌；2) 场景/角色/分镜描述必须按上述官方提示词规范组织；3) 人物外观（面容/发型/服装/体型）、场景陈设、关键道具的描述词必须在全部分析结果中保持一致，供后续生成分镜、概念图与视频时跨镜头复用，保证剧情连贯与资产一致性。',
        temperature: 0.3,  // 低温度保证分析准确性
        maxTokens: 8000,   // v1.1：4000→8000，降低长剧本分析 JSON 被截断导致解析失败的概率
        responseFormat: 'json',
      });

      // 解析JSON结果
      try {
        analysis = parseAiJsonOrThrow<ScriptAnalysisResult>(result.content);
      } catch (e) {
        lastParseError = (e as Error).message;
        if (attempt === MAX_AI_TRIES) throw e;
      }
    }
    analysis = analysis as ScriptAnalysisResult;

    // 补充元数据
    analysis.analyzedAt = new Date().toISOString();
    analysis.episodeId = episodeId;

    console.log(`[ScriptAnalysis] 分析完成`);
    console.log(`  - 情节节点: ${analysis.plotStructure?.plotPoints?.length || 0} 个`);
    console.log(`  - 场景分析: ${analysis.sceneAnalysis?.length || 0} 个`);
    console.log(`  - 角色分析: ${analysis.characterAnalysis?.length || 0} 个`);
    console.log(`  - 情绪曲线: ${analysis.emotionalCurve?.length || 0} 个节点`);
    console.log(`  - 推荐风格: ${analysis.visualStyleSuggestion?.recommendedStyle || '未指定'}`);

    // 写缓存（upsert，幂等）
    try {
      const ts = now();
      db.prepare(`INSERT INTO script_analysis (id, user_id, episode_id, analysis_json, model_used, video_skill, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(episode_id) DO UPDATE SET
          analysis_json = excluded.analysis_json,
          model_used = excluded.model_used,
          video_skill = excluded.video_skill,
          updated_at = excluded.updated_at`)
        .run(generateId('sana'), userId, episodeId, JSON.stringify(analysis), `${provider}/${modelName}`, promptSkill.id, ts, ts);
    } catch (cacheErr) {
      console.warn('[ScriptAnalysis] 缓存写入失败（不影响主流程）:', (cacheErr as Error).message);
    }

    return analysis;
  },

  /**
   * 分析单个镜头的上下文（用于关键帧/视频生成前的细化分析）
   * @param db 数据库实例
   * @param shotId 镜头ID
   * @param userId 用户ID
   * @param scriptAnalysis 已有的剧本分析结果（可选）
   * @returns 镜头上下文分析
   */
  async analyzeShotContext(
    db: Database,
    shotId: string,
    userId: string,
    scriptAnalysis?: ScriptAnalysisResult
  ): Promise<{
    shotDescription: string;
    emotionalContext: string;
    visualContext: string;
    pacingContext: string;
    characterContext: string;
    sceneContext: string;
  }> {
    const shot = ShotDAO.getById(db, shotId);
    if (!shot) {
      throw new Error(`镜头不存在: ${shotId}`);
    }

    // 基础信息
    const result = {
      shotDescription: shot.action_description || '',
      emotionalContext: '',
      visualContext: '',
      pacingContext: '',
      characterContext: '',
      sceneContext: '',
    };

    // 如果有剧本分析结果，从中提取上下文
    if (scriptAnalysis) {
      // 情绪上下文
      if (scriptAnalysis.emotionalCurve && scriptAnalysis.emotionalCurve.length > 0) {
        // 找到最接近的情绪节点
        const shotIndex = shot.shot_number || 0;
        const curveIndex = Math.min(
          Math.floor((shotIndex / Math.max(1, (scriptAnalysis.emotionalCurve.length || 1))) * scriptAnalysis.emotionalCurve.length),
          scriptAnalysis.emotionalCurve.length - 1
        );
        const emotionPoint = scriptAnalysis.emotionalCurve[curveIndex];
        if (emotionPoint) {
          result.emotionalContext = `当前情绪：${emotionPoint.emotion}，强度${emotionPoint.intensity}/10，节奏${emotionPoint.pacing}`;
          result.pacingContext = `推荐节奏：${emotionPoint.pacing}`;
        }
      }

      // 视觉上下文
      if (scriptAnalysis.visualStyleSuggestion) {
        result.visualContext = `视觉风格：${scriptAnalysis.visualStyleSuggestion.recommendedStyle}，色调：${scriptAnalysis.visualStyleSuggestion.colorPalette}，光线：${scriptAnalysis.visualStyleSuggestion.lightingMood}`;
      }

      // 角色上下文
      if (scriptAnalysis.characterAnalysis && scriptAnalysis.characterAnalysis.length > 0) {
        const charNames = scriptAnalysis.characterAnalysis.map(c => c.characterName);
        // 检查镜头描述中包含哪些角色
        const shotChars = charNames.filter(name =>
          shot.action_description?.includes(name) || shot.dialogue?.includes(name)
        );
        if (shotChars.length > 0) {
          const charDetails = scriptAnalysis.characterAnalysis
            .filter(c => shotChars.includes(c.characterName))
            .map(c => `${c.characterName}(${c.role}): ${c.visualTraits || c.personality}`)
            .join('; ');
          result.characterContext = `出场角色：${charDetails}`;
        }
      }
    }

    return result;
  },

  /**
   * 获取分析结果的摘要（用于日志显示）
   */
  getAnalysisSummary(analysis: ScriptAnalysisResult): string {
    return [
      `主题: ${analysis.plotStructure?.theme || '未知'}`,
      `情节节点: ${analysis.plotStructure?.plotPoints?.length || 0}个`,
      `场景: ${analysis.sceneAnalysis?.length || 0}个`,
      `角色: ${analysis.characterAnalysis?.length || 0}个`,
      `情绪节点: ${analysis.emotionalCurve?.length || 0}个`,
      `推荐风格: ${analysis.visualStyleSuggestion?.recommendedStyle || '未指定'}`,
      `整体节奏: ${analysis.rhythmAnalysis?.overallPacing || '未知'}`,
    ].join(' | ');
  },
};
