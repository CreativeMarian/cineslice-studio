// 数据库连接工厂（MVP 阶段仅支持 SQLite）
// v1.0

import path from 'path';
import { initSQLite, runMigrations, type SQLiteDatabase } from './sqliteDatabase';
import type { AppConfig } from './env';
import type { Database } from '../types';

export async function initDatabase(config: AppConfig): Promise<Database> {
  if (config.dbType !== 'sqlite') {
    throw new Error(
      `MVP 阶段仅支持 SQLite，当前 DB_TYPE=${config.dbType}。` +
      `MySQL 多用户模式将在 P2 阶段重新实现（需将 Database 接口改为全异步）。`
    );
  }

  // 迁移文件目录：开发模式在 src/migrations，生产模式在 dist/migrations（构建时复制）
  const migrationsDir = path.resolve(__dirname, '../migrations');
  const db = initSQLite(config.dbPath);
  runMigrations(db, migrationsDir);
  return db;
}

export type { SQLiteDatabase };
