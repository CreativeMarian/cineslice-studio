// 提示词优化服务 v1.0
// 基于剧本分析结果，优化和细化分镜生成、关键帧生成、视频生成的提示词
// 在传入AI生成之前调用，提升生成质量和一致性

import type { ScriptAnalysisResult } from './scriptAnalysisService';

// ═══════════════════════════════════════════════════════════════
// 类型定义
// ═══════════════════════════════════════════════════════════════

export interface OptimizedPrompt {
  /** 优化后的提示词 */
  prompt: string;
  /** 负面提示词 */
  negativePrompt?: string;
  /** 优化说明（做了哪些优化） */
  optimizations: string[];
  /** 使用的分析维度 */
  usedDimensions: string[];
}

export interface ShotContext {
  shotNumber: number;
  actionDescription: string;
  dialogue: string;
  shotSize: string;
  cameraMovement: string;
  duration: number;
  charactersInShot: string[];
  sceneName?: string;
}

// ═══════════════════════════════════════════════════════════════
// 通用负面提示词
// ═══════════════════════════════════════════════════════════════

const COMMON_NEGATIVE_PROMPTS = [
  // 画质问题
  '低质量，模糊，变形，噪点，压缩痕迹，色带，锯齿，画面撕裂',
  // 人物问题
  '多余手指，多余肢体，手指融合，手部畸形，面部扭曲，五官错位，换脸，角色不匹配',
  '塑料皮肤，蜡像质感，恐怖谷，过度光滑，AI伪影，CG感',
  // 场景问题
  '背景闪烁，背景变形，家具移动，光照不一致，阴影方向错误',
  '场景错误，物体位置错误，透视错误',
  // 物理问题
  '反重力，物体漂浮，液体逆流，无惯性运动，瞬间加速',
  // 镜头问题
  '错误镜头角度，糟糕构图，平光，无景深，动作场景固定镜头',
];

// ═══════════════════════════════════════════════════════════════
// 服务实现
// ═══════════════════════════════════════════════════════════════

