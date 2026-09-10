// 阶段7：关键帧批量生成
import type { Database } from '../../../types';
import {
  NovelEpisodeDAO,
  ShotDAO,
  ScriptCharacterDAO,
  ShotKeyframeDAO,
} from '../../../models';
import { aiProxy } from '../../aiProxy';
import { directorPromptService } from '../../directorPromptService';
import { aiPromptOptimizerService, type ScriptContextForAI } from '../../aiPromptOptimizerService';
import { collectShotReferenceImages } from '../../shotConsistencyService';
import { parseCharactersInShot } from '../../../models/shot';
import type { AutoPipelineTask } from '../types';
import { getFirstModel, getOrCreateScriptAnalysis, getProjectStylePreset, buildDirectorShotContext } from '../helpers';
import { UserPreferenceDAO } from '../../../models';
import { getPromptSkillForVideoModel } from '../../promptSkills';

/** 从动作弧三段式 actionDescription 中提取首/尾帧画面描述（无分段标记时返回 null） */
function extractFrameDesc(actionDesc: string | null | undefined, which: 'first' | 'last'): string | null {
  if (!actionDesc) return null;
  if (which === 'first') {
    const m = actionDesc.match(/【起始状态】([\s\S]*?)(?=【动作过程】|$)/);
    return m && m[1].trim() ? m[1].trim() : null;
  }
  const m = actionDesc.match(/【结束状态】([\s\S]*?)$/);
  return m && m[1].trim() ? m[1].trim() : null;
}

