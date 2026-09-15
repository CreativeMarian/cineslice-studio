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
import { applyStageRules } from '../../stageSkills';
import { UserPreferenceDAO } from '../../../models';
import { runStageGates } from '../../stageSkills';

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
  const finalSystemPrompt = applyStageRules(applySkillRules(systemPrompt, promptSkill, 'shotRule'), 'shots')

  // ── 台词容量硬规则（novel-script 4.5字/秒 × 固定5秒镜头）──
    + `\n\n【台词容量硬规则（必须遵守）】\n- 每个镜头固定 5 秒（durationSeconds=5），中文台词按 4.5 字/秒折算，5 秒镜头最多装约 20 字台词（留 0.5 秒缓冲）。\n- 若某个镜头台词超过 20 字，必须自动拆分为多个连续镜头：前一镜说完前半句（<=20字），下一镜接后半句，保持动作连贯，景别/机位要有变化（如中景→特写）。\n- 严禁单个镜头台词超过 20 字；长对白必须拆镜，宁多勿塞。`;

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

  // ── 质量门（shuohao-skills 移植）：只读检查 + 台词超时自动拆镜修复 ──
  try {
    let gate = runStageGates(db, 'shots', first.id);
    console.log(`[AutoPipeline][质量门] ${gate.summary}`);
    let errs = gate.issues.filter((i: any) => i.severity === 'error');

    // 台词装不下镜头（4.5字/秒折算）→ 自动拆镜，最多两轮，防止死循环烧额度
    if (errs.some((e: any) => e.rule.includes('台词'))) {
      console.warn(`[AutoPipeline] 检测到台词超时镜头，自动拆镜（最多两轮）...`);
      const r1 = await fixLongDialogueShots(db, task, first.id);
      task.stageProgress['shots'] += `｜自动拆镜:${r1.fixed}成功/${r1.failed}失败`;
      gate = runStageGates(db, 'shots', first.id);
      errs = gate.issues.filter((i: any) => i.severity === 'error');
      if (errs.some((e: any) => e.rule.includes('台词'))) {
        const r2 = await fixLongDialogueShots(db, task, first.id);
        task.stageProgress['shots'] += `｜再拆:${r2.fixed}成功/${r2.failed}失败`;
        gate = runStageGates(db, 'shots', first.id);
        errs = gate.issues.filter((i: any) => i.severity === 'error');
      }
      console.log(`[AutoPipeline][质量门] 拆镜后复检: ${gate.summary}`);
    }

    if (errs.length > 0) {
      errs.slice(0, 5).forEach((e: any) => console.warn(`[AutoPipeline][质量门]   - ${e.message}`));
      task.stageProgress['shots'] += `｜质量门:${errs.length}错`;
    } else {
      task.stageProgress['shots'] += `｜质量门:通过`;
    }
  } catch (gateErr: any) {
    console.warn('[AutoPipeline] shots 质量门执行失败:', gateErr.message);
  }
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

// ── 台词超时自动拆镜：把台词折算超时的镜头拆成多个连续短镜头（每镜5秒、台词≤20字）──
const SPLIT_SYSTEM = `你是一个短剧分镜拆分助手。将台词超长的单个分镜拆成 2-3 个连续的短镜头。硬性要求：每个镜头固定 5 秒（durationSeconds=5），中文台词不超过 20 字（约4.5字/秒×5秒，留缓冲）；拆分后剧情连贯、动作连续；相邻镜头景别/机位要有变化（如中景→特写、推镜→固定）；说话人不变，前后镜头接续同一句话。输出 JSON 数组，每项字段：shotNumber(从1开始)、shotSize、cameraMovement、actionDescription、dialogue、durationSeconds、charactersInShot、propsInShot、subject、lighting、mood。`;

const cjkLenOf = (t: string) => (t.match(/[\u4e00-\u9fa5]/g) || []).length;
const dialogueNeedSeconds = (d: string) => cjkLenOf(d || '') / 4.5;

