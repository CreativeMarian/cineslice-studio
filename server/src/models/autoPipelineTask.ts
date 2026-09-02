// 全自动流水线任务 DAO
// v1.0 - 任务状态持久化到数据库，支持服务器重启后恢复查询

import type { Database } from '../types';
import { now } from './index';

export interface AutoPipelineTaskRow {
  task_id: string;
  project_id: string;
  user_id: string;
  status: string; // running | completed | failed | cancelled
  current_stage: string;
  stage_progress: string; // JSON string
  error: string | null;
  started_at: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export const AutoPipelineTaskDAO = {
  /** 插入或更新任务 */
  upsert(db: Database, task: {
    taskId: string;
    projectId: string;
    userId: string;
    status: string;
    currentStage: string;
    stageProgress: Record<string, string>;
    error?: string;
    startedAt: string;
    completedAt?: string;
  }): void {
    db.prepare(`
      INSERT OR REPLACE INTO auto_pipeline_tasks
        (task_id, project_id, user_id, status, current_stage, stage_progress, error, started_at, completed_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      task.taskId,
      task.projectId,
      task.userId,
      task.status,
      task.currentStage,
      JSON.stringify(task.stageProgress),
      task.error || null,
      task.startedAt,
      task.completedAt || null,
      now()
    );
  },

  /** 根据 taskId 获取任务 */
  get(db: Database, taskId: string): AutoPipelineTaskRow | null {
    const row = db.prepare('SELECT * FROM auto_pipeline_tasks WHERE task_id = ?').get(taskId) as AutoPipelineTaskRow | undefined;
    return row || null;
  },

  /** 获取项目最新的运行中或可恢复任务 */
  getCurrentRunning(db: Database, projectId: string): AutoPipelineTaskRow | null {
    const row = db.prepare(
      "SELECT * FROM auto_pipeline_tasks WHERE project_id = ? AND status IN ('running', 'interrupted') ORDER BY started_at DESC LIMIT 1"
    ).get(projectId) as AutoPipelineTaskRow | undefined;
    return row || null;
  },

  /** 将所有运行中任务标记为失败（服务器重启时调用）- 保留兼容 */
  markAllRunningAsFailed(db: Database): number {
    const result = db.prepare(
      "UPDATE auto_pipeline_tasks SET status = 'failed', error = '服务器重启，任务中断', completed_at = ?, updated_at = ? WHERE status = 'running'"
    ).run(now(), now());
    return result.changes;
  },

  /** 将所有运行中任务标记为 interrupted（可恢复）- 服务器重启时调用 */
  markAllRunningAsInterrupted(db: Database): number {
    const result = db.prepare(
      "UPDATE auto_pipeline_tasks SET status = 'interrupted', error = '服务器重启，任务中断，可点击恢复继续', updated_at = ? WHERE status = 'running'"
    ).run(now());
    return result.changes;
  },

  /** 更新任务状态 */
  updateStatus(db: Database, taskId: string, status: string, error?: string): void {
    db.prepare(
      'UPDATE auto_pipeline_tasks SET status = ?, error = ?, completed_at = ?, updated_at = ? WHERE task_id = ?'
    ).run(status, error || null, status !== 'running' ? now() : null, now(), taskId);
  },

  /** 取消任务 */
  cancel(db: Database, taskId: string): void {
    db.prepare(
      "UPDATE auto_pipeline_tasks SET status = 'cancelled', error = '用户取消', completed_at = ?, updated_at = ? WHERE task_id = ? AND status = 'running'"
    ).run(now(), now(), taskId);
  },
};
