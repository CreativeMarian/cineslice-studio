// 关键帧 DAO
// v1.0

import type { Database, ShotKeyframe } from '../types';
import { generateId, now } from './index';

export const ShotKeyframeDAO = {
  create(db: Database, data: { user_id: string; shot_id: string; frame_type?: string; prompt?: string; negative_prompt?: string; image_url?: string; image_model_used?: string; reference_characters?: string; reference_scene?: string }): ShotKeyframe {
    const id = generateId('kf');
    db.prepare(`
      INSERT INTO shot_keyframes (id, user_id, shot_id, frame_type, prompt, negative_prompt, image_url, image_model_used, reference_characters, reference_scene, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, data.user_id, data.shot_id, data.frame_type || 'first', data.prompt || '', data.negative_prompt || null, data.image_url || null, data.image_model_used || null, data.reference_characters || null, data.reference_scene || null, now());
    return this.getById(db, id)!;
  },

  batchCreate(db: Database, keyframes: Array<{ user_id: string; shot_id: string; frame_type?: string; prompt?: string; negative_prompt?: string; image_url?: string; image_model_used?: string; reference_characters?: string; reference_scene?: string }>): ShotKeyframe[] {
    const results: ShotKeyframe[] = [];
    const transaction = db.transaction(() => {
      for (const kf of keyframes) {
        results.push(this.create(db, kf));
      }
    });
    transaction();
    return results;
  },

  listByShot(db: Database, shotId: string): ShotKeyframe[] {
    return db.prepare('SELECT * FROM shot_keyframes WHERE shot_id = ? ORDER BY created_at ASC').all(shotId) as ShotKeyframe[];
  },

  getById(db: Database, id: string): ShotKeyframe | null {
    return (db.prepare('SELECT * FROM shot_keyframes WHERE id = ?').get(id) as ShotKeyframe) || null;
  },

  getByIds(db: Database, ids: string[]): ShotKeyframe[] {
    if (ids.length === 0) return [];
    const placeholders = ids.map(() => '?').join(',');
    return db.prepare(`SELECT * FROM shot_keyframes WHERE id IN (${placeholders}) ORDER BY created_at ASC`).all(...ids) as ShotKeyframe[];
  },

  getByIdAndUser(db: Database, id: string, userId: string): ShotKeyframe | null {
    return (db.prepare('SELECT * FROM shot_keyframes WHERE id = ? AND user_id = ?').get(id, userId) as ShotKeyframe) || null;
  },

  update(db: Database, id: string, data: Partial<ShotKeyframe>): ShotKeyframe | null {
    const fields = Object.keys(data).filter(k => k !== 'id');
    if (fields.length === 0) return this.getById(db, id);
    const sets = fields.map(f => `${f} = ?`).join(', ');
    db.prepare(`UPDATE shot_keyframes SET ${sets} WHERE id = ?`)
      .run(...fields.map(f => (data as any)[f]), id);
    return this.getById(db, id);
  },

  delete(db: Database, id: string): void {
    db.prepare('DELETE FROM shot_keyframes WHERE id = ?').run(id);
  },

  deleteByShot(db: Database, shotId: string): void {
    db.prepare('DELETE FROM shot_keyframes WHERE shot_id = ?').run(shotId);
  },
};
