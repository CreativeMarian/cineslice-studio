import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb, closeTestDb } from '../helpers/db';
import { ProjectDAO, NovelEpisodeDAO, ensureLocalUser } from '../../server/src/models';
import type { SQLiteDatabase } from '../../server/src/config/sqliteDatabase';

describe('NovelEpisodeDAO', () => {
  let db: SQLiteDatabase;
  let projectId: string;

  beforeEach(() => {
    db = createTestDb();
    ensureLocalUser(db);
    const project = ProjectDAO.create(db, { user_id: 'local_user', title: '测试项目' });
    projectId = project.id;
  });

  afterEach(() => {
    closeTestDb(db);
  });

  describe('create', () => {
    it('创建剧集成功', () => {
      const ep = NovelEpisodeDAO.create(db, {
        user_id: 'local_user',
        project_id: projectId,
        episode_number: 1,
        title: '第一集',
      });
      expect(ep.id).toMatch(/^ep_/);
      expect(ep.episode_number).toBe(1);
      expect(ep.title).toBe('第一集');
      expect(ep.project_id).toBe(projectId);
      expect(ep.status).toBe('generated');
      expect(ep.word_count).toBe(0);
    });

    it('创建带脚本内容的剧集自动计算字数', () => {
      const ep = NovelEpisodeDAO.create(db, {
        user_id: 'local_user',
        project_id: projectId,
        episode_number: 2,
        title: '第二集',
        script_content: '你好世界 hello world',
      });
      expect(ep.word_count).toBe(6); // 4中文 + 2英文单词
    });
  });

  describe('getById', () => {
    it('存在的剧集返回正确', () => {
      const created = NovelEpisodeDAO.create(db, {
        user_id: 'local_user', project_id: projectId, episode_number: 1, title: 'find me',
      });
      const found = NovelEpisodeDAO.getById(db, created.id);
      expect(found).not.toBeNull();
      expect(found!.title).toBe('find me');
    });

    it('不存在返回 null', () => {
      expect(NovelEpisodeDAO.getById(db, 'nope')).toBeNull();
    });
  });

  describe('getByIds', () => {
    it('批量查询返回正确结果', () => {
      const ep1 = NovelEpisodeDAO.create(db, { user_id: 'local_user', project_id: projectId, episode_number: 1, title: 'A' });
      const ep2 = NovelEpisodeDAO.create(db, { user_id: 'local_user', project_id: projectId, episode_number: 2, title: 'B' });
      const ep3 = NovelEpisodeDAO.create(db, { user_id: 'local_user', project_id: projectId, episode_number: 3, title: 'C' });
      const result = NovelEpisodeDAO.getByIds(db, [ep1.id, ep3.id]);
      expect(result).toHaveLength(2);
      expect(result.map(e => e.id).sort()).toEqual([ep1.id, ep3.id].sort());
    });

    it('空数组返回空', () => {
      expect(NovelEpisodeDAO.getByIds(db, [])).toEqual([]);
    });
  });

  describe('listByProject', () => {
    it('按项目列出剧集并按集数排序', () => {
      NovelEpisodeDAO.create(db, { user_id: 'local_user', project_id: projectId, episode_number: 2, title: 'B' });
      NovelEpisodeDAO.create(db, { user_id: 'local_user', project_id: projectId, episode_number: 1, title: 'A' });
      const list = NovelEpisodeDAO.listByProject(db, projectId);
      expect(list).toHaveLength(2);
      expect(list[0].episode_number).toBe(1);
      expect(list[1].episode_number).toBe(2);
    });

    it('其他项目的剧集不可见', () => {
      const other = ProjectDAO.create(db, { user_id: 'local_user', title: '其他项目' });
      NovelEpisodeDAO.create(db, { user_id: 'local_user', project_id: other.id, episode_number: 1, title: 'other' });
      const list = NovelEpisodeDAO.listByProject(db, projectId);
      expect(list).toHaveLength(0);
    });
  });

  describe('update', () => {
    it('更新标题和状态', () => {
      const ep = NovelEpisodeDAO.create(db, { user_id: 'local_user', project_id: projectId, episode_number: 1, title: 'old' });
      const updated = NovelEpisodeDAO.update(db, ep.id, { title: 'new', status: 'edited' });
      expect(updated!.title).toBe('new');
      expect(updated!.status).toBe('edited');
    });

    it('更新脚本内容自动重算字数并设为 edited', () => {
      const ep = NovelEpisodeDAO.create(db, { user_id: 'local_user', project_id: projectId, episode_number: 1, title: 'ep' });
      const updated = NovelEpisodeDAO.update(db, ep.id, { script_content: '新内容 new content' });
      expect(updated!.word_count).toBe(5); // 3中文 + 2英文
      expect(updated!.status).toBe('edited');
    });
  });

  describe('delete', () => {
    it('删除后查询为 null', () => {
      const ep = NovelEpisodeDAO.create(db, { user_id: 'local_user', project_id: projectId, episode_number: 1, title: 'to delete' });
      NovelEpisodeDAO.delete(db, ep.id);
      expect(NovelEpisodeDAO.getById(db, ep.id)).toBeNull();
    });
  });

  describe('batchCreate', () => {
    it('事务批量创建多个剧集', () => {
      const episodes = [
        { user_id: 'local_user', project_id: projectId, episode_number: 1, title: '批量1' },
        { user_id: 'local_user', project_id: projectId, episode_number: 2, title: '批量2' },
        { user_id: 'local_user', project_id: projectId, episode_number: 3, title: '批量3' },
      ];
      const results = NovelEpisodeDAO.batchCreate(db, episodes);
      expect(results).toHaveLength(3);
      expect(results[0].id).toMatch(/^ep_/);
      const list = NovelEpisodeDAO.listByProject(db, projectId);
      expect(list).toHaveLength(3);
    });

    it('空数组返回空', () => {
      const results = NovelEpisodeDAO.batchCreate(db, []);
      expect(results).toHaveLength(0);
    });
  });
});
