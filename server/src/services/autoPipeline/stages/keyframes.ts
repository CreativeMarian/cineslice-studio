// 阶段7：关键帧批量生成
import type { Database } from '../../../types';
import {
  NovelEpisodeDAO,
  ShotDAO,
  ScriptCharacterDAO,
  ScriptSceneDAO,
  ShotKeyframeDAO,
} from '../../../models';
import { aiProxy } from '../../aiProxy';
import { buildKeyframePrompt } from '../../prompts/keyframe';
import { collectShotReferenceImages } from '../../shotConsistencyService';
import { parseCharactersInShot } from '../../../models/shot';
import type { AutoPipelineTask } from '../types';
import { getFirstModel, getProjectStyleDescription } from '../helpers';
import { saveTask } from '../taskStore';
import { visualMemoryService } from '../../visualMemoryService';

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

  // 统一风格前缀（从项目风格描述读取，极简系统：一句话拼在提示词开头）
  const styleDescription = getProjectStyleDescription(db, task.projectId);

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

      // 收集角色视觉描述（服装/面部/年龄/发型），与参考图形成双重约束，防止角色漂移
      const characterVisualDescriptions: string[] = [];
      for (const cid of characterIds) {
        const c = allCharacters.find((x: any) => x.id === cid);
        if (c) {
          const visualDesc = c.visual_prompt || c.visual_description || c.description || '';
          if (visualDesc) characterVisualDescriptions.push(`${c.name}：${visualDesc}`);
        }
      }
      const characterDescBlock = characterVisualDescriptions.length > 0
        ? `\n【出场角色形象 — 必须严格保持与参考图一致】\n${characterVisualDescriptions.join('\n')}\n以上角色的面容、发型、发色、服装、体型、年龄感必须与参考图完全一致，绝对不能更换人物形象。`
        : '';

      // 获取场景信息（场景参考图已由 collectShotReferenceImages 统一收集）

      // 收集一致性参考图：角色定妆照 + 场景概念图 + 道具图
      // 参考 ArcReel/BigBanana：每镜注入"当前角色+场景+道具"参考，显著降低人物/场景漂移
      const referenceImages = collectShotReferenceImages(db, shot);

      // ═══════════════════════════════════════════════════════════
      // 关键帧提示词（v3.1）：首帧/尾帧画面描述 + 角色视觉描述（双重保障一致性）+ 风格前缀
      // 画面描述优先取 frameSpecificDescription 字段，回退到动作弧【起始状态】/【结束状态】分段
      // 一致性靠参考图 + 角色视觉描述文字双重约束
      // ═══════════════════════════════════════════════════════════
      const firstDesc = shot.first_frame_description || extractFrameDesc(shot.action_description, 'first') || shot.action_description || '';
      const lastDesc = shot.last_frame_description || extractFrameDesc(shot.action_description, 'last') || shot.action_description || '';
      const finalFirstPrompt = buildKeyframePrompt(firstDesc + characterDescBlock, styleDescription || undefined);
      const finalLastPrompt = buildKeyframePrompt(lastDesc + characterDescBlock, styleDescription || undefined);
      const finalNegativePrompt: string | undefined = undefined;

      console.log(`[AutoPipeline] keyframe shot=${shot.shot_number} 提示词生成完成`);

      // 局部函数：生成一帧关键帧并入库（first=镜头起始画面 / last=镜头结尾画面）
      const genFrame = async (frameType: 'first' | 'last', promptText: string): Promise<boolean> => {
        let attempts = 0;
        const MAX_ATTEMPTS = 6;
        while (attempts < MAX_ATTEMPTS) {
          attempts++;
          try {
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
            skipCache: true, // 全自动流水线关键帧生成跳过缓存
          });
          const url = imgResult.images[0]?.url;
          if (!url) return false;
          const kf = ShotKeyframeDAO.create(db, {
            user_id: task.userId,
            shot_id: shot.id,
            frame_type: frameType,
            prompt: effectivePrompt,
            negative_prompt: finalNegativePrompt,
            image_url: url,
            image_model_used: model.modelName,
          });

          // ═══════════════════════════════════════════════════════════════
          // P0-2: 关键帧自动入库视觉记忆库
          // 按角色/场景/通用分别索引，供后续镜头检索参考
          // ═══════════════════════════════════════════════════════════════
          try {
            const charNames = characterIds
              .map(id => allCharacters.find(c => c.id === id)?.name)
              .filter((n): n is string => !!n);
            let sceneName = '';
            if (shot.scene_id) {
              const scenes = ScriptSceneDAO.listByEpisode(db, first.id);
              sceneName = scenes.find(s => s.id === shot.scene_id)?.name || '';
            }
            visualMemoryService.indexKeyframe(
              db, task.projectId, first.id, shot.id, kf.id, url,
              frameType, charNames, sceneName
            );
          } catch (memErr) {
            console.warn(`[AutoPipeline] keyframe shot=${shot.shot_number} 视觉记忆入库失败:`, (memErr as Error).message);
          }

          generated++;
          task.stageProgress['keyframes'] = `生成中 ${generated} 帧（${frameType}），跳过 ${skipped}`;
          saveTask(db, task);
          return true;
          } catch (err: any) {
            const msg = (err as Error).message || '';
            const isRateLimit = /rate[_\- ]?limit|限流|429|Too Many Requests/i.test(msg);
            if (isRateLimit && attempts < MAX_ATTEMPTS) {
              const waitMs = 15000 * attempts; // 15s/30s/45s/60s/75s 逐次加长
              console.warn(`[AutoPipeline] keyframe shot=${shot.shot_number} ${frameType} 触发限流，第 ${attempts}/${MAX_ATTEMPTS} 次退避 ${waitMs}ms 后重试`);
              await new Promise<void>(r => setTimeout(r, waitMs));
              continue;
            }
            console.error(`[AutoPipeline] keyframe shot=${shot.id} ${frameType} 生成失败:`, msg);
            return false;
          }
        }
        return false;
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
