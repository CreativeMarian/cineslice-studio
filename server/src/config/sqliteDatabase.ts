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
      // 逐语句执行：SQLite 不支持 ADD COLUMN IF NOT EXISTS，
      // 列已存在时整文件执行会因 duplicate column name 回滚，导致迁移永远无法记录。
      // 这里对"列已存在"做幂等跳过，让文件内其余语句（如索引重建）继续生效。
      for (const stmt of splitSqlStatements(sql)) {
        try {
          db.exec(stmt);
        } catch (err) {
          if (isDuplicateColumnError(err) && isColumnExists(db, stmt)) {
            console.warn(`[DB] ${file}: 列已存在，跳过重复 DDL 语句`);
            continue;
          }
          throw err;
        }
      }
      insertMigration.run(file);
    });
    runMigration();
  }

  console.log('[DB] 迁移完成');
}

// 迁移文件均为简单 DDL（无触发器/BEGIN 块，字符串字面量不含分号），可按 ';' 安全拆分
function splitSqlStatements(sql: string): string[] {
  return sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

// 匹配 ALTER TABLE ... ADD COLUMN 语句（表名/列名限定为常见标识符）
const ALTER_ADD_COLUMN_RE =
  /^\s*ALTER\s+TABLE\s+["'`]?([A-Za-z_][\w$]*)["'`]?\s+ADD\s+COLUMN\s+["'`]?([A-Za-z_][\w$]*)["'`]?/i;

function isDuplicateColumnError(err: unknown): boolean {
  return /duplicate column name/i.test(String((err as Error)?.message ?? ''));
}

// 剥离语句段开头的 SQL 注释行，便于后续正则锚定语句关键词
function stripLeadingSqlComments(sql: string): string {
  return sql.replace(/^(?:\s*--[^\n]*\n?)+/, '');
}

// 校验 ADD COLUMN 的目标列是否已存在于表中，存在则说明该 DDL 已生效，可安全跳过
function isColumnExists(db: SQLiteDatabase, stmt: string): boolean {
  const m = stripLeadingSqlComments(stmt).match(ALTER_ADD_COLUMN_RE);
  if (!m) return false;
  const [, table, column] = m;
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return columns.some(c => c.name === column);
}