export const promptOptimizationService = {
  /**
   * 优化分镜生成提示词
   * @param originalPrompt 原始分镜提示词
   * @param scriptAnalysis 剧本分析结果
   * @returns 优化后的提示词
   */
  optimizeShotPrompt(
    originalPrompt: string,
    scriptAnalysis?: ScriptAnalysisResult
  ): OptimizedPrompt {
    const optimizations: string[] = [];
    const usedDimensions: string[] = [];
    let enhancedPrompt = originalPrompt;

    if (scriptAnalysis) {
      // 1. 注入剧情结构和主题
      if (scriptAnalysis.plotStructure) {
        const theme = scriptAnalysis.plotStructure.theme;
        if (theme) {
          enhancedPrompt += `\n\n## 剧本主题\n${theme}`;
          optimizations.push('注入剧本主题');
          usedDimensions.push('plotStructure.theme');
        }

        // 注入关键情节节点
        if (scriptAnalysis.plotStructure.plotPoints && scriptAnalysis.plotStructure.plotPoints.length > 0) {
          const plotPointsText = scriptAnalysis.plotStructure.plotPoints
            .map(p => `${p.index}. [${p.type}/${p.emotionalWeight}] ${p.description}`)
            .join('\n');
          enhancedPrompt += `\n\n## 关键情节节点（分镜必须覆盖这些节点）\n${plotPointsText}`;
          optimizations.push('注入关键情节节点，确保分镜覆盖剧情关键点');
          usedDimensions.push('plotStructure.plotPoints');
        }
      }

      // 2. 注入场景分析
      if (scriptAnalysis.sceneAnalysis && scriptAnalysis.sceneAnalysis.length > 0) {
        const sceneText = scriptAnalysis.sceneAnalysis
          .map(s => `- ${s.sceneName} (${s.location}, ${s.timeOfDay}): 氛围[${s.atmosphere.join('/')}], 光线[${s.lighting}], 情绪[${s.emotionalTone}], 道具[${s.keyProps.join('/')}]`)
          .join('\n');
        enhancedPrompt += `\n\n## 场景分析（分镜场景必须与此一致）\n${sceneText}`;
        optimizations.push('注入场景分析，确保场景氛围/光线/道具一致');
        usedDimensions.push('sceneAnalysis');
      }

      // 3. 注入角色分析
      if (scriptAnalysis.characterAnalysis && scriptAnalysis.characterAnalysis.length > 0) {
        const charText = scriptAnalysis.characterAnalysis
          .filter(c => c.role === 'protagonist' || c.role === 'antagonist' || c.role === 'supporting')
          .map(c => `- ${c.characterName} (${c.role}): ${c.personality} | 视觉特征: ${c.visualTraits || '未指定'} | 情绪弧线: ${c.emotionalArc}`)
          .join('\n');
        enhancedPrompt += `\n\n## 角色分析（分镜中角色行为/外貌必须与此一致）\n${charText}`;
        optimizations.push('注入角色分析，确保角色性格/视觉特征/情绪弧线一致');
        usedDimensions.push('characterAnalysis');
      }

      // 4. 注入节奏分析
      if (scriptAnalysis.rhythmAnalysis) {
        const rhythm = scriptAnalysis.rhythmAnalysis;
        enhancedPrompt += `\n\n## 节奏指导\n整体节奏: ${rhythm.overallPacing}\n推荐镜头时长: ${rhythm.recommendedShotDuration}\n动作/对话比例: ${rhythm.actionVsDialogueRatio}\n节拍结构: ${rhythm.beatStructure}`;
        optimizations.push('注入节奏分析，指导镜头时长和剪辑节奏');
        usedDimensions.push('rhythmAnalysis');
      }

      // 5. 注入视觉风格建议
      if (scriptAnalysis.visualStyleSuggestion) {
        const vs = scriptAnalysis.visualStyleSuggestion;
        enhancedPrompt += `\n\n## 视觉风格指导\n推荐风格: ${vs.recommendedStyle}\n色调: ${vs.colorPalette}\n光线氛围: ${vs.lightingMood}\n镜头语言: ${vs.cameraLanguage}\n视觉母题: ${vs.keyMotifs?.join(', ') || '无'}`;
        optimizations.push('注入视觉风格建议，统一全片视觉风格');
        usedDimensions.push('visualStyleSuggestion');
      }

      // 6. 注入情绪曲线
      if (scriptAnalysis.emotionalCurve && scriptAnalysis.emotionalCurve.length > 0) {
        const emotionText = scriptAnalysis.emotionalCurve
          .map(e => `场景${e.sceneIndex} [${e.sceneName}]: 情绪=${e.emotion}, 强度=${e.intensity}/10, 节奏=${e.pacing}`)
          .join('\n');
        enhancedPrompt += `\n\n## 情绪曲线（分镜情绪强度和节奏应与此曲线匹配）\n${emotionText}`;
        optimizations.push('注入情绪曲线，指导分镜情绪强度和节奏');
        usedDimensions.push('emotionalCurve');
      }
    }

    // 7. 添加分镜生成的核心原则
    enhancedPrompt += `\n\n## 分镜生成核心原则
1. 严格遵循剧本情节，不得遗漏或修改关键剧情
2. 每个镜头必须标注景别(shot_size)、镜头运动(camera_movement)、时长(duration_seconds)
3. 对话场景使用正反打(shot/reverse shot)，动作场景使用中景+特写组合
4. 动作描述必须包含因果时序（先攻击后受击，不可颠倒）
5. 前后镜头角色位置和状态连贯，服装发型一致
6. 输出 characters_in_shot 字段，列出该镜头出现的角色名（用于人物一致性）
7. 输出 subject 字段，标注镜头主体`;

    optimizations.push('添加分镜生成核心原则（7条）');

    return {
      prompt: enhancedPrompt,
      negativePrompt: COMMON_NEGATIVE_PROMPTS.join('，'),
      optimizations,
      usedDimensions,
    };
  },

  /**
   * 优化关键帧生成提示词
   * @param originalPrompt 原始关键帧提示词
   * @param shotContext 镜头上下文
   * @param scriptAnalysis 剧本分析结果
   * @param stylePreset 风格预设（可选）
   * @returns 优化后的提示词
   */
  optimizeKeyframePrompt(
    originalPrompt: string,
    shotContext: ShotContext,
    scriptAnalysis?: ScriptAnalysisResult,
    stylePreset?: { visualStyle: string; colorPalette: string; cameraLanguage: string }
  ): OptimizedPrompt {
    const optimizations: string[] = [];
    const usedDimensions: string[] = [];
    let enhancedPrompt = originalPrompt;

    // 1. 注入风格预设
    if (stylePreset) {
      enhancedPrompt = `【统一风格】${stylePreset.visualStyle}\n\n【色调】${stylePreset.colorPalette}\n\n${enhancedPrompt}`;
      optimizations.push('注入统一风格预设（visualStyle + colorPalette）');
      usedDimensions.push('stylePreset');
    }

    // 2. 注入镜头信息
    if (shotContext) {
      const shotInfo = [
        `镜头编号: ${shotContext.shotNumber}`,
        `景别: ${shotContext.shotSize}`,
        `镜头运动: ${shotContext.cameraMovement}`,
        `时长: ${shotContext.duration}秒`,
      ].join(' | ');
      enhancedPrompt += `\n\n【镜头参数】${shotInfo}`;
      optimizations.push('注入镜头参数（景别/运动/时长）');
      usedDimensions.push('shotContext.basic');
    }

    // 3. 从剧本分析中提取情绪上下文
    if (scriptAnalysis && scriptAnalysis.emotionalCurve && scriptAnalysis.emotionalCurve.length > 0) {
      const shotIndex = shotContext.shotNumber || 0;
      const curveIndex = Math.min(
        Math.floor((shotIndex / Math.max(1, scriptAnalysis.emotionalCurve.length)) * scriptAnalysis.emotionalCurve.length),
        scriptAnalysis.emotionalCurve.length - 1
      );
      const emotionPoint = scriptAnalysis.emotionalCurve[curveIndex];
      if (emotionPoint) {
        enhancedPrompt += `\n\n【情绪氛围】当前情绪: ${emotionPoint.emotion}，强度${emotionPoint.intensity}/10。画面光线、色调、构图应体现此情绪。`;
        optimizations.push(`注入情绪氛围（${emotionPoint.emotion}, 强度${emotionPoint.intensity}/10）`);
        usedDimensions.push('emotionalCurve');
      }
    }

    // 4. 从剧本分析中提取场景上下文
    if (scriptAnalysis && scriptAnalysis.sceneAnalysis && scriptAnalysis.sceneAnalysis.length > 0) {
      // 找到匹配的场景
      const matchedScene = scriptAnalysis.sceneAnalysis.find(
        s => shotContext.sceneName?.includes(s.sceneName) || s.sceneName.includes(shotContext.sceneName || '')
      ) || scriptAnalysis.sceneAnalysis[0];

      if (matchedScene) {
        enhancedPrompt += `\n\n【场景环境】地点: ${matchedScene.location}，时段: ${matchedScene.timeOfDay}，氛围: ${matchedScene.atmosphere.join('/')}，光线: ${matchedScene.lighting}，关键道具: ${matchedScene.keyProps.join('/')}`;
        optimizations.push(`注入场景环境（${matchedScene.sceneName}）`);
        usedDimensions.push('sceneAnalysis');
      }
    }

    // 5. 从剧本分析中提取角色上下文
    if (scriptAnalysis && scriptAnalysis.characterAnalysis && shotContext.charactersInShot && shotContext.charactersInShot.length > 0) {
      const matchedChars = scriptAnalysis.characterAnalysis.filter(
        c => shotContext.charactersInShot.includes(c.characterName)
      );
      if (matchedChars.length > 0) {
        const charInfo = matchedChars
          .map(c => `${c.characterName}: ${c.visualTraits || c.personality}`)
          .join('; ');
        enhancedPrompt += `\n\n【角色一致性】出场角色视觉特征必须严格遵循: ${charInfo}`;
        optimizations.push(`注入角色视觉特征（${matchedChars.map(c => c.characterName).join(', ')}）`);
        usedDimensions.push('characterAnalysis.visualTraits');
      }
    }

    // 6. 从剧本分析中提取视觉母题
    if (scriptAnalysis && scriptAnalysis.visualStyleSuggestion?.keyMotifs && scriptAnalysis.visualStyleSuggestion.keyMotifs.length > 0) {
      enhancedPrompt += `\n\n【视觉母题】画面中可融入以下重复视觉元素: ${scriptAnalysis.visualStyleSuggestion.keyMotifs.join(', ')}`;
      optimizations.push('注入视觉母题（重复出现的视觉元素）');
      usedDimensions.push('visualStyleSuggestion.keyMotifs');
    }

    // 7. 添加关键帧质量要求
    enhancedPrompt += `\n\n【质量要求】电影级画质，8K超高清，极致细节，浅景深，真实光影，物理级渲染，人物一致性，场景一致性，前后镜头连贯`;
    optimizations.push('添加关键帧质量要求');

    return {
      prompt: enhancedPrompt,
      negativePrompt: COMMON_NEGATIVE_PROMPTS.join('，'),
      optimizations,
      usedDimensions,
    };
  },

  /**
   * 优化视频生成提示词（motion prompt）
   * @param originalMotionPrompt 原始视频运动提示词
   * @param shotContext 镜头上下文
   * @param scriptAnalysis 剧本分析结果
   * @param stylePreset 风格预设（可选）
   * @returns 优化后的提示词
   */
  optimizeVideoPrompt(
    originalMotionPrompt: string,
    shotContext: ShotContext,
    scriptAnalysis?: ScriptAnalysisResult,
    stylePreset?: { visualStyle: string; colorPalette: string; cameraLanguage: string }
  ): OptimizedPrompt {
    const optimizations: string[] = [];
    const usedDimensions: string[] = [];

    // 构建结构化的视频运动提示词
    const motionParts: string[] = [];

    // 1. 景别
    const shotSizeLabels: Record<string, string> = {
      extreme_wide: '大远景，展现场景全貌',
      long: '远景，人物全身与环境',
      full: '全景，完整动作',
      medium: '中景，膝盖以上',
      medium_closeup: '近景，胸部以上',
      closeup: '特写，肩部以上，情绪聚焦',
      extreme_closeup: '大特写，细节强调',
    };
    const shotSizeDesc = shotSizeLabels[shotContext.shotSize] || '中景';
    motionParts.push(`【景别】${shotSizeDesc}`);
    optimizations.push('标准化景别描述');
    usedDimensions.push('shotContext.shotSize');

    // 2. 镜头运动
    const cameraMovementLabels: Record<string, string> = {
      push_in: '镜头缓慢推近，聚焦主体情绪',
      pull_out: '镜头缓慢拉远，展现场景环境',
      pan: '镜头水平摇移，跟随动作',
      tilt: '镜头垂直升降，揭示空间',
      truck: '摄像机平行移动跟随人物',
      crane: '镜头升降运动，宏大场面',
      handheld: '手持镜头，轻微晃动，纪实紧张感',
      steadicam: '稳定器平滑跟随，长镜头',
      static: '固定镜头，稳定画面',
    };
    const cameraDesc = cameraMovementLabels[shotContext.cameraMovement] || '固定镜头';
    motionParts.push(`【镜头运动】${cameraDesc}`);
    optimizations.push('标准化镜头运动描述');
    usedDimensions.push('shotContext.cameraMovement');

    // 3. 画面内容（原始描述）
    motionParts.push(`【画面内容】${shotContext.actionDescription || originalMotionPrompt}`);

    // 4. 情绪和节奏（从剧本分析提取）
    if (scriptAnalysis && scriptAnalysis.emotionalCurve && scriptAnalysis.emotionalCurve.length > 0) {
      const shotIndex = shotContext.shotNumber || 0;
      const curveIndex = Math.min(
        Math.floor((shotIndex / Math.max(1, scriptAnalysis.emotionalCurve.length)) * scriptAnalysis.emotionalCurve.length),
        scriptAnalysis.emotionalCurve.length - 1
      );
      const emotionPoint = scriptAnalysis.emotionalCurve[curveIndex];
      if (emotionPoint) {
        const motionIntensity = emotionPoint.intensity >= 7 ? '运动幅度较大，节奏较快' :
          emotionPoint.intensity >= 4 ? '运动幅度适中，节奏平稳' :
          '运动幅度较小，节奏缓慢';
        motionParts.push(`【情绪运动】情绪=${emotionPoint.emotion}，强度${emotionPoint.intensity}/10，${motionIntensity}`);
        optimizations.push(`注入情绪运动控制（${emotionPoint.emotion}, 强度${emotionPoint.intensity}/10）`);
        usedDimensions.push('emotionalCurve');
      }
    }

    // 5. 风格
    if (stylePreset) {
      motionParts.push(`【风格】${stylePreset.visualStyle}`);
      optimizations.push('注入统一风格预设');
      usedDimensions.push('stylePreset.visualStyle');
    }

    // 6. 物理和一致性要求
    motionParts.push('【物理一致性】正确重力，自然惯性，真实碰撞反应，衣物自然摆动，头发自然飘动，人体解剖正确，自然呼吸');
    motionParts.push('【身份一致性】人物身份一致，角色外观一致，服装一致，发型发色一致，场景一致，物体位置一致，光照方向一致');
    optimizations.push('添加物理一致性和身份一致性要求');

    const finalPrompt = motionParts.join('。');

    return {
      prompt: finalPrompt,
      negativePrompt: COMMON_NEGATIVE_PROMPTS.join('，'),
      optimizations,
      usedDimensions,
    };
  },

  /**
   * 获取优化摘要（用于日志显示）
   */
  getOptimizationSummary(optimized: OptimizedPrompt): string {
    return `优化${optimized.optimizations.length}项: ${optimized.optimizations.slice(0, 3).join('、')}${optimized.optimizations.length > 3 ? '...' : ''}`;
  },
};
