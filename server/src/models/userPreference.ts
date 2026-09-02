// 用户偏好 DAO
// v1.0

import type { Database, UserPreference } from '../types';
import { generateId, now } from './index';

export const UserPreferenceDAO = {
  getOrCreate(db: Database, userId: string): UserPreference {
    let pref = db.prepare('SELECT * FROM user_preferences WHERE user_id = ?').get(userId) as UserPreference | undefined;
    if (!pref) {
      const id = generateId('pref');
      db.prepare(`
        INSERT INTO user_preferences (id, user_id, theme, onboarding_completed, created_at, updated_at)
        VALUES (?, ?, 'system', 0, ?, ?)
      `).run(id, userId, now(), now());
      pref = db.prepare('SELECT * FROM user_preferences WHERE user_id = ?').get(userId) as UserPreference;
    }
    return pref;
  },

  getByUser(db: Database, userId: string): UserPreference | null {
    return (db.prepare('SELECT * FROM user_preferences WHERE user_id = ?').get(userId) as UserPreference) || null;
  },

  update(db: Database, userId: string, data: Partial<UserPreference>): UserPreference {
    const existing = this.getByUser(db, userId);
    if (!existing) {
      this.getOrCreate(db, userId);
    }
    const fields = Object.keys(data).filter(k => k !== 'id' && k !== 'user_id');
    if (fields.length > 0) {
      const sets = fields.map(f => `${f} = ?`).join(', ');
      db.prepare(`UPDATE user_preferences SET ${sets}, updated_at = ? WHERE user_id = ?`)
        .run(...fields.map(f => (data as any)[f]), now(), userId);
    }
    return this.getByUser(db, userId)!;
  },
};
