// 项目 DAO
// v1.0

import type { Database, Project } from '../types';
import { generateId, now } from './index';

export const ProjectDAO = {
  create(db: Database, data: {
    user_id: string;
    title: string;
    description?: string;
    genre?: string;
    target_duration?: string;
    language?: string;
    pipeline_step?: string;
    mode?: 'auto' | 'semi-auto';
    style_preset_id?: string;
  }): Project {
    const id = generateId('proj');
    db.prepare(`
      INSERT INTO projects (id, user_id, title, description, stage, status, genre, target_duration, language, pipeline_step, mode, style_preset_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'script', 'active', ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      data.user_id,
      data.title,
      data.description || null,
      data.genre || null,
      data.target_duration || '3min',
      data.language || 'zh',
      data.pipeline_step || 'novel',
      data.mode || 'semi-auto',
      data.style_preset_id || null,
      now(),
      now()
    );
    return this.getById(db, id)!;
  },

  listByUser(db: Database, userId: string, page = 1, limit = 20, status = 'active'): { items: Project[]; total: number } {
    const offset = (page - 1) * limit;
    const items = db.prepare(`
      SELECT * FROM projects WHERE user_id = ? AND status = ?
      ORDER BY updated_at DESC LIMIT ? OFFSET ?
    `).all(userId, status, limit, offset) as Project[];
    const total = (db.prepare('SELECT COUNT(*) as count FROM projects WHERE user_id = ? AND status = ?').get(userId, status) as { count: number }).count;
    return { items, total };
  },

  getById(db: Database, id: string): Project | null {
    return (db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as Project) || null;
  },

  getByIdAndUser(db: Database, id: string, userId: string): Project | null {
    return (db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(id, userId) as Project) || null;
  },

  update(db: Database, id: string, data: Partial<Project>): Project | null {
    const fields = Object.keys(data).filter(k => k !== 'id');
    if (fields.length === 0) return this.getById(db, id);
    const sets = fields.map(f => `${f} = ?`).join(', ');
    db.prepare(`UPDATE projects SET ${sets}, updated_at = ? WHERE id = ?`)
      .run(...fields.map(f => (data as any)[f]), now(), id);
    return this.getById(db, id);
  },

  softDelete(db: Database, id: string): void {
    db.prepare("UPDATE projects SET status = 'archived', updated_at = ? WHERE id = ?").run(now(), id);
  },

  hardDelete(db: Database, id: string): void {
    db.prepare('DELETE FROM projects WHERE id = ?').run(id);
  },
};
