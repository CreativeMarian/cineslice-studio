import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb, closeTestDb } from '../helpers/db';
import { ModelRegistryDAO, ensureLocalUser } from '../../server/src/models';
import type { SQLiteDatabase } from '../../server/src/config/sqliteDatabase';

describe('ModelRegistryDAO - recommended_for', () => {
  let db: SQLiteDatabase;

  beforeEach(() => {
    db = createTestDb();
    ensureLocalUser(db);
  });

  afterEach(() => {
    closeTestDb(db);
  });

  describe('setRecommendedFor', () => {
    it('设置模型的推荐阶段', () => {
      const model = ModelRegistryDAO.create(db, {
        user_id: 'local_user',
        provider: 'test',
        model_name: 'test-model',
        model_type: 'text',
        api_key: 'key123',
      });
      const updated = ModelRegistryDAO.setRecommendedFor(db, model.id, ['episodes', 'script']);
      expect(updated?.recommended_for).toBe(JSON.stringify(['episodes', 'script']));
    });
  });

  describe('listRecommendedForStage', () => {
    it('返回指定阶段的推荐模型', () => {
      const m1 = ModelRegistryDAO.create(db, {
        user_id: 'local_user',
        provider: 'openai',
        model_name: 'gpt-4o',
        model_type: 'text',
        api_key: 'key1',
      });
      const m2 = ModelRegistryDAO.create(db, {
        user_id: 'local_user',
        provider: 'doubao',
        model_name: 'doubao-pro',
        model_type: 'text',
        api_key: 'key2',
      });
      ModelRegistryDAO.setRecommendedFor(db, m1.id, ['episodes']);
      ModelRegistryDAO.setRecommendedFor(db, m2.id, ['script', 'characters']);

      const episodesRecs = ModelRegistryDAO.listRecommendedForStage(db, 'local_user', 'episodes');
      expect(episodesRecs).toHaveLength(1);
      expect(episodesRecs[0].id).toBe(m1.id);

      const scriptRecs = ModelRegistryDAO.listRecommendedForStage(db, 'local_user', 'script');
      expect(scriptRecs).toHaveLength(1);
      expect(scriptRecs[0].id).toBe(m2.id);
    });

    it('没有推荐模型时返回空数组', () => {
      ModelRegistryDAO.create(db, {
        user_id: 'local_user',
        provider: 'test',
        model_name: 'no-rec',
        model_type: 'text',
        api_key: 'key',
      });
      const recs = ModelRegistryDAO.listRecommendedForStage(db, 'local_user', 'video');
      expect(recs).toHaveLength(0);
    });

    it('只返回当前用户的推荐模型', () => {
      const m1 = ModelRegistryDAO.create(db, {
        user_id: 'local_user',
        provider: 'openai',
        model_name: 'gpt-4o',
        model_type: 'text',
        api_key: 'key1',
      });
      ModelRegistryDAO.setRecommendedFor(db, m1.id, ['episodes']);

      const recs = ModelRegistryDAO.listRecommendedForStage(db, 'other_user', 'episodes');
      expect(recs).toHaveLength(0);
    });
  });
});
