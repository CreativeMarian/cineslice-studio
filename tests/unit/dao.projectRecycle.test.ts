import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb, closeTestDb } from '../helpers/db';
import {
  ProjectDAO,
  NovelChapterDAO,
  NovelEpisodeDAO,
  ShotDAO,
  ShotKeyframeDAO,
  GenerationTaskDAO,
  ensureLocalUser,
} from '../../server/src/models';
import type { SQLiteDatabase } from '../../server/src/config/sqliteDatabase';

describe('ProjectDAO 回收站与级联删除', () => {
  let db: SQLiteDatabase;
  let projectId: string;
  let episodeId: string;
  let shotId: string;

  beforeEach(() => {
    db = createTestDb();
    ensureLocalUser(db);
    const project = ProjectDAO.create(db, { user_id: 'local_user', title: '回收站测试项目' });
    projectId = project.id;
    const chapter = NovelChapterDAO.create(db, {
      user_id: 'local_user',
      project_id: projectId,
      chapter_number: 1,
      title: '第一章',
      content: '正文内容',
    });
    void chapter;
    const ep = NovelEpisodeDAO.create(db, {
      user_id: 'local_user',
      project_id: projectId,
      episode_number: 1,
      title: '第一集',
    });
    episodeId = ep.id;
    const shot = ShotDAO.create(db, {
      user_id: 'local_user',
      episode_id: episodeId,
      shot_number: 1,
      action_description: '镜头1',
    });
    shotId = shot.id;
    GenerationTaskDAO.create(db, {
      user_id: 'local_user',
      project_id: projectId,
      task_type: 'image',
      provider: 'test',
      model_name: 'test-model',
    });
  });

  afterEach(() => {
    closeTestDb(db);
  });

  it('softDelete 后列表不可见，restore 后恢复', () => {
    ProjectDAO.softDelete(db, projectId);
    const active = ProjectDAO.listByUser(db, 'local_user', 1, 20, 'active');
    expect(active.items.find((p) => p.id === projectId)).toBeUndefined();
    const archived = ProjectDAO.listByUser(db, 'local_user', 1, 20, 'archived');
    expect(archived.items.find((p) => p.id === projectId)).toBeDefined();

    ProjectDAO.restore(db, projectId);
    const restored = ProjectDAO.listByUser(db, 'local_user', 1, 20, 'active');
    expect(restored.items.find((p) => p.id === projectId)).toBeDefined();
  });

  it('deleteCascade 清除项目全部子资源', () => {
    // 关键帧挂在 shot 下
    ShotKeyframeDAO.create(db, {
      user_id: 'local_user',
      shot_id: shotId,
      frame_type: 'first',
      image_url: '/data/x.png',
    });

    ProjectDAO.deleteCascade(db, projectId);

    const count = (table: string, where = '', param?: string): number =>
      (db.prepare(`SELECT COUNT(*) as c FROM ${table} ${where}`).get(param) as { c: number }).c;

    expect(ProjectDAO.getById(db, projectId)).toBeNull();
    expect(count('novel_chapters', 'WHERE project_id = ?', projectId)).toBe(0);
    expect(count('novel_episodes', 'WHERE project_id = ?', projectId)).toBe(0);
    expect(count('shots', 'WHERE episode_id = ?', episodeId)).toBe(0);
    expect(count('shot_keyframes', 'WHERE shot_id = ?', shotId)).toBe(0);
    expect(count('generation_tasks', 'WHERE project_id = ?', projectId)).toBe(0);
  });
});
