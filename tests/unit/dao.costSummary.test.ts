import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb, closeTestDb } from '../helpers/db';
import { CostRecordDAO, ensureLocalUser } from '../../server/src/models';
import type { SQLiteDatabase } from '../../server/src/config/sqliteDatabase';

describe('CostRecordDAO 成本汇总', () => {
  let db: SQLiteDatabase;

  beforeEach(() => {
    db = createTestDb();
    ensureLocalUser(db);
  });

  afterEach(() => {
    closeTestDb(db);
  });

  function seed(createdAt: string, type: string, tokens: number, cost: number, model: string) {
    db.prepare(`
      INSERT INTO cost_records (id, user_id, provider, model_name, model_type, tokens, cost, image_count, video_seconds, audio_chars, created_at)
      VALUES (?, 'local_user', 'test', ?, ?, ?, ?, 0, 0, 0, ?)
    `).run(`cost_${Math.random().toString(36).slice(2)}`, model, type, tokens, cost, createdAt);
  }

  it('getSummary 按类型/模型/日期聚合', () => {
    const today = new Date().toISOString();
    const yesterday = new Date(Date.now() - 86_400_000).toISOString();
    seed(today, 'text', 1000, 0.5, 'deepseek-chat');
    seed(today, 'text', 500, 0.25, 'deepseek-chat');
    seed(today, 'image', 0, 1.0, 'seedream');
    seed(yesterday, 'video', 0, 2.0, 'kling');

    const s = CostRecordDAO.getSummary(db, 'local_user');

    expect(s.call_count).toBe(4);
    expect(s.total_tokens).toBe(1500);
    expect(Math.abs(s.total_cost - 3.75)).toBeLessThan(1e-9);

    const textRow = s.by_type.find((t) => t.model_type === 'text');
    expect(textRow?.count).toBe(2);
    expect(Math.abs((textRow?.cost ?? 0) - 0.75)).toBeLessThan(1e-9);

    const ds = s.by_model.find((m) => m.model_name === 'deepseek-chat');
    expect(ds?.count).toBe(2);
    expect(s.by_model[0].cost).toBeGreaterThanOrEqual(s.by_model[s.by_model.length - 1].cost);

    expect(s.daily.length).toBe(2);
    expect(s.daily[0].date <= s.daily[1].date).toBe(true);
  });

  it('getSummary 支持 since 时间窗口', () => {
    const now = new Date().toISOString();
    const old = new Date(Date.now() - 10 * 86_400_000).toISOString();
    seed(now, 'text', 100, 0.1, 'new-model');
    seed(old, 'text', 900, 0.9, 'old-model');

    const since = new Date(Date.now() - 5 * 86_400_000).toISOString();
    const s = CostRecordDAO.getSummary(db, 'local_user', since);

    expect(s.call_count).toBe(1);
    expect(s.total_tokens).toBe(100);
    expect(Math.abs(s.total_cost - 0.1)).toBeLessThan(1e-9);
  });
});
