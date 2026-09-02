// CineSlice Studio 后端入口
// v1.0

// 修复 Windows 控制台中文乱码：设置 stdout 编码为 UTF-8
if (process.stdout.setEncoding) {
  process.stdout.setEncoding('utf8');
}
if (process.stderr.setEncoding) {
  process.stderr.setEncoding('utf8');
}

import express from 'express';
import cors from 'cors';
import compression from 'compression';
import path from 'path';
import fs from 'fs';
import { loadEnv } from './config/env';
import { initDatabase } from './config/database';
import { authMiddleware, AUTH_WHITELIST } from './middleware/auth';
import { rateLimit } from './middleware/rateLimiter';
import { errorHandler } from './middleware/errorHandler';
import { ensureLocalUser, UserPreferenceDAO } from './models';
import { AutoPipelineService } from './services/autoPipelineService';
import './services/adapters';
import { seedStylePresets } from './seed/seedStylePresets';
import authRoutes from './routes/auth';
import projectRoutes from './routes/projects';
import assetRoutes from './routes/assets';
import episodeRoutes from './routes/episodes';
import modelRoutes from './routes/models';
import dataTransferRoutes from './routes/dataTransfer';
import preferenceRoutes from './routes/preferences';
import visualStyleRoutes from './routes/visualStyles';
import stylePresetRoutes from './routes/stylePresets';
import pipelineRoutes from './routes/pipeline';
import taskRoutes from './routes/tasks';
import aiRoutes from './routes/ai';
import projectPatchRoutes from './routes/projectPatch';
import videoComposeRoutes from './routes/videoCompose';
import audioRoutes from './routes/audio';
import { getAvailablePort, getLocalIP } from './utils/portManager';

async function main() {
  // 1. 加载环境变量
  const config = loadEnv();
  console.log(`[CineSlice Studio] 运行模式: ${config.runMode}`);
  console.log(`[CineSlice Studio] 数据库类型: ${config.dbType}`);

  // 2. 确保数据目录存在
  if (!fs.existsSync(config.dataDir)) fs.mkdirSync(config.dataDir, { recursive: true });
  if (!fs.existsSync(config.uploadDir)) fs.mkdirSync(config.uploadDir, { recursive: true });

  // 3. 初始化数据库（自动执行迁移）
  const db = await initDatabase(config);
  console.log('[CineSlice Studio] 数据库初始化完成');

  // 4. 本地模式：确保默认用户存在
  if (config.runMode === 'local') {
    ensureLocalUser(db);
    UserPreferenceDAO.getOrCreate(db, 'local_user');
  }

  // 4.1 全自动流水线：标记服务器重启前残留的运行中任务为失败
  AutoPipelineService.init(db);

  // 4.2 初始化内置风格预设
  seedStylePresets(db);

  // 5. 创建 Express 应用
  const app = express();
  app.locals.db = db;

  // 6. 中间件
  app.use(cors());
  app.use(compression());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // 静态文件托管（/data 含项目图片等资源，但绝不能暴露 SQLite 数据库文件）
  const blockSensitiveFiles: express.RequestHandler = (req, res, next) => {
    if (/\.(db|db-wal|db-shm|sqlite|sqlite3|wal|shm)$/i.test(req.path)) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: '禁止访问该文件' },
      });
    }
    next();
  };
  app.use('/data', blockSensitiveFiles, express.static(config.dataDir));
  app.use('/uploads', blockSensitiveFiles, express.static(config.uploadDir));

  // 健康检查（不需要认证）
  app.get('/api/health', (_req, res) => {
    res.json({ success: true, data: { status: 'ok', mode: config.runMode, timestamp: new Date().toISOString() } });
  });

  // 7. 认证中间件（白名单内的路由不需要认证）
  app.use((req, res, next) => {
    const whitelist = [...AUTH_WHITELIST, '/api/health'];
    if (whitelist.some(p => req.path.startsWith(p))) {
      return next();
    }
    return authMiddleware(req, res, next);
  });

  // 7.1 登录/注册限流（防暴力破解）
  const authRateLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });
  app.use('/api/auth/login', authRateLimit);
  app.use('/api/auth/register', authRateLimit);

  // 8. 挂载路由
  app.use('/api/auth', authRoutes);
  app.use('/api/projects', projectRoutes);
  app.use('/api', assetRoutes);       // /api/episodes/:id/characters, /api/characters/:id 等
  app.use('/api', episodeRoutes);     // /api/episodes/:id, /api/shots/:id, /api/keyframes/:id 等
  app.use('/api/models', modelRoutes);
  app.use('/api', dataTransferRoutes); // /api/projects/:id/export, /api/projects/import
  app.use('/api/preferences', preferenceRoutes);
  app.use('/api/visual-styles', visualStyleRoutes);
  app.use('/api/style-presets', stylePresetRoutes);
  app.use('/api/projects/:id/pipeline', pipelineRoutes);
  app.use('/api/tasks', taskRoutes);
  app.use('/api/ai', aiRoutes);
  app.use('/api/project-patch', projectPatchRoutes);
  app.use('/api', videoComposeRoutes); // /api/episodes/:id/compose, /api/compose/:taskId, /api/ffmpeg/status
  app.use('/api', audioRoutes); // /api/episodes/:id/tts, /api/episodes/:id/audio-compose, etc.

  // 9. 全局错误处理
  app.use(errorHandler);

  // 10. 生产模式托管前端静态文件
  const distPath = path.resolve(__dirname, '../../dist');
  if (process.env.NODE_ENV === 'production' && fs.existsSync(distPath)) {
    app.use(express.static(distPath));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/')) return next();
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // 11. 端口检测与启动
  const { port: actualPort, wasOccupied } = await getAvailablePort(config.port, 10);
  if (wasOccupied) {
    console.log(`[CineSlice Studio] 端口 ${config.port} 被占用，已自动切换到 ${actualPort}`);
  }

  const localIP = getLocalIP();
  app.listen(actualPort, () => {
    console.log('========================================');
    console.log(`[CineSlice Studio] 后端服务已启动`);
    console.log(`[CineSlice Studio] 本地访问: http://localhost:${actualPort}`);
    console.log(`[CineSlice Studio] 局域网访问: http://${localIP}:${actualPort}`);
    console.log(`[CineSlice Studio] 健康检查: http://localhost:${actualPort}/api/health`);
    console.log('========================================');
  });

  // 优雅关闭
  const shutdown = (signal: string) => {
    console.log(`[CineSlice Studio] 收到 ${signal} 信号，正在关闭...`);
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // 全局异常保护：防止未捕获异常导致进程崩溃
  process.on('uncaughtException', (err) => {
    console.error('[CineSlice Studio] 未捕获异常:', err.message, err.stack);
    // 不退出进程，记录日志后继续运行
  });

  process.on('unhandledRejection', (reason) => {
    console.error('[CineSlice Studio] 未处理的 Promise 拒绝:', reason);
    // 不退出进程，记录日志后继续运行
  });
}

main().catch(err => {
  console.error('[CineSlice Studio] 启动失败:', err);
  process.exit(1);
});
