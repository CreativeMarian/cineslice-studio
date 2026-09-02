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

  // 成本统计聚合（since 为 ISO 字符串，可选；不传则统计全部）
  getSummary(db: Database, userId: string, since?: string) {
    const sinceClause = since ? 'AND created_at >= ?' : '';
    const params = since ? [userId, since] : [userId];

    const totals = db.prepare(
      `SELECT COALESCE(SUM(tokens), 0) as total_tokens, COALESCE(SUM(cost), 0) as total_cost, COUNT(*) as call_count
       FROM cost_records WHERE user_id = ? ${sinceClause}`
    ).get(...params) as { total_tokens: number; total_cost: number; call_count: number };

    const byType = db.prepare(
      `SELECT model_type, COALESCE(SUM(tokens), 0) as tokens, COALESCE(SUM(cost), 0) as cost, COUNT(*) as count
       FROM cost_records WHERE user_id = ? ${sinceClause}
       GROUP BY model_type ORDER BY cost DESC`
    ).all(...params) as Array<{ model_type: string; tokens: number; cost: number; count: number }>;

    const byModel = db.prepare(
      `SELECT provider, model_name, COALESCE(SUM(tokens), 0) as tokens, COALESCE(SUM(cost), 0) as cost, COUNT(*) as count
       FROM cost_records WHERE user_id = ? ${sinceClause}
       GROUP BY provider, model_name ORDER BY cost DESC LIMIT 20`
    ).all(...params) as Array<{ provider: string; model_name: string; tokens: number; cost: number; count: number }>;

    const daily = db.prepare(
      `SELECT substr(created_at, 1, 10) as date, COALESCE(SUM(tokens), 0) as tokens, COALESCE(SUM(cost), 0) as cost
       FROM cost_records WHERE user_id = ? ${sinceClause}
       GROUP BY substr(created_at, 1, 10) ORDER BY date ASC`
    ).all(...params) as Array<{ date: string; tokens: number; cost: number }>;

    return { ...totals, by_type: byType, by_model: byModel, daily };
  },
};
