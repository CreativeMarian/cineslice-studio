// 全自动流水线调度器 v2.0：DAG 并行执行 + 幂等跳过 + 断点恢复 + 进度百分比
// 执行计划（DAG）：
//   novel → episodes → script → [characters ‖ scenes] → shots → [keyframes ‖ audio] → video → export
// 并行组内各阶段独立执行、独立失败不影响同组其他阶段；组间严格按依赖顺序。
import type { Database } from '../../types';
import { PipelineService, PIPELINE_STAGES } from '../pipelineService';
import type { AutoPipelineTask } from './types';
import { tasks } from './state';
import { isStageComplete, calculatePipelineProgress } from './helpers';
import { saveTask, getTask, getCurrentRunningTask } from './taskStore';
import { stageNovel } from './stages/novel';
import { stageEpisodes } from './stages/episodes';
import { stageScript } from './stages/script';
import { stageCharacters } from './stages/characters';
import { stageScenes } from './stages/scenes';
import { stageShots } from './stages/shots';
import { stageKeyframes } from './stages/keyframes';
import { stageVideo } from './stages/video';
import { stageAudio } from './stages/audio';
import { stageExport } from './stages/export';

/** 阶段执行器映射 */
const STAGE_EXECUTORS: Record<string, (db: Database, task: AutoPipelineTask) => Promise<void>> = {
  novel: stageNovel,
  episodes: stageEpisodes,
  script: stageScript,
  characters: stageCharacters,
  scenes: stageScenes,
  shots: stageShots,
  keyframes: stageKeyframes,
  video: stageVideo,
  audio: stageAudio,
  export: stageExport,
};

/**
 * DAG 执行计划：每个元素是一个执行步。
 * 单阶段 = 字符串；并行组 = 字符串数组。
 * 并行组内所有阶段完成后才进入下一步。
 */
const EXECUTION_PLAN: Array<string | string[]> = [
  'novel',
  'episodes',
  'script',
  ['characters', 'scenes'],   // 并行：都只依赖 script
  'shots',
  ['keyframes', 'audio'],      // 并行：都只依赖 shots（audio 不需要关键帧）
  'video',                      // 依赖 keyframes
  'export',                     // 依赖 video + audio
];

