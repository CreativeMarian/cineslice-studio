// DAO 层统一导出
// v1.0

export * from './user';
export * from './project';
export * from './novelChapter';
export * from './novelEpisode';
export * from './scriptCharacter';
export * from './characterOutfit';
export * from './scriptScene';
export * from './scriptProp';
export * from './shot';
export * from './shotKeyframe';
export * from './shotVideoInterval';
export * from './shotAudio';
export * from './generationTask';
export * from './renderLog';
export * from './modelRegistry';
export * from './userPreference';
export * from './visualStyle';
export * from './stylePreset';
export * from './aiCache';
export * from './costRecord';
export * from './subtitle';
export * from './autoPipelineTask';

// 通用工具
import crypto from 'crypto';
import type { Database } from '../types';

export function generateId(prefix = ''): string {
  const id = crypto.randomBytes(8).toString('hex');
  return prefix ? `${prefix}_${id}` : id;
}

export function now(): string {
  return new Date().toISOString();
}

export function countWords(text: string): number {
  if (!text) return 0;
  // 中文字符算 1 个字，英文单词算 1 个
  const chinese = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  const english = (text.match(/[a-zA-Z]+/g) || []).length;
  return chinese + english;
}

// 动态更新辅助函数
export function buildUpdateQuery(
  table: string,
  data: Record<string, unknown>,
  idField = 'id'
): { sql: string; params: unknown[] } {
  const fields = Object.keys(data).filter(k => k !== idField);
  if (fields.length === 0) {
    return { sql: '', params: [] };
  }
  const sets = fields.map(f => `${f} = ?`).join(', ');
  return {
    sql: `UPDATE ${table} SET ${sets}, updated_at = ? WHERE ${idField} = ?`,
    params: [...fields.map(f => data[f]), now(), data[idField]],
  };
}

// 确保用户存在（本地模式）
export function ensureLocalUser(db: Database): void {
  const existing = db.prepare('SELECT id FROM users WHERE id = ?').get('local_user');
  if (!existing) {
    db.prepare(`
      INSERT INTO users (id, username, display_name, is_local, created_at, updated_at)
      VALUES (?, ?, ?, 1, ?, ?)
    `).run('local_user', 'local', '本地用户', now(), now());
    console.log('[DB] 已创建本地默认用户');
  }
}
