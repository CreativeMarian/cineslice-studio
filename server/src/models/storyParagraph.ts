// 故事段落 DAO
// v1.0

import type { Database, StoryParagraph } from '../types';
import { generateId, now } from './index';

export const StoryParagraphDAO = {
  create(db: Database, data: { user_id: string; episode_id: string; scene_id?: string; paragraph_index: number; content: string }): StoryParagraph {
    const id = generateId('para');
    db.prepare(`
      INSERT INTO story_paragraphs (id, user_id, episode_id, scene_id, paragraph_index, content, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, data.user_id, data.episode_id, data.scene_id || null, data.paragraph_index, data.content, now());
    return this.getById(db, id)!;
  },

  listByEpisode(db: Database, episodeId: string): StoryParagraph[] {
    return db.prepare('SELECT * FROM story_paragraphs WHERE episode_id = ? ORDER BY paragraph_index ASC').all(episodeId) as StoryParagraph[];
  },

  getById(db: Database, id: string): StoryParagraph | null {
    return (db.prepare('SELECT * FROM story_paragraphs WHERE id = ?').get(id) as StoryParagraph) || null;
  },

  update(db: Database, id: string, data: Partial<StoryParagraph>): StoryParagraph | null {
    const fields = Object.keys(data).filter(k => k !== 'id');
    if (fields.length === 0) return this.getById(db, id);
    const sets = fields.map(f => `${f} = ?`).join(', ');
    db.prepare(`UPDATE story_paragraphs SET ${sets} WHERE id = ?`)
      .run(...fields.map(f => (data as any)[f]), id);
    return this.getById(db, id);
  },

  delete(db: Database, id: string): void {
    db.prepare('DELETE FROM story_paragraphs WHERE id = ?').run(id);
  },

  deleteByEpisode(db: Database, episodeId: string): void {
    db.prepare('DELETE FROM story_paragraphs WHERE episode_id = ?').run(episodeId);
  },
};
