import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb, closeTestDb } from '../helpers/db';
import { ModelRegistryDAO, ensureLocalUser } from '../../server/src/models';
import type { SQLiteDatabase } from '../../server/src/config/sqliteDatabase';

describe('ModelRegistryDAO', () => {
  let db: SQLiteDatabase;

  beforeEach(() => {
    db = createTestDb();
    ensureLocalUser(db);
  });

  afterEach(() => {
    closeTestDb(db);
  });

  describe('create', () => {
    it('创建模型配置成功', () => {
      const model = ModelRegistryDAO.create(db, {
        user_id: 'local_user',
        provider: 'openai',
        model_name: 'gpt-4o',
        model_type: 'text',
        api_key: 'sk-test',
      });
      expect(model.id).toMatch(/^model_/);
      expect(model.provider).toBe('openai');
      expect(model.model_name).toBe('gpt-4o');
      expect(model.api_key).toBe('sk-test');
      expect(model.is_active).toBe(1);
      expect(model.is_default).toBe(0);
    });

    it('创建时设为默认', () => {
      const model = ModelRegistryDAO.create(db, {
        user_id: 'local_user',
        provider: 'openai',
        model_name: 'gpt-4o',
        model_type: 'text',
        api_key: 'sk-test',
        is_default: true,
      });
      expect(model.is_default).toBe(1);
    });

    it('设为默认时取消同类型其他默认', () => {
      ModelRegistryDAO.create(db, {
        user_id: 'local_user', provider: 'openai', model_name: 'gpt-4o',
        model_type: 'text', api_key: 'k1', is_default: true,
      });
      const m2 = ModelRegistryDAO.create(db, {
        user_id: 'local_user', provider: 'anthropic', model_name: 'claude-3-5',
        model_type: 'text', api_key: 'k2', is_default: true,
      });
      // m2 应该是默认，m1 应该被取消默认
      const defaultModel = ModelRegistryDAO.getDefault(db, 'local_user', 'text');
      expect(defaultModel!.id).toBe(m2.id);
      const m1 = ModelRegistryDAO.getByUserAndModel(db, 'local_user', 'openai', 'gpt-4o');
      expect(m1!.is_default).toBe(0);
    });

    it('不同类型的默认互不影响', () => {
      ModelRegistryDAO.create(db, {
        user_id: 'local_user', provider: 'openai', model_name: 'gpt-4o',
        model_type: 'text', api_key: 'k1', is_default: true,
      });
      ModelRegistryDAO.create(db, {
        user_id: 'local_user', provider: 'openai-image', model_name: 'dall-e-3',
        model_type: 'image', api_key: 'k2', is_default: true,
      });
      const textDefault = ModelRegistryDAO.getDefault(db, 'local_user', 'text');
      const imageDefault = ModelRegistryDAO.getDefault(db, 'local_user', 'image');
      expect(textDefault!.model_type).toBe('text');
      expect(imageDefault!.model_type).toBe('image');
    });
  });

  describe('upsert', () => {
    it('不存在时创建', () => {
      const model = ModelRegistryDAO.upsert(db, {
        user_id: 'local_user', provider: 'doubao', model_name: 'doubao-pro',
        model_type: 'text', api_key: 'sk-new',
      });
      expect(model.provider).toBe('doubao');
    });

    it('已存在时更新', () => {
      ModelRegistryDAO.create(db, {
        user_id: 'local_user', provider: 'doubao', model_name: 'doubao-pro',
        model_type: 'text', api_key: 'old-key',
      });
      const updated = ModelRegistryDAO.upsert(db, {
        user_id: 'local_user', provider: 'doubao', model_name: 'doubao-pro',
        model_type: 'text', api_key: 'new-key',
      });
      expect(updated.api_key).toBe('new-key');
      // 不应该创建重复记录
      const all = ModelRegistryDAO.listByUser(db, 'local_user');
      const doubaoModels = all.filter(m => m.provider === 'doubao' && m.model_name === 'doubao-pro');
      expect(doubaoModels).toHaveLength(1);
    });
  });

  describe('getByUserAndModel', () => {
    it('正确查找', () => {
      ModelRegistryDAO.create(db, {
        user_id: 'local_user', provider: 'qwen', model_name: 'qwen-max',
        model_type: 'text', api_key: 'k',
      });
      const found = ModelRegistryDAO.getByUserAndModel(db, 'local_user', 'qwen', 'qwen-max');
      expect(found).not.toBeNull();
    });

    it('不存在返回 null', () => {
      expect(ModelRegistryDAO.getByUserAndModel(db, 'local_user', 'x', 'y')).toBeNull();
    });
  });

  describe('setDefault', () => {
    it('设置默认模型', () => {
      const m1 = ModelRegistryDAO.create(db, {
        user_id: 'local_user', provider: 'openai', model_name: 'gpt-4o',
        model_type: 'text', api_key: 'k1',
      });
      const result = ModelRegistryDAO.setDefault(db, m1.id);
      expect(result!.is_default).toBe(1);
      const defaultModel = ModelRegistryDAO.getDefault(db, 'local_user', 'text');
      expect(defaultModel!.id).toBe(m1.id);
    });

    it('切换默认时取消旧默认', () => {
      const m1 = ModelRegistryDAO.create(db, {
        user_id: 'local_user', provider: 'openai', model_name: 'gpt-4o',
        model_type: 'text', api_key: 'k1', is_default: true,
      });
      const m2 = ModelRegistryDAO.create(db, {
        user_id: 'local_user', provider: 'anthropic', model_name: 'claude',
        model_type: 'text', api_key: 'k2',
      });
      ModelRegistryDAO.setDefault(db, m2.id);
      const updatedM1 = ModelRegistryDAO.getById(db, m1.id);
      expect(updatedM1!.is_default).toBe(0);
      const defaultModel = ModelRegistryDAO.getDefault(db, 'local_user', 'text');
      expect(defaultModel!.id).toBe(m2.id);
    });
  });

  describe('listByUserAndType', () => {
    it('只返回激活的指定类型模型', () => {
      ModelRegistryDAO.create(db, {
        user_id: 'local_user', provider: 'openai', model_name: 'gpt-4o',
        model_type: 'text', api_key: 'k1',
      });
      ModelRegistryDAO.create(db, {
        user_id: 'local_user', provider: 'openai-image', model_name: 'dall-e-3',
        model_type: 'image', api_key: 'k2',
      });
      const textModels = ModelRegistryDAO.listByUserAndType(db, 'local_user', 'text');
      expect(textModels).toHaveLength(1);
      expect(textModels[0].model_type).toBe('text');
    });
  });
});
