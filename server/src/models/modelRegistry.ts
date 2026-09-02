// 模型配置 DAO
// v1.0

import type { Database, ModelRegistry } from '../types';
import { generateId, now } from './index';

export const ModelRegistryDAO = {
  create(db: Database, data: { user_id: string; provider: string; model_name: string; model_type: string; api_key: string; endpoint_url?: string; is_default?: boolean; config?: string; supports_audio?: boolean }): ModelRegistry {
    const id = generateId('model');
    // 如果设为默认，先取消同类型其他默认
    if (data.is_default) {
      db.prepare('UPDATE model_registry SET is_default = 0 WHERE user_id = ? AND model_type = ?').run(data.user_id, data.model_type);
    }
    db.prepare(`
      INSERT INTO model_registry (id, user_id, provider, model_name, model_type, api_key, endpoint_url, is_active, is_default, config, supports_audio, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)
    `).run(id, data.user_id, data.provider, data.model_name, data.model_type, data.api_key, data.endpoint_url || null, data.is_default ? 1 : 0, data.config || null, data.supports_audio ? 1 : 0, now(), now());
    return this.getById(db, id)!;
  },

  upsert(db: Database, data: { user_id: string; provider: string; model_name: string; model_type: string; api_key: string; endpoint_url?: string; is_default?: boolean; config?: string; supports_audio?: boolean }): ModelRegistry {
    // 查找条件包含 model_type，支持同一模型多类型记录
    const existing = db.prepare(
      'SELECT * FROM model_registry WHERE user_id = ? AND provider = ? AND model_name = ? AND model_type = ?'
    ).get(data.user_id, data.provider, data.model_name, data.model_type) as ModelRegistry | null;
    if (existing) {
      return this.update(db, existing.id, {
        api_key: data.api_key,
        endpoint_url: data.endpoint_url || null,
        config: data.config || null,
        is_default: data.is_default ? 1 : 0,
        supports_audio: data.supports_audio ? 1 : 0,
      })!;
    }
    return this.create(db, data);
  },

  listByUser(db: Database, userId: string): ModelRegistry[] {
    return db.prepare('SELECT * FROM model_registry WHERE user_id = ? ORDER BY model_type, provider, model_name').all(userId) as ModelRegistry[];
  },

  listByUserAndType(db: Database, userId: string, modelType: string): ModelRegistry[] {
    return db.prepare('SELECT * FROM model_registry WHERE user_id = ? AND model_type = ? AND is_active = 1 ORDER BY is_default DESC, provider').all(userId, modelType) as ModelRegistry[];
  },

  getById(db: Database, id: string): ModelRegistry | null {
    return (db.prepare('SELECT * FROM model_registry WHERE id = ?').get(id) as ModelRegistry) || null;
  },

  getByUserAndModel(db: Database, userId: string, provider: string, modelName: string): ModelRegistry | null {
    return (db.prepare('SELECT * FROM model_registry WHERE user_id = ? AND provider = ? AND model_name = ?').get(userId, provider, modelName) as ModelRegistry) || null;
  },

  getDefault(db: Database, userId: string, modelType: string): ModelRegistry | null {
    return (db.prepare('SELECT * FROM model_registry WHERE user_id = ? AND model_type = ? AND is_default = 1 AND is_active = 1').get(userId, modelType) as ModelRegistry) || null;
  },

  update(db: Database, id: string, data: Partial<ModelRegistry>): ModelRegistry | null {
    const fields = Object.keys(data).filter(k => k !== 'id');
    if (fields.length === 0) return this.getById(db, id);
    // 如果设为默认，先取消同类型其他默认
    if (fields.includes('is_default') && data.is_default === 1) {
      const model = this.getById(db, id);
      if (model) {
        db.prepare('UPDATE model_registry SET is_default = 0 WHERE user_id = ? AND model_type = ?').run(model.user_id, model.model_type);
      }
    }
    const sets = fields.map(f => `${f} = ?`).join(', ');
    db.prepare(`UPDATE model_registry SET ${sets}, updated_at = ? WHERE id = ?`)
      .run(...fields.map(f => (data as any)[f]), now(), id);
    return this.getById(db, id);
  },

  setDefault(db: Database, id: string): ModelRegistry | null {
    const model = this.getById(db, id);
    if (!model) return null;
    db.prepare('UPDATE model_registry SET is_default = 0 WHERE user_id = ? AND model_type = ?').run(model.user_id, model.model_type);
    db.prepare('UPDATE model_registry SET is_default = 1, updated_at = ? WHERE id = ?').run(now(), id);
    return this.getById(db, id);
  },

  updateTestStatus(db: Database, id: string, status: string): void {
    db.prepare('UPDATE model_registry SET last_test_status = ?, last_test_at = ?, updated_at = ? WHERE id = ?').run(status, now(), now(), id);
  },

  // 根据阶段获取推荐模型（recommended_for 字段为 JSON 数组，包含阶段名）
  listRecommendedForStage(db: Database, userId: string, stage: string): ModelRegistry[] {
    const all = db.prepare(
      'SELECT * FROM model_registry WHERE user_id = ? AND is_active = 1 ORDER BY is_default DESC, provider'
    ).all(userId) as ModelRegistry[];
    return all.filter(m => {
      if (!m.recommended_for) return false;
      try {
        const stages = JSON.parse(m.recommended_for) as string[];
        return stages.includes(stage);
      } catch {
        return false;
      }
    });
  },

  // 设置模型的推荐阶段
  setRecommendedFor(db: Database, id: string, stages: string[]): ModelRegistry | null {
    db.prepare('UPDATE model_registry SET recommended_for = ?, updated_at = ? WHERE id = ?')
      .run(JSON.stringify(stages), now(), id);
    return this.getById(db, id);
  },

  delete(db: Database, id: string): void {
    db.prepare('DELETE FROM model_registry WHERE id = ?').run(id);
  },
};
