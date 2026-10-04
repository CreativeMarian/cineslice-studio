// 道具 DAO（P1）
// v1.1 - 增加线索标记 is_clue / 关键词 keywords（跨镜头视觉连贯追踪）
// v1.2 - 添加 concept_images JSON 解析

import type { Database, ScriptProp } from '../types';
import { generateId, now } from './index';
import { safeJsonParse } from '../utils/json';

/** 统一解析 concept_images 字段（字符串 → 数组） */
function parseConceptImages(result: any): void {
  if (typeof result.concept_images === 'string') result.concept_images = safeJsonParse(result.concept_images, []);
  if (!Array.isArray(result.concept_images)) result.concept_images = [];
  if (result.concept_images === null) result.concept_images = [];
}

export const ScriptPropDAO = {
  create(db: Database, data: { user_id: string; episode_id: string; name: string; category?: string; description?: string; is_clue?: number; keywords?: string; concept_images?: string; visual_prompt?: string; is_narrative?: number }): ScriptProp {
    const id = generateId('prop');
    db.prepare(`
      INSERT INTO script_props (id, user_id, episode_id, name, category, description, is_clue, keywords, concept_images, visual_prompt, is_narrative, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, data.user_id, data.episode_id, data.name, data.category || 'other', data.description || '', data.is_clue || 0, data.keywords || '', data.concept_images || null, data.visual_prompt || null, data.is_narrative || 0, now());
    return this.getById(db, id)!;
  },

  listByEpisode(db: Database, episodeId: string): ScriptProp[] {
    const results = db.prepare('SELECT * FROM script_props WHERE episode_id = ? ORDER BY created_at ASC').all(episodeId) as any[];
    results.forEach(parseConceptImages);
    return results as ScriptProp[];
  },

  getById(db: Database, id: string): ScriptProp | null {
    const result = db.prepare('SELECT * FROM script_props WHERE id = ?').get(id) as any;
    if (!result) return null;
    parseConceptImages(result);
    return result as ScriptProp;
  },

  getByIds(db: Database, ids: string[]): ScriptProp[] {
    if (ids.length === 0) return [];
    const placeholders = ids.map(() => '?').join(',');
    const results = db.prepare(`SELECT * FROM script_props WHERE id IN (${placeholders})`).all(...ids) as any[];
    results.forEach(parseConceptImages);
    return results as ScriptProp[];
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
