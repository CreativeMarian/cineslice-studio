// 阶段5：场景提取
import type { Database } from '../../../types';
import { NovelEpisodeDAO, ScriptSceneDAO, ScriptPropDAO } from '../../../models';
import { aiProxy } from '../../aiProxy';
import { buildSceneExtractPrompt } from '../../prompts/sceneExtract';
import { buildPropExtractPrompt } from '../../prompts/propExtract';
import { buildSceneConceptPrompt, buildPropConceptPrompt, SCENE_CONCEPT_NEGATIVE, PROP_CONCEPT_NEGATIVE } from '../../prompts/keyframe';
import { parseAiJsonOrThrow } from '../../../utils/aiJsonParser';
import type { AutoPipelineTask } from '../types';
import { getFirstModel, getOrCreateScriptAnalysis, getProjectStyleDescription, withRetry } from '../helpers';
import { runStageGates } from '../../stageSkills';
import { applyStageRules } from '../../stageSkills';
import { runNativeGates } from '../../stageSkills/nativeGates';

export async function stageScenes(db: Database, task: AutoPipelineTask): Promise<void> {
  const episodes = NovelEpisodeDAO.listByProject(db, task.projectId);
  const first = episodes[0];
  if (!first) throw new Error('无可用剧集');

  const existing = ScriptSceneDAO.listByEpisode(db, first.id);
  if (existing.length > 0) {
    task.stageProgress['scenes'] = `已存在 ${existing.length} 个场景，跳过`;
    return;
  }

  const model = getFirstModel(db, task.userId, 'text');
  if (!model) throw new Error('请先配置文本模型');

  const prompt = buildSceneExtractPrompt(first.script_content);

  // 极简系统：不注入模型专属 Skill 规范，仅保留阶段通用规则
  const finalSystem = applyStageRules('', 'scenes');
  const result = await withRetry(
    () => aiProxy.generateText({
      db, userId: task.userId, provider: model.provider, modelName: model.modelName,
      prompt, systemPrompt: finalSystem, responseFormat: 'json', maxTokens: 16000,
    }),
    { maxAttempts: 3, label: '场景提取AI调用' }
  );

  const scenes = parseAiJsonOrThrow<any[]>(result.content);
  const list = Array.isArray(scenes) ? scenes : [scenes];

  const created = ScriptSceneDAO.batchCreate(db, list.map((s: any) => ({
    user_id: task.userId,
    episode_id: first.id,
    name: s.name || '未知场景',
    location: s.location || '',
    time_of_day: s.timeOfDay || s.time_of_day || 'day',
    atmosphere: s.atmosphere || '',
    // shuohao 场景美术字段：视觉提示词 / 一致性锚点 / 光照变体 / 尺度参照（DAO 同时回填旧字段 description，兼容既有消费方）
    visual_prompt: s.visual_prompt || s.visualPrompt || '',
    consistency_anchor: s.consistency_anchor || s.consistencyAnchor || '',
    lighting_variants: s.lighting_variants || s.lightingVariants || '',
    scale_reference: s.scale_reference || s.scaleReference || '',
    description: s.description || '',
  })));

  task.stageProgress['scenes'] = `提取 ${created.length} 个场景`;

  // P2 场景一致性：为每个场景生成场景参考图
  // 该场景下的所有关键帧都将以此参考图为风格基准，保证环境一致性
  const imageModel = getFirstModel(db, task.userId, 'image');
  if (imageModel && created.length > 0) {
    // 获取剧本分析结果（用于场景描述兜底）
    const scriptAnalysis = await getOrCreateScriptAnalysis(db, task.projectId, task.userId, first.id);
    // 极简系统：风格来自 project.style_description
    const styleDescription = getProjectStyleDescription(db, task.projectId);

    let sceneImagesGenerated = 0;
    for (const scene of created) {
      try {
        // 从剧本分析中找到匹配的场景信息
        let sceneAnalysis = null;
        if (scriptAnalysis?.sceneAnalysis) {
          sceneAnalysis = scriptAnalysis.sceneAnalysis.find(
            s => s.sceneName === scene.name || scene.name.includes(s.sceneName) || s.sceneName.includes(scene.name)
          );
        }

        // 极简场景概念图提示词（buildSceneConceptPrompt：风格 + 场景名/环境描述 + 高清光影）
        // shuohao 标准：visual_prompt（场景形象提示词）优先，空时降级旧字段（description / location）+ 剧本分析兜底
        const atmosphere = sceneAnalysis?.atmosphere?.join(', ') || scene.atmosphere || '';
        const lighting = sceneAnalysis?.lighting || '';
        const keyProps = sceneAnalysis?.keyProps?.join(', ') || '';
        const emotionalTone = sceneAnalysis?.emotionalTone || '';
        const sceneDesc = scene.visual_prompt
          || [scene.description || scene.location || '', atmosphere, lighting, keyProps, emotionalTone, `时段：${scene.time_of_day || 'day'}`]
            .filter(Boolean).join('，');
        const scenePrompt = buildSceneConceptPrompt(scene.name, sceneDesc || '无描述', styleDescription || undefined);

        // 负面提示词（shuohao novel-art 标准，替换原硬编码）
        const sceneNegativePrompt = SCENE_CONCEPT_NEGATIVE;

        const imgResult = await aiProxy.generateImage({
          db, userId: task.userId, projectId: task.projectId,
          provider: imageModel.provider, modelName: imageModel.modelName,
          prompt: scenePrompt, negativePrompt: sceneNegativePrompt,
          count: 1, size: '2560x1440',
          saveSubDir: 'scene_refs',
        });

        if (imgResult.images.length > 0 && imgResult.images[0].url) {
          const conceptImages = JSON.stringify([{
            url: imgResult.images[0].url,
            model: imageModel.modelName,
            prompt: scenePrompt,
          }]);
          ScriptSceneDAO.update(db, scene.id, {
            concept_images: conceptImages,
            selected_image_index: 0,
          });
          sceneImagesGenerated++;
          console.log(`[AutoPipeline] 场景参考图生成成功: ${scene.name}`);
        }
      } catch (err: any) {
        console.error(`[AutoPipeline] scene reference image failed for scene=${scene.id}:`, err.message);
        // 单场景参考图失败不影响整体流程
      }
    }
    if (sceneImagesGenerated > 0) {
      task.stageProgress['scenes'] = `提取 ${created.length} 个场景，生成 ${sceneImagesGenerated} 张场景参考图`;
    }

    // ═══════════════════════════════════════════════════════════
    // 道具提取（shuohao novel-art）：叙事道具 → script_props
    // 只提取"叙事道具"（推动剧情/揭示人物/承载伏笔），带 visual_prompt / is_narrative=1 / keywords
    // ═══════════════════════════════════════════════════════════
    let extractedProps: any[] = [];
    const existingProps = ScriptPropDAO.listByEpisode(db, first.id);
    if (existingProps.length === 0) {
      try {
        const propPrompt = buildPropExtractPrompt(first.script_content);
        const propResult = await withRetry(
          () => aiProxy.generateText({
            db, userId: task.userId, provider: model.provider, modelName: model.modelName,
            prompt: propPrompt, systemPrompt: applyStageRules('', 'scenes'), responseFormat: 'json', maxTokens: 8192,
          }),
          { maxAttempts: 3, label: '道具提取AI调用' }
        );
        const propData = parseAiJsonOrThrow<any[]>(propResult.content);
        const propList = Array.isArray(propData) ? propData : [propData];
        for (const p of propList) {
          if (!p || !p.name) continue;
          ScriptPropDAO.create(db, {
            user_id: task.userId,
            episode_id: first.id,
            name: String(p.name).trim(),
            category: p.category || 'other',
            description: p.description || '',
            visual_prompt: p.visual_prompt || '',
            is_narrative: p.is_narrative === undefined ? 1 : (Number(p.is_narrative) || 0),
            keywords: p.keywords || '',
          });
        }
        extractedProps = ScriptPropDAO.listByEpisode(db, first.id);
        console.log(`[AutoPipeline] 叙事道具提取完成: ${extractedProps.length} 个`);
      } catch (propErr: any) {
        console.error('[AutoPipeline] 叙事道具提取失败:', propErr.message);
      }
    } else {
      extractedProps = existingProps;
    }

    // 道具提取为空/失败 → 回退剧本分析 keyProps（旧行为兜底，仅补名称，概念图由下方统一生成）
    if (extractedProps.length === 0 && scriptAnalysis?.sceneAnalysis) {
      const allProps = new Set<string>();
      for (const s of scriptAnalysis.sceneAnalysis) {
        if (s.keyProps && Array.isArray(s.keyProps)) s.keyProps.forEach(p => allProps.add(p));
      }
      for (const propName of Array.from(allProps).slice(0, 10)) {  // 最多10个
        ScriptPropDAO.create(db, {
          user_id: task.userId,
          episode_id: first.id,
          name: propName,
          description: 'AI 自动提取的关键道具（回退）',
          is_narrative: 1,
          keywords: '',
        });
      }
      extractedProps = ScriptPropDAO.listByEpisode(db, first.id);
      if (extractedProps.length > 0) {
        console.log(`[AutoPipeline] 道具回退提取完成（剧本分析 keyProps）: ${extractedProps.length} 个`);
      }
    }

    // 道具概念图（buildPropConceptPrompt + PROP_CONCEPT_NEGATIVE）：每个无概念图的叙事道具生成一张
    if (extractedProps.length > 0) {
      let propImagesGenerated = 0;
      for (const prop of extractedProps) {
        if (prop.concept_images && prop.concept_images.length > 0) continue; // 幂等：已有概念图跳过
        try {
          const propPrompt = buildPropConceptPrompt(prop.name, prop.visual_prompt || prop.description || '无描述', styleDescription || undefined);
          const imgResult = await aiProxy.generateImage({
            db, userId: task.userId, projectId: task.projectId,
            provider: imageModel.provider, modelName: imageModel.modelName,
            prompt: propPrompt, negativePrompt: PROP_CONCEPT_NEGATIVE,
            count: 1, size: '2048x2048',  // 方形适合物品展示，满足豆包最低3686400像素要求
            saveSubDir: 'prop_refs',
          });

          if (imgResult.images.length > 0 && imgResult.images[0].url) {
            ScriptPropDAO.update(db, prop.id, {
              concept_images: JSON.stringify([{ url: imgResult.images[0].url, model: imageModel.modelName, prompt: propPrompt }]),
            });
            propImagesGenerated++;
            console.log(`[AutoPipeline] 道具概念图生成成功: ${prop.name}`);
          }
        } catch (err: any) {
          console.error(`[AutoPipeline] 道具概念图生成失败 for prop=${prop.name}:`, err.message);
          // 单道具概念图失败不影响整体流程
        }
      }

      if (extractedProps.length > 0) {
        const prevProgress = task.stageProgress['scenes'] || `提取 ${created.length} 个场景`;
        task.stageProgress['scenes'] = `${prevProgress}，提取 ${extractedProps.length} 个叙事道具${propImagesGenerated > 0 ? `，生成 ${propImagesGenerated} 张道具概念图` : ''}`;
      }
    }
  }

  // ── 质量门（shuohao-skills 移植）：只读检查，不阻断流水线 ──
  try {
    const gate = runStageGates(db, 'scenes', first.id);
    console.log(`[AutoPipeline][质量门] ${gate.summary}`);
    const errs = gate.issues.filter((i: any) => i.severity === 'error');
    if (errs.length > 0) {
      errs.slice(0, 5).forEach((e: any) => console.warn(`[AutoPipeline][质量门]   - ${e.message}`));
      task.stageProgress['scenes'] += `｜质量门:${errs.length}错`;
    } else {
      task.stageProgress['scenes'] += `｜质量门:通过`;
    }
  } catch (gateErr: any) {
    console.warn('[AutoPipeline] scenes 质量门执行失败:', gateErr.message);
  }

  // ── shuohao 原生 JSON 校验：MOO 场景/道具 → art.json → 真实运行 novel-art validate ──
  try {
    const native = await runNativeGates(db, 'scenes', { episodeId: first.id, projectId: task.projectId });
    if (native.executed && native.result) {
      console.log(`[AutoPipeline][原生校验] ${native.result.summary}`);
      if (native.result.passed) {
        task.stageProgress['scenes'] += `｜原生校验:通过`;
      } else {
        native.result.issues.slice(0, 5).forEach((e: any) => console.warn(`[AutoPipeline][原生校验]   - ${e.message}`));
        task.stageProgress['scenes'] += `｜原生校验:${native.result.issues.length}条`;
      }
    } else {
      console.warn('[AutoPipeline][原生校验] 脚本未执行（node/环境问题，跳过）');
      task.stageProgress['scenes'] += `｜原生校验:未执行`;
    }
  } catch (nativeErr: any) {
    console.warn('[AutoPipeline] scenes 原生校验异常（忽略）:', nativeErr.message);
  }
}
