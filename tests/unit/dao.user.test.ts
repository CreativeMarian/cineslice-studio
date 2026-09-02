import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb, closeTestDb } from '../helpers/db';
import { UserDAO, ensureLocalUser } from '../../server/src/models';
import type { SQLiteDatabase } from '../../server/src/config/sqliteDatabase';

describe('UserDAO', () => {
  let db: SQLiteDatabase;

  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    closeTestDb(db);
  });

  describe('create', () => {
    it('创建用户成功', () => {
      const user = UserDAO.create(db, { username: 'testuser', displayName: 'Test User' });
      expect(user.id).toMatch(/^user_/);
      expect(user.username).toBe('testuser');
      expect(user.display_name).toBe('Test User');
      expect(user.is_local).toBe(0);
      expect(user.password_hash).toBeNull();
    });

    it('创建本地用户', () => {
      const user = UserDAO.create(db, { username: 'local', isLocal: 1 });
      expect(user.is_local).toBe(1);
    });

    it('带密码哈希创建', () => {
      const user = UserDAO.create(db, { username: 'secure', passwordHash: 'hashedpw' });
      expect(user.password_hash).toBe('hashedpw');
    });
  });

  describe('getById', () => {
    it('存在的用户返回正确', () => {
      const created = UserDAO.create(db, { username: 'alice' });
      const found = UserDAO.getById(db, created.id);
      expect(found).not.toBeNull();
      expect(found!.username).toBe('alice');
    });

    it('不存在的用户返回 null', () => {
      expect(UserDAO.getById(db, 'nonexistent')).toBeNull();
    });
  });

  describe('getByUsername', () => {
    it('按用户名查找', () => {
      UserDAO.create(db, { username: 'bob' });
      const found = UserDAO.getByUsername(db, 'bob');
      expect(found).not.toBeNull();
      expect(found!.username).toBe('bob');
    });

    it('用户名不存在返回 null', () => {
      expect(UserDAO.getByUsername(db, 'nobody')).toBeNull();
    });
  });

  describe('update', () => {
    it('更新显示名称', () => {
      const user = UserDAO.create(db, { username: 'charlie' });
      const updated = UserDAO.update(db, user.id, { display_name: 'Charlie Updated' });
      expect(updated!.display_name).toBe('Charlie Updated');
    });

    it('空数据不修改', () => {
      const user = UserDAO.create(db, { username: 'dave' });
      const updated = UserDAO.update(db, user.id, {});
      expect(updated!.username).toBe('dave');
    });
  });

  describe('updatePassword', () => {
    it('更新密码哈希', () => {
      const user = UserDAO.create(db, { username: 'eve' });
      UserDAO.updatePassword(db, user.id, 'newhash');
      const updated = UserDAO.getById(db, user.id);
      expect(updated!.password_hash).toBe('newhash');
    });
  });

  describe('delete', () => {
    it('删除用户', () => {
      const user = UserDAO.create(db, { username: 'frank' });
      UserDAO.delete(db, user.id);
      expect(UserDAO.getById(db, user.id)).toBeNull();
    });
  });

  describe('ensureLocalUser', () => {
    it('首次调用创建本地用户', () => {
      ensureLocalUser(db);
      const user = UserDAO.getById(db, 'local_user');
      expect(user).not.toBeNull();
      expect(user!.username).toBe('local');
      expect(user!.is_local).toBe(1);
    });

    it('重复调用不创建重复用户', () => {
      ensureLocalUser(db);
      ensureLocalUser(db);
      const users = db.prepare('SELECT COUNT(*) as count FROM users WHERE id = ?').get('local_user') as { count: number };
      expect(users.count).toBe(1);
    });
  });
});
