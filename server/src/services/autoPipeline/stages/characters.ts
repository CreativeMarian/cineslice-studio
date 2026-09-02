// 阶段4：角色提取
import type { Database } from '../../../types';
import { NovelEpisodeDAO, ScriptCharacterDAO } from '../../../models';
import { aiProxy } from '../../aiProxy';
import { characterExtractPrompt } from '../../prompts/characterExtract';
import { parseAiJsonOrThrow } from '../../../utils/aiJsonParser';
import type { AutoPipelineTask } from '../types';
import { getFirstModel, getOrCreateScriptAnalysis, getProjectStylePreset } from '../helpers';

export async function stageCharacters(db: Database, task: AutoPipelineTask): Promise<void> {
  const episodes = NovelEpisodeDAO.listByProject(db, task.projectId);
  const first = episodes[0];
  if (!first) throw new Error('无可用剧集');

  const existing = ScriptCharacterDAO.listByEpisode(db, first.id);
  if (existing.length > 0) {
    task.stageProgress['characters'] = `已存在 ${existing.length} 个角色，跳过`;
    return;
  }

  const model = getFirstModel(db, task.userId, 'text');
  if (!model) throw new Error('请先配置文本模型');

  const { systemPrompt, prompt } = characterExtractPrompt(first.script_content);
  const result = await aiProxy.generateText({
    db, userId: task.userId, provider: model.provider, modelName: model.modelName,
    prompt, systemPrompt, responseFormat: 'json', maxTokens: 4096,
  });

  const characters = parseAiJsonOrThrow<any[]>(result.content);
  const list = Array.isArray(characters) ? characters : [characters];

  const created = ScriptCharacterDAO.batchCreate(db, list.map((c: any) => ({
    user_id: task.userId,
    episode_id: first.id,
    name: c.name || '未知角色',
    gender: c.gender || 'other',
    role_type: c.roleType || c.role_type || 'supporting',
    description: c.description || '',
    visual_description: c.visualDescription || c.visual_description || '',
  })));

  task.stageProgress['characters'] = `提取 ${created.length} 个角色`;

  // P0 人物一致性：为每个角色生成概念图
  // 使用剧本分析中的角色视觉特征、情绪弧线优化提示词
  // 角色概念图将作为关键帧生成的参考图，保证人物一致性
  const imageModel = getFirstModel(db, task.userId, 'image');
  if (imageModel && created.length > 0) {
    // 获取剧本分析结果（用于优化角色概念图提示词）
    const scriptAnalysis = await getOrCreateScriptAnalysis(db, task.projectId, task.userId, first.id);
    const stylePreset = getProjectStylePreset(db, task.projectId);

    let characterImagesGenerated = 0;
    for (const character of created) {
      try {
        // 从剧本分析中找到匹配的角色信息
        let charAnalysis = null;
        if (scriptAnalysis?.characterAnalysis) {
          charAnalysis = scriptAnalysis.characterAnalysis.find(
            c => c.characterName === character.name || character.name.includes(c.characterName) || c.characterName.includes(character.name)
          );
        }

        // 构建角色概念图提示词
        const visualDesc = character.visual_description || character.description || '';
        const personality = charAnalysis?.personality || '';
        const emotionalArc = charAnalysis?.emotionalArc || '';
        const visualTraits = charAnalysis?.visualTraits || '';

        let characterPrompt = `人物角色概念图，${character.name}，${visualDesc}`;
        if (personality) characterPrompt += `，性格特征：${personality}`;
        if (visualTraits) characterPrompt += `，视觉特征：${visualTraits}`;
        if (emotionalArc) characterPrompt += `，情绪状态：${emotionalArc}`;
        characterPrompt += `。${stylePreset.visualStyle}`;
        characterPrompt += '。正面全身像，标准姿势，清晰面部特征，完整服装展示，中性背景，高细节，8K分辨率';

        // 负面提示词
        const charNegativePrompt = '低质量，模糊，变形，多余手指，丑陋，水印，文字，卡通，动漫，3d渲染感，塑料皮肤，蜡像质感，恐怖谷，过度光滑，AI伪影，CG感，不自然对称，背景杂乱，多人，侧脸，背影';

        const imgResult = await aiProxy.generateImage({
          db, userId: task.userId, projectId: task.projectId,
          provider: imageModel.provider, modelName: imageModel.modelName,
          prompt: characterPrompt, negativePrompt: charNegativePrompt,
          count: 1, size: '1440x2560',  // 竖版适合人物全身像，满足豆包最低3686400像素要求
          saveSubDir: 'character_refs',
        });

        if (imgResult.images.length > 0 && imgResult.images[0].url) {
          ScriptCharacterDAO.update(db, character.id, {
            reference_image_url: imgResult.images[0].url,
          });
          characterImagesGenerated++;
          console.log(`[AutoPipeline] 角色概念图生成成功: ${character.name}`);
        }
      } catch (err: any) {
        console.error(`[AutoPipeline] 角色概念图生成失败 for character=${character.name}:`, err.message);
        // 单角色概念图失败不影响整体流程
      }
    }

    if (characterImagesGenerated > 0) {
      task.stageProgress['characters'] = `提取 ${created.length} 个角色，生成 ${characterImagesGenerated} 张角色概念图`;
    }
  }
}
