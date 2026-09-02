import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb, closeTestDb } from '../helpers/db';
import { ProjectDAO, UserDAO, ensureLocalUser } from '../../server/src/models';
import type { SQLiteDatabase } from '../../server/src/config/sqliteDatabase';

describe('ProjectDAO', () => {
  let db: SQLiteDatabase;

  beforeEach(() => {
    db = createTestDb();
    ensureLocalUser(db);
  });

  afterEach(() => {
    closeTestDb(db);
  });

  describe('create', () => {
    it('创建项目成功', () => {
      const project = ProjectDAO.create(db, { user_id: 'local_user', title: '测试项目' });
      expect(project.id).toMatch(/^proj_/);
      expect(project.title).toBe('测试项目');
      expect(project.user_id).toBe('local_user');
      expect(project.stage).toBe('script');
      expect(project.status).toBe('active');
    });

    it('创建带描述的项目', () => {
      const project = ProjectDAO.create(db, { user_id: 'local_user', title: 'P2', description: 'desc' });
      expect(project.description).toBe('desc');
    });
  });

  describe('listByUser', () => {
    it('列出用户的活跃项目', () => {
      ProjectDAO.create(db, { user_id: 'local_user', title: 'A' });
      ProjectDAO.create(db, { user_id: 'local_user', title: 'B' });
      const result = ProjectDAO.listByUser(db, 'local_user');
      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it('分页正确', () => {
      for (let i = 0; i < 5; i++) {
        ProjectDAO.create(db, { user_id: 'local_user', title: `P${i}` });
      }
      const page1 = ProjectDAO.listByUser(db, 'local_user', 1, 2);
      expect(page1.items).toHaveLength(2);
      expect(page1.total).toBe(5);
      const page2 = ProjectDAO.listByUser(db, 'local_user', 2, 2);
      expect(page2.items).toHaveLength(2);
      const page3 = ProjectDAO.listByUser(db, 'local_user', 3, 2);
      expect(page3.items).toHaveLength(1);
    });

    it('按状态过滤', () => {
      const p1 = ProjectDAO.create(db, { user_id: 'local_user', title: 'active' });
      ProjectDAO.softDelete(db, p1.id);
      const active = ProjectDAO.listByUser(db, 'local_user', 1, 20, 'active');
      expect(active.total).toBe(0);
      const archived = ProjectDAO.listByUser(db, 'local_user', 1, 20, 'archived');
      expect(archived.total).toBe(1);
    });

    it('其他用户的项目不可见', () => {
      const other = UserDAO.create(db, { username: 'other' });
      ProjectDAO.create(db, { user_id: other.id, title: 'other project' });
      const result = ProjectDAO.listByUser(db, 'local_user');
      expect(result.total).toBe(0);
    });
  });

  describe('getById', () => {
    it('存在的项目返回正确', () => {
      const created = ProjectDAO.create(db, { user_id: 'local_user', title: 'find me' });
      const found = ProjectDAO.getById(db, created.id);
      expect(found).not.toBeNull();
      expect(found!.title).toBe('find me');
    });

    it('不存在返回 null', () => {
      expect(ProjectDAO.getById(db, 'nope')).toBeNull();
    });
  });

  describe('getByIdAndUser', () => {
    it('正确的用户能找到', () => {
      const project = ProjectDAO.create(db, { user_id: 'local_user', title: 'mine' });
      const found = ProjectDAO.getByIdAndUser(db, project.id, 'local_user');
      expect(found).not.toBeNull();
    });

    it('错误的用户找不到', () => {
      const project = ProjectDAO.create(db, { user_id: 'local_user', title: 'mine' });
      const found = ProjectDAO.getByIdAndUser(db, project.id, 'other_user');
      expect(found).toBeNull();
    });
  });

  describe('update', () => {
    it('更新标题和阶段', () => {
      const project = ProjectDAO.create(db, { user_id: 'local_user', title: 'old' });
      const updated = ProjectDAO.update(db, project.id, { title: 'new', stage: 'assets' });
      expect(updated!.title).toBe('new');
      expect(updated!.stage).toBe('assets');
    });
  });

  describe('softDelete', () => {
    it('软删除设置状态为 archived', () => {
      const project = ProjectDAO.create(db, { user_id: 'local_user', title: 'to delete' });
      ProjectDAO.softDelete(db, project.id);
      const found = ProjectDAO.getById(db, project.id);
      expect(found!.status).toBe('archived');
    });
  });

  describe('hardDelete', () => {
    it('硬删除从数据库移除', () => {
      const project = ProjectDAO.create(db, { user_id: 'local_user', title: 'to remove' });
      ProjectDAO.hardDelete(db, project.id);
      expect(ProjectDAO.getById(db, project.id)).toBeNull();
    });
  });
});
