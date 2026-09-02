// 全自动流水线调度器：串行执行 9 个阶段，支持启动与断点恢复
import type { Database } from '../../types';
import { PipelineService, PIPELINE_STAGES } from '../pipelineService';
import type { AutoPipelineTask } from './types';
import { tasks } from './state';
import { saveTask, getTask , getCurrentRunningTask } from './taskStore';
import { stageNovel } from './stages/novel';
import { stageEpisodes } from './stages/episodes';
import { stageScript } from './stages/script';
import { stageCharacters } from './stages/characters';
import { stageScenes } from './stages/scenes';
import { stageShots } from './stages/shots';
import { stageKeyframes } from './stages/keyframes';
import { stageAudio } from './stages/audio';
import { stageVideo } from './stages/video';

/**
 * 串行执行所有阶段
 */
export async function runPipeline(db: Database, task: AutoPipelineTask): Promise<void> {
  const { projectId } = task;

  // 初始化流水线为自动模式
  PipelineService.setMode(db, projectId, 'auto');
  PipelineService.initPipeline(db, projectId, 'auto');

  for (const stage of PIPELINE_STAGES) {
    // 检查取消
    if (task.cancelled) {
      task.status = 'cancelled';
      task.error = '用户取消';
      task.completedAt = new Date().toISOString();
      saveTask(db, task);
      console.log(`[AutoPipeline] task=${task.taskId} cancelled at stage=${stage}`);
      return;
    }

    task.currentStage = stage;
    PipelineService.startStage(db, projectId, stage);
    saveTask(db, task);

    try {
      switch (stage) {
        case 'novel':
          await stageNovel(db, task);
          break;
        case 'episodes':
          await stageEpisodes(db, task);
          break;
        case 'script':
          await stageScript(db, task);
          break;
        case 'characters':
          await stageCharacters(db, task);
          break;
        case 'scenes':
          await stageScenes(db, task);
          break;
        case 'shots':
          await stageShots(db, task);
          break;
        case 'keyframes':
          await stageKeyframes(db, task);
          break;
        case 'audio':
          await stageAudio(db, task);
          break;
        case 'video':
          await stageVideo(db, task);
          break;
      }
      PipelineService.completeStage(db, projectId, stage);
      // 保留阶段方法设置的详细进度，若未设置则标记为 done
      if (!task.stageProgress[stage]) {
        task.stageProgress[stage] = 'done';
      }
      saveTask(db, task);
      console.log(`[AutoPipeline] stage=${stage} completed`);
    } catch (err: any) {
      PipelineService.failStage(db, projectId, stage, err.message || '未知错误');
      task.stageProgress[stage] = `failed: ${err.message}`;
      task.status = 'failed';
      task.error = err.message || '未知错误';
      task.completedAt = new Date().toISOString();
      saveTask(db, task);
      console.error(`[AutoPipeline] stage=${stage} failed:`, err.message);
      return;
    }
  }

  // 最后一个阶段执行期间用户取消时，不能把任务覆盖为 completed
  if (task.cancelled) {
    task.status = 'cancelled';
    task.error = '用户取消';
    task.completedAt = new Date().toISOString();
    saveTask(db, task);
    console.log(`[AutoPipeline] task=${task.taskId} cancelled during final stage`);
    return;
  }

  task.status = 'completed';
  task.completedAt = new Date().toISOString();
  saveTask(db, task);
  console.log(`[AutoPipeline] task=${task.taskId} all stages completed`);
}

/**
 * 启动全自动流水线（异步执行，立即返回 taskId）
 */
export function start(db: Database, projectId: string, userId: string): AutoPipelineTask {
  // 并发守卫：同一项目已有 running/interrupted 任务时拒绝重复启动，
  // 防止双击/重复请求造成双份 AI 花费与状态互相覆盖
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
 * 从当前阶段重新开始，已完成的阶段跳过（幂等性）
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

  tasks.set(taskId, task);
  saveTask(db, task);

  console.log(`[AutoPipeline] 恢复任务 ${taskId}，从阶段 ${task.currentStage} 继续`);

  // 异步执行
  runPipeline(db, task).catch((err) => {
    task.status = 'failed';
    task.error = err.message || '未知错误';
    task.completedAt = new Date().toISOString();
    saveTask(db, task);
  });

  return task;
}
