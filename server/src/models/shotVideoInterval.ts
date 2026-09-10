// 视频片段 DAO（P1）
// v1.0

import type { Database, ShotVideoInterval } from '../types';
import { generateId, now } from './index';

export const ShotVideoIntervalDAO = {
  create(db: Database, data: { user_id: string; shot_id: string; start_frame_id?: string; end_frame_id?: string; duration_seconds?: number; motion_prompt?: string; video_model_used?: string }): ShotVideoInterval {
    const id = generateId('vid');
    db.prepare(`
      INSERT INTO shot_video_intervals (id, user_id, shot_id, start_frame_id, end_frame_id, duration_seconds, video_model_used, motion_prompt, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
    `).run(id, data.user_id, data.shot_id, data.start_frame_id || null, data.end_frame_id || null, data.duration_seconds || 5.0, data.video_model_used || null, data.motion_prompt || null, now());
    return this.getById(db, id)!;
  },

  listByShot(db: Database, shotId: string): ShotVideoInterval[] {
    return db.prepare('SELECT * FROM shot_video_intervals WHERE shot_id = ? ORDER BY created_at ASC').all(shotId) as ShotVideoInterval[];
  },

  /** 所有待推进的外部任务（pending/processing 且已有 external_task_id 与模型标识），供后台轮询器消费。按创建时间正序（FIFO）轮询：ComfyUI 串行队列先提交的先完成，DESC 会永远轮询不到已完成的旧任务 */
  listPendingExternal(db: Database, limit = 15): ShotVideoInterval[] {
    return db.prepare(`
      SELECT * FROM shot_video_intervals
      WHERE status IN ('pending', 'processing')
        AND external_task_id IS NOT NULL AND external_task_id != ''
        AND video_model_used IS NOT NULL AND video_model_used != ''
      ORDER BY created_at ASC LIMIT ?
    `).all(limit) as ShotVideoInterval[];
  },

  getById(db: Database, id: string): ShotVideoInterval | null {
    return (db.prepare('SELECT * FROM shot_video_intervals WHERE id = ?').get(id) as ShotVideoInterval) || null;
  },

  update(db: Database, id: string, data: Partial<ShotVideoInterval>): ShotVideoInterval | null {
    const fields = Object.keys(data).filter(k => k !== 'id');
    if (fields.length === 0) return this.getById(db, id);
    const sets = fields.map(f => `${f} = ?`).join(', ');
    db.prepare(`UPDATE shot_video_intervals SET ${sets} WHERE id = ?`)
      .run(...fields.map(f => (data as any)[f]), id);
    return this.getById(db, id);
  },

  updateStatus(db: Database, id: string, status: string, errorMessage?: string): void {
    if (status === 'completed') {
      db.prepare('UPDATE shot_video_intervals SET status = ?, completed_at = ? WHERE id = ?').run(status, now(), id);
    } else {
      db.prepare('UPDATE shot_video_intervals SET status = ?, error_message = ? WHERE id = ?').run(status, errorMessage || null, id);
    }
  },

  delete(db: Database, id: string): void {
    db.prepare('DELETE FROM shot_video_intervals WHERE id = ?').run(id);
  },
};
