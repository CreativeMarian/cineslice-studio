import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb, closeTestDb } from '../helpers/db';
import { ProjectDAO, NovelEpisodeDAO, ScriptSceneDAO, ensureLocalUser } from '../../server/src/models';
import type { SQLiteDatabase } from '../../server/src/config/sqliteDatabase';

describe('ScriptSceneDAO', () => {
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
    it('创建场景成功', () => {
      const scene = ScriptSceneDAO.create(db, {
        user_id: 'local_user', episode_id: episodeId, name: '客厅',
      });
      expect(scene.id).toMatch(/^scene_/);
      expect(scene.name).toBe('客厅');
      expect(scene.episode_id).toBe(episodeId);
      expect(scene.time_of_day).toBe('day');
      expect(scene.selected_image_index).toBe(0);
    });

    it('创建带完整属性的场景', () => {
      const scene = ScriptSceneDAO.create(db, {
        user_id: 'local_user', episode_id: episodeId, name: '夜晚街道',
        location: '城市街道', time_of_day: 'night', atmosphere: '紧张', description: '下雨的夜晚',
      });
      expect(scene.location).toBe('城市街道');
      expect(scene.time_of_day).toBe('night');
      expect(scene.atmosphere).toBe('紧张');
      expect(scene.description).toBe('下雨的夜晚');
    });
  });

  describe('getById', () => {
    it('存在的场景返回正确', () => {
      const created = ScriptSceneDAO.create(db, { user_id: 'local_user', episode_id: episodeId, name: 'find me' });
      const found = ScriptSceneDAO.getById(db, created.id);
      expect(found).not.toBeNull();
      expect(found!.name).toBe('find me');
    });

    it('不存在返回 null', () => {
      expect(ScriptSceneDAO.getById(db, 'nope')).toBeNull();
    });
  });

  describe('getByIds', () => {
    it('批量查询返回正确结果', () => {
      const s1 = ScriptSceneDAO.create(db, { user_id: 'local_user', episode_id: episodeId, name: 'A' });
      const s2 = ScriptSceneDAO.create(db, { user_id: 'local_user', episode_id: episodeId, name: 'B' });
      const s3 = ScriptSceneDAO.create(db, { user_id: 'local_user', episode_id: episodeId, name: 'C' });
      const result = ScriptSceneDAO.getByIds(db, [s1.id, s3.id]);
      expect(result).toHaveLength(2);
      expect(result.map(s => s.id).sort()).toEqual([s1.id, s3.id].sort());
    });

    it('空数组返回空', () => {
      expect(ScriptSceneDAO.getByIds(db, [])).toEqual([]);
    });
  });

  describe('listByEpisode', () => {
    it('按剧集列出场景', () => {
      ScriptSceneDAO.create(db, { user_id: 'local_user', episode_id: episodeId, name: 'A' });
      ScriptSceneDAO.create(db, { user_id: 'local_user', episode_id: episodeId, name: 'B' });
      const list = ScriptSceneDAO.listByEpisode(db, episodeId);
      expect(list).toHaveLength(2);
    });

    it('其他剧集的场景不可见', () => {
      const project = ProjectDAO.create(db, { user_id: 'local_user', title: 'P2' });
      const otherEp = NovelEpisodeDAO.create(db, { user_id: 'local_user', project_id: project.id, episode_number: 1, title: 'ep2' });
      ScriptSceneDAO.create(db, { user_id: 'local_user', episode_id: otherEp.id, name: 'other' });
      const list = ScriptSceneDAO.listByEpisode(db, episodeId);
      expect(list).toHaveLength(0);
    });
  });

  describe('update', () => {
    it('更新场景名称和氛围', () => {
      const scene = ScriptSceneDAO.create(db, { user_id: 'local_user', episode_id: episodeId, name: 'old' });
      const updated = ScriptSceneDAO.update(db, scene.id, { name: 'new', atmosphere: '温馨' });
      expect(updated!.name).toBe('new');
      expect(updated!.atmosphere).toBe('温馨');
    });
  });

  describe('delete', () => {
    it('删除后查询为 null', () => {
      const scene = ScriptSceneDAO.create(db, { user_id: 'local_user', episode_id: episodeId, name: 'to delete' });
      ScriptSceneDAO.delete(db, scene.id);
      expect(ScriptSceneDAO.getById(db, scene.id)).toBeNull();
    });
  });

  describe('batchCreate', () => {
    it('事务批量创建多个场景', () => {
      const scenes = [
        { user_id: 'local_user', episode_id: episodeId, name: '批量1' },
        { user_id: 'local_user', episode_id: episodeId, name: '批量2', time_of_day: 'night' as const },
        { user_id: 'local_user', episode_id: episodeId, name: '批量3', location: '室外' },
      ];
      const results = ScriptSceneDAO.batchCreate(db, scenes);
      expect(results).toHaveLength(3);
      expect(results[0].id).toMatch(/^scene_/);
      const list = ScriptSceneDAO.listByEpisode(db, episodeId);
      expect(list).toHaveLength(3);
    });

    it('空数组返回空', () => {
      expect(ScriptSceneDAO.batchCreate(db, [])).toHaveLength(0);
    });
  });
});
