// 阶段6：分镜生成
import type { Database } from '../../../types';
import { NovelEpisodeDAO, ShotDAO } from '../../../models';
import { aiProxy } from '../../aiProxy';
import { shotGenerationPrompt } from '../../prompts/shotGeneration';
import { promptOptimizationService } from '../../promptOptimizationService';
import { parseAiJsonOrThrow } from '../../../utils/aiJsonParser';
import type { AutoPipelineTask } from '../types';
import { getFirstModel, getOrCreateScriptAnalysis } from '../helpers';
import { saveTask } from '../taskStore';

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

  const { systemPrompt, prompt } = shotGenerationPrompt({
    scriptContent: first.script_content,
    shotDensity: 'normal',
    includeDialogue: true,
  });

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
    prompt: finalPrompt, systemPrompt, responseFormat: 'json', maxTokens: 8192,
  });

  const shots = parseAiJsonOrThrow<any[]>(result.content);
  const list = Array.isArray(shots) ? shots : [shots];

  // 先删旧再创建（与路由逻辑一致）
  const old = ShotDAO.listByEpisode(db, first.id);
  for (const s of old) ShotDAO.delete(db, s.id);

  const created = ShotDAO.batchCreate(db, list.map((s: any) => ({
    user_id: task.userId,
    episode_id: first.id,
    shot_number: s.shotNumber || s.shot_number || 0,
    shot_type: s.shotType || s.shot_type || 'medium',
    camera_movement: s.cameraMovement || s.camera_movement || 'static',
    action_description: s.actionDescription || s.action_description || '',
    dialogue: s.dialogue || '',
    duration_seconds: s.durationSeconds || s.duration_seconds || 5,
    subject: s.subject || null,
    lighting: s.lighting || null,
    mood: s.mood || null,
    transition: s.transition || 'cut',
    pace: s.pace || 'normal',
  })));

  task.stageProgress['shots'] = `生成 ${created.length} 个镜头`;
}
