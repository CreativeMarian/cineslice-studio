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
import type { AutoPipelineTask } from '../types';
import { getFirstModel, getOrCreateScriptAnalysis, getProjectStylePreset, buildDirectorShotContext } from '../helpers';

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
    const existing = ShotKeyframeDAO.listByShot(db, shot.id);
    if (existing.length > 0) {
      skipped++;
      continue;
    }

    try {
      // 解析当前镜头中的角色
      let characterIds: string[] = [];
      if (shot.characters_in_shot) {
        try {
          characterIds = JSON.parse(shot.characters_in_shot);
        } catch {
          // 解析失败，尝试按逗号分割
          characterIds = shot.characters_in_shot.split(',').map(s => s.trim()).filter(Boolean);
        }
      }

      // 如果镜头没有指定角色，从 action_description 中匹配角色名
      if (characterIds.length === 0) {
        for (const char of allCharacters) {
          if (shot.action_description.includes(char.name) || shot.dialogue.includes(char.name)) {
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
      const directorContext = buildDirectorShotContext(
        db,
        shot,
        shots,
        first.id,
        shots.length
      );

      const directorResult = directorPromptService.generateKeyframePrompt(
        directorContext,
        scriptAnalysis || undefined
      );

      // ═══════════════════════════════════════════════════════════
      // AI 深度优化（让 AI 关联剧本上下文，深度分析后生成优化提示词）
      // 这是核心优化：不是模板化，而是真正的 AI 理解和分析
      // ═══════════════════════════════════════════════════════════
      let finalPrompt = directorResult.prompt;
      let finalNegativePrompt = directorResult.negativePrompt;

      try {
        const aiOptimized = await aiPromptOptimizerService.optimizeKeyframePrompt(
          db,
          task.userId,
          directorContext,
          scriptContextForAI
        );
        if (aiOptimized.prompt && aiOptimized.prompt.length > 50) {
          finalPrompt = aiOptimized.prompt;
          finalNegativePrompt = aiOptimized.negativePrompt || directorResult.negativePrompt;
          console.log(`[AutoPipeline] keyframe shot=${shot.shot_number} AI深度优化成功`);
        }
      } catch (aiErr) {
        console.warn(`[AutoPipeline] keyframe shot=${shot.shot_number} AI深度优化失败，使用导演级提示词:`, (aiErr as Error).message);
      }

      console.log(`[AutoPipeline] keyframe shot=${shot.shot_number} 提示词生成完成`);

      const imgResult = await aiProxy.generateImage({
        db, userId: task.userId, projectId: task.projectId,
        provider: model.provider, modelName: model.modelName,
        prompt: finalPrompt, negativePrompt: finalNegativePrompt, count: 1, size: '2560x1440',
        referenceImages: referenceImages.length > 0 ? referenceImages : undefined,
        saveSubDir: 'keyframes',
      });

      ShotKeyframeDAO.create(db, {
        user_id: task.userId,
        shot_id: shot.id,
        frame_type: 'first',
        prompt: finalPrompt,
        negative_prompt: finalNegativePrompt,
        image_url: imgResult.images[0]?.url,
        image_model_used: model.modelName,
      });
      generated++;
      task.stageProgress['keyframes'] = `生成中 ${generated}/${shots.length - skipped}`;
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
