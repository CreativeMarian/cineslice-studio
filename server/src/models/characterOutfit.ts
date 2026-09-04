// 角色衣橱 DAO：每个角色多套造型（BigBanana Base Look 方案）
// 默认造型图在参考图收集时优先注入，实现保险换装与跨镜服装一致

import type { Database, CharacterOutfit } from '../types';
import { generateId, now } from './index';

export const CharacterOutfitDAO = {
  create(db: Database, data: { user_id: string; character_id: string; name: string; description?: string; image_url?: string; is_default?: number }): CharacterOutfit {
    const id = generateId('outfit');
    db.prepare(`
      INSERT INTO character_outfits (id, user_id, character_id, name, description, image_url, is_default, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, data.user_id, data.character_id, data.name,
      data.description || '', data.image_url || null,
      data.is_default || 0, now(), now()
    );
    return this.getById(db, id)!;
  },

  getById(db: Database, id: string): CharacterOutfit | null {
    return (db.prepare('SELECT * FROM character_outfits WHERE id = ?').get(id) as CharacterOutfit) || null;
  },

  getByIdAndUser(db: Database, id: string, userId: string): CharacterOutfit | null {
    return (db.prepare('SELECT * FROM character_outfits WHERE id = ? AND user_id = ?').get(id, userId) as CharacterOutfit) || null;
  },

  listByCharacter(db: Database, characterId: string): CharacterOutfit[] {
    return db.prepare('SELECT * FROM character_outfits WHERE character_id = ? ORDER BY is_default DESC, created_at ASC').all(characterId) as CharacterOutfit[];
  },

  update(db: Database, id: string, data: Partial<CharacterOutfit>): CharacterOutfit | null {
    const fields = Object.keys(data).filter(k => k !== 'id');
    if (fields.length === 0) return this.getById(db, id);
    const sets = fields.map(f => `${f} = ?`).join(', ');
    db.prepare(`UPDATE character_outfits SET ${sets}, updated_at = ? WHERE id = ?`)
      .run(...fields.map(f => (data as any)[f]), now(), id);
    return this.getById(db, id);
  },

  delete(db: Database, id: string): void {
    db.prepare('DELETE FROM character_outfits WHERE id = ?').run(id);
  },

  /** 设为默认：先清除同角色其他默认，再置位 */
  setDefault(db: Database, id: string, characterId: string): CharacterOutfit | null {
    db.prepare('UPDATE character_outfits SET is_default = 0, updated_at = ? WHERE character_id = ?').run(now(), characterId);
    db.prepare('UPDATE character_outfits SET is_default = 1, updated_at = ? WHERE id = ?').run(now(), id);
    return this.getById(db, id);
  },

  /** 取角色默认造型（无默认时取第一个） */
  getDefaultForCharacter(db: Database, characterId: string): CharacterOutfit | null {
    return (db.prepare('SELECT * FROM character_outfits WHERE character_id = ? ORDER BY is_default DESC, created_at ASC LIMIT 1').get(characterId) as CharacterOutfit) || null;
  },
};
