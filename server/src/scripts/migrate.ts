// 数据库迁移执行脚本
// v1.0

import { loadEnv } from '../config/env';
import { initSQLite, runMigrations } from '../config/sqliteDatabase';
import path from 'path';

async function main() {
  const config = loadEnv();
  if (config.dbType !== 'sqlite') {
    console.log('当前非 SQLite 模式，迁移请使用对应数据库工具');
    process.exit(0);
  }

  const db = initSQLite(config.dbPath);
  const migrationsDir = path.resolve(__dirname, '../migrations');
  runMigrations(db, migrationsDir);
  console.log('迁移执行完成');
  process.exit(0);
}

main().catch(err => {
  console.error('迁移失败:', err);
  process.exit(1);
});
