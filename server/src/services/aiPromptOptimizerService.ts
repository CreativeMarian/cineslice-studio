// AI 驱动的深度提示词优化服务 v1.0
// 让 AI 关联剧本上下文，深度分析每个镜头的剧情、角色、情绪、动作，然后生成优化后的提示词
// 不是模板化，而是真正的 AI 理解和分析

import type { Database } from '../types';
import { aiProxy } from './aiProxy';
import { ModelRegistryDAO } from '../models';
import { applyStageRules } from './stageSkills';
import type { DirectorShotContext } from './directorPromptService';

// ═══════════════════════════════════════════════════════════════
// 类型定义
// ═══════════════════════════════════════════════════════════════

export interface AIOptimizedPrompt {
  /** 优化后的正面提示词 */
  prompt: string;
  /** 优化后的负面提示词 */
  negativePrompt: string;
  /** AI 的分析说明（为什么这样优化） */
  analysis: string;
  /** 动作分解（AI 分析的动作时序） */
  actionBreakdown: string[];
  /** 表情细节（AI 分析的表情变化） */
  expressionDetails: string;
  /** 心理活动（AI 分析的角色内心活动→外在表现） */
  psychology: string;
  /** 连贯性约束（AI 分析的前后镜头衔接） */
  continuity: string;
  /** 真实性校验（AI 分析的物理/生理/逻辑合理性） */
  realityCheck: string;
}

export interface ScriptContextForAI {
  /** 剧本标题 */
  title?: string;
  /** 剧本简介 */
  synopsis?: string;
  /** 主题 */
  theme?: string;
  /** 整体风格 */
  style?: string;
  /** 所有角色信息 */
  characters: Array<{
    name: string;
    role: string; // protagonist/antagonist/supporting
    personality: string;
    appearance: string;
    emotionalArc: string;
  }>;
  /** 所有场景信息 */
  scenes: Array<{
    name: string;
    location: string;
    timeOfDay: string;
    weather: string;
    atmosphere: string;
    description: string;
  }>;
  /** 情绪曲线 */
  emotionalCurve?: Array<{
    sceneIndex: number;
    sceneName: string;
    emotion: string;
    intensity: number;
    pacing: string;
  }>;
  /** 关键情节节点 */
  plotPoints?: Array<{
    index: number;
    type: string;
    description: string;
    emotionalWeight: string;
  }>;
}

// ═══════════════════════════════════════════════════════════════
// System Prompt：指导 AI 如何深度分析和优化提示词
// ═══════════════════════════════════════════════════════════════