export async function stageKeyframes(db: Database, task: AutoPipelineTask): Promise<void> {
  const episodes = NovelEpisodeDAO.listByProject(db, task.projectId);
  const first = episodes[0];
  if (!first) throw new Error('无可用剧集');

  const shots = ShotDAO.listByEpisode(db, first.id);
  if (shots.length === 0) throw new Error('无可用分镜');

  const model = getFirstModel(db, task.userId, 'image');
  if (!model) throw new Error('请先配置图像模型');

  // 预加载所有角色（避免循环内重复查询）
  const allCharacters = ScriptCharacterDAO.listByEpisode(db, first.id);

  // 提示词 Skill：按用户预选视频模型加载（关键帧阶段追加官方锚定句）
  const promptSkill = getPromptSkillForVideoModel(UserPreferenceDAO.getByUser(db, task.userId)?.default_video_model);
  if (promptSkill) console.log(' + ' + promptSkill.displayName);

  // 统一风格前缀（从项目风格预设读取，保证全片画风一致）
  const stylePreset = getProjectStylePreset(db, task.projectId);
  console.log(`[AutoPipeline] keyframes 使用风格预设: ${stylePreset.presetName}`);

  // 剧本分析（在关键帧生成之前分析剧情、场景、角色、情绪，用于提示词优化）
  const scriptAnalysis = await getOrCreateScriptAnalysis(db, task.projectId, task.userId, first.id);
  if (scriptAnalysis) {
    console.log(`[AutoPipeline] keyframes 使用剧本分析结果优化提示词`);
  }

  // 构建 AI 深度优化用的剧本上下文（包含整个剧本的剧情、角色、场景、情绪曲线）
  const scriptContextForAI: ScriptContextForAI = scriptAnalysis
    ? aiPromptOptimizerService.buildScriptContextFromAnalysis(scriptAnalysis)
    : { characters: [], scenes: [] };

  let generated = 0;
  let skipped = 0;

  for (const shot of shots) {
    // 幂等：first + last 双帧都齐才算完成（flf2v 首尾帧链路需要两帧），缺失哪帧补哪帧
    const existing = ShotKeyframeDAO.listByShot(db, shot.id);
    const hasFirst = existing.some(k => k.frame_type === 'first' && k.image_url);
    const hasLast = existing.some(k => k.frame_type === 'last' && k.image_url);
    if (hasFirst && hasLast) {
      skipped++;
      continue;
    }

    try {
      // 解析当前镜头中的角色
      let characterIds: string[] = [];
      if (shot.characters_in_shot) {
        characterIds = parseCharactersInShot(shot.characters_in_shot);
      }

      // 如果镜头没有指定角色，从 action_description 中匹配角色名
      if (characterIds.length === 0) {
        for (const char of allCharacters) {
          const shotText = `${shot.action_description || ''} ${shot.dialogue || ''}`;
          if (shotText.includes(char.name)) {
            characterIds.push(char.id);
          }
        }
      }

      // 获取场景信息（场景参考图已由 collectShotReferenceImages 统一收集）

      // 收集一致性参考图：角色定妆照 + 场景概念图 + 道具图
      // 参考 ArcReel/BigBanana：每镜注入"当前角色+场景+道具"参考，显著降低人物/场景漂移
      const referenceImages = collectShotReferenceImages(db, shot);

      // ═══════════════════════════════════════════════════════════
      // 导演级关键帧提示词生成（v2.0）
      // 包含：时序控制、动作分解、表情细节、心理活动、环境交互、连贯性、真实性校验
      // 解决：角色变脸、场景不一致、剧情不连贯、无厘头动作等问题
      // ═══════════════════════════════════════════════════════════
      // 首帧上下文：动作起始状态（frameSpecificDescription 优先，回退到动作弧【起始状态】）
      const ctxFirst = buildDirectorShotContext(
        db,
        shot,
        shots,
        first.id,
        shots.length
      );
      ctxFirst.frameType = 'first';
      ctxFirst.frameSpecificDescription = shot.first_frame_description || extractFrameDesc(shot.action_description, 'first') || undefined;

      // 尾帧上下文：动作结束状态（frameSpecificDescription 优先，回退到动作弧【结束状态】）
      const ctxLast = buildDirectorShotContext(
        db,
        shot,
        shots,
        first.id,
        shots.length
      );
      ctxLast.frameType = 'last';
      ctxLast.frameSpecificDescription = shot.last_frame_description || extractFrameDesc(shot.action_description, 'last') || undefined;

      const directorFirstResult = directorPromptService.generateKeyframePrompt(
        ctxFirst,
        scriptAnalysis || undefined
      );
      const directorLastResult = directorPromptService.generateKeyframePrompt(
        ctxLast,
        scriptAnalysis || undefined
      );

      // ═══════════════════════════════════════════════════════════
      // AI 深度优化（让 AI 关联剧本上下文，深度分析后生成优化提示词）
      // 这是核心优化：不是模板化，而是真正的 AI 理解和分析
      // ═══════════════════════════════════════════════════════════
      let finalFirstPrompt = directorFirstResult.prompt;
      let finalLastPrompt = directorLastResult.prompt;
      let finalNegativePrompt = directorFirstResult.negativePrompt;
      let aiOptimizedOk = false;

      try {
        const aiOptimized = await aiPromptOptimizerService.optimizeKeyframePrompt(
          db,
          task.userId,
          ctxFirst,
          scriptContextForAI
        );
        if (aiOptimized.prompt && aiOptimized.prompt.length > 50) {
          finalFirstPrompt = aiOptimized.prompt;
          finalNegativePrompt = aiOptimized.negativePrompt || directorFirstResult.negativePrompt;
          aiOptimizedOk = true;
          console.log(`[AutoPipeline] keyframe shot=${shot.shot_number} AI深度优化成功`);
        }
      } catch (aiErr) {
        console.warn(`[AutoPipeline] keyframe shot=${shot.shot_number} AI深度优化失败，使用导演级提示词:`, (aiErr as Error).message);
      }

      // 帧专属画面兜底追加：防止 AI 优化丢弃首尾帧差异化信息
      if (aiOptimizedOk && ctxFirst.frameSpecificDescription && !finalFirstPrompt.includes('【帧专属画面】')) {
        finalFirstPrompt += `\n【帧专属画面】本帧画面必须严格为以下内容：${ctxFirst.frameSpecificDescription}`;
      }
      if (ctxLast.frameSpecificDescription && !finalLastPrompt.includes('【帧专属画面】')) {
        finalLastPrompt += `\n【帧专属画面】本帧画面必须严格为以下内容：${ctxLast.frameSpecificDescription}`;
      }

      console.log(`[AutoPipeline] keyframe shot=${shot.shot_number} 提示词生成完成`);

      // 局部函数：生成一帧关键帧并入库（first=镜头起始画面 / last=镜头结尾画面）
      const genFrame = async (frameType: 'first' | 'last', promptText: string): Promise<boolean> => {
        try {
          // ── 提示词 Skill：追加官方关键帧锚定句（H3 I2VA/FL2VA）──
          if (promptSkill?.keyframeAnchor) {
            const anchor = promptSkill.keyframeAnchor(frameType);
            if (anchor && !promptText.includes('锚定')) promptText = promptText + '\n' + anchor;
          }
          // Pollinations FLUX 对英文提示词理解远优于中文：先经 deepseek 翻译成英文
          let effectivePrompt = promptText;
          if (model.provider === 'pollinations') {
            try {
              const trans = await aiProxy.generateText({
                db, userId: task.userId,
                provider: 'deepseek', modelName: 'deepseek-chat',
                prompt: 'You are a professional prompt translator for AI image generation models. Translate the following Chinese image prompt into fluent, detailed English. Keep EVERY visual detail: characters, clothing, props, scene, background, action, body pose, camera angle, lighting, color tone, mood and art style. For Chinese-style elements (costume, architecture, props) use clear English descriptions instead of raw pinyin. Output ONLY the English translation with no explanation, no quotes.\n\n' + promptText,
                temperature: 0.3,
                maxTokens: 900,
              });
              const t = (trans.content || '').trim();
              if (t.length > 20) effectivePrompt = t;
            } catch (transErr) {
              console.warn('[AutoPipeline] keyframe shot=' + shot.shot_number + ' ' + frameType + ' FLUX提示词翻译失败，使用中文原词: ' + (transErr as Error).message);
            }
          }
          const imgResult = await aiProxy.generateImage({
            db, userId: task.userId, projectId: task.projectId,
            provider: model.provider, modelName: model.modelName,
            prompt: effectivePrompt, negativePrompt: finalNegativePrompt, count: 1, size: '2560x1440',
            referenceImages: referenceImages.length > 0 ? referenceImages : undefined,
            saveSubDir: 'keyframes',
          });
          const url = imgResult.images[0]?.url;
          if (!url) return false;
          ShotKeyframeDAO.create(db, {
            user_id: task.userId,
            shot_id: shot.id,
            frame_type: frameType,
            prompt: effectivePrompt,
            negative_prompt: finalNegativePrompt,
            image_url: url,
            image_model_used: model.modelName,
          });
          generated++;
          task.stageProgress['keyframes'] = `生成中 ${generated} 帧（${frameType}）`;
          return true;
        } catch (err: any) {
          console.error(`[AutoPipeline] keyframe shot=${shot.id} ${frameType} 生成失败:`, err.message);
          return false;
        }
      };

      // first：镜头起始画面（动作起点状态）
      if (!hasFirst) {
        await genFrame('first', finalFirstPrompt);
      }

      // last：镜头结尾画面（动作终点状态——与 first 有明确动作状态差异，是首尾帧插值的差异化尾端）
      if (!hasLast) {
        await genFrame('last', finalLastPrompt);
      }
    } catch (err: any) {
      console.error(`[AutoPipeline] keyframe shot=${shot.id} failed:`, err.message);
      // 单帧失败不中断整体，继续下一个
    }
  }

  if (generated === 0 && skipped === 0) {
    throw new Error('关键帧生成全部失败');
  }
  task.stageProgress['keyframes'] = `生成 ${generated} 帧，跳过 ${skipped} 帧`;
}
