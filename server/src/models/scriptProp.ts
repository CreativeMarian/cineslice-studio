// 道具 DAO（P1）
// v1.0

import type { Database, ScriptProp } from '../types';
import { generateId, now } from './index';

export const ScriptPropDAO = {
  create(db: Database, data: { user_id: string; episode_id: string; name: string; category?: string; description?: string }): ScriptProp {
    const id = generateId('prop');
    db.prepare(`
      INSERT INTO script_props (id, user_id, episode_id, name, category, description, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, data.user_id, data.episode_id, data.name, data.category || 'other', data.description || '', now());
    return this.getById(db, id)!;
  },

  listByEpisode(db: Database, episodeId: string): ScriptProp[] {
    return db.prepare('SELECT * FROM script_props WHERE episode_id = ? ORDER BY created_at ASC').all(episodeId) as ScriptProp[];
  },

  getById(db: Database, id: string): ScriptProp | null {
    return (db.prepare('SELECT * FROM script_props WHERE id = ?').get(id) as ScriptProp) || null;
  },

  update(db: Database, id: string, data: Partial<ScriptProp>): ScriptProp | null {
    const fields = Object.keys(data).filter(k => k !== 'id');
    if (fields.length === 0) return this.getById(db, id);
    const sets = fields.map(f => `${f} = ?`).join(', ');
    db.prepare(`UPDATE script_props SET ${sets} WHERE id = ?`)
      .run(...fields.map(f => (data as any)[f]), id);
    return this.getById(db, id);
  },

  delete(db: Database, id: string): void {
    db.prepare('DELETE FROM script_props WHERE id = ?').run(id);
  },
};
