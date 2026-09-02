// 用户 DAO
// v1.0

import type { Database } from '../types';
import type { User } from '../types';
import { generateId, now } from './index';

export const UserDAO = {
  create(db: Database, data: { username: string; passwordHash?: string; email?: string; displayName?: string; isLocal?: number }): User {
    const id = generateId('user');
    db.prepare(`
      INSERT INTO users (id, username, password_hash, email, display_name, is_local, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, data.username, data.passwordHash || null, data.email || null, data.displayName || data.username, data.isLocal || 0, now(), now());
    return this.getById(db, id)!;
  },

  getById(db: Database, id: string): User | null {
    return (db.prepare('SELECT * FROM users WHERE id = ?').get(id) as User) || null;
  },

  getByUsername(db: Database, username: string): User | null {
    return (db.prepare('SELECT * FROM users WHERE username = ?').get(username) as User) || null;
  },

  update(db: Database, id: string, data: Partial<User>): User | null {
    const fields = Object.keys(data).filter(k => k !== 'id');
    if (fields.length === 0) return this.getById(db, id);
    const sets = fields.map(f => `${f} = ?`).join(', ');
    db.prepare(`UPDATE users SET ${sets}, updated_at = ? WHERE id = ?`)
      .run(...fields.map(f => (data as any)[f]), now(), id);
    return this.getById(db, id);
  },

  updatePassword(db: Database, id: string, passwordHash: string): void {
    db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?')
      .run(passwordHash, now(), id);
  },

  delete(db: Database, id: string): void {
    db.prepare('DELETE FROM users WHERE id = ?').run(id);
  },
};
