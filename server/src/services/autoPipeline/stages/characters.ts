// 阶段4：角色提取
import type { Database } from '../../../types';
import { NovelEpisodeDAO, ScriptCharacterDAO, CharacterOutfitDAO } from '../../../models';
import { aiProxy } from '../../aiProxy';
import { characterExtractPrompt } from '../../prompts/characterExtract';
import { parseAiJsonOrThrow } from '../../../utils/aiJsonParser';
import type { AutoPipelineTask } from '../types';
import { getFirstModel, getOrCreateScriptAnalysis, getProjectStylePreset } from '../helpers';
import { UserPreferenceDAO } from '../../../models';
import { getPromptSkillForVideoModel, applySkillRules } from '../../promptSkills';
import { runStageGates } from '../../stageSkills';
import { applyStageRules } from '../../stageSkills';

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

  // ── 提示词 Skill：资产提取阶段按用户预选视频模型加载官方规范 ──
  const promptSkill = getPromptSkillForVideoModel(UserPreferenceDAO.getByUser(db, task.userId)?.default_video_model);
  if (promptSkill) console.log(`[AutoPipeline] 角色提取加载官方提示词 skill: ${promptSkill.displayName}`);
  const finalSystem = applyStageRules(applySkillRules(systemPrompt, promptSkill, 'assetRule'), 'characters');
  const result = await aiProxy.generateText({
    db, userId: task.userId, provider: model.provider, modelName: model.modelName,
    prompt, systemPrompt: finalSystem, responseFormat: 'json', maxTokens: 4096,
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
        // ── 提示词 Skill：追加官方参考图约束（供后续视频生成锁定身份）──
        if (promptSkill?.assetRule) {
          characterPrompt += '。此图将作为视频生成的身份参考图：面部正对镜头或轻微侧对镜头、五官清晰、面部不可遮挡、无大面积阴影或过曝、自然光色；画面中只有此人、无任何文字/字母/数字/logo/水印';
        }

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

    // P0 造型调度：AI 分析每个角色在剧本中的服装变化，自动创建多套造型
    // 第一套用角色概念图作为默认定妆照，其他套等用户手动生成或分镜阶段按需生成
    let totalOutfits = 0;
    for (const character of created) {
      try {
        const existingOutfits = CharacterOutfitDAO.listByCharacter(db, character.id);
        if (existingOutfits.length > 0) continue;

        const outfitPrompt = `分析以下剧本中角色「${character.name}」的服装变化。
角色外貌：${character.visual_description || character.description}
剧本内容：${first.script_content?.slice(0, 3000) || ''}

请判断该角色在剧情中需要几套不同造型（如日常装、职业装、睡衣、礼服、运动装等），每套造型给出名称和详细服装描述。
只输出 JSON 数组，格式：[{"name":"日常装","description":"白色衬衫，黑色西裤，皮鞋"},{"name":"睡衣","description":"浅蓝色棉质睡衣套装"}]
最多5套，最少1套。`;

        const outfitResult = await aiProxy.generateText({
          db, userId: task.userId, provider: model.provider, modelName: model.modelName,
          prompt: outfitPrompt, systemPrompt: '你是影视服装设计师，根据剧情场景判断角色需要的服装造型。只输出JSON，不要解释。',
          responseFormat: 'json', maxTokens: 2048,
        });

        let outfits: any[] = [];
        try {
          const parsed = JSON.parse(outfitResult.content);
          outfits = Array.isArray(parsed) ? parsed : (parsed.outfits || parsed.data || []);
        } catch { outfits = []; }

        if (outfits.length === 0) {
          outfits = [{ name: '默认造型', description: character.visual_description || '角色默认服装' }];
        }

        for (let i = 0; i < outfits.length; i++) {
          const o = outfits[i];
          const isFirst = i === 0;
          // 第一套用角色概念图作为定妆照（面容一致）
          const imgUrl = isFirst ? (character.reference_image_url || undefined) : undefined;
          CharacterOutfitDAO.create(db, {
            user_id: task.userId,
            character_id: character.id,
            name: o.name || `造型${i + 1}`,
            description: o.description || '',
            image_url: imgUrl,
            is_default: isFirst ? 1 : 0,
          });
          totalOutfits++;
        }
        console.log(`[AutoPipeline] 角色 ${character.name} 自动创建 ${outfits.length} 套造型`);
      } catch (err: any) {
        console.error(`[AutoPipeline] 角色 ${character.name} 造型分析失败:`, err.message);
        // 失败时至少创建一套默认造型
        try {
          const existing = CharacterOutfitDAO.listByCharacter(db, character.id);
          if (existing.length === 0) {
            CharacterOutfitDAO.create(db, {
              user_id: task.userId, character_id: character.id,
              name: '默认造型', description: character.visual_description || '',
              image_url: character.reference_image_url || undefined, is_default: 1,
            });
            totalOutfits++;
          }
        } catch { /* 忽略 */ }
      }
    }

    if (totalOutfits > 0) {
      const prev = task.stageProgress['characters'];
      task.stageProgress['characters'] = `${prev}，自动分析 ${totalOutfits} 套造型`;
    }
  }

  // ── 质量门（shuohao-skills 移植）：只读检查，不阻断流水线 ──
  try {
    const gate = runStageGates(db, 'characters', first.id);
    console.log(`[AutoPipeline][质量门] ${gate.summary}`);
    const errs = gate.issues.filter((i: any) => i.severity === 'error');
    if (errs.length > 0) {
      errs.slice(0, 5).forEach((e: any) => console.warn(`[AutoPipeline][质量门]   - ${e.message}`));
      task.stageProgress['characters'] += `｜质量门:${errs.length}错`;
    } else {
      task.stageProgress['characters'] += `｜质量门:通过`;
    }
  } catch (gateErr: any) {
    console.warn('[AutoPipeline] characters 质量门执行失败:', gateErr.message);
  }
}
