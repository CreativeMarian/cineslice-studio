// 阶段6：分镜生成
// v2.0 - 场景关联（scene_id 落库）+ 角色资产上下文注入 + 修复 shot_type 列不存在 bug + 道具落库
import type { Database } from '../../../types';
import { NovelEpisodeDAO, ShotDAO, ScriptCharacterDAO } from '../../../models';
import { aiProxy } from '../../aiProxy';
import { shotGenerationPrompt } from '../../prompts/shotGeneration';
import { promptOptimizationService } from '../../promptOptimizationService';
import { parseShotListArray, normalizeZhKeys } from '../../../utils/aiJsonParser';
import { buildShotSceneMap } from '../../shotConsistencyService';
import type { AutoPipelineTask } from '../types';
import { getFirstModel, getOrCreateScriptAnalysis } from '../helpers';
import { saveTask } from '../taskStore';
import { getPromptSkillForVideoModel, applySkillRules } from '../../promptSkills';
import { UserPreferenceDAO } from '../../../models';

export async function stageShots(db: Database, task: AutoPipelineTask): Promise<void> {
  const episodes = NovelEpisodeDAO.listByProject(db, task.projectId);
  const first = episodes[0];
  if (!first) throw new Error('无可用剧集');

  const existing = ShotDAO.listByEpisode(db, first.id);
  if (existing.length > 0) {
    task.stageProgress['shots'] = `已存在 ${existing.length} 个镜头，跳过`;
    return;
  }

  const model = getFirstModel(db, task.userId, 'text');
  if (!model) throw new Error('请先配置文本模型');

  // 剧本分析（在分镜生成之前分析剧情、场景、角色、情绪、节奏）
  const scriptAnalysis = await getOrCreateScriptAnalysis(db, task.projectId, task.userId, first.id);

  // 已有角色资产（定妆信息）→ 注入分镜 prompt，保证分镜描述贴合定妆角色
  const existingCharacters = ScriptCharacterDAO.listByEpisode(db, first.id)
    .filter(c => c.name)
    .map(c => ({ name: c.name, appearance: c.visual_description || c.description || c.name }));

  const { systemPrompt, prompt } = shotGenerationPrompt({
    scriptContent: first.script_content,
    shotDensity: 'normal',
    includeDialogue: true,
    characters: existingCharacters.length > 0 ? existingCharacters : undefined,
  });

  // ── 提示词 Skill：按用户预选视频模型加载官方规范，注入分镜阶段 ──
  const pref = UserPreferenceDAO.getByUser(db, task.userId);
  const promptSkill = getPromptSkillForVideoModel(pref?.default_video_model || undefined);
  if (promptSkill) {
    console.log(`[AutoPipeline] 分镜阶段加载官方提示词 skill: ${promptSkill.displayName}`);
  }
  const finalSystemPrompt = applySkillRules(systemPrompt, promptSkill, 'shotRule');

  // 提示词优化（基于剧本分析结果细化分镜提示词）
  let finalPrompt = prompt;
  if (scriptAnalysis) {
    const optimized = promptOptimizationService.optimizeShotPrompt(prompt, scriptAnalysis);
    finalPrompt = optimized.prompt;
    console.log(`[AutoPipeline] 分镜提示词优化: ${promptOptimizationService.getOptimizationSummary(optimized)}`);
    task.stageProgress['shots'] = '剧本分析完成，正在生成优化后的分镜...';
    saveTask(db, task);
  }

  const result = await aiProxy.generateText({
    db, userId: task.userId, provider: model.provider, modelName: model.modelName,
    prompt: finalPrompt, systemPrompt: finalSystemPrompt, responseFormat: 'json', maxTokens: 32000,
  });

  const shots = parseShotListArray<any[]>(result.content).map((sh: any) => normalizeShotValueSafe(sh));
  const list = Array.isArray(shots) ? shots : [shots];

  // 删除旧镜头 + 创建新镜头在同一事务内：分镜子表（关键帧/视频区间）是
  // ON DELETE CASCADE，插入中途失败（如镜头号重复触发唯一索引）会丢失全部旧分镜
  const created = db.transaction(() => {
    const old = ShotDAO.listByEpisode(db, first.id);
    for (const s of old) ShotDAO.delete(db, s.id);

    // AI 可能返回重复镜头号（uq_shots_episode_num 唯一约束），先顺序去重
    const seen = new Set<number>();
    let nextNum = 1;
    const finalList = list.map((s: any) => {
      let num = s.shotNumber || s.shot_number || 0;
      while (seen.has(num)) num = 10000 + nextNum++;
      seen.add(num);
      return { ...s, shotNumber: num };
    });

    // 阶段兜底：AI 未返回 phase 时，按镜头序号均分到 4 个阶段
    const PHASE_NAMES = ['开场引入', '矛盾升级', '高潮爆发', '收束悬念'];
    const totalCount = finalList.length;
    finalList.forEach((s: any, idx: number) => {
      if (s.phase === undefined || s.phase === null) {
        const phaseNum = Math.min(4, Math.max(1, Math.floor((idx / Math.max(1, totalCount)) * 4) + 1));
        s.phase = phaseNum;
        s.phaseName = PHASE_NAMES[phaseNum - 1];
      }
    });

    // 场景关联：sceneName → 匹配/创建 script_scenes → scene_id 落库（场景参考图链路）
    const sceneMap = buildShotSceneMap(db, task.userId, first.id, finalList);

    return ShotDAO.batchCreate(db, finalList.map((s: any) => ({
      user_id: task.userId,
      episode_id: first.id,
      shot_number: s.shotNumber,
      shot_size: s.shotSize || s.shot_size || 'medium',
      camera_movement: s.cameraMovement || s.camera_movement || 'static',
      action_description: s.actionDescription || s.action_description || '',
      dialogue: s.dialogue || '',
      duration_seconds: s.durationSeconds || s.duration_seconds || 5,
      characters_in_shot: s.charactersInShot ? JSON.stringify(s.charactersInShot) : null,
      props_in_shot: s.propsInShot ? JSON.stringify(s.propsInShot) : null,
      scene_id: s.sceneName ? sceneMap.get(String(s.sceneName).trim()) : undefined,
      subject: s.subject || null,
      lighting: s.lighting || null,
      mood: s.mood || null,
      transition: s.transition || 'cut',
      pace: s.pace || 'normal',
      character_outfits: s.characterOutfits ? JSON.stringify(s.characterOutfits) : null,
      phase: s.phase ?? null,
      phase_name: s.phaseName || null,
    })));
  })();

  task.stageProgress['shots'] = `生成 ${created.length} 个镜头`;
}

