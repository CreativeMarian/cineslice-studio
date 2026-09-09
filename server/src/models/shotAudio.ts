// 配音记录 DAO（结构化入库，支撑 audio 阶段完成度与跨刷新恢复）
// v1.0

import type { Database, ShotAudio } from '../types';
import { generateId, now } from './index';

export interface ShotAudioCreateInput {
  user_id: string;
  project_id: string;
  episode_id: string;
  shot_id: string;
  shot_number?: number | null;
  file_name?: string | null;
  voice?: string | null;
  speed?: number | null;
  duration_seconds?: number | null;
  source?: string;
  status?: string;
}

export const ShotAudioDAO = {
  create(db: Database, data: ShotAudioCreateInput): ShotAudio {
    const id = generateId('aud');
    db.prepare(`
      INSERT INTO shot_audio (id, user_id, project_id, episode_id, shot_id, shot_number, file_name, voice, speed, duration_seconds, source, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, data.user_id, data.project_id, data.episode_id, data.shot_id,
      data.shot_number ?? null, data.file_name ?? null, data.voice ?? null,
      data.speed ?? null, data.duration_seconds ?? null,
      data.source || 'manual', data.status || 'completed', now(), now()
    );
    return this.getById(db, id)!;
  },

  /** 按镜头 upsert：删除该镜头的旧记录，插入新记录。返回被删除的旧记录（用于清理旧文件） */
  upsertByShot(db: Database, data: ShotAudioCreateInput): { created: ShotAudio; removed: ShotAudio[] } {
    const removed = this.listByShot(db, data.shot_id);
    db.prepare('DELETE FROM shot_audio WHERE shot_id = ?').run(data.shot_id);
    const created = this.create(db, data);
    return { created, removed };
  },

  getById(db: Database, id: string): ShotAudio | null {
    return (db.prepare('SELECT * FROM shot_audio WHERE id = ?').get(id) as ShotAudio) || null;
  },

  getByShot(db: Database, shotId: string): ShotAudio | null {
    return (db.prepare('SELECT * FROM shot_audio WHERE shot_id = ? ORDER BY created_at DESC LIMIT 1').get(shotId) as ShotAudio) || null;
  },

  listByShot(db: Database, shotId: string): ShotAudio[] {
    return db.prepare('SELECT * FROM shot_audio WHERE shot_id = ? ORDER BY created_at DESC').all(shotId) as ShotAudio[];
  },

  listByEpisode(db: Database, episodeId: string): ShotAudio[] {
    return db.prepare('SELECT * FROM shot_audio WHERE episode_id = ? ORDER BY shot_number ASC, created_at DESC').all(episodeId) as ShotAudio[];
  },

  /** 某集已配音的镜头数（distinct shot_id，status=completed） */
  countShotWithAudio(db: Database, episodeId: string): number {
    const row: any = db.prepare(
      "SELECT COUNT(DISTINCT shot_id) c FROM shot_audio WHERE episode_id = ? AND status = 'completed'"
    ).get(episodeId);
    return Number(row?.c || 0);
  },
};
