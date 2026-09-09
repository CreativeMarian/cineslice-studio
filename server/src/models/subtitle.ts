// 字幕 DAO
import type { Database, Subtitle } from '../types';
import { generateId, now } from './index';

export const SubtitleDAO = {
  create(db: Database, data: { user_id: string; episode_id: string; shot_id?: string; start_time: number; end_time: number; text: string; speaker?: string; style?: string }): Subtitle {
    const id = generateId('sub');
    db.prepare(`
      INSERT INTO subtitles (id, user_id, episode_id, shot_id, start_time, end_time, text, speaker, style, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, data.user_id, data.episode_id, data.shot_id || null, data.start_time, data.end_time, data.text, data.speaker || null, data.style || 'default', now());
    return this.getById(db, id)!;
  },

  getById(db: Database, id: string): Subtitle | null {
    return (db.prepare('SELECT * FROM subtitles WHERE id = ?').get(id) as Subtitle) || null;
  },

  listByEpisode(db: Database, episodeId: string): Subtitle[] {
    return db.prepare('SELECT * FROM subtitles WHERE episode_id = ? ORDER BY start_time ASC').all(episodeId) as Subtitle[];
  },

  deleteByEpisode(db: Database, episodeId: string): void {
    db.prepare('DELETE FROM subtitles WHERE episode_id = ?').run(episodeId);
  },

  deleteByShot(db: Database, shotId: string): void {
    db.prepare('DELETE FROM subtitles WHERE shot_id = ?').run(shotId);
  },

  // 生成 SRT 格式字幕
  toSRT(subtitles: Subtitle[]): string {
    return subtitles.map((s, i) => {
      const fmt = (t: number) => {
        const h = Math.floor(t / 3600);
        const m = Math.floor((t % 3600) / 60);
        const sec = Math.floor(t % 60);
        const ms = Math.floor((t % 1) * 1000);
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
      };
      return `${i + 1}\n${fmt(s.start_time)} --> ${fmt(s.end_time)}\n${s.text}\n`;
    }).join('\n');
  },
};