const _SHOT_SIZE_MAP: Record<string, string> = { '大远景': 'extreme_wide', '远景': 'long', '全景': 'full', '中景': 'medium', '近景': 'medium_closeup', '特写': 'closeup', '大特写': 'extreme_closeup' };
const _CAMERA_MAP: Record<string, string> = { '推镜': 'push_in', '拉镜': 'pull_out', '摇镜': 'pan', '移镜': 'truck', '升降镜': 'crane', '升降': 'crane', '手持': 'handheld', '稳定器': 'steadicam', '固定': 'static', '固定镜头': 'static' };
const _PACE_MAP: Record<string, string> = { '快': 'fast', '快节奏': 'fast', '中': 'normal', '中速': 'normal', '慢': 'slow', '慢速': 'slow', '慢动作': 'slow_motion', '快动作': 'fast_motion', '长镜头': 'long_take' };
const _TRANS_MAP: Record<string, string> = { '硬切': 'cut', '切': 'cut', '淡入淡出': 'fade', '淡入': 'fade', '淡出': 'fade', '叠化': 'dissolve', '划像': 'wipe', '匹配剪辑': 'match_cut' };
const _PHASE_MAP: Record<string, number> = { '一': 1, '1': 1, '开场引入': 1, '铺垫': 1, '引入': 1, '二': 2, '2': 2, '矛盾升级': 2, '发展': 2, '三': 3, '3': 3, '高潮爆发': 3, '高潮': 3, '四': 4, '4': 4, '收束悬念': 4, '收束': 4, '结局': 4, '尾声': 4 };
function normalizeShotValueSafe(shot: any): any {
  if (!shot || typeof shot !== 'object') return shot;
  const out = { ...shot };
  if (out.shotSize && _SHOT_SIZE_MAP[String(out.shotSize).trim()]) out.shotSize = _SHOT_SIZE_MAP[String(out.shotSize).trim()];
  if (out.cameraMovement && _CAMERA_MAP[String(out.cameraMovement).trim()]) out.cameraMovement = _CAMERA_MAP[String(out.cameraMovement).trim()];
  if (out.pace && _PACE_MAP[String(out.pace).trim()]) out.pace = _PACE_MAP[String(out.pace).trim()];
  if (out.transition && _TRANS_MAP[String(out.transition).trim()]) out.transition = _TRANS_MAP[String(out.transition).trim()];
  if (out.phase !== undefined && out.phase !== null) {
    const key = String(out.phase).trim();
    if (_PHASE_MAP[key]) out.phase = _PHASE_MAP[key];
    else if (/^\d+$/.test(key)) out.phase = Number(key);
    else out.phase = 1;
  }
  for (const k of ['shotNumber', 'durationSeconds']) {
    if (out[k] !== undefined && out[k] !== null && typeof out[k] !== 'number') {
      const n = Number(String(out[k]).replace(/[^\d.]/g, ''));
      out[k] = Number.isFinite(n) ? n : (k === 'durationSeconds' ? 4 : 1);
    }
  }
  for (const k of ['charactersInShot', 'propsInShot']) {
    if (out[k] && typeof out[k] === 'string') out[k] = String(out[k]).split(/[,，、]/).map((x: string) => x.trim()).filter(Boolean);
  }
  if (!out.subject && Array.isArray(out.charactersInShot) && out.charactersInShot.length > 0) out.subject = out.charactersInShot[0];
  return out;
}