const AI_OPTIMIZER_SYSTEM_PROMPT = `你是一位资深的电影导演和提示词工程师，擅长将剧本转化为精准的视频生成提示词。

## 你的任务
基于完整的剧本上下文，深度分析当前镜头的剧情、角色、情绪、动作，然后生成一份电影级的视频生成提示词。

## 核心原则
1. **剧情连贯性优先**：每个镜头不是孤立的，必须与前后镜头紧密衔接，角色位置、状态、情绪、道具必须连贯
2. **动作真实性**：所有动作必须符合物理规律和人体生理，不能出现无厘头动作（如凭空挨耳光、打电话还在点屏幕）
3. **角色一致性**：同一角色在所有镜头中外貌、服装、发型、性格必须严格一致
4. **情绪连续性**：角色情绪必须自然过渡，不能突然从悲伤变为开心
5. **细节决定质量**：提示词必须包含足够的细节（微动作、微表情、物体交互、光影变化）

## 分析维度
你必须从以下7个维度深度分析每个镜头：

### 1. 剧情定位分析
- 这个镜头在整个剧情中的位置（开头/发展/高潮/结尾）
- 这个镜头的剧情作用（交代环境/推进剧情/表现情绪/制造悬念）
- 前一个镜头发生了什么，当前镜头如何承接
- 后一个镜头将要发生什么，当前镜头如何铺垫

### 2. 动作时序分解
将当前镜头的动作分解为精确的时间序列：
- 0-X秒：什么动作（准备/开始）
- X-Y秒：什么动作（主要进行）
- Y-Z秒：什么动作（收尾/结束）
每个动作必须包含：
- 具体的身体部位动作（手、脚、头、身体）
- 动作的幅度和速度
- 与物体的交互方式（握持、触摸、推动等）
- 动作的因果关系（先做什么，后做什么，为什么）

### 3. 表情细节分析
描述角色在整个镜头中的表情变化：
- 面部肌肉变化（眉头、眼睛、嘴角、下颌）
- 微动作（眨眼、吞咽、呼吸、鼻翼翕动）
- 眼神变化（注视方向、瞳孔变化、眼神情绪）
- 表情随时间的变化（起始表情→中间表情→结束表情）

### 4. 心理活动分析
分析角色当前的内心活动，并转化为可见的外在表现：
- 角色在想什么（内心独白）
- 这种想法如何通过外在表现出来（表情、动作、姿态）
- 角色的潜意识反应（紧张时的小动作、焦虑时的踱步等）
- 心理活动与剧情的关联（为什么会有这种想法）

### 5. 连贯性约束
明确列出当前镜头必须遵守的连贯性约束：
- 角色位置：与前一个镜头的位置关系（从哪里来，到哪里去）
- 角色状态：服装、发型、道具、身体状态（受伤、疲惫等）必须与前后镜头一致
- 环境状态：光线、天气、家具布置必须与前后镜头一致
- 情绪状态：必须自然承接前一个镜头的情绪，为后一个镜头的情绪铺垫
- 角色数量：出场角色必须与剧情一致，不能突然出现或消失

### 6. 真实性校验
检查并列出必须遵守的真实性规则：
- 物理规律：重力、惯性、碰撞、液体流动等必须正确
- 生理规律：人体解剖、关节活动范围、呼吸、表情肌肉等必须正确
- 动作逻辑：动作必须有因果关系，不能出现无厘头动作（如凭空挨耳光）
- 物体交互：手与物体的接触点、握持方式、操作方式必须符合实际
- 时序逻辑：动作必须有先后顺序，不能颠倒（如拨号完成后还在点屏幕）

### 7. 负面提示词
列出必须避免的常见错误：
- 动作错误（无厘头动作、时序错误、物体穿模）
- 角色错误（变脸、换装、角色突然出现/消失）
- 场景错误（环境突变、光照不一致、家具移动）
- 情绪错误（情绪突变、表情与动作不符）
- 物理错误（反重力、物体漂浮、无惯性）

## 输出格式
你必须以 JSON 格式输出，包含以下字段：
{
  "analysis": "你的深度分析说明（为什么这样优化，这个镜头的关键是什么）",
  "actionBreakdown": ["0-2秒：...", "2-4秒：...", "4-5秒：..."],
  "expressionDetails": "详细的表情变化描述",
  "psychology": "心理活动分析及外在表现",
  "continuity": "连贯性约束列表",
  "realityCheck": "真实性校验列表",
  "prompt": "优化后的完整正面提示词（包含所有分析维度的细节）",
  "negativePrompt": "优化后的负面提示词（必须避免的错误）"
}

## 重要提醒
- 不要生成模板化的内容，每个镜头的分析必须是独特的、基于剧本上下文的
- 不要遗漏任何细节，细节越多，生成的视频质量越高
- 特别注意动作的因果关系和时序，这是最容易出错的地方
- 特别注意角色连贯性，这是观众最容易察觉到的问题
- 如果当前镜头有对话，要描述说话时的嘴部动作和表情变化`;

// ═══════════════════════════════════════════════════════════════
// 服务实现
// ═══════════════════════════════════════════════════════════════