/** 执行单个阶段（含幂等跳过、取消检查、错误捕获、耗时统计） */
async function executeSingleStage(
  db: Database,
  task: AutoPipelineTask,
  stage: string
): Promise<{ stage: string; success: boolean; error?: string; skipped: boolean }> {
  const startTime = Date.now();

  // 取消检查
  if (task.cancelled) {
    return { stage, success: false, error: '用户取消', skipped: false };
  }

  // 幂等跳过：该阶段已有真实产出时直接跳过
  if (isStageComplete(db, task.projectId, stage)) {
    task.stageProgress[stage] = 'done（已存在，跳过）';
    task.progressPercent = calculatePipelineProgress(task);
    saveTask(db, task);
    console.log(`[AutoPipeline] stage=${stage} already complete, skipped`);
    return { stage, success: true, skipped: true };
  }

  task.currentStage = stage;
  PipelineService.startStage(db, task.projectId, stage as any);
  saveTask(db, task);

  try {
    const executor = STAGE_EXECUTORS[stage];
    if (!executor) throw new Error(`未知阶段: ${stage}`);
    await executor(db, task);

    PipelineService.completeStage(db, task.projectId, stage as any);
    if (!task.stageProgress[stage]) {
      task.stageProgress[stage] = 'done';
    }
    // 记录阶段耗时
    if (!task.stageStats) task.stageStats = {};
    task.stageStats[stage] = {
      retries: task.stageStats?.[stage]?.retries || 0,
      durationMs: Date.now() - startTime,
    };
    task.progressPercent = calculatePipelineProgress(task);
    saveTask(db, task);
    console.log(`[AutoPipeline] stage=${stage} completed in ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
    return { stage, success: true, skipped: false };
  } catch (err: any) {
    const errorMsg = err.message || '未知错误';
    PipelineService.failStage(db, task.projectId, stage as any, errorMsg);
    task.stageProgress[stage] = `failed: ${errorMsg}`;
    if (!task.stageStats) task.stageStats = {};
    task.stageStats[stage] = {
      retries: task.stageStats?.[stage]?.retries || 0,
      durationMs: Date.now() - startTime,
    };
    saveTask(db, task);
    console.error(`[AutoPipeline] stage=${stage} failed after ${((Date.now() - startTime) / 1000).toFixed(1)}s:`, errorMsg);
    return { stage, success: false, error: errorMsg, skipped: false };
  }
}

/**
 * 执行一个执行步（单阶段或并行组）
 * 并行组内：所有阶段并行执行，收集结果；任一失败则标记整个步失败
 */
async function executeStep(
  db: Database,
  task: AutoPipelineTask,
  step: string | string[]
): Promise<{ success: boolean; failedStage?: string; error?: string }> {
  if (typeof step === 'string') {
    const result = await executeSingleStage(db, task, step);
    if (!result.success && !result.skipped) {
      return { success: false, failedStage: step, error: result.error };
    }
    return { success: true };
  }

  // 并行组
  console.log(`[AutoPipeline] 并行组启动: [${step.join(', ')}]`);
  const results = await Promise.all(
    step.map(stage => executeSingleStage(db, task, stage))
  );

  const failures = results.filter(r => !r.success && !r.skipped);
  if (failures.length > 0) {
    // 并行组中取第一个失败作为主错误
    const firstFail = failures[0];
    console.error(`[AutoPipeline] 并行组 [${step.join(', ')}] 中 ${failures.length} 个阶段失败: ${failures.map(f => f.stage).join(', ')}`);
    return { success: false, failedStage: firstFail.stage, error: firstFail.error };
  }
  console.log(`[AutoPipeline] 并行组完成: [${step.join(', ')}]`);
  return { success: true };
}

/**
 * 计算从 resumeFromStage 开始需要跳过的执行步索引
 * 返回第一个需要执行的步索引（之前的步都已完成或幂等跳过）
 */
function findResumeStepIndex(resumeFromStage?: string): number {
  if (!resumeFromStage) return 0;
  for (let i = 0; i < EXECUTION_PLAN.length; i++) {
    const step = EXECUTION_PLAN[i];
    const stages = typeof step === 'string' ? [step] : step;
    if (stages.includes(resumeFromStage)) return i;
  }
  return 0;
}

/**
 * DAG 并行执行所有阶段
 */
export async function runPipeline(db: Database, task: AutoPipelineTask): Promise<void> {
  const { projectId } = task;

  // 初始化流水线为自动模式
  PipelineService.setMode(db, projectId, 'auto');
  PipelineService.initPipeline(db, projectId, 'auto');

  // 断点恢复：从 resumeFromStage 所在步开始（之前的步幂等跳过会自动处理）
  const startStepIdx = findResumeStepIndex(task.resumeFromStage);
  if (startStepIdx > 0) {
    console.log(`[AutoPipeline] 断点恢复：跳过前 ${startStepIdx} 步，从步 ${startStepIdx} 开始`);
  }

  for (let i = startStepIdx; i < EXECUTION_PLAN.length; i++) {
    // 取消检查
    if (task.cancelled) {
      task.status = 'cancelled';
      task.error = '用户取消';
      task.completedAt = new Date().toISOString();
      task.progressPercent = calculatePipelineProgress(task);
      saveTask(db, task);
      console.log(`[AutoPipeline] task=${task.taskId} cancelled at step=${i}`);
      return;
    }

    const step = EXECUTION_PLAN[i];
    const stepLabel = typeof step === 'string' ? step : `[${step.join('+')}]`;
    console.log(`[AutoPipeline] ===== 步 ${i + 1}/${EXECUTION_PLAN.length}: ${stepLabel} ====`);

    const result = await executeStep(db, task, step);

    if (!result.success) {
      task.status = 'failed';
      task.error = result.error || `阶段 ${result.failedStage} 失败`;
      task.completedAt = new Date().toISOString();
      task.progressPercent = calculatePipelineProgress(task);
      saveTask(db, task);
      console.error(`[AutoPipeline] task=${task.taskId} failed at step=${stepLabel}: ${result.error}`);
      return;
    }
  }

  // 最后阶段执行期间用户取消时，不能覆盖为 completed
  if (task.cancelled) {
    task.status = 'cancelled';
    task.error = '用户取消';
    task.completedAt = new Date().toISOString();
    saveTask(db, task);
    console.log(`[AutoPipeline] task=${task.taskId} cancelled during final stage`);
    return;
  }

  task.status = 'completed';
  task.progressPercent = 100;
  task.completedAt = new Date().toISOString();
  saveTask(db, task);
  console.log(`[AutoPipeline] task=${task.taskId} all stages completed (DAG parallel)`);
}

/**
 * 启动全自动流水线（异步执行，立即返回 taskId）
 * v2.0: 并发守卫使用数据库原子查询 + 内存双重检查
 */
export function start(db: Database, projectId: string, userId: string): AutoPipelineTask {
  // 并发守卫：同一项目已有 running/interrupted 任务时拒绝重复启动
  const existing = getCurrentRunningTask(db, projectId);
  if (existing) {
    throw new Error(`该项目已有进行中的全自动任务（${existing.status}），请先等待完成或取消后再启动`);
  }

  const taskId = `auto_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const task: AutoPipelineTask = {
    taskId,
    projectId,
    userId,
    status: 'running',
    currentStage: 'novel',
    stageProgress: {},
    startedAt: new Date().toISOString(),
    progressPercent: 0,
    stageStats: {},
  };
  tasks.set(taskId, task);
  saveTask(db, task);

  // 异步执行
  runPipeline(db, task).catch((err) => {
    task.status = 'failed';
    task.error = err.message || '未知错误';
    task.completedAt = new Date().toISOString();
    saveTask(db, task);
    console.error(`[AutoPipeline] task=${taskId} failed:`, err.message);
  });

  return task;
}

/**
 * 恢复中断的任务
 * v2.0: 正确使用 resumeFromStage 定位到 DAG 中的执行步
 */
export function resume(db: Database, taskId: string): AutoPipelineTask | null {
  const task = getTask(db, taskId);
  if (!task) return null;

  if (task.status !== 'interrupted' && task.status !== 'failed') {
    return task; // 已经在运行或已完成
  }

  // 重置任务状态为 running，从当前阶段恢复
  task.status = 'running';
  task.error = undefined;
  task.completedAt = undefined;
  task.cancelled = false;
  task.resumeFromStage = task.currentStage;
  if (!task.stageStats) task.stageStats = {};

  tasks.set(taskId, task);
  saveTask(db, task);

  console.log(`[AutoPipeline] 恢复任务 ${taskId}，从阶段 ${task.currentStage}（步 ${findResumeStepIndex(task.currentStage) + 1}）继续`);

  // 异步执行
  runPipeline(db, task).catch((err) => {
    task.status = 'failed';
    task.error = err.message || '未知错误';
    task.completedAt = new Date().toISOString();
    saveTask(db, task);
  });

  return task;
}
