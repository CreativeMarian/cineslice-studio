// 剧集 DAO
// v1.0

import type { Database, NovelEpisode } from '../types';
import { generateId, now, countWords } from './index';

export const NovelEpisodeDAO = {
  create(db: Database, data: { user_id: string; project_id: string; episode_number: number; title: string; chapter_range?: string; script_content?: string; text_model_used?: string }): NovelEpisode {
    const id = generateId('ep');
    const content = data.script_content || '';
    db.prepare(`
      INSERT INTO novel_episodes (id, user_id, project_id, episode_number, title, chapter_range, script_content, status, text_model_used, word_count, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'generated', ?, ?, ?, ?)
    `).run(id, data.user_id, data.project_id, data.episode_number, data.title, data.chapter_range || '', content, data.text_model_used || null, countWords(content), now(), now());
    return this.getById(db, id)!;
  },

  batchCreate(db: Database, episodes: Array<{ user_id: string; project_id: string; episode_number: number; title: string; chapter_range?: string; script_content?: string; text_model_used?: string }>): NovelEpisode[] {
    const results: NovelEpisode[] = [];
    const transaction = db.transaction(() => {
      for (const ep of episodes) {
        results.push(this.create(db, ep));
      }
    });
    transaction();
    return results;
  },

  listByProject(db: Database, projectId: string): NovelEpisode[] {
    return db.prepare('SELECT * FROM novel_episodes WHERE project_id = ? ORDER BY episode_number ASC').all(projectId) as NovelEpisode[];
  },

  getById(db: Database, id: string): NovelEpisode | null {
    return (db.prepare('SELECT * FROM novel_episodes WHERE id = ?').get(id) as NovelEpisode) || null;
  },

  getByIds(db: Database, ids: string[]): NovelEpisode[] {
    if (ids.length === 0) return [];
    const placeholders = ids.map(() => '?').join(',');
    return db.prepare(`SELECT * FROM novel_episodes WHERE id IN (${placeholders}) ORDER BY episode_number ASC`).all(...ids) as NovelEpisode[];
  },

  getByIdAndUser(db: Database, id: string, userId: string): NovelEpisode | null {
    return (db.prepare('SELECT * FROM novel_episodes WHERE id = ? AND user_id = ?').get(id, userId) as NovelEpisode) || null;
  },

  update(db: Database, id: string, data: Partial<NovelEpisode>): NovelEpisode | null {
    const fields = Object.keys(data).filter(k => k !== 'id');
    if (fields.length === 0) return this.getById(db, id);
    if (fields.includes('script_content')) {
      (data as any).word_count = countWords(data.script_content || '');
      fields.push('word_count');
      if (!fields.includes('status')) {
        (data as any).status = 'edited';
        fields.push('status');
      }
    }
    const sets = fields.map(f => `${f} = ?`).join(', ');
    db.prepare(`UPDATE novel_episodes SET ${sets}, updated_at = ? WHERE id = ?`)
      .run(...fields.map(f => (data as any)[f]), now(), id);
    return this.getById(db, id);
  },

  delete(db: Database, id: string): void {
    db.prepare('DELETE FROM novel_episodes WHERE id = ?').run(id);
  },

  getMaxEpisodeNumber(db: Database, projectId: string): number {
    const result = db.prepare('SELECT MAX(episode_number) as max FROM novel_episodes WHERE project_id = ?').get(projectId) as { max: number | null };
    return result.max || 0;
  },
};
