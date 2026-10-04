// 模型配置 DAO
// v1.0
// P2修复: api_key 加密存储（AES-256-CBC，密钥来自环境变量 MODEL_KEY_SECRET，默认开发固定值）；
//         写入时加密，读取时解密（aiProxy 等调用方无感知），GET 路由响应仍剥离 api_key

import crypto from 'crypto';
import type { Database, ModelRegistry } from '../types';
import { generateId, now } from './index';

/** API Key 加密密钥：环境变量 MODEL_KEY_SECRET，未配置时使用默认开发值 */
const MODEL_KEY_SECRET = process.env.MODEL_KEY_SECRET || 'cine-slice-dev-secret-key-0123456789abcdef';

/** AES-256-CBC 加密（返回 enc:iv:data 格式） */
function encryptApiKey(plain: string): string {
  if (!plain) return plain;
  try {
    const key = crypto.createHash('sha256').update(MODEL_KEY_SECRET).digest();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return `enc:${iv.toString('hex')}:${encrypted.toString('hex')}`;
  } catch {
    return plain;
  }
}

/** AES-256-CBC 解密（兼容历史明文数据：非 enc: 前缀原样返回） */
function decryptApiKey(stored: string | null | undefined): string {
  if (!stored) return stored || '';
  if (!stored.startsWith('enc:')) return stored;
  try {
    const parts = stored.split(':');
    if (parts.length < 3) return '';
    const key = crypto.createHash('sha256').update(MODEL_KEY_SECRET).digest();
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, Buffer.from(parts[1], 'hex'));
    return Buffer.concat([decipher.update(Buffer.from(parts[2], 'hex')), decipher.final()]).toString('utf8');
  } catch {
    return '';
  }
}

/** 读取时解密 api_key（不修改原对象） */
function withDecryptedKey<T extends { api_key?: string | null }>(row: T | null): T | null {
  if (!row) return row;
  return { ...row, api_key: decryptApiKey(row.api_key) };
}

export const ModelRegistryDAO = {
  create(db: Database, data: { user_id: string; provider: string; model_name: string; model_type: string; api_key: string; endpoint_url?: string; is_default?: boolean; config?: string; supports_audio?: boolean }): ModelRegistry {
    const id = generateId('model');
    // 如果设为默认，先取消同类型其他默认
    if (data.is_default) {
      db.prepare('UPDATE model_registry SET is_default = 0 WHERE user_id = ? AND model_type = ?').run(data.user_id, data.model_type);
    }
    // P2修复: api_key 加密后落库
    const encryptedKey = encryptApiKey(data.api_key);
    db.prepare(`
      INSERT INTO model_registry (id, user_id, provider, model_name, model_type, api_key, endpoint_url, is_active, is_default, config, supports_audio, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)
    `).run(id, data.user_id, data.provider, data.model_name, data.model_type, encryptedKey, data.endpoint_url || null, data.is_default ? 1 : 0, data.config || null, data.supports_audio ? 1 : 0, now(), now());
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
    const rows = db.prepare('SELECT * FROM model_registry WHERE user_id = ? ORDER BY model_type, provider, model_name').all(userId) as ModelRegistry[];
    return rows.map(r => withDecryptedKey(r) as ModelRegistry);
  },

  listByUserAndType(db: Database, userId: string, modelType: string): ModelRegistry[] {
    const rows = db.prepare('SELECT * FROM model_registry WHERE user_id = ? AND model_type = ? AND is_active = 1 ORDER BY is_default DESC, provider').all(userId, modelType) as ModelRegistry[];
    return rows.map(r => withDecryptedKey(r) as ModelRegistry);
  },

  getById(db: Database, id: string): ModelRegistry | null {
    const row = db.prepare('SELECT * FROM model_registry WHERE id = ?').get(id) as ModelRegistry | null;
    return withDecryptedKey(row);
  },

  getByUserAndModel(db: Database, userId: string, provider: string, modelName: string): ModelRegistry | null {
    const row = db.prepare('SELECT * FROM model_registry WHERE user_id = ? AND provider = ? AND model_name = ?').get(userId, provider, modelName) as ModelRegistry | null;
    return withDecryptedKey(row);
  },

  getDefault(db: Database, userId: string, modelType: string): ModelRegistry | null {
    const row = db.prepare('SELECT * FROM model_registry WHERE user_id = ? AND model_type = ? AND is_default = 1 AND is_active = 1').get(userId, modelType) as ModelRegistry | null;
    return withDecryptedKey(row);
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
    const values = fields.map(f => {
      // P2修复: api_key 更新时加密落库
      if (f === 'api_key' && typeof (data as any)[f] === 'string') {
        return encryptApiKey((data as any)[f]);
      }
      return (data as any)[f];
    });
    const sets = fields.map(f => `${f} = ?`).join(', ');
    db.prepare(`UPDATE model_registry SET ${sets}, updated_at = ? WHERE id = ?`)
      .run(...values, now(), id);
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
    return all
      .filter(m => {
        if (!m.recommended_for) return false;
        try {
          const stages = JSON.parse(m.recommended_for) as string[];
          return stages.includes(stage);
        } catch {
          return false;
        }
      })
      .map(m => withDecryptedKey(m) as ModelRegistry);
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
