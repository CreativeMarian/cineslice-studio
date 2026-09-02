// AI 调用缓存 DAO
// v1.0

import type { Database } from '../types';
import { now } from './index';

export interface AiCacheEntry {
  cache_key: string;
  result: string;
  model_type: string;
  expires_at: string;
  created_at: string;
}

export const AiCacheDAO = {
  get(db: Database, cacheKey: string): string | null {
    // 先清理过期缓存
    db.prepare('DELETE FROM ai_cache WHERE expires_at < ?').run(now());
    const entry = db.prepare('SELECT result FROM ai_cache WHERE cache_key = ?').get(cacheKey) as { result: string } | undefined;
    return entry?.result || null;
  },

  set(db: Database, cacheKey: string, result: string, modelType: string, ttlSeconds = 3600): void {
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
    db.prepare(`
      INSERT OR REPLACE INTO ai_cache (cache_key, result, model_type, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(cacheKey, result, modelType, expiresAt, now());
  },

  delete(db: Database, cacheKey: string): void {
    db.prepare('DELETE FROM ai_cache WHERE cache_key = ?').run(cacheKey);
  },

  clearExpired(db: Database): void {
    db.prepare('DELETE FROM ai_cache WHERE expires_at < ?').run(now());
  },
};
