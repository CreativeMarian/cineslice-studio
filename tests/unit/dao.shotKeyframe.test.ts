import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb, closeTestDb } from '../helpers/db';
import { ProjectDAO, NovelEpisodeDAO, ShotDAO, ShotKeyframeDAO, ensureLocalUser } from '../../server/src/models';
import type { SQLiteDatabase } from '../../server/src/config/sqliteDatabase';

describe('ShotKeyframeDAO', () => {
  let db: SQLiteDatabase;
  let shotId: string;

  beforeEach(() => {
    db = createTestDb();
    ensureLocalUser(db);
    const project = ProjectDAO.create(db, { user_id: 'local_user', title: '测试项目' });
    const episode = NovelEpisodeDAO.create(db, {
      user_id: 'local_user', project_id: project.id, episode_number: 1, title: '第一集',
    });
    const shot = ShotDAO.create(db, {
      user_id: 'local_user', episode_id: episode.id, shot_number: 1,
    });
    shotId = shot.id;
  });

  afterEach(() => {
    closeTestDb(db);
  });

  describe('create', () => {
    it('创建关键帧成功', () => {
      const kf = ShotKeyframeDAO.create(db, {
        user_id: 'local_user', shot_id: shotId, prompt: '一个人站在窗前',
      });
      expect(kf.id).toMatch(/^kf_/);
      expect(kf.shot_id).toBe(shotId);
      expect(kf.frame_type).toBe('first');
      expect(kf.prompt).toBe('一个人站在窗前');
    });

    it('创建带完整属性的关键帧', () => {
      const kf = ShotKeyframeDAO.create(db, {
        user_id: 'local_user', shot_id: shotId, frame_type: 'last',
        prompt: '结尾画面', negative_prompt: '模糊', image_url: 'http://example.com/img.png',
        image_model_used: 'sdxl', reference_characters: 'char_123', reference_scene: 'scene_456',
      });
      expect(kf.frame_type).toBe('last');
      expect(kf.negative_prompt).toBe('模糊');
      expect(kf.image_url).toBe('http://example.com/img.png');
      expect(kf.image_model_used).toBe('sdxl');
      expect(kf.reference_characters).toBe('char_123');
      expect(kf.reference_scene).toBe('scene_456');
    });
  });

  describe('getById', () => {
    it('存在的关键帧返回正确', () => {
      const created = ShotKeyframeDAO.create(db, { user_id: 'local_user', shot_id: shotId, prompt: 'find me' });
      const found = ShotKeyframeDAO.getById(db, created.id);
      expect(found).not.toBeNull();
      expect(found!.prompt).toBe('find me');
    });

    it('不存在返回 null', () => {
      expect(ShotKeyframeDAO.getById(db, 'nope')).toBeNull();
    });
  });

  describe('getByIds', () => {
    it('批量查询返回正确结果', () => {
      const k1 = ShotKeyframeDAO.create(db, { user_id: 'local_user', shot_id: shotId, prompt: 'A' });
      const k2 = ShotKeyframeDAO.create(db, { user_id: 'local_user', shot_id: shotId, prompt: 'B' });
      const k3 = ShotKeyframeDAO.create(db, { user_id: 'local_user', shot_id: shotId, prompt: 'C' });
      const result = ShotKeyframeDAO.getByIds(db, [k1.id, k3.id]);
      expect(result).toHaveLength(2);
      expect(result.map(k => k.id).sort()).toEqual([k1.id, k3.id].sort());
    });

    it('空数组返回空', () => {
      expect(ShotKeyframeDAO.getByIds(db, [])).toEqual([]);
    });
  });

  describe('listByShot', () => {
    it('按镜头列出关键帧', () => {
      ShotKeyframeDAO.create(db, { user_id: 'local_user', shot_id: shotId, prompt: 'A' });
      ShotKeyframeDAO.create(db, { user_id: 'local_user', shot_id: shotId, prompt: 'B' });
      const list = ShotKeyframeDAO.listByShot(db, shotId);
      expect(list).toHaveLength(2);
    });

    it('其他镜头的关键帧不可见', () => {
      const project = ProjectDAO.create(db, { user_id: 'local_user', title: 'P2' });
      const episode = NovelEpisodeDAO.create(db, { user_id: 'local_user', project_id: project.id, episode_number: 1, title: 'ep2' });
      const otherShot = ShotDAO.create(db, { user_id: 'local_user', episode_id: episode.id, shot_number: 1 });
      ShotKeyframeDAO.create(db, { user_id: 'local_user', shot_id: otherShot.id, prompt: 'other' });
      const list = ShotKeyframeDAO.listByShot(db, shotId);
      expect(list).toHaveLength(0);
    });
  });

  describe('update', () => {
    it('更新关键帧提示词和图片', () => {
      const kf = ShotKeyframeDAO.create(db, { user_id: 'local_user', shot_id: shotId, prompt: 'old' });
      const updated = ShotKeyframeDAO.update(db, kf.id, { prompt: 'new', image_url: 'http://example.com/new.png' });
      expect(updated!.prompt).toBe('new');
      expect(updated!.image_url).toBe('http://example.com/new.png');
    });
  });

  describe('delete', () => {
    it('删除后查询为 null', () => {
      const kf = ShotKeyframeDAO.create(db, { user_id: 'local_user', shot_id: shotId, prompt: 'to delete' });
      ShotKeyframeDAO.delete(db, kf.id);
      expect(ShotKeyframeDAO.getById(db, kf.id)).toBeNull();
    });
  });

  describe('batchCreate', () => {
    it('事务批量创建多个关键帧', () => {
      const keyframes = [
        { user_id: 'local_user', shot_id: shotId, prompt: '首帧', frame_type: 'first' as const },
        { user_id: 'local_user', shot_id: shotId, prompt: '中帧', frame_type: 'middle' as const },
        { user_id: 'local_user', shot_id: shotId, prompt: '尾帧', frame_type: 'last' as const },
      ];
      const results = ShotKeyframeDAO.batchCreate(db, keyframes);
      expect(results).toHaveLength(3);
      expect(results[0].id).toMatch(/^kf_/);
      const list = ShotKeyframeDAO.listByShot(db, shotId);
      expect(list).toHaveLength(3);
    });

    it('空数组返回空', () => {
      expect(ShotKeyframeDAO.batchCreate(db, [])).toHaveLength(0);
    });
  });
});
