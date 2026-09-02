import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb, closeTestDb } from '../helpers/db';
import { ProjectDAO, NovelEpisodeDAO, ScriptCharacterDAO, ensureLocalUser } from '../../server/src/models';
import type { SQLiteDatabase } from '../../server/src/config/sqliteDatabase';

describe('ScriptCharacterDAO', () => {
  let db: SQLiteDatabase;
  let episodeId: string;

  beforeEach(() => {
    db = createTestDb();
    ensureLocalUser(db);
    const project = ProjectDAO.create(db, { user_id: 'local_user', title: '测试项目' });
    const episode = NovelEpisodeDAO.create(db, {
      user_id: 'local_user', project_id: project.id, episode_number: 1, title: '第一集',
    });
    episodeId = episode.id;
  });

  afterEach(() => {
    closeTestDb(db);
  });

  describe('create', () => {
    it('创建角色成功', () => {
      const char = ScriptCharacterDAO.create(db, {
        user_id: 'local_user', episode_id: episodeId, name: '张三',
      });
      expect(char.id).toMatch(/^char_/);
      expect(char.name).toBe('张三');
      expect(char.episode_id).toBe(episodeId);
      expect(char.gender).toBe('other');
      expect(char.role_type).toBe('supporting');
      expect(char.selected_image_index).toBe(0);
    });

    it('创建带完整属性的角色', () => {
      const char = ScriptCharacterDAO.create(db, {
        user_id: 'local_user', episode_id: episodeId, name: '李四',
        gender: 'male', role_type: 'protagonist', description: '主角', visual_description: '高大英俊',
      });
      expect(char.gender).toBe('male');
      expect(char.role_type).toBe('protagonist');
      expect(char.description).toBe('主角');
      expect(char.visual_description).toBe('高大英俊');
    });
  });

  describe('getById', () => {
    it('存在的角色返回正确', () => {
      const created = ScriptCharacterDAO.create(db, { user_id: 'local_user', episode_id: episodeId, name: 'find me' });
      const found = ScriptCharacterDAO.getById(db, created.id);
      expect(found).not.toBeNull();
      expect(found!.name).toBe('find me');
    });

    it('不存在返回 null', () => {
      expect(ScriptCharacterDAO.getById(db, 'nope')).toBeNull();
    });
  });

  describe('getByIds', () => {
    it('批量查询返回正确结果', () => {
      const c1 = ScriptCharacterDAO.create(db, { user_id: 'local_user', episode_id: episodeId, name: 'A' });
      const c2 = ScriptCharacterDAO.create(db, { user_id: 'local_user', episode_id: episodeId, name: 'B' });
      const c3 = ScriptCharacterDAO.create(db, { user_id: 'local_user', episode_id: episodeId, name: 'C' });
      const result = ScriptCharacterDAO.getByIds(db, [c1.id, c3.id]);
      expect(result).toHaveLength(2);
      expect(result.map(c => c.id).sort()).toEqual([c1.id, c3.id].sort());
    });

    it('空数组返回空', () => {
      expect(ScriptCharacterDAO.getByIds(db, [])).toEqual([]);
    });
  });

  describe('listByEpisode', () => {
    it('按剧集列出角色', () => {
      ScriptCharacterDAO.create(db, { user_id: 'local_user', episode_id: episodeId, name: 'A' });
      ScriptCharacterDAO.create(db, { user_id: 'local_user', episode_id: episodeId, name: 'B' });
      const list = ScriptCharacterDAO.listByEpisode(db, episodeId);
      expect(list).toHaveLength(2);
    });

    it('其他剧集的角色不可见', () => {
      const project = ProjectDAO.create(db, { user_id: 'local_user', title: 'P2' });
      const otherEp = NovelEpisodeDAO.create(db, { user_id: 'local_user', project_id: project.id, episode_number: 1, title: 'ep2' });
      ScriptCharacterDAO.create(db, { user_id: 'local_user', episode_id: otherEp.id, name: 'other' });
      const list = ScriptCharacterDAO.listByEpisode(db, episodeId);
      expect(list).toHaveLength(0);
    });
  });

  describe('update', () => {
    it('更新角色名称和描述', () => {
      const char = ScriptCharacterDAO.create(db, { user_id: 'local_user', episode_id: episodeId, name: 'old' });
      const updated = ScriptCharacterDAO.update(db, char.id, { name: 'new', description: 'updated' });
      expect(updated!.name).toBe('new');
      expect(updated!.description).toBe('updated');
    });
  });

  describe('delete', () => {
    it('删除后查询为 null', () => {
      const char = ScriptCharacterDAO.create(db, { user_id: 'local_user', episode_id: episodeId, name: 'to delete' });
      ScriptCharacterDAO.delete(db, char.id);
      expect(ScriptCharacterDAO.getById(db, char.id)).toBeNull();
    });
  });

  describe('batchCreate', () => {
    it('事务批量创建多个角色', () => {
      const characters = [
        { user_id: 'local_user', episode_id: episodeId, name: '批量1' },
        { user_id: 'local_user', episode_id: episodeId, name: '批量2', gender: 'female' as const },
        { user_id: 'local_user', episode_id: episodeId, name: '批量3', role_type: 'antagonist' as const },
      ];
      const results = ScriptCharacterDAO.batchCreate(db, characters);
      expect(results).toHaveLength(3);
      expect(results[0].id).toMatch(/^char_/);
      const list = ScriptCharacterDAO.listByEpisode(db, episodeId);
      expect(list).toHaveLength(3);
    });

    it('空数组返回空', () => {
      expect(ScriptCharacterDAO.batchCreate(db, [])).toHaveLength(0);
    });
  });
});