function buildSplitPrompt(shot: any, prev: any, next: any): string {
  return `以下分镜台词超过镜头容量，请拆分。\n\n前一镜：${prev ? `镜头${prev.shot_number}「${prev.action_description || ''}」台词「${prev.dialogue || ''}」` : '无'}\n本镜（需拆分）：镜头${shot.shot_number}「${shot.action_description || ''}」台词「${shot.dialogue || ''}」同框角色：${shot.characters_in_shot || '无'}\n后一镜：${next ? `镜头${next.shot_number}「${next.action_description || ''}」台词「${next.dialogue || ''}」` : '无'}\n\n请输出拆分后的镜头 JSON 数组（只输出数组，不要其他文字）。`;
}

async function fixLongDialogueShots(db: Database, task: AutoPipelineTask, episodeId: string): Promise<{ fixed: number; failed: number }> {
  const model = getFirstModel(db, task.userId, 'text');
  if (!model) return { fixed: 0, failed: 0 };
  const shots = ShotDAO.listByEpisode(db, episodeId);
  const over = shots.filter((s) => {
    const d = s.dialogue || '';
    if (!d.trim()) return false;
    return dialogueNeedSeconds(d) > (s.duration_seconds || 5) + 0.5;
  });
  if (over.length === 0) return { fixed: 0, failed: 0 };

  let fixed = 0, failed = 0;
  for (const shot of over) {
    try {
      const idx = shots.findIndex((s) => s.id === shot.id);
      const prev = idx > 0 ? shots[idx - 1] : null;
      const next = idx < shots.length - 1 ? shots[idx + 1] : null;
      const result = await aiProxy.generateText({
        db, userId: task.userId, provider: model.provider, modelName: model.modelName,
        prompt: buildSplitPrompt(shot, prev, next), systemPrompt: SPLIT_SYSTEM,
        responseFormat: 'json', maxTokens: 8000,
      });
      const raw = parseShotListArray<any[]>(result.content);
      const newShots = raw.map((s: any) => normalizeShotValueSafe(s)).filter((s: any) => s && s.dialogue);
      if (newShots.length < 2) { failed++; console.warn(`[AutoPipeline] 拆镜结果不足2镜，跳过镜头${shot.shot_number}`); continue; }

      const usable = newShots.slice(0, 3).map((s: any) => ({ ...s, durationSeconds: 5 }));
      const insertCount = usable.length;
      db.transaction(() => {
        ShotDAO.delete(db, shot.id);
        // 该镜之后的镜头号整体后移
        const after = ShotDAO.listByEpisode(db, episodeId)
          .filter((s) => s.shot_number > shot.shot_number)
          .sort((a, b) => a.shot_number - b.shot_number);
        for (const a of after) ShotDAO.update(db, a.id, { shot_number: a.shot_number + insertCount - 1 });
        // 插入新镜头（保持原位置）
        let n = shot.shot_number;
        for (const s of usable) {
          ShotDAO.create(db, {
            user_id: task.userId, episode_id: episodeId, scene_id: shot.scene_id ?? undefined,
            shot_number: n,
            shot_size: s.shotSize || s.shot_size || shot.shot_size || 'medium',
            camera_movement: s.cameraMovement || s.camera_movement || shot.camera_movement || 'static',
            action_description: s.actionDescription || s.action_description || shot.action_description || '',
            dialogue: s.dialogue || '',
            duration_seconds: 5,
            characters_in_shot: s.charactersInShot ? JSON.stringify(s.charactersInShot) : (shot.characters_in_shot ? JSON.stringify(shot.characters_in_shot) : undefined),
            props_in_shot: s.propsInShot ? JSON.stringify(s.propsInShot) : (shot.props_in_shot ? JSON.stringify(shot.props_in_shot) : undefined),
            subject: s.subject || shot.subject || undefined,
            lighting: s.lighting || shot.lighting || undefined,
            mood: s.mood || shot.mood || undefined,
            transition: s.transition || shot.transition || 'cut',
            pace: s.pace || shot.pace || 'normal',
            character_outfits: shot.character_outfits ?? undefined,
            phase: shot.phase ?? null,
            phase_name: shot.phase_name || null,
          });
          n++;
        }
      })();
      console.log(`[AutoPipeline] 镜头${shot.shot_number} 拆成 ${insertCount} 镜`);
      fixed++;
    } catch (e: any) {
      console.warn(`[AutoPipeline] 拆镜失败（镜头${shot.shot_number}）:`, e.message);
      failed++;
    }
  }
  return { fixed, failed };
}
