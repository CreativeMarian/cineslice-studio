// 角色变体 DAO（P1）
// v1.0

import type { Database, CharacterVariation } from '../types';
import { generateId, now } from './index';

export const CharacterVariationDAO = {
  create(db: Database, data: { user_id: string; character_id: string; name: string; description?: string; visual_description?: string }): CharacterVariation {
    const id = generateId('var');
    db.prepare(`
      INSERT INTO character_variations (id, user_id, character_id, name, description, visual_description, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, data.user_id, data.character_id, data.name, data.description || '', data.visual_description || '', now());
    return this.getById(db, id)!;
  },

  listByCharacter(db: Database, characterId: string): CharacterVariation[] {
    return db.prepare('SELECT * FROM character_variations WHERE character_id = ? ORDER BY created_at ASC').all(characterId) as CharacterVariation[];
  },

  getById(db: Database, id: string): CharacterVariation | null {
    return (db.prepare('SELECT * FROM character_variations WHERE id = ?').get(id) as CharacterVariation) || null;
  },

  update(db: Database, id: string, data: Partial<CharacterVariation>): CharacterVariation | null {
    const fields = Object.keys(data).filter(k => k !== 'id');
    if (fields.length === 0) return this.getById(db, id);
    const sets = fields.map(f => `${f} = ?`).join(', ');
    db.prepare(`UPDATE character_variations SET ${sets} WHERE id = ?`)
      .run(...fields.map(f => (data as any)[f]), id);
    return this.getById(db, id);
  },

  delete(db: Database, id: string): void {
    db.prepare('DELETE FROM character_variations WHERE id = ?').run(id);
  },
};