export const aiPromptOptimizerService = {
  /**
   * AI 深度优化视频生成提示词
   * @param db 数据库连接
   * @param userId 用户ID
   * @param shotContext 镜头上下文（包含前后镜头信息）
   * @param scriptContext 剧本上下文（整个剧本的剧情、角色、场景等）
   * @returns AI 优化后的提示词
   */
  async optimizeVideoPrompt(
    db: Database,
    userId: string,
    shotContext: DirectorShotContext,
    scriptContext: ScriptContextForAI
  ): Promise<AIOptimizedPrompt> {
    console.log(`[AIPromptOptimizer] 开始AI深度优化提示词: shot=${shotContext.shotNumber}`);

    // 1. 获取可用的文本模型
    const textModel = this.getAvailableTextModel(db, userId);
    if (!textModel) {
      console.warn('[AIPromptOptimizer] 无可用文本模型，使用默认提示词');
      return this.getFallbackPrompt(shotContext);
    }

    // 2. 构建 user prompt
    const userPrompt = this.buildUserPrompt(shotContext, scriptContext);

    // 3. 调用 AI 进行深度分析和提示词优化
    try {
      const result = await aiProxy.generateText({
        db,
        userId,
        provider: textModel.provider,
        modelName: textModel.modelName,
        systemPrompt: AI_OPTIMIZER_SYSTEM_PROMPT,
        prompt: userPrompt,
        temperature: 0.3, // 低温度，保证分析的准确性和一致性
        maxTokens: 4000,
      });

      // 4. 解析 AI 返回的 JSON
      const optimized = this.parseAIResponse(result.content);
      console.log(`[AIPromptOptimizer] AI优化完成: shot=${shotContext.shotNumber}, ${optimized.actionBreakdown.length}个动作分解`);
      return optimized;
    } catch (err) {
      console.error('[AIPromptOptimizer] AI优化失败，使用默认提示词:', (err as Error).message);
      return this.getFallbackPrompt(shotContext);
    }
  },

  /**
   * AI 深度优化关键帧生成提示词
   * 与视频提示词优化类似，但针对静态画面（首帧）进行优化
   */
  async optimizeKeyframePrompt(
    db: Database,
    userId: string,
    shotContext: DirectorShotContext,
    scriptContext: ScriptContextForAI
  ): Promise<AIOptimizedPrompt> {
    console.log(`[AIPromptOptimizer] 开始AI深度优化关键帧提示词: shot=${shotContext.shotNumber}`);

    // 1. 获取可用的文本模型
    const textModel = this.getAvailableTextModel(db, userId);
    if (!textModel) {
      console.warn('[AIPromptOptimizer] 无可用文本模型，使用默认提示词');
      return this.getFallbackPrompt(shotContext);
    }

    // 2. 构建 user prompt（关键帧版本）
    const userPrompt = this.buildKeyframeUserPrompt(shotContext, scriptContext);

    // 3. 关键帧专用的 system prompt（强调静态画面的构图、光影、细节）
    const keyframeSystemPrompt = AI_OPTIMIZER_SYSTEM_PROMPT + `

## 关键帧优化特别说明
这是关键帧（视频首帧）的提示词优化，不是视频运动提示词。
关键帧是静态画面，需要特别注意：
1. **构图**：画面构图必须精美，主体突出，留白合理，符合电影级构图法则
2. **光影**：光线方向、强度、色温必须准确，阴影必须自然，有明显的光影对比
3. **细节**：画面细节必须丰富（纹理、材质、景深、背景），不能有模糊或缺失
4. **角色状态**：这是动作开始的瞬间，角色的姿态、表情、位置必须准确反映动作的起始状态
5. **场景氛围**：场景的氛围、色调、光线必须与剧情情绪匹配
6. **连贯性**：这是视频的首帧，必须为后续的视频运动提供准确的参考`;

    // 4. 调用 AI 进行深度分析和提示词优化
    try {
      const result = await aiProxy.generateText({
        db,
        userId,
        provider: textModel.provider,
        modelName: textModel.modelName,
        systemPrompt: applyStageRules(keyframeSystemPrompt, 'keyframes'),
        prompt: userPrompt,
        temperature: 0.3,
        maxTokens: 4000,
      });

      // 5. 解析 AI 返回的 JSON
      const optimized = this.parseAIResponse(result.content);
      console.log(`[AIPromptOptimizer] 关键帧AI优化完成: shot=${shotContext.shotNumber}`);
      return optimized;
    } catch (err) {
      console.error('[AIPromptOptimizer] 关键帧AI优化失败，使用默认提示词:', (err as Error).message);
      return this.getFallbackPrompt(shotContext);
    }
  },

  /**
   * 构建关键帧专用的 user prompt
   */
  buildKeyframeUserPrompt(
    shotContext: DirectorShotContext,
    scriptContext: ScriptContextForAI
  ): string {
    // 复用视频的 user prompt 构建逻辑，但添加关键帧特别说明
    const basePrompt = this.buildUserPrompt(shotContext, scriptContext);

    return basePrompt + `

## 关键帧特别说明
这是视频的首帧（关键帧），是静态画面，不是视频运动。
请优化这个静态画面的提示词，特别注意：
1. 这是动作开始的瞬间，捕捉动作的起始状态
2. 构图必须精美，主体突出，符合电影级构图
3. 光影必须准确，有明显的光影对比和氛围
4. 细节必须丰富，纹理、材质、景深、背景都要清晰
5. 角色的姿态、表情、位置必须准确，为后续视频运动提供参考`;
  },

  /**
   * 构建 user prompt
   */
  buildUserPrompt(
    shotContext: DirectorShotContext,
    scriptContext: ScriptContextForAI
  ): string {
    const parts: string[] = [];

    // 剧本整体上下文
    parts.push('## 剧本整体上下文');
    if (scriptContext.title) parts.push(`标题：${scriptContext.title}`);
    if (scriptContext.synopsis) parts.push(`简介：${scriptContext.synopsis}`);
    if (scriptContext.theme) parts.push(`主题：${scriptContext.theme}`);
    if (scriptContext.style) parts.push(`整体风格：${scriptContext.style}`);

    // 角色信息
    parts.push('\n## 所有角色信息');
    scriptContext.characters.forEach(char => {
      parts.push(`- ${char.name}（${char.role}）：性格[${char.personality}]，外貌[${char.appearance}]，情绪弧线[${char.emotionalArc}]`);
    });

    // 场景信息
    parts.push('\n## 所有场景信息');
    scriptContext.scenes.forEach(scene => {
      parts.push(`- ${scene.name}：地点[${scene.location}]，时段[${scene.timeOfDay}]，天气[${scene.weather}]，氛围[${scene.atmosphere}]，描述[${scene.description}]`);
    });

    // 情绪曲线
    if (scriptContext.emotionalCurve && scriptContext.emotionalCurve.length > 0) {
      parts.push('\n## 情绪曲线');
      scriptContext.emotionalCurve.forEach(point => {
        parts.push(`- 场景${point.sceneIndex}（${point.sceneName}）：情绪[${point.emotion}]，强度${point.intensity}/10，节奏[${point.pacing}]`);
      });
    }

    // 关键情节节点
    if (scriptContext.plotPoints && scriptContext.plotPoints.length > 0) {
      parts.push('\n## 关键情节节点');
      scriptContext.plotPoints.forEach(point => {
        parts.push(`${point.index}. [${point.type}/${point.emotionalWeight}] ${point.description}`);
      });
    }

    // 当前镜头信息
    parts.push('\n## 当前镜头信息');
    parts.push(`镜头编号：${shotContext.shotNumber}/${shotContext.totalShots}`);
    parts.push(`时长：${shotContext.duration}秒`);
    parts.push(`景别：${shotContext.shotSize}`);
    parts.push(`镜头运动：${shotContext.cameraMovement}`);
    parts.push(`动作描述：${shotContext.actionDescription}`);
    if (shotContext.dialogue) parts.push(`对话：${shotContext.dialogue}`);
    if (shotContext.sceneName) parts.push(`场景：${shotContext.sceneName}`);
    if (shotContext.sceneDescription) parts.push(`场景描述：${shotContext.sceneDescription}`);
    if (shotContext.timeOfDay) parts.push(`时段：${shotContext.timeOfDay}`);
    if (shotContext.weather) parts.push(`天气：${shotContext.weather}`);
    if (shotContext.mood) parts.push(`情绪：${shotContext.mood}`);

    // 出场角色
    if (shotContext.charactersInShot && shotContext.charactersInShot.length > 0) {
      parts.push(`出场角色：${shotContext.charactersInShot.join('、')}`);
      if (shotContext.characterDetails) {
        parts.push('角色详细信息：');
        shotContext.charactersInShot.forEach(name => {
          const detail = shotContext.characterDetails?.[name];
          if (detail) {
            parts.push(`- ${name}：${detail.appearance || '外貌未指定'}，${detail.personality || '性格未指定'}`);
          }
        });
      }
    }

    // 前后镜头上下文（关键！）
    parts.push('\n## 前后镜头上下文（必须严格衔接）');
    if (shotContext.previousShotAction) {
      parts.push(`前一个镜头动作：${shotContext.previousShotAction}`);
    } else {
      parts.push('前一个镜头：无（这是第一个镜头）');
    }
    if (shotContext.nextShotAction) {
      parts.push(`后一个镜头动作：${shotContext.nextShotAction}`);
    } else {
      parts.push('后一个镜头：无（这是最后一个镜头）');
    }

    // 任务指令
    parts.push('\n## 任务');
    parts.push('请基于以上完整的剧本上下文，深度分析当前镜头，然后生成电影级的视频生成提示词。');
    parts.push('特别注意：');
    parts.push('1. 动作必须有因果关系和时序，不能出现无厘头动作（如凭空挨耳光、打电话还在点屏幕）');
    parts.push('2. 角色必须与前后镜头连贯，不能突然出现或消失，不能变脸换装');
    parts.push('3. 情绪必须自然过渡，不能突变');
    parts.push('4. 所有动作必须符合物理规律和人体生理');
    parts.push('5. 提示词必须包含足够的细节（微动作、微表情、物体交互、光影变化）');

    return parts.join('\n');
  },

  /**
   * 解析 AI 返回的 JSON
   */
  parseAIResponse(responseText: string): AIOptimizedPrompt {
    // 尝试提取 JSON（AI 可能在 JSON 前后有其他文字）
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('AI 返回内容中未找到 JSON');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      analysis: parsed.analysis || '',
      actionBreakdown: Array.isArray(parsed.actionBreakdown) ? parsed.actionBreakdown : [],
      expressionDetails: parsed.expressionDetails || '',
      psychology: parsed.psychology || '',
      continuity: parsed.continuity || '',
      realityCheck: parsed.realityCheck || '',
      prompt: parsed.prompt || '',
      negativePrompt: parsed.negativePrompt || '',
    };
  },

  /**
   * 获取可用的文本模型
   */
  getAvailableTextModel(db: Database, userId: string): { provider: string; modelName: string } | null {
    try {
      const models = ModelRegistryDAO.listByUser(db, userId);
      const textModel = models.find(m => m.model_type === 'text' && m.is_active && m.api_key);
      if (textModel) {
        return { provider: textModel.provider, modelName: textModel.model_name };
      }
      return null;
    } catch {
      return null;
    }
  },

  /**
   * 降级方案：AI 不可用时使用默认提示词
   */
  getFallbackPrompt(shotContext: DirectorShotContext): AIOptimizedPrompt {
    const prompt = `【景别】${shotContext.shotSize}。【镜头运动】${shotContext.cameraMovement}。【画面内容】${shotContext.actionDescription}。【时长】${shotContext.duration}秒。`;
    const negativePrompt = '低质量，模糊，变形，多余手指，面部扭曲，换脸，角色不匹配，动作时序错误，物体穿模，反重力，场景错误，光照不一致，角色突然出现，角色突然消失，情绪突变';

    return {
      analysis: 'AI 优化不可用，使用默认提示词',
      actionBreakdown: [shotContext.actionDescription],
      expressionDetails: '',
      psychology: '',
      continuity: '',
      realityCheck: '',
      prompt,
      negativePrompt,
    };
  },

  /**
   * 从剧本分析结果构建 AI 用的剧本上下文
   */
  buildScriptContextFromAnalysis(analysis: any): ScriptContextForAI {
    return {
      title: analysis?.title || '',
      synopsis: analysis?.synopsis || '',
      theme: analysis?.plotStructure?.theme || '',
      style: analysis?.visualStyleSuggestion?.recommendedStyle || '',
      characters: (analysis?.characterAnalysis || []).map((c: any) => ({
        name: c.characterName,
        role: c.role,
        personality: c.personality || '',
        appearance: c.visualTraits || c.description || '',
        emotionalArc: c.emotionalArc || '',
      })),
      scenes: (analysis?.sceneAnalysis || []).map((s: any) => ({
        name: s.sceneName,
        location: s.location || '',
        timeOfDay: s.timeOfDay || '',
        weather: s.weather || '',
        atmosphere: (s.atmosphere || []).join('/'),
        description: s.description || s.location || '',
      })),
      emotionalCurve: analysis?.emotionalCurve || [],
      plotPoints: analysis?.plotStructure?.plotPoints || [],
    };
  },
};
