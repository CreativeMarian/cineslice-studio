// 阶段4：角色提取
import type { Database } from '../../../types';
import { NovelEpisodeDAO, ScriptCharacterDAO, CharacterOutfitDAO, ProjectDAO, ScriptSceneDAO } from '../../../models';
import { aiProxy } from '../../aiProxy';
import { buildCharacterExtractPrompt } from '../../prompts/characterExtract';
import {
  buildCharacterConceptPromptWithIdentity,
  normalizeIdentityLock,
  normalizeWardrobe,
  buildWardrobeJson,
} from '../../promptBuilder';
import { buildCharacterFourViewPrompt, CHARACTER_CONCEPT_NEGATIVE } from '../../prompts/keyframe';
import { parseAiJsonOrThrow } from '../../../utils/aiJsonParser';
import type { AutoPipelineTask } from '../types';
import { getFirstModel, getOrCreateScriptAnalysis, getProjectStyleDescription, withRetry } from '../helpers';
import { runStageGates } from '../../stageSkills';
import { applyStageRules } from '../../stageSkills';
import { runNativeGates } from '../../stageSkills/nativeGates';

export async function stageCharacters(db: Database, task: AutoPipelineTask): Promise<void> {
  const episodes = NovelEpisodeDAO.listByProject(db, task.projectId);
  if (episodes.length === 0) throw new Error('无可用剧集');
  const first = episodes[0];

  // P1-13: 不再固定 episodes[0]——逐剧集处理；第2集起当前集无角色时从上一集继承角色资产，
  // 确保第2集能引用第1集的角色概念图/定妆照作为参考（跨剧集视觉一致）
  let processedAny = false;
  let extractedCount = 0;

  for (let idx = 0; idx < episodes.length; idx++) {
    const episode = episodes[idx];
    const existing = ScriptCharacterDAO.listByEpisode(db, episode.id);
    if (existing.length > 0) {
      task.stageProgress['characters'] = idx === 0
        ? `已存在 ${existing.length} 个角色，跳过`
        : `第${idx + 1}集已存在 ${existing.length} 个角色，跳过`;
      continue;
    }

    // ── P1-13: 上一集有角色时直接继承（复制记录 + 概念图/定妆照引用 + 服装记录）──
    if (idx > 0) {
      const prevChars = ScriptCharacterDAO.listByEpisode(db, episodes[idx - 1].id);
      if (prevChars.length > 0) {
        const inherited = ScriptCharacterDAO.batchCreate(db, prevChars.map(pc => ({
          user_id: task.userId,
          episode_id: episode.id,
          name: pc.name,
          gender: pc.gender || 'other',
          role_type: pc.role_type || 'supporting',
          description: pc.description || '',
          visual_description: pc.visual_description || '',
          character_profile: pc.character_profile || undefined,
          visual_prompt: pc.visual_prompt || undefined,
          voice_prompt: pc.voice_prompt || undefined,
          identity_lock: pc.identity_lock || undefined,
          wardrobe: pc.wardrobe || undefined,
        })));
        // 概念图 / 定妆照 / 四视图引用继承（collectShotReferenceImages 优先读 concept_images，跨集复用第1集资产）
        for (let j = 0; j < prevChars.length && j < inherited.length; j++) {
          const pc = prevChars[j];
          const nc = inherited[j];
          ScriptCharacterDAO.update(db, nc.id, {
            reference_image_url: pc.reference_image_url || undefined,
            concept_images: pc.concept_images && pc.concept_images.length > 0 ? JSON.stringify(pc.concept_images) : undefined,
            four_view_images: pc.four_view_images && pc.four_view_images.length > 0 ? JSON.stringify(pc.four_view_images) : undefined,
            selected_image_index: pc.selected_image_index || 0,
          });
          // 服装记录继承（character_id 重映射；image_url 复用上一集定妆照）
          for (const outfit of CharacterOutfitDAO.listByCharacter(db, pc.id)) {
            CharacterOutfitDAO.create(db, {
              user_id: task.userId,
              character_id: nc.id,
              name: outfit.name,
              description: outfit.description || '',
              image_url: outfit.image_url || undefined,
              is_default: outfit.is_default || 0,
            });
          }
        }
        task.stageProgress['characters'] = `第${idx + 1}集继承第${idx}集 ${inherited.length} 个角色资产（概念图/定妆照/服装）`;
        processedAny = true;
        extractedCount += inherited.length;
        continue;
      }
      // 上一集无角色可继承时，落到下方 AI 提取（保证后续剧集仍有角色资产）
    }

    // ── 当前剧集 AI 提取（第1集，或上一集无角色可继承时）──
    const model = getFirstModel(db, task.userId, 'text');
    if (!model) throw new Error('请先配置文本模型');

    const prompt = buildCharacterExtractPrompt(episode.script_content);

    // 极简系统：不注入模型专属 Skill 规范，仅保留阶段通用规则
    const finalSystem = applyStageRules('', 'characters');
    const result = await withRetry(
      () => aiProxy.generateText({
        db, userId: task.userId, provider: model.provider, modelName: model.modelName,
        prompt, systemPrompt: finalSystem, responseFormat: 'json', maxTokens: 16000,
      }),
      { maxAttempts: 3, label: '角色提取AI调用' }
    );

    const characters = parseAiJsonOrThrow<any[]>(result.content);
    const list = Array.isArray(characters) ? characters : [characters];

    // P0-1: 场景名 → 场景ID 映射（wardrobe.scene_name 解析为 scene_id；本阶段场景未提取时置 null 通用服装）
    const sceneList = ScriptSceneDAO.listByEpisode(db, episode.id);
    const sceneNameToId: Record<string, string> = {};
    for (const sc of sceneList) {
      if (sc.name) sceneNameToId[sc.name] = sc.id;
    }

    const created = ScriptCharacterDAO.batchCreate(db, list.map((c: any) => {
      // P0-1 身份锁：AI 返回 identity_lock → 归一化 JSON（空则 null）
      const identityLock = normalizeIdentityLock(c.identity_lock || c.identityLock || null);
      // P0-1 服装：AI 返回 wardrobe → 归一化 + scene_id 解析（空则 null）
      const wardrobeItems = normalizeWardrobe(c.wardrobe || c.wardrobeList || []);
      return {
        user_id: task.userId,
        episode_id: episode.id,
        name: c.name || '未知角色',
        gender: c.gender || 'other',
        role_type: c.roleType || c.role_type || 'supporting',
        // shuohao 角色三件套：画像 / 形象提示词 / 音色提示词（DAO 同时回填旧字段 description / visual_description，兼容既有消费方）
        character_profile: c.character_profile || c.characterProfile || '',
        visual_prompt: c.visual_prompt || c.visualPrompt || '',
        voice_prompt: c.voice_prompt || c.voicePrompt || '',
        description: c.description || '',
        visual_description: c.visualDescription || c.visual_description || '',
        // P0-1 身份锁 + 服装
        identity_lock: identityLock ? JSON.stringify(identityLock) : undefined,
        wardrobe: buildWardrobeJson(wardrobeItems, sceneNameToId) || undefined,
      };
    }));

    task.stageProgress['characters'] = `第${idx + 1}集提取 ${created.length} 个角色`;
    processedAny = true;
    extractedCount += created.length;

    // P0 人物一致性：为每个角色生成概念图
    // 使用剧本分析中的角色视觉特征、情绪弧线优化提示词
    // 角色概念图将作为关键帧生成的参考图，保证人物一致性
    const imageModel = getFirstModel(db, task.userId, 'image');
    if (imageModel && created.length > 0) {
      // 获取剧本分析结果（用于角色外观描述兜底；跨剧集沿用第1集分析，避免每集重复 AI 调用）
      const scriptAnalysis = await getOrCreateScriptAnalysis(db, task.projectId, task.userId, first.id);
      // 极简系统：风格来自 project.style_description
      const styleDescription = getProjectStyleDescription(db, task.projectId);

      let characterImagesGenerated = 0;
      let characterFourViewsGenerated = 0;
      for (const character of created) {
        try {
          // 从剧本分析中找到匹配的角色信息（补充性格/视觉特征）
          let charAnalysis = null;
          if (scriptAnalysis?.characterAnalysis) {
            charAnalysis = scriptAnalysis.characterAnalysis.find(
              c => c.characterName === character.name || character.name.includes(c.characterName) || c.characterName.includes(character.name)
            );
          }

          // P0-1 极简角色概念图提示词（buildCharacterConceptPromptWithIdentity：项目风格 + 身份锁定块 + 纯白背景全身）
          // 身份锁不含服装——锚点图只锁定面容/体型/发型，服装由 wardrobe 分场景控制
          const visualDesc = character.visual_prompt
            || [character.visual_description || character.description || '', charAnalysis?.personality || '', charAnalysis?.visualTraits || '']
              .filter(Boolean).join('，');
          const project = ProjectDAO.getById(db, task.projectId) || null;
          const characterPrompt = buildCharacterConceptPromptWithIdentity(character, project);

          // 负面提示词（shuohao character-refs 标准，替换原硬编码）
          const charNegativePrompt = CHARACTER_CONCEPT_NEGATIVE;

          const imgResult = await aiProxy.generateImage({
            db, userId: task.userId, projectId: task.projectId,
            provider: imageModel.provider, modelName: imageModel.modelName,
            prompt: characterPrompt, negativePrompt: charNegativePrompt,
            count: 1, size: '1440x2560',  // 竖版适合人物全身像，满足豆包最低3686400像素要求
            saveSubDir: 'character_refs',
          });

          if (imgResult.images.length > 0 && imgResult.images[0].url) {
            const conceptUrl = imgResult.images[0].url;
            // 概念图 URL 同时写入 concept_images（JSON 数组，collectShotReferenceImages 优先读取）与 reference_image_url（旧字段保留，兼容历史消费方）
            const conceptImages = JSON.stringify([{
              url: conceptUrl,
              model: imageModel.modelName,
              prompt: characterPrompt,
            }]);
            ScriptCharacterDAO.update(db, character.id, {
              reference_image_url: conceptUrl,
              concept_images: conceptImages,
              selected_image_index: 0,
            });
            characterImagesGenerated++;
            console.log(`[AutoPipeline] 角色概念图生成成功: ${character.name}`);

            // ── P0 角色四视图：以概念锚点图为参考图生成 大头照/正面/侧面/背面 ──
            // 四视图强化角色一致性（collectShotReferenceImages 已支持 four_view_images 参考注入）
            // 图像模型不支持参考图时逐张降级跳过，不影响概念图主流程
            let fourViewsGenerated = 0;
            try {
              const viewTypes = ['closeup', 'front', 'side', 'back'] as const;
              const fourViewImages: Array<{ url: string; model: string; prompt: string; view_type: string }> = [];
              for (const viewType of viewTypes) {
                try {
                  const fourViewPrompt = buildCharacterFourViewPrompt(character.name, visualDesc || '无描述', viewType, styleDescription || undefined);
                  const fvResult = await aiProxy.generateImage({
                    db, userId: task.userId, projectId: task.projectId,
                    provider: imageModel.provider, modelName: imageModel.modelName,
                    prompt: fourViewPrompt, negativePrompt: charNegativePrompt,
                    count: 1, size: '1440x2560',
                    referenceImages: [conceptUrl], // 锚点图作为参考，保证服装/发型/发色/面容一致
                    saveSubDir: 'character_refs',
                  });
                  if (fvResult.images.length > 0 && fvResult.images[0].url) {
                    fourViewImages.push({ url: fvResult.images[0].url, model: imageModel.modelName, prompt: fourViewPrompt, view_type: viewType });
                  }
                } catch (fvErr: any) {
                  // 单视图失败不影响其他视图（如模型不支持参考图，逐张跳过）
                  console.warn(`[AutoPipeline] 角色四视图 ${viewType} 生成失败 for ${character.name}:`, fvErr.message);
                }
              }
              if (fourViewImages.length > 0) {
                ScriptCharacterDAO.update(db, character.id, { four_view_images: JSON.stringify(fourViewImages) });
                fourViewsGenerated = fourViewImages.length;
                console.log(`[AutoPipeline] 角色四视图生成成功: ${character.name}（${fourViewImages.length}张）`);
              }
            } catch (fourErr: any) {
              // 图像模型不支持参考图或整体失败 → 跳过四视图
              console.warn(`[AutoPipeline] 角色四视图生成失败 for ${character.name}:`, fourErr.message);
            }

            if (fourViewsGenerated > 0) {
              characterFourViewsGenerated++;
            }
          }
        } catch (err: any) {
          console.error(`[AutoPipeline] 角色概念图生成失败 for character=${character.name}:`, err.message);
          // 单角色概念图失败不影响整体流程
        }
      }

      if (characterImagesGenerated > 0) {
        task.stageProgress['characters'] = `第${idx + 1}集提取 ${created.length} 个角色，生成 ${characterImagesGenerated} 张角色概念图`;
      }
      if (characterFourViewsGenerated > 0) {
        task.stageProgress['characters'] = `${task.stageProgress['characters'] || `第${idx + 1}集提取 ${created.length} 个角色`}，生成 ${characterFourViewsGenerated} 组角色四视图`;
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
剧本内容：${episode.script_content?.slice(0, 3000) || ''}

请判断该角色在剧情中需要几套不同造型（如日常装、职业装、睡衣、礼服、运动装等），每套造型给出名称和详细服装描述。
只输出 JSON 数组，格式：[{"name":"日常装","description":"白色衬衫，黑色西裤，皮鞋"},{"name":"睡衣","description":"浅蓝色棉质睡衣套装"}]
最多5套，最少1套。`;

          const outfitResult = await withRetry(
            () => aiProxy.generateText({
              db, userId: task.userId, provider: model.provider, modelName: model.modelName,
              prompt: outfitPrompt, systemPrompt: '你是影视服装设计师，根据剧情场景判断角色需要的服装造型。只输出JSON，不要解释。',
              responseFormat: 'json', maxTokens: 2048,
            }),
            { maxAttempts: 2, label: `造型分析-${character.name}` }
          );

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
  }

  // 所有剧集角色均已存在（无新增/继承）→ 与旧行为一致，提前返回
  if (!processedAny && !extractedCount) {
    return;
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

  // ── shuohao 原生 JSON 校验：MOO 数据 → skill 原生 schema → 真实运行 vendor 脚本 ──
  try {
    const native = await runNativeGates(db, 'characters', { episodeId: first.id, projectId: task.projectId });
    if (native.executed && native.result) {
      console.log(`[AutoPipeline][原生校验] ${native.result.summary}`);
      if (native.result.passed) {
        task.stageProgress['characters'] += `｜原生校验:通过`;
      } else {
        native.result.issues.slice(0, 5).forEach((e: any) => console.warn(`[AutoPipeline][原生校验]   - ${e.message}`));
        task.stageProgress['characters'] += `｜原生校验:${native.result.issues.length}条`;
      }
    } else {
      console.warn('[AutoPipeline][原生校验] 脚本未执行（node/环境问题，跳过）');
      task.stageProgress['characters'] += `｜原生校验:未执行`;
    }
  } catch (nativeErr: any) {
    console.warn('[AutoPipeline] characters 原生校验异常（忽略）:', nativeErr.message);
  }
}
