import path from 'path';
import { initSQLite, runMigrations, type SQLiteDatabase } from '../../server/src/config/sqliteDatabase';

/**
 * 创建内存 SQLite 数据库并执行迁移，用于 DAO 层测试
 */
export function createTestDb(): SQLiteDatabase {
  const db = initSQLite(':memory:');
  const migrationsDir = path.resolve(__dirname, '../../server/src/migrations');
  runMigrations(db, migrationsDir);
  return db;
}

/**
 * 关闭测试数据库
 */
export function closeTestDb(db: SQLiteDatabase | undefined): void {
  if (db) db.close();
}
