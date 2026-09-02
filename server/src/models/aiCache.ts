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
  // 过期清理的节流：至少间隔 10 分钟才执行一次全表清理（原来每次读都 DELETE，
  // 读路径变成写路径，与流水线的高频写产生 WAL 锁竞争）
  _lastPurgeAt: 0,

  get(db: Database, cacheKey: string): string | null {
    const entry = db.prepare(
      'SELECT result FROM ai_cache WHERE cache_key = ? AND expires_at >= ?'
    ).get(cacheKey, now()) as { result: string } | undefined;
    if (!entry) return null;

    const nowMs = Date.now();
    if (nowMs - AiCacheDAO._lastPurgeAt > 10 * 60 * 1000) {
      AiCacheDAO._lastPurgeAt = nowMs;
      try {
        db.prepare('DELETE FROM ai_cache WHERE expires_at < ?').run(now());
      } catch { /* 清理失败不影响读取 */ }
    }
    return entry.result;
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
