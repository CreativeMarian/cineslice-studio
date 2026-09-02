// 角色 DAO
// v1.1 - 添加 concept_images / four_view_images JSON 解析

import type { Database, ScriptCharacter } from '../types';
import { generateId, now } from './index';

// 解析角色数据：将 JSON 字符串字段转为数组
function parseCharacter(row: any): ScriptCharacter {
  if (!row) return row;
  const result = { ...row };
  if (typeof result.concept_images === 'string') {
    try { result.concept_images = JSON.parse(result.concept_images); } catch { result.concept_images = []; }
  }
  if (typeof result.four_view_images === 'string') {
    try { result.four_view_images = JSON.parse(result.four_view_images); } catch { result.four_view_images = []; }
  }
  if (result.concept_images === null) result.concept_images = [];
  if (result.four_view_images === null) result.four_view_images = [];
  return result;
}

export const ScriptCharacterDAO = {
  create(db: Database, data: { user_id: string; episode_id: string; name: string; gender?: string; role_type?: string; description?: string; visual_description?: string }): ScriptCharacter {
    const id = generateId('char');
    db.prepare(`
      INSERT INTO script_characters (id, user_id, episode_id, name, gender, role_type, description, visual_description, selected_image_index, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
    `).run(id, data.user_id, data.episode_id, data.name, data.gender || 'other', data.role_type || 'supporting', data.description || '', data.visual_description || '', now(), now());
    return this.getById(db, id)!;
  },

  batchCreate(db: Database, characters: Array<{ user_id: string; episode_id: string; name: string; gender?: string; role_type?: string; description?: string; visual_description?: string }>): ScriptCharacter[] {
    const results: ScriptCharacter[] = [];
    const transaction = db.transaction(() => {
      for (const c of characters) {
        results.push(this.create(db, c));
      }
    });
    transaction();
    return results;
  },

  listByEpisode(db: Database, episodeId: string): ScriptCharacter[] {
    const rows = db.prepare('SELECT * FROM script_characters WHERE episode_id = ? ORDER BY created_at ASC').all(episodeId) as any[];
    return rows.map(parseCharacter);
  },

  getById(db: Database, id: string): ScriptCharacter | null {
    const row = db.prepare('SELECT * FROM script_characters WHERE id = ?').get(id) as any;
    return row ? parseCharacter(row) : null;
  },

  getByIds(db: Database, ids: string[]): ScriptCharacter[] {
    if (ids.length === 0) return [];
    const placeholders = ids.map(() => '?').join(',');
    const rows = db.prepare(`SELECT * FROM script_characters WHERE id IN (${placeholders}) ORDER BY created_at ASC`).all(...ids) as any[];
    return rows.map(parseCharacter);
  },

  getByIdAndUser(db: Database, id: string, userId: string): ScriptCharacter | null {
    const row = db.prepare('SELECT * FROM script_characters WHERE id = ? AND user_id = ?').get(id, userId) as any;
    return row ? parseCharacter(row) : null;
  },

  update(db: Database, id: string, data: Partial<ScriptCharacter>): ScriptCharacter | null {
    const fields = Object.keys(data).filter(k => k !== 'id');
    if (fields.length === 0) return this.getById(db, id);
    const sets = fields.map(f => `${f} = ?`).join(', ');
    db.prepare(`UPDATE script_characters SET ${sets}, updated_at = ? WHERE id = ?`)
      .run(...fields.map(f => (data as any)[f]), now(), id);
    return this.getById(db, id);
  },

  delete(db: Database, id: string): void {
    db.prepare('DELETE FROM script_characters WHERE id = ?').run(id);
  },

  deleteByEpisode(db: Database, episodeId: string): void {
    db.prepare('DELETE FROM script_characters WHERE episode_id = ?').run(episodeId);
  },
};
