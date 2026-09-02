// 渲染日志 DAO
// v1.0

import type { Database, RenderLog } from '../types';
import { generateId, now } from './index';

export const RenderLogDAO = {
  create(db: Database, data: { user_id: string; episode_id?: string; shot_id?: string; action: string; details?: string }): RenderLog {
    const id = generateId('log');
    db.prepare(`
      INSERT INTO render_logs (id, user_id, episode_id, shot_id, action, details, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, data.user_id, data.episode_id || null, data.shot_id || null, data.action, data.details || null, now());
    return this.getById(db, id)!;
  },

  listByUser(db: Database, userId: string, limit = 100): RenderLog[] {
    return db.prepare('SELECT * FROM render_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT ?').all(userId, limit) as RenderLog[];
  },

  listByEpisode(db: Database, episodeId: string): RenderLog[] {
    return db.prepare('SELECT * FROM render_logs WHERE episode_id = ? ORDER BY created_at DESC').all(episodeId) as RenderLog[];
  },

  getById(db: Database, id: string): RenderLog | null {
    return (db.prepare('SELECT * FROM render_logs WHERE id = ?').get(id) as RenderLog) || null;
  },
};
