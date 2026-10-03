// 阶段5：场景提取
import type { Database } from '../../../types';
import { NovelEpisodeDAO, ScriptSceneDAO, ScriptPropDAO } from '../../../models';
import { aiProxy } from '../../aiProxy';
import { buildSceneExtractPrompt } from '../../prompts/sceneExtract';
import { buildSceneConceptPrompt, buildKeyframePrompt } from '../../prompts/keyframe';
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
      prompt, systemPrompt: finalSystem, responseFormat: 'json', maxTokens: 4096,
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
        const atmosphere = sceneAnalysis?.atmosphere?.join(', ') || scene.atmosphere || '';
        const lighting = sceneAnalysis?.lighting || '';
        const keyProps = sceneAnalysis?.keyProps?.join(', ') || '';
        const emotionalTone = sceneAnalysis?.emotionalTone || '';
        const sceneDesc = [scene.description || scene.location || '', atmosphere, lighting, keyProps, emotionalTone, `时段：${scene.time_of_day || 'day'}`]
          .filter(Boolean).join('，');
        const scenePrompt = buildSceneConceptPrompt(scene.name, sceneDesc || '无描述', styleDescription || undefined);

        // 负面提示词
        const sceneNegativePrompt = '低质量，模糊，变形，丑陋，水印，文字，卡通，动漫，3d渲染感，塑料质感，过度光滑，AI伪影，CG感，人物，角色，人脸，不自然对称，透视错误，光照不一致，阴影错误';

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

    // 物品/道具资产：从剧本分析中提取关键道具并生成概念图
    // 道具概念图可用于关键帧生成的参考，保证物品一致性
    if (scriptAnalysis?.sceneAnalysis && imageModel) {
      // 从所有场景中提取关键道具并去重
      const allProps = new Set<string>();
      for (const s of scriptAnalysis.sceneAnalysis) {
        if (s.keyProps && Array.isArray(s.keyProps)) {
          s.keyProps.forEach(p => allProps.add(p));
        }
      }

      if (allProps.size > 0) {
        const propsList = Array.from(allProps).slice(0, 10);  // 最多生成10个道具
        let propImagesGenerated = 0;
        const propAssets: Array<{ name: string; url: string }> = [];

        for (const propName of propsList) {
          try {
            // 极简道具概念图提示词（buildKeyframePrompt：风格 + 主体描述）
            const propPrompt = buildKeyframePrompt(`物品道具概念图：${propName}，产品摄影，中性背景，均匀光照，清晰展示物品全貌和细节`, styleDescription || undefined);

            const propNegativePrompt = '低质量，模糊，变形，丑陋，水印，文字，卡通，动漫，3d渲染感，塑料质感，过度光滑，AI伪影，CG感，人物，角色，人脸，手，背景杂乱，多物品';

            const imgResult = await aiProxy.generateImage({
              db, userId: task.userId, projectId: task.projectId,
              provider: imageModel.provider, modelName: imageModel.modelName,
              prompt: propPrompt, negativePrompt: propNegativePrompt,
              count: 1, size: '2048x2048',  // 方形适合物品展示，满足豆包最低3686400像素要求
              saveSubDir: 'prop_refs',
            });

            if (imgResult.images.length > 0 && imgResult.images[0].url) {
              propAssets.push({ name: propName, url: imgResult.images[0].url });
              propImagesGenerated++;
              console.log(`[AutoPipeline] 道具概念图生成成功: ${propName}`);
            }
          } catch (err: any) {
            console.error(`[AutoPipeline] 道具概念图生成失败 for prop=${propName}:`, err.message);
            // 单道具概念图失败不影响整体流程
          }
        }

        if (propImagesGenerated > 0) {
          // 将道具资产存入 script_props 表（关键帧生成时 collectShotReferenceImages 从这里取道具参考图）
          try {
            for (const pa of propAssets) {
              // 避免重复创建同名道具
              const existing = ScriptPropDAO.listByEpisode(db, first.id).find(p => p.name === pa.name);
              if (!existing) {
                ScriptPropDAO.create(db, {
                  user_id: task.userId,
                  episode_id: first.id,
                  name: pa.name,
                  description: 'AI 自动提取的关键道具',
                  concept_images: JSON.stringify([{ url: pa.url, model: imageModel.modelName, prompt: '' }]),
                });
              }
            }
            console.log(`[AutoPipeline] 道具资产已存入 script_props 表: ${propAssets.length} 个`);
          } catch (propErr) {
            console.error('[AutoPipeline] 保存道具资产到 script_props 失败:', (propErr as Error).message);
          }

          const prevProgress = task.stageProgress['scenes'] || `提取 ${created.length} 个场景`;
          task.stageProgress['scenes'] = `${prevProgress}，生成 ${propImagesGenerated} 张道具概念图`;
        }
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
