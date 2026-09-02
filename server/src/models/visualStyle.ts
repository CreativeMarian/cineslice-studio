// 视觉风格 DAO（P1）
// v1.0

import type { Database, VisualStyle } from '../types';
import { generateId, now } from './index';

export const VisualStyleDAO = {
  create(db: Database, data: { user_id: string; name: string; description?: string; style_prompt: string; negative_prompt?: string; thumbnail_url?: string; is_global?: boolean }): VisualStyle {
    const id = generateId('vs');
    if (data.is_global) {
      db.prepare('UPDATE visual_styles SET is_global = 0 WHERE user_id = ?').run(data.user_id);
    }
    db.prepare(`
      INSERT INTO visual_styles (id, user_id, name, description, style_prompt, negative_prompt, thumbnail_url, is_global, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, data.user_id, data.name, data.description || '', data.style_prompt, data.negative_prompt || null, data.thumbnail_url || null, data.is_global ? 1 : 0, now(), now());
    return this.getById(db, id)!;
  },

  listByUser(db: Database, userId: string): VisualStyle[] {
    return db.prepare('SELECT * FROM visual_styles WHERE user_id = ? ORDER BY is_global DESC, created_at DESC').all(userId) as VisualStyle[];
  },

  getById(db: Database, id: string): VisualStyle | null {
    return (db.prepare('SELECT * FROM visual_styles WHERE id = ?').get(id) as VisualStyle) || null;
  },

  getGlobal(db: Database, userId: string): VisualStyle | null {
    return (db.prepare('SELECT * FROM visual_styles WHERE user_id = ? AND is_global = 1').get(userId) as VisualStyle) || null;
  },

  update(db: Database, id: string, data: Partial<VisualStyle>): VisualStyle | null {
    const fields = Object.keys(data).filter(k => k !== 'id');
    if (fields.length === 0) return this.getById(db, id);
    if (fields.includes('is_global') && data.is_global === 1) {
      const style = this.getById(db, id);
      if (style) db.prepare('UPDATE visual_styles SET is_global = 0 WHERE user_id = ?').run(style.user_id);
    }
    const sets = fields.map(f => `${f} = ?`).join(', ');
    db.prepare(`UPDATE visual_styles SET ${sets}, updated_at = ? WHERE id = ?`)
      .run(...fields.map(f => (data as any)[f]), now(), id);
    return this.getById(db, id);
  },

  delete(db: Database, id: string): void {
    db.prepare('DELETE FROM visual_styles WHERE id = ?').run(id);
  },
};
