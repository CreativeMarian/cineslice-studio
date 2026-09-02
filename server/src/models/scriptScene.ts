// 场景 DAO
// v1.1 - 添加 concept_images JSON 解析

import type { Database, ScriptScene } from '../types';
import { generateId, now } from './index';

// 解析场景数据：将 JSON 字符串字段转为数组
function parseScene(row: any): ScriptScene {
  if (!row) return row;
  const result = { ...row };
  if (typeof result.concept_images === 'string') {
    try { result.concept_images = JSON.parse(result.concept_images); } catch { result.concept_images = []; }
  }
  if (result.concept_images === null) result.concept_images = [];
  return result;
}

export const ScriptSceneDAO = {
  create(db: Database, data: { user_id: string; episode_id: string; name: string; location?: string; time_of_day?: string; atmosphere?: string; description?: string }): ScriptScene {
    const id = generateId('scene');
    db.prepare(`
      INSERT INTO script_scenes (id, user_id, episode_id, name, location, time_of_day, atmosphere, description, selected_image_index, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
    `).run(id, data.user_id, data.episode_id, data.name, data.location || '', data.time_of_day || 'day', data.atmosphere || '', data.description || '', now(), now());
    return this.getById(db, id)!;
  },

  batchCreate(db: Database, scenes: Array<{ user_id: string; episode_id: string; name: string; location?: string; time_of_day?: string; atmosphere?: string; description?: string }>): ScriptScene[] {
    const results: ScriptScene[] = [];
    const transaction = db.transaction(() => {
      for (const s of scenes) {
        results.push(this.create(db, s));
      }
    });
    transaction();
    return results;
  },

  listByEpisode(db: Database, episodeId: string): ScriptScene[] {
    const rows = db.prepare('SELECT * FROM script_scenes WHERE episode_id = ? ORDER BY created_at ASC').all(episodeId) as any[];
    return rows.map(parseScene);
  },

  getById(db: Database, id: string): ScriptScene | null {
    const row = db.prepare('SELECT * FROM script_scenes WHERE id = ?').get(id) as any;
    return row ? parseScene(row) : null;
  },

  getByIds(db: Database, ids: string[]): ScriptScene[] {
    if (ids.length === 0) return [];
    const placeholders = ids.map(() => '?').join(',');
    const rows = db.prepare(`SELECT * FROM script_scenes WHERE id IN (${placeholders}) ORDER BY created_at ASC`).all(...ids) as any[];
    return rows.map(parseScene);
  },

  getByIdAndUser(db: Database, id: string, userId: string): ScriptScene | null {
    const row = db.prepare('SELECT * FROM script_scenes WHERE id = ? AND user_id = ?').get(id, userId) as any;
    return row ? parseScene(row) : null;
  },

  update(db: Database, id: string, data: Partial<ScriptScene>): ScriptScene | null {
    const fields = Object.keys(data).filter(k => k !== 'id');
    if (fields.length === 0) return this.getById(db, id);
    const sets = fields.map(f => `${f} = ?`).join(', ');
    db.prepare(`UPDATE script_scenes SET ${sets}, updated_at = ? WHERE id = ?`)
      .run(...fields.map(f => (data as any)[f]), now(), id);
    return this.getById(db, id);
  },

  delete(db: Database, id: string): void {
    db.prepare('DELETE FROM script_scenes WHERE id = ?').run(id);
  },
};
