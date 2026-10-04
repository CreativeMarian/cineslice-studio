// 项目 DAO
// v1.0

import type { Database, Project } from '../types';
import { generateId, now } from './index';

export const ProjectDAO = {
  create(db: Database, data: {
    user_id: string;
    title: string;
    description?: string;
    genre?: string;
    target_duration?: string;
    language?: string;
    pipeline_step?: string;
    mode?: 'auto' | 'semi-auto';
    style_description?: string;
    visual_style?: string;
    aspect_ratio?: string;
    input_mode?: string;
  }): Project {
    const id = generateId('proj');
    db.prepare(`
      INSERT INTO projects (id, user_id, title, description, stage, status, genre, target_duration, language, pipeline_step, mode, style_description, visual_style, aspect_ratio, input_mode, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'script', 'active', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      data.user_id,
      data.title,
      data.description || null,
      data.genre || null,
      data.target_duration || '3min',
      data.language || 'zh',
      data.pipeline_step || 'novel',
      data.mode || 'semi-auto',
      data.style_description || null,
      data.visual_style || null,
      data.aspect_ratio || null,
      data.input_mode || null,
      now(),
      now()
    );
    return this.getById(db, id)!;
  },

  listByUser(db: Database, userId: string, page = 1, limit = 20, status = 'active'): { items: Project[]; total: number } {
    const offset = (page - 1) * limit;
    const items = db.prepare(`
      SELECT * FROM projects WHERE user_id = ? AND status = ?
      ORDER BY updated_at DESC LIMIT ? OFFSET ?
    `).all(userId, status, limit, offset) as Project[];
    const total = (db.prepare('SELECT COUNT(*) as count FROM projects WHERE user_id = ? AND status = ?').get(userId, status) as { count: number }).count;
    return { items, total };
  },

  getById(db: Database, id: string): Project | null {
    return (db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as Project) || null;
  },

  getByIdAndUser(db: Database, id: string, userId: string): Project | null {
    return (db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(id, userId) as Project) || null;
  },

  update(db: Database, id: string, data: Partial<Project>): Project | null {
    const fields = Object.keys(data).filter(k => k !== 'id');
    if (fields.length === 0) return this.getById(db, id);
    const sets = fields.map(f => `${f} = ?`).join(', ');
    db.prepare(`UPDATE projects SET ${sets}, updated_at = ? WHERE id = ?`)
      .run(...fields.map(f => (data as any)[f]), now(), id);
    return this.getById(db, id);
  },

  softDelete(db: Database, id: string): void {
    db.prepare("UPDATE projects SET status = 'archived', updated_at = ? WHERE id = ?").run(now(), id);
  },

  restore(db: Database, id: string): void {
    db.prepare("UPDATE projects SET status = 'active', updated_at = ? WHERE id = ?").run(now(), id);
  },

  // 彻底删除：按依赖顺序清理项目所有子资源（不含用户级共享资产与成本记录）
  // P2-2: 补充 segments / character_outfits / shot_audio / script_analysis /
  //       project_bible / story_foreshadow / character_relationship / visual_memory 级联删除
  // P1-27: 全部 DELETE 语句包裹在单事务中，中途失败自动回滚（避免半删状态）
  deleteCascade(db: Database, id: string): void {
    db.transaction(() => {
      const episodeIdsSub = 'SELECT id FROM novel_episodes WHERE project_id = ?';
      const shotIdsSub = 'SELECT id FROM shots WHERE episode_id IN (' + episodeIdsSub + ')';
      db.prepare(`DELETE FROM character_variations WHERE character_id IN (SELECT id FROM script_characters WHERE episode_id IN (${episodeIdsSub}))`).run(id);
      db.prepare(`DELETE FROM character_outfits WHERE character_id IN (SELECT id FROM script_characters WHERE episode_id IN (${episodeIdsSub}))`).run(id);
      db.prepare(`DELETE FROM shot_keyframes WHERE shot_id IN (${shotIdsSub})`).run(id);
      db.prepare(`DELETE FROM shot_video_intervals WHERE shot_id IN (${shotIdsSub})`).run(id);
      db.prepare(`DELETE FROM shot_audio WHERE shot_id IN (${shotIdsSub})`).run(id);
      db.prepare('DELETE FROM render_logs WHERE project_id = ?').run(id);
      db.prepare('DELETE FROM generation_tasks WHERE project_id = ?').run(id);
      db.prepare(`DELETE FROM story_paragraphs WHERE episode_id IN (${episodeIdsSub})`).run(id);
      db.prepare(`DELETE FROM subtitles WHERE episode_id IN (${episodeIdsSub})`).run(id);
      db.prepare(`DELETE FROM shots WHERE episode_id IN (${episodeIdsSub})`).run(id);
      db.prepare(`DELETE FROM script_characters WHERE episode_id IN (${episodeIdsSub})`).run(id);
      db.prepare(`DELETE FROM script_scenes WHERE episode_id IN (${episodeIdsSub})`).run(id);
      db.prepare(`DELETE FROM script_props WHERE episode_id IN (${episodeIdsSub})`).run(id);
      db.prepare(`DELETE FROM segments WHERE episode_id IN (${episodeIdsSub})`).run(id);
      db.prepare(`DELETE FROM script_analysis WHERE episode_id IN (${episodeIdsSub})`).run(id);
      db.prepare(`DELETE FROM visual_memory WHERE project_id = ?`).run(id);
      db.prepare('DELETE FROM novel_episodes WHERE project_id = ?').run(id);
      db.prepare('DELETE FROM novel_chapters WHERE project_id = ?').run(id);
      db.prepare('DELETE FROM auto_pipeline_tasks WHERE project_id = ?').run(id);
      db.prepare('DELETE FROM project_bible WHERE project_id = ?').run(id);
      db.prepare('DELETE FROM story_foreshadow WHERE project_id = ?').run(id);
      db.prepare('DELETE FROM character_relationship WHERE project_id = ?').run(id);
      this.hardDelete(db, id);
    })();
  },

  hardDelete(db: Database, id: string): void {
    db.prepare('DELETE FROM projects WHERE id = ?').run(id);
  },
};
