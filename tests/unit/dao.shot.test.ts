import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb, closeTestDb } from '../helpers/db';
import { ProjectDAO, NovelEpisodeDAO, ShotDAO, ensureLocalUser } from '../../server/src/models';
import type { SQLiteDatabase } from '../../server/src/config/sqliteDatabase';

describe('ShotDAO', () => {
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
    it('创建镜头成功', () => {
      const shot = ShotDAO.create(db, {
        user_id: 'local_user', episode_id: episodeId, shot_number: 1,
      });
      expect(shot.id).toMatch(/^shot_/);
      expect(shot.shot_number).toBe(1);
      expect(shot.episode_id).toBe(episodeId);
      expect(shot.shot_size).toBe('medium');
      expect(shot.camera_movement).toBe('static');
      expect(shot.duration_seconds).toBe(5.0);
      expect(shot.transition).toBe('cut');
      expect(shot.pace).toBe('normal');
    });

    it('创建带完整属性的镜头', () => {
      const shot = ShotDAO.create(db, {
        user_id: 'local_user', episode_id: episodeId, shot_number: 2,
        shot_size: 'closeup', action_description: '人物转身', dialogue: '你好',
        camera_movement: 'pan', duration_seconds: 8.5, subject: '主角',
        lighting: '柔和', mood: '温馨', transition: 'fade', pace: 'slow',
      });
      expect(shot.shot_size).toBe('closeup');
      expect(shot.action_description).toBe('人物转身');
      expect(shot.dialogue).toBe('你好');
      expect(shot.camera_movement).toBe('pan');
      expect(shot.duration_seconds).toBe(8.5);
      expect(shot.subject).toBe('主角');
      expect(shot.lighting).toBe('柔和');
      expect(shot.mood).toBe('温馨');
      expect(shot.transition).toBe('fade');
      expect(shot.pace).toBe('slow');
    });
  });

  describe('getById', () => {
    it('存在的镜头返回正确', () => {
      const created = ShotDAO.create(db, { user_id: 'local_user', episode_id: episodeId, shot_number: 1 });
      const found = ShotDAO.getById(db, created.id);
      expect(found).not.toBeNull();
      expect(found!.shot_number).toBe(1);
    });

    it('不存在返回 null', () => {
      expect(ShotDAO.getById(db, 'nope')).toBeNull();
    });
  });

  describe('getByIds', () => {
    it('批量查询返回正确结果', () => {
      const s1 = ShotDAO.create(db, { user_id: 'local_user', episode_id: episodeId, shot_number: 1 });
      const _s2 = ShotDAO.create(db, { user_id: 'local_user', episode_id: episodeId, shot_number: 2 });
      const s3 = ShotDAO.create(db, { user_id: 'local_user', episode_id: episodeId, shot_number: 3 });
      const result = ShotDAO.getByIds(db, [s1.id, s3.id]);
      expect(result).toHaveLength(2);
      expect(result.map(s => s.id).sort()).toEqual([s1.id, s3.id].sort());
    });

    it('空数组返回空', () => {
      expect(ShotDAO.getByIds(db, [])).toEqual([]);
    });
  });

  describe('listByEpisode', () => {
    it('按剧集列出镜头并按镜头号排序', () => {
      ShotDAO.create(db, { user_id: 'local_user', episode_id: episodeId, shot_number: 2 });
      ShotDAO.create(db, { user_id: 'local_user', episode_id: episodeId, shot_number: 1 });
      const list = ShotDAO.listByEpisode(db, episodeId);
      expect(list).toHaveLength(2);
      expect(list[0].shot_number).toBe(1);
      expect(list[1].shot_number).toBe(2);
    });

    it('其他剧集的镜头不可见', () => {
      const project = ProjectDAO.create(db, { user_id: 'local_user', title: 'P2' });
      const otherEp = NovelEpisodeDAO.create(db, { user_id: 'local_user', project_id: project.id, episode_number: 1, title: 'ep2' });
      ShotDAO.create(db, { user_id: 'local_user', episode_id: otherEp.id, shot_number: 1 });
      const list = ShotDAO.listByEpisode(db, episodeId);
      expect(list).toHaveLength(0);
    });
  });

  describe('update', () => {
    it('更新镜头动作和时长', () => {
      const shot = ShotDAO.create(db, { user_id: 'local_user', episode_id: episodeId, shot_number: 1 });
      const updated = ShotDAO.update(db, shot.id, { action_description: '新动作', duration_seconds: 10 });
      expect(updated!.action_description).toBe('新动作');
      expect(updated!.duration_seconds).toBe(10);
    });
  });

  describe('delete', () => {
    it('删除后查询为 null', () => {
      const shot = ShotDAO.create(db, { user_id: 'local_user', episode_id: episodeId, shot_number: 1 });
      ShotDAO.delete(db, shot.id);
      expect(ShotDAO.getById(db, shot.id)).toBeNull();
    });
  });

  describe('batchCreate', () => {
    it('事务批量创建多个镜头', () => {
      const shots = [
        { user_id: 'local_user', episode_id: episodeId, shot_number: 1 },
        { user_id: 'local_user', episode_id: episodeId, shot_number: 2, shot_size: 'wide' as const },
        { user_id: 'local_user', episode_id: episodeId, shot_number: 3, dialogue: '测试台词' },
      ];
      const results = ShotDAO.batchCreate(db, shots);
      expect(results).toHaveLength(3);
      expect(results[0].id).toMatch(/^shot_/);
      const list = ShotDAO.listByEpisode(db, episodeId);
      expect(list).toHaveLength(3);
    });

    it('空数组返回空', () => {
      expect(ShotDAO.batchCreate(db, [])).toHaveLength(0);
    });
  });
});
