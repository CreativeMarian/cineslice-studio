// 成本统计 DAO
// v1.1 — 增加 image_count/video_seconds/audio_chars 字段

import type { Database, CostRecord } from '../types';
import { generateId, now } from './index';

export const CostRecordDAO = {
  create(db: Database, data: {
    user_id: string;
    provider: string;
    model_name: string;
    model_type: string;
    tokens: number;
    cost: number;
    image_count?: number;
    video_seconds?: number;
    audio_chars?: number;
  }): CostRecord {
    const id = generateId('cost');
    db.prepare(`
      INSERT INTO cost_records (id, user_id, provider, model_name, model_type, tokens, cost, image_count, video_seconds, audio_chars, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, data.user_id, data.provider, data.model_name, data.model_type,
      data.tokens, data.cost,
      data.image_count || 0,
      data.video_seconds || 0,
      data.audio_chars || 0,
      now()
    );
    return {
      id, ...data,
      image_count: data.image_count || 0,
      video_seconds: data.video_seconds || 0,
      audio_chars: data.audio_chars || 0,
      created_at: now()
    } as CostRecord;
  },

  listByUser(db: Database, userId: string, limit = 100): CostRecord[] {
    return db.prepare('SELECT * FROM cost_records WHERE user_id = ? ORDER BY created_at DESC LIMIT ?').all(userId, limit) as CostRecord[];
  },

  getTotalByUser(db: Database, userId: string): { totalTokens: number; totalCost: number } {
    const result = db.prepare('SELECT COALESCE(SUM(tokens), 0) as totalTokens, COALESCE(SUM(cost), 0) as totalCost FROM cost_records WHERE user_id = ?').get(userId) as { totalTokens: number; totalCost: number };
    return result;
  },

  getByDateRange(db: Database, userId: string, startDate: string, endDate: string): CostRecord[] {
    return db.prepare('SELECT * FROM cost_records WHERE user_id = ? AND created_at BETWEEN ? AND ? ORDER BY created_at DESC').all(userId, startDate, endDate) as CostRecord[];
  },
};
