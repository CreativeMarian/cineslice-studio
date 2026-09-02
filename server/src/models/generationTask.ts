// 异步生成任务 DAO（P1）
// v1.0

import type { Database, GenerationTask } from '../types';
import { generateId, now } from './index';

export const GenerationTaskDAO = {
  create(db: Database, data: { user_id: string; project_id: string; task_type: string; model_used?: string; input_params?: string }): GenerationTask {
    const id = generateId('task');
    db.prepare(`
      INSERT INTO generation_tasks (id, user_id, project_id, task_type, status, model_used, input_params, progress, created_at)
      VALUES (?, ?, ?, ?, 'pending', ?, ?, 0, ?)
    `).run(id, data.user_id, data.project_id, data.task_type, data.model_used || null, data.input_params || null, now());
    return this.getById(db, id)!;
  },

  list(db: Database, userId: string, options?: { status?: string; projectId?: string; page?: number; limit?: number }): { items: GenerationTask[]; total: number } {
    const page = options?.page || 1;
    const limit = options?.limit || 20;
    const offset = (page - 1) * limit;
    let where = 'WHERE user_id = ?';
    const params: unknown[] = [userId];
    if (options?.status) { where += ' AND status = ?'; params.push(options.status); }
    if (options?.projectId) { where += ' AND project_id = ?'; params.push(options.projectId); }
    const items = db.prepare(`SELECT * FROM generation_tasks ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...params, limit, offset) as GenerationTask[];
    const total = (db.prepare(`SELECT COUNT(*) as count FROM generation_tasks ${where}`).get(...params) as { count: number }).count;
    return { items, total };
  },

  getById(db: Database, id: string): GenerationTask | null {
    return (db.prepare('SELECT * FROM generation_tasks WHERE id = ?').get(id) as GenerationTask) || null;
  },

  getByIdAndUser(db: Database, id: string, userId: string): GenerationTask | null {
    return (db.prepare('SELECT * FROM generation_tasks WHERE id = ? AND user_id = ?').get(id, userId) as GenerationTask) || null;
  },

  update(db: Database, id: string, data: Partial<GenerationTask>): GenerationTask | null {
    const fields = Object.keys(data).filter(k => k !== 'id');
    if (fields.length === 0) return this.getById(db, id);
    const sets = fields.map(f => `${f} = ?`).join(', ');
    db.prepare(`UPDATE generation_tasks SET ${sets} WHERE id = ?`)
      .run(...fields.map(f => (data as any)[f]), id);
    return this.getById(db, id);
  },

  start(db: Database, id: string): void {
    db.prepare("UPDATE generation_tasks SET status = 'running', started_at = ? WHERE id = ?").run(now(), id);
  },

  complete(db: Database, id: string, result: string): void {
    db.prepare("UPDATE generation_tasks SET status = 'completed', result = ?, progress = 100, completed_at = ? WHERE id = ?").run(result, now(), id);
  },

  fail(db: Database, id: string, errorMessage: string): void {
    db.prepare("UPDATE generation_tasks SET status = 'failed', error_message = ?, completed_at = ? WHERE id = ?").run(errorMessage, now(), id);
  },

  cancel(db: Database, id: string): void {
    db.prepare("UPDATE generation_tasks SET status = 'cancelled', completed_at = ? WHERE id = ?").run(now(), id);
  },

  updateProgress(db: Database, id: string, progress: number): void {
    db.prepare('UPDATE generation_tasks SET progress = ? WHERE id = ?').run(progress, id);
  },
};
