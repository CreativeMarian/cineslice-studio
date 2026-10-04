// 关键帧生成服务（P3-9 拆分自 episodeProductionService.ts）
// 单镜/单帧/批量关键帧生成 相关逻辑
// 由 episodeProductionService.ts 作为 index 统一重新导出

import {
  NovelEpisodeDAO,
  ShotDAO,
  ShotKeyframeDAO,
  ScriptCharacterDAO,
  ScriptSceneDAO,
  ProjectDAO,
} from '../models';
import { createError } from '../middleware/errorHandler';
import { ErrorCodes } from '../errors';
import { aiProxy } from './aiProxy';
import { buildFullKeyframePrompt } from './promptBuilder';
import { getKeyframeSize } from '../constants';
import {
  collectShotReferenceImages,
  generateKeyframeCandidates,
  parseShotCharacterIds,
} from './shotConsistencyService';
import type { Database, ScriptCharacter, ScriptScene, Shot } from '../types';

// ============ 关键帧 ============

/**
 * 生成关键帧（支持 first/last/middle 多帧类型与角色/场景参考图）
 * @param db 数据库实例
 * @param userId 当前用户 ID（校验镜头归属）
 * @param shotId 镜头 ID
 * @param opts 生成选项（provider/modelName 必填；frameTypes/referenceCharacterIds/referenceSceneId 可选）
 * @returns 新创建的关键帧记录列表（每帧型一条）
 * @sideEffects 调用图像模型生成并写入 shot_keyframes 表；输出生成过程日志
 */
