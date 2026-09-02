// 小说章节 DAO
// v1.0

import type { Database, NovelChapter } from '../types';
import { generateId, now, countWords } from './index';

export const NovelChapterDAO = {
  create(db: Database, data: { user_id: string; project_id: string; chapter_number: number; title: string; content: string; source_file?: string }): NovelChapter {
    const id = generateId('chap');
    const wordCount = countWords(data.content);
    db.prepare(`
      INSERT INTO novel_chapters (id, user_id, project_id, chapter_number, title, content, word_count, source_file, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, data.user_id, data.project_id, data.chapter_number, data.title, data.content, wordCount, data.source_file || null, now());
    return this.getById(db, id)!;
  },

  batchCreate(db: Database, chapters: Array<{ user_id: string; project_id: string; chapter_number: number; title: string; content: string; source_file?: string }>): NovelChapter[] {
    const insert = db.prepare(`
      INSERT INTO novel_chapters (id, user_id, project_id, chapter_number, title, content, word_count, source_file, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const results: NovelChapter[] = [];
    const transaction = db.transaction(() => {
      for (const ch of chapters) {
        const id = generateId('chap');
        const wordCount = countWords(ch.content);
        insert.run(id, ch.user_id, ch.project_id, ch.chapter_number, ch.title, ch.content, wordCount, ch.source_file || null, now());
        results.push(this.getById(db, id)!);
      }
    });
    transaction();
    return results;
  },

  listByProject(db: Database, projectId: string): NovelChapter[] {
    return db.prepare('SELECT * FROM novel_chapters WHERE project_id = ? ORDER BY chapter_number ASC').all(projectId) as NovelChapter[];
  },

  getById(db: Database, id: string): NovelChapter | null {
    return (db.prepare('SELECT * FROM novel_chapters WHERE id = ?').get(id) as NovelChapter) || null;
  },

  getByIds(db: Database, ids: string[]): NovelChapter[] {
    if (ids.length === 0) return [];
    const placeholders = ids.map(() => '?').join(',');
    return db.prepare(`SELECT * FROM novel_chapters WHERE id IN (${placeholders}) ORDER BY chapter_number ASC`).all(...ids) as NovelChapter[];
  },

  update(db: Database, id: string, data: Partial<NovelChapter>): NovelChapter | null {
    const fields = Object.keys(data).filter(k => k !== 'id');
    if (fields.length === 0) return this.getById(db, id);
    if (fields.includes('content')) {
      (data as any).word_count = countWords(data.content || '');
    }
    const sets = fields.map(f => `${f} = ?`).join(', ');
    db.prepare(`UPDATE novel_chapters SET ${sets} WHERE id = ?`)
      .run(...fields.map(f => (data as any)[f]), id);
    return this.getById(db, id);
  },

  delete(db: Database, id: string): void {
    db.prepare('DELETE FROM novel_chapters WHERE id = ?').run(id);
  },

  deleteByProject(db: Database, projectId: string): void {
    db.prepare('DELETE FROM novel_chapters WHERE project_id = ?').run(projectId);
  },

  getMaxChapterNumber(db: Database, projectId: string): number {
    const result = db.prepare('SELECT MAX(chapter_number) as max FROM novel_chapters WHERE project_id = ?').get(projectId) as { max: number | null };
    return result.max || 0;
  },
};
