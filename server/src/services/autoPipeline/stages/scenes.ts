// 阶段5：场景提取
import type { Database } from '../../../types';
import { NovelEpisodeDAO, ScriptSceneDAO, ProjectDAO } from '../../../models';
import { aiProxy } from '../../aiProxy';
import { sceneExtractPrompt } from '../../prompts/sceneExtract';
import { parseAiJsonOrThrow } from '../../../utils/aiJsonParser';
import type { AutoPipelineTask } from '../types';
import { getFirstModel, getOrCreateScriptAnalysis, getProjectStylePreset } from '../helpers';

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

  const { systemPrompt, prompt } = sceneExtractPrompt(first.script_content);
  const result = await aiProxy.generateText({
    db, userId: task.userId, provider: model.provider, modelName: model.modelName,
    prompt, systemPrompt, responseFormat: 'json', maxTokens: 4096,
  });

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
    // 获取剧本分析结果（用于优化场景参考图提示词）
    const scriptAnalysis = await getOrCreateScriptAnalysis(db, task.projectId, task.userId, first.id);
    const stylePreset = getProjectStylePreset(db, task.projectId);

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

        // 构建场景参考图提示词（使用剧本分析优化）
        const sceneDesc = scene.description || scene.location || '';
        const atmosphere = sceneAnalysis?.atmosphere?.join(', ') || scene.atmosphere || '';
        const lighting = sceneAnalysis?.lighting || '';
        const keyProps = sceneAnalysis?.keyProps?.join(', ') || '';
        const emotionalTone = sceneAnalysis?.emotionalTone || '';

        let scenePrompt = `场景概念图，${scene.name}，${sceneDesc}`;
        if (atmosphere) scenePrompt += `，氛围：${atmosphere}`;
        if (lighting) scenePrompt += `，光线：${lighting}`;
        if (keyProps) scenePrompt += `，关键道具：${keyProps}`;
        if (emotionalTone) scenePrompt += `，情绪基调：${emotionalTone}`;
        scenePrompt += `，时段：${scene.time_of_day || 'day'}`;
        scenePrompt += `。${stylePreset.visualStyle}`;
        scenePrompt += '。空场景，无人物，完整空间展示，透视正确，高细节，8K分辨率，电影级画质';

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
            // 构建道具概念图提示词
            let propPrompt = `物品道具概念图，${propName}，电影级写实风格，高细节，8K分辨率，产品摄影，中性背景，均匀光照，清晰展示物品全貌和细节`;
            propPrompt += `。${stylePreset.visualStyle}`;

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
          // 将道具资产保存到项目 metadata
          try {
            const project = ProjectDAO.getById(db, task.projectId);
            if (project) {
              const metadata = project.metadata ? JSON.parse(JSON.stringify(project.metadata)) : {};
              metadata.propAssets = propAssets;
              ProjectDAO.update(db, task.projectId, { metadata: metadata as any });
            }
          } catch (metaErr) {
            console.error('[AutoPipeline] 保存道具资产到 metadata 失败:', (metaErr as Error).message);
          }

          const prevProgress = task.stageProgress['scenes'] || `提取 ${created.length} 个场景`;
          task.stageProgress['scenes'] = `${prevProgress}，生成 ${propImagesGenerated} 张道具概念图`;
        }
      }
    }
  }
}
