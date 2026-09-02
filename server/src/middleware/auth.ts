// 双模式认证中间件
// v1.0

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getConfig } from '../config/env';
import type { AuthUser } from '../types';

// Express Request 类型增强（模块增强，等价于旧写法 declare global { namespace Express }）
declare module 'express-serve-static-core' {
  interface Request {
    user: AuthUser;
  }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const config = getConfig();

  if (config.runMode === 'local') {
    req.user = { id: 'local_user', username: 'local', isLocal: true };
    return next();
  }

  // 服务端模式：JWT 校验
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({
      success: false,
      error: { code: 'AUTH_REQUIRED', message: '未登录' },
    });
  }

  try {
    const payload = jwt.verify(token, config.jwtSecret) as { id: string; username: string };
    req.user = { id: payload.id, username: payload.username, isLocal: false };
    next();
  } catch {
    return res.status(401).json({
      success: false,
      error: { code: 'AUTH_INVALID', message: 'Token 无效' },
    });
  }
}

// 白名单路由（不需要认证）
export const AUTH_WHITELIST = [
  '/api/auth/mode',
  '/api/auth/login',
  '/api/auth/register',
];

export function authMiddlewareWithWhitelist(req: Request, res: Response, next: NextFunction) {
  if (AUTH_WHITELIST.some(path => req.path.startsWith(path))) {
    return next();
  }
  return authMiddleware(req, res, next);
}
