// 自动流水线任务生命周期：持久化、查询、取消、初始化
// 状态存储在 state.ts 的单一 tasks Map 中，数据库作为持久层
import type { Database } from '../../types';
import { AutoPipelineTaskDAO } from '../../models';
import type { AutoPipelineTask } from './types';
import { tasks } from './state';

/** 持久化任务到数据库 */
export function saveTask(db: Database, task: AutoPipelineTask): void {
  try {
    AutoPipelineTaskDAO.upsert(db, {
      taskId: task.taskId,
      projectId: task.projectId,
      userId: task.userId,
      status: task.status,
      currentStage: task.currentStage,
      stageProgress: task.stageProgress,
      error: task.error,
      startedAt: task.startedAt,
      completedAt: task.completedAt,
    });
  } catch (err) {
    console.error('[AutoPipeline] saveTask failed:', (err as Error).message);
  }
}

/** 获取任务状态（优先内存，未命中则查数据库） */
export function getTask(db: Database, taskId: string): AutoPipelineTask | undefined {
  const memTask = tasks.get(taskId);
  if (memTask) return memTask;

  // 从数据库恢复
  const row = AutoPipelineTaskDAO.get(db, taskId);
  if (!row) return undefined;

  const restored: AutoPipelineTask = {
    taskId: row.task_id,
    projectId: row.project_id,
    userId: row.user_id,
    status: row.status as AutoPipelineTask['status'],
    currentStage: row.current_stage,
    stageProgress: JSON.parse(row.stage_progress || '{}'),
    error: row.error || undefined,
    startedAt: row.started_at,
    completedAt: row.completed_at || undefined,
  };
  // 服务器重启后恢复的 running 任务标记为 interrupted（可恢复）
  if (restored.status === 'running') {
    restored.status = 'interrupted';
    restored.error = '服务器重启，任务中断，可点击恢复继续';
  }
  tasks.set(taskId, restored);
  return restored;
}

/** 获取项目当前运行中的任务（包括 interrupted 可恢复任务） */
export function getCurrentRunningTask(db: Database, projectId: string): AutoPipelineTask | null {
  // 先查内存
  for (const task of tasks.values()) {
    if (task.projectId === projectId && (task.status === 'running' || task.status === 'interrupted')) {
      return task;
    }
  }
  // 查数据库
  const row = AutoPipelineTaskDAO.getCurrentRunning(db, projectId);
  if (!row) return null;
  const restored: AutoPipelineTask = {
    taskId: row.task_id,
    projectId: row.project_id,
    userId: row.user_id,
    status: row.status === 'running' ? 'interrupted' : (row.status as AutoPipelineTask['status']),
    currentStage: row.current_stage,
    stageProgress: JSON.parse(row.stage_progress || '{}'),
    error: row.status === 'running' ? '服务器重启，任务中断，可点击恢复继续' : (row.error || undefined),
    startedAt: row.started_at,
    completedAt: row.completed_at || undefined,
  };
  if (row.status === 'running') {
    AutoPipelineTaskDAO.updateStatus(db, row.task_id, 'interrupted', '服务器重启，任务中断，可点击恢复继续');
  }
  tasks.set(row.task_id, restored);
  return restored;
}

/** 取消运行中的任务 */
export function cancel(db: Database, taskId: string): boolean {
  const task = tasks.get(taskId);
  if (task && task.status === 'running') {
    task.cancelled = true;
    task.status = 'cancelled';
    task.error = '用户取消';
    task.completedAt = new Date().toISOString();
    saveTask(db, task);
    return true;
  }
  // 尝试取消数据库中的任务
  const row = AutoPipelineTaskDAO.get(db, taskId);
  if (row && row.status === 'running') {
    AutoPipelineTaskDAO.cancel(db, taskId);
    return true;
  }
  return false;
}

/** 初始化：标记所有残留的 running 任务为 interrupted（可恢复） */
export function init(db: Database): void {
  const count = AutoPipelineTaskDAO.markAllRunningAsInterrupted(db);
  if (count > 0) {
    console.log(`[AutoPipeline] 标记 ${count} 个中断任务为可恢复状态`);
  }
}
