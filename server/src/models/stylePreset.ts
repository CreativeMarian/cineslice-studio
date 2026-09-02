// 预设风格 DAO
// v1.0

import type { Database, StylePreset } from '../types';
import { generateId, now } from './index';

export const StylePresetDAO = {
  listAll(db: Database): StylePreset[] {
    return db.prepare('SELECT * FROM style_presets ORDER BY is_builtin DESC, sort_order ASC, created_at ASC').all() as StylePreset[];
  },

  listBuiltin(db: Database): StylePreset[] {
    return db.prepare('SELECT * FROM style_presets WHERE is_builtin = 1 ORDER BY sort_order ASC').all() as StylePreset[];
  },

  getById(db: Database, id: string): StylePreset | null {
    return (db.prepare('SELECT * FROM style_presets WHERE id = ?').get(id) as StylePreset) || null;
  },

  create(db: Database, data: {
    name: string;
    description?: string;
    category?: string;
    visual_style: string;
    camera_language?: string;
    color_palette?: string;
    shot_rhythm?: string;
    video_params?: string;
  }): StylePreset {
    const id = generateId('sp');
    db.prepare(`
      INSERT INTO style_presets (id, name, description, category, visual_style, camera_language, color_palette, shot_rhythm, video_params, is_builtin, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)
    `).run(
      id,
      data.name,
      data.description || null,
      data.category || 'custom',
      data.visual_style,
      data.camera_language || null,
      data.color_palette || null,
      data.shot_rhythm || null,
      data.video_params || null,
      now(),
      now()
    );
    return this.getById(db, id)!;
  },

  update(db: Database, id: string, data: Partial<StylePreset>): StylePreset | null {
    const fields = Object.keys(data).filter(k => k !== 'id' && k !== 'is_builtin');
    if (fields.length === 0) return this.getById(db, id);
    const sets = fields.map(f => `${f} = ?`).join(', ');
    db.prepare(`UPDATE style_presets SET ${sets}, updated_at = ? WHERE id = ? AND is_builtin = 0`)
      .run(...fields.map(f => (data as any)[f]), now(), id);
    return this.getById(db, id);
  },

  delete(db: Database, id: string): void {
    db.prepare('DELETE FROM style_presets WHERE id = ? AND is_builtin = 0').run(id);
  },
};