export async function generateKeyframesForShot(
  db: Database,
  userId: string,
  shotId: string,
  opts: {
    provider: string;
    modelName: string;
    frameTypes?: Array<'first' | 'last' | 'middle'>;
    referenceCharacterIds?: string[];
    referenceSceneId?: string;
    customPrompt?: string;   // 自定义关键帧提示词：undefined=未传（回退已存 custom_keyframe_prompt），''=清空并自动构建
  }
) {
  const shot = ShotDAO.getByIdAndUser(db, shotId, userId);
  if (!shot) throw createError(404, ErrorCodes.NOT_FOUND, '镜头不存在');

  const episode = NovelEpisodeDAO.getById(db, shot.episode_id);
  if (!episode) throw createError(404, ErrorCodes.NOT_FOUND, '剧集不存在');

  const { provider, modelName, frameTypes, referenceCharacterIds, referenceSceneId, customPrompt } = opts;

  // P3: 自定义提示词解析（优先级：本次传入 > 已保存 custom_keyframe_prompt > 自动构建）
  // 显式传入时落库（'' = 清除），供预览接口与下次生成默认使用
  let finalCustomPrompt: string | null = null;
  if (customPrompt !== undefined) {
    finalCustomPrompt = customPrompt.trim() ? customPrompt.trim() : null;
    ShotDAO.update(db, shot.id, { custom_keyframe_prompt: finalCustomPrompt });
  } else if (shot.custom_keyframe_prompt && shot.custom_keyframe_prompt.trim()) {
    finalCustomPrompt = shot.custom_keyframe_prompt.trim();
  }
  if (finalCustomPrompt) {
    console.log(`[Keyframe] 使用自定义关键帧提示词（custom_keyframe_prompt），长度=${finalCustomPrompt.length}`);
  }
  console.log('[Keyframe] start:', { provider, modelName, frameTypes, shotId: shot.id, projectId: episode.project_id });

  // 获取参考角色（显式传入优先；缺省自动按镜头 characters_in_shot 收集——前端/批量入口无需感知，防旧图缓存与角色漂移）
  const referenceImages: string[] = [];
  const charactersInShot: ScriptCharacter[] = [];   // P0-1: 出场角色实体（promptBuilder 身份锁/服装块使用）
  const charRefs: string[] = (referenceCharacterIds && referenceCharacterIds.length > 0)
    ? referenceCharacterIds
    : parseShotCharacterIds(shot);
  if (charRefs.length > 0) {
    for (const ref of charRefs) {
      let c = ScriptCharacterDAO.getById(db, ref);
      if (!c) {
        const epChars = ScriptCharacterDAO.listByEpisode(db, shot.episode_id);
        c = epChars.find((x: any) => x.name === ref) || null;
      }
      if (c) charactersInShot.push(c);
    }
  }
  // P1-1: 角色参考图改用 collectShotReferenceImages（与视频生成一致，完整 fallback 链：
  //       镜头造型定妆照 → 默认造型 → reference_image_url → concept_images → four_view）。
  //       手动生成概念图后 assets 路由只写 concept_images 不写 reference_image_url，
  //       旧逻辑只认 reference_image_url 会引用不到最新概念图——断链根因。
  try {
    const shotRefImages = collectShotReferenceImages(db, shot);
    for (const imgUrl of shotRefImages) {
      if (imgUrl && !referenceImages.includes(imgUrl)) referenceImages.push(imgUrl);
    }
  } catch (refErr) {
    console.warn('[Keyframe] 角色参考图收集失败（回退无参考图）:', (refErr as Error).message);
  }

  // 获取参考场景：优先传入的 referenceSceneId，缺省自动用 shot.scene_id
  let scene: ScriptScene | null = null;
  const effectiveSceneId = referenceSceneId || shot.scene_id;
  if (effectiveSceneId) {
    scene = ScriptSceneDAO.getById(db, effectiveSceneId);
    // 收集场景参考图（DAO层已解析concept_images为数组）
    if (scene?.concept_images && Array.isArray(scene.concept_images)) {
      const sceneImages = scene.concept_images;
      if (sceneImages.length > 0) {
        const sceneImgUrl = sceneImages[scene.selected_image_index || 0]?.url || sceneImages[0]?.url;
        if (sceneImgUrl) referenceImages.push(sceneImgUrl);
      }
    }
  }

  // 上下文衔接：获取前一镜的动作描述，确保镜头间画面连贯
  let prevShotContext = '';
  try {
    const allShots = ShotDAO.listByEpisode(db, shot.episode_id);
    const currentIdx = allShots.findIndex(s => s.id === shot.id);
    if (currentIdx > 0) {
      const prevShot = allShots[currentIdx - 1];
      if (prevShot?.action_description) {
        prevShotContext = `\n【上下文衔接 — 上一镜画面】\n上一镜：${prevShot.action_description.substring(0, 200)}\n本镜必须与上一镜在同一个场景中，角色位置、朝向、状态必须与上一镜结束时连贯衔接。`;
      }
    }
  } catch (ctxErr) {
    console.warn('[Keyframe] 上下文衔接获取失败:', (ctxErr as Error).message);
  }

  const types = frameTypes || ['first', 'last'];
  const results = [];

  // P1-9: 关键帧尺寸统一走 constants.getKeyframeSize（管线路径与手动路径同一映射）。
  // 注：aiProxy.generateImage 仅接受固定尺寸白名单，4:3/3:4/21:9 目标尺寸不在白名单，
  //     函数内取最接近的受支持尺寸（见 constants.ts 注释）
  const project = episode ? (ProjectDAO.getById(db, episode.project_id) || null) : null;
  const keyframeSize = getKeyframeSize(project?.aspect_ratio || null);

  for (const frameType of types) {
    try {
      console.log('[Keyframe] generating frame:', frameType);
      // P1-13: 生成前检查是否已有相同 (shot_id, frame_type) 的关键帧——先删除旧的同类型关键帧，
      //        避免重复生成/重新生成时新旧并存（列表出现重复帧）
      const existingSameType = ShotKeyframeDAO.listByShot(db, shot.id).filter(k => k.frame_type === frameType);
      if (existingSameType.length > 0) {
        console.log(`[Keyframe] 清理旧 ${frameType} 帧 ${existingSameType.length} 条（重新生成）`);
        for (const oldKf of existingSameType) ShotKeyframeDAO.delete(db, oldKf.id);
      }
      // 从 action_description 提取动作弧三段式：首帧=起始状态、尾帧=结束状态、中帧=动作过程
      // （分镜生成时三段式混在 action_description 中，未拆独立列；此处按帧型提取实现首尾帧画面差异化）
      const actionDesc = shot.action_description || '';
      let frameSpecificDescription: string | undefined;
      const segStart = actionDesc.match(/【起始状态】([^【]*)/);
      const segProc = actionDesc.match(/【动作过程】([^【]*)/);
      const segEnd = actionDesc.match(/【结束状态】([^【]*)/);
      if (frameType === 'first' && segStart) frameSpecificDescription = segStart[1].trim();
      else if (frameType === 'last' && segEnd) frameSpecificDescription = segEnd[1].trim();
      else if (frameType === 'middle' && segProc) frameSpecificDescription = segProc[1].trim();
      // 关键帧提示词：P0-1 使用 promptBuilder 模块化拼接（项目风格 + 身份锁定块 + 服装块 + 场景块 + 调度块 + 动作 + 禁令行）
      // 帧型差异（首帧=起始状态/尾帧=结束状态/中帧=动作过程）通过替换 shot.action_description 实现
      const subject = frameSpecificDescription || shot.action_description || '';
      const sceneForPrompt: ScriptScene | null = scene || null;
      const frameShot: Shot = { ...shot, action_description: subject };
      // P1-5: prevShotContext 作为 extraContext 传入，插到禁令行之前（保留块内），
      //       不再追加在禁令行之后（避免禁令被上下文"挤出"尾部语义）
      // P3: 自定义提示词有值时直接使用，跳过自动构建（帧型差异由用户提示词自行把控）
      const finalPrompt = finalCustomPrompt
        ? finalCustomPrompt
        : buildFullKeyframePrompt(frameShot, charactersInShot, sceneForPrompt, project, prevShotContext || undefined);
      const finalNegativePrompt: string | undefined = undefined;

      console.log('[Keyframe] prompt generated, length:', finalPrompt.length);

      // Pollinations FLUX 对英文提示词理解远优于中文：先经 deepseek 翻译成英文
      let effectivePrompt = finalPrompt;
      if (provider === 'pollinations') {
        try {
          const trans = await aiProxy.generateText({
            db, userId,
            provider: 'deepseek', modelName: 'deepseek-chat',
            prompt: 'You are a professional prompt translator for AI image generation models. Translate the following Chinese image prompt into fluent, detailed English. Keep EVERY visual detail: characters, clothing, props, scene, background, action, body pose, camera angle, lighting, color tone, mood and art style. For Chinese-style elements (costume, architecture, props) use clear English descriptions instead of raw pinyin. Output ONLY the English translation with no explanation, no quotes.\n\n' + finalPrompt,
            temperature: 0.3,
            maxTokens: 900,
          });
          const t = (trans.content || '').trim();
          if (t.length > 20) effectivePrompt = t;
        } catch (transErr) {
          console.warn('[Keyframe] FLUX提示词翻译失败，使用中文原词:', (transErr as Error).message);
        }
      }

      const imgResult = await aiProxy.generateImage({
        db, userId, projectId: episode.project_id,
        provider, modelName, prompt: effectivePrompt, negativePrompt: finalNegativePrompt,
        count: 1, size: keyframeSize,
        referenceImages: referenceImages.length > 0 ? referenceImages : undefined,
        saveSubDir: 'keyframes',
        skipCache: true, // 关键帧生成跳过缓存，确保修改提示词后重新生成得到新图
      });
      console.log('[Keyframe] image generated:', imgResult.images?.length);

      const keyframe = ShotKeyframeDAO.create(db, {
        user_id: userId,
        shot_id: shot.id,
        frame_type: frameType,
        prompt: effectivePrompt,
        negative_prompt: finalNegativePrompt,
        image_url: imgResult.images[0]?.url,
        image_model_used: modelName,
        reference_characters: charRefs.length > 0 ? JSON.stringify(charRefs) : undefined,
        reference_scene: referenceSceneId || undefined,
      });
      results.push(keyframe);
    } catch (err: any) {
      console.error('[Keyframe] frame generation failed:', frameType, err.message, err.stack);
      throw err;
    }
  }

  return results;
}

