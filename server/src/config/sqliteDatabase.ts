// SQLite 数据库初始化、迁移执行、WAL 模式
// v1.0

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import type { Database as DBType, DatabaseStatement } from '../types';

export interface SQLiteDatabase extends DBType {
  raw: Database.Database;
}

export function initSQLite(dbPath: string): SQLiteDatabase {
  // 确保目录存在
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const db = new Database(dbPath);

  // 启用 WAL 模式提升并发性能
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');

  // 包装成统一接口
  const wrapper: SQLiteDatabase = {
    raw: db,
    prepare(sql: string): DatabaseStatement {
      const stmt = db.prepare(sql);
      return {
        run(...params: unknown[]) {
          return stmt.run(...params) as { changes: number; lastInsertRowid: number | bigint };
        },
        get(...params: unknown[]) {
          return stmt.get(...params);
        },
        all(...params: unknown[]) {
          return stmt.all(...params);
        },
      };
    },
    exec(sql: string): void {
      db.exec(sql);
    },
    transaction<T>(fn: () => T): () => T {
      return db.transaction(fn) as unknown as () => T;
    },
    close(): void {
      db.close();
    },
  };

  return wrapper;
}

// 迁移执行
export function runMigrations(db: SQLiteDatabase, migrationsDir: string): void {
  // 创建迁移记录表
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      version TEXT UNIQUE,
      executed_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 读取迁移文件
  if (!fs.existsSync(migrationsDir)) {
    console.log('[DB] 迁移目录不存在，跳过');
    return;
  }

  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  const getExecuted = db.prepare('SELECT version FROM _migrations');
  const executedVersions = new Set(
    (getExecuted.all() as { version: string }[]).map(r => r.version)
  );

  const insertMigration = db.prepare('INSERT INTO _migrations (version) VALUES (?)');

  for (const file of files) {
    if (executedVersions.has(file)) continue;

    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
    console.log(`[DB] 执行迁移: ${file}`);

    const runMigration = db.transaction(() => {
      db.exec(sql);
      insertMigration.run(file);
    });
    runMigration();
  }

  console.log('[DB] 迁移完成');
}
