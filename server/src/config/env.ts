// 环境变量解析与校验
// v1.0

import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export interface AppConfig {
  runMode: 'local' | 'server';
  port: number;
  dbType: 'sqlite';
  dbPath: string;
  jwtSecret: string;
  jwtExpiresIn: string;
  uploadDir: string;
  dataDir: string;
  logLevel: string;
}

function required(key: string, fallback?: string): string {
  const value = process.env[key] ?? fallback;
  if (value === undefined) {
    throw new Error(`环境变量 ${key} 未设置`);
  }
  return value;
}

function resolvePath(p: string): string {
  return path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
}

export function loadEnv(): AppConfig {
  const runMode = (process.env.RUN_MODE || 'local') as 'local' | 'server';
  const dbType = (process.env.DB_TYPE || 'sqlite') as 'sqlite';

  if (dbType !== 'sqlite') {
    throw new Error(`MVP 阶段仅支持 DB_TYPE=sqlite，当前值: ${dbType}`);
  }

  const config: AppConfig = {
    runMode,
    port: parseInt(process.env.PORT || '3000', 10),
    dbType,
    dbPath: resolvePath(process.env.DB_PATH || './data/cineslice-studio.db'),
    jwtSecret: required('JWT_SECRET', 'cineslice-studio-dev-secret'),
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
    uploadDir: resolvePath(process.env.UPLOAD_DIR || './uploads'),
    dataDir: resolvePath(process.env.DATA_DIR || './data'),
    logLevel: process.env.LOG_LEVEL || 'info',
  };

  // 服务端模式必须设置强 JWT_SECRET
  if (runMode === 'server' && config.jwtSecret === 'cineslice-studio-dev-secret') {
    throw new Error('服务端模式下必须设置 JWT_SECRET 环境变量（不能使用默认值）');
  }

  return config;
}

let cachedConfig: AppConfig | null = null;

export function getConfig(): AppConfig {
  if (!cachedConfig) {
    cachedConfig = loadEnv();
  }
  return cachedConfig;
}