/**
 * 重新生成单帧（可选提示词优化）。
 * @param db 数据库实例
 * @param userId 当前用户 ID（校验关键帧归属）
 * @param keyframeId 关键帧 ID
 * @param opts 生成选项（provider/modelName 必填；optimizePrompt 可选）
 * @returns 更新后的关键帧记录
 * @sideEffects 用原提示词重新调用图像模型并更新 shot_keyframes 行
 */
export async function regenerateKeyframe(
  db: Database,
  userId: string,
  keyframeId: string,
  opts: { provider: string; modelName: string; optimizePrompt?: boolean }
) {
  const keyframe = ShotKeyframeDAO.getByIdAndUser(db, keyframeId, userId);
  if (!keyframe) throw createError(404, ErrorCodes.NOT_FOUND, '关键帧不存在');

  const shot = ShotDAO.getById(db, keyframe.shot_id);
  const episode = NovelEpisodeDAO.getById(db, shot!.episode_id);
  const { provider, modelName } = opts;

  // 极简系统：直接用原提示词重生成（一致性靠参考图，不再做优化/包装）
  let finalPrompt = keyframe.prompt;
  let finalNegativePrompt = keyframe.negative_prompt || undefined;

  const result = await aiProxy.generateImage({
    db, userId, projectId: episode!.project_id,
    provider, modelName,
    prompt: finalPrompt,
    negativePrompt: finalNegativePrompt,
    count: 1, size: '2560x1440',
    saveSubDir: 'keyframes',
    referenceImages: collectShotReferenceImages(db, shot!),
    skipCache: true, // 重新生成关键帧跳过缓存
  });

  return ShotKeyframeDAO.update(db, keyframe.id, {
    image_url: result.images[0]?.url,
    image_model_used: modelName,
    prompt: finalPrompt,
    negative_prompt: finalNegativePrompt,
  });
}

// ============ 批量生成 ============

/**
 * 批量生成首帧关键帧（对已有首帧的镜头先删后生成）。
 * @param db 数据库实例
 * @param userId 当前用户 ID（校验剧集归属）
 * @param episodeId 剧集 ID
 * @param opts 生成选项（provider/modelName 必填；shotIds/candidatesPerShot/frameTypes 可选）
 * @param _onProgress 进度回调（当前未使用，保留签名兼容）
 * @returns 生成结果汇总（total/success/skipped/failed + 明细）
 * @sideEffects 逐镜生成关键帧（含限流退避与请求间隔），新帧落库后删除旧首帧
 */
export async function batchGenerateKeyframes(
  db: Database,
  userId: string,
  episodeId: string,
  opts: { provider: string; modelName: string; shotIds?: string[]; candidatesPerShot?: number; frameTypes?: Array<'first' | 'last' | 'middle'> },
  _onProgress?: (p: { index: number; total: number; shotId: string; status: 'ok' | 'failed' }) => void
) {
  const episode = NovelEpisodeDAO.getByIdAndUser(db, episodeId, userId);
  if (!episode) throw createError(404, ErrorCodes.NOT_FOUND, '剧集不存在');

  const { provider, modelName, shotIds, candidatesPerShot } = opts;
  const candidateCount = Math.min(Math.max(candidatesPerShot || 1, 1), 9);

  let shots = ShotDAO.listByEpisode(db, episode.id);
  if (shotIds && shotIds.length > 0) {
    shots = shots.filter(s => shotIds.includes(s.id));
  }

  const results: any[] = [];
  const errors: Array<{ shotId: string; error: string }> = [];

  for (const shot of shots) {
    // 重新生成首帧：必须先生成成功、再删除旧帧。
    // 旧逻辑先删后生成，一旦生成失败（限流/Key 失效），镜头唯一的首帧永久丢失，
    // 下游视频生成会因"无首帧关键帧"跳过该镜头
    try {
      // 九宫格候选模式：生成 N 个视角候选（frame_type='candidate'），不删除旧首帧，
      // 用户挑选满意的一张后经"选择为首帧"接口升级（BigBanana 九宫格方案）
      if (candidateCount > 1) {
        const candidates = await generateKeyframeCandidates(db, userId, shot, {
          provider,
          modelName,
          count: candidateCount,
          referenceImages: collectShotReferenceImages(db, shot),
        });
        results.push({ shotId: shot.id, success: true, mode: 'candidates', candidates });
        continue;
      }

      // 复用单镜完整逻辑：角色参考（缺省自动按镜头角色收集）+ 场景 + 提示词优化 + 参考图注入
      // 与前端单镜/批量入口行为完全一致，防止批量关键帧缺角色描述导致人物漂移
      const kfs = await generateKeyframesForShot(db, userId, shot.id, {
        provider,
        modelName,
        frameTypes: opts.frameTypes || ['first'],
      });
      const keyframe = kfs[0];

      // 新帧落库成功后再移除旧帧（保留新生成的 first）
      const existing = ShotKeyframeDAO.listByShot(db, shot.id);
      const existingFirst = existing.find(k => k.frame_type === 'first' && k.image_url && k.id !== keyframe.id);
      if (existingFirst) {
        ShotKeyframeDAO.delete(db, existingFirst.id);
      }
      results.push({ shotId: shot.id, success: true, keyframe });
    } catch (err: any) {
      const errorMsg = err.message || '生成失败';
      console.error(`[BatchKeyframe] 镜头 ${shot.id} 生成失败:`, errorMsg);
      errors.push({ shotId: shot.id, error: errorMsg });
      results.push({ shotId: shot.id, success: false, error: errorMsg });
      // 速率限制：额外冷却再继续（Agnes 免费额度分钟级限流）
      if (errorMsg.includes('rate limit') || errorMsg.includes('限流') || err.code === 'AI_RATE_LIMITED') {
        await new Promise(resolve => setTimeout(resolve, Number(process.env.BATCH_KEYFRAME_RATE_LIMIT_BACKOFF_MS) || 30000));
      }
    }

    // 请求间隔：避免速率限制（Agnes AI 免费额度分钟级限流），可用环境变量 BATCH_KEYFRAME_INTERVAL_MS 调整
    await new Promise(resolve => setTimeout(resolve, Number(process.env.BATCH_KEYFRAME_INTERVAL_MS) || 20000));
  }

  return {
    total: shots.length,
    success: results.filter(r => r.success).length,
    skipped: results.filter(r => r.skipped).length,
    failed: errors.length,
    results,
  };
}
