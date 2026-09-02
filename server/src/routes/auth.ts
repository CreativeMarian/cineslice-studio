// 认证路由
// v1.0

import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { UserDAO, UserPreferenceDAO } from '../models';
import { getConfig } from '../config/env';
import { createError, asyncHandler } from '../middleware/errorHandler';
import { validateBody } from '../middleware/validate';
import type { Database } from '../types';

const router = Router();

function getDb(req: Request): Database {
  return (req.app.locals.db as Database);
}

const registerSchema = z.object({
  username: z.string().min(3).max(50),
  password: z.string().min(6).max(100),
  email: z.string().email().optional(),
  display_name: z.string().max(50).optional(),
});

const loginSchema = z.object({
  username: z.string(),
  password: z.string(),
});

const profileSchema = z.object({
  display_name: z.string().max(50).optional(),
  avatar_url: z.string().url().optional(),
  email: z.string().email().optional(),
});

const passwordSchema = z.object({
  old_password: z.string(),
  new_password: z.string().min(6).max(100),
});

// 注册（仅服务端模式）
router.post('/register', validateBody(registerSchema), asyncHandler(async (req: Request, res: Response) => {
  const config = getConfig();
  if (config.runMode === 'local') {
    throw createError(400, 'LOCAL_MODE_NO_AUTH', '本地模式无需注册');
  }

  const db = getDb(req);
  const { username, password, email, display_name } = req.body;

  const existing = UserDAO.getByUsername(db, username);
  if (existing) {
    throw createError(400, 'VALIDATION_ERROR', '用户名已存在');
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = UserDAO.create(db, {
    username,
    passwordHash,
    email,
    displayName: display_name || username,
  });

  // 初始化用户偏好
  UserPreferenceDAO.getOrCreate(db, user.id);

  const token = jwt.sign({ id: user.id, username: user.username }, config.jwtSecret, { expiresIn: config.jwtExpiresIn as any });
  res.json({ success: true, data: { token, user: sanitizeUser(user) } });
}));

// 登录（仅服务端模式）
router.post('/login', validateBody(loginSchema), asyncHandler(async (req: Request, res: Response) => {
  const config = getConfig();
  if (config.runMode === 'local') {
    throw createError(400, 'LOCAL_MODE_NO_AUTH', '本地模式无需登录');
  }

  const db = getDb(req);
  const { username, password } = req.body;

  const user = UserDAO.getByUsername(db, username);
  if (!user || !user.password_hash) {
    throw createError(401, 'AUTH_INVALID', '用户名或密码错误');
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    throw createError(401, 'AUTH_INVALID', '用户名或密码错误');
  }

  const token = jwt.sign({ id: user.id, username: user.username }, config.jwtSecret, { expiresIn: config.jwtExpiresIn as any });
  res.json({ success: true, data: { token, user: sanitizeUser(user) } });
}));

// 获取当前用户
router.get('/me', asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const user = UserDAO.getById(db, req.user.id);
  if (!user) {
    throw createError(404, 'NOT_FOUND', '用户不存在');
  }
  res.json({ success: true, data: sanitizeUser(user) });
}));

// 获取运行模式
router.get('/mode', (_req: Request, res: Response) => {
  const config = getConfig();
  res.json({ success: true, data: { mode: config.runMode } });
});

// 修改资料
router.put('/profile', validateBody(profileSchema), asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const user = UserDAO.update(db, req.user.id, req.body);
  res.json({ success: true, data: sanitizeUser(user!) });
}));

// 修改密码（仅服务端模式）
router.put('/password', validateBody(passwordSchema), asyncHandler(async (req: Request, res: Response) => {
  const config = getConfig();
  if (config.runMode === 'local') {
    throw createError(400, 'LOCAL_MODE_NO_AUTH', '本地模式无需修改密码');
  }

  const db = getDb(req);
  const user = UserDAO.getById(db, req.user.id);
  if (!user || !user.password_hash) {
    throw createError(404, 'NOT_FOUND', '用户不存在');
  }

  const valid = await bcrypt.compare(req.body.old_password, user.password_hash);
  if (!valid) {
    throw createError(400, 'VALIDATION_ERROR', '原密码错误');
  }

  const newHash = await bcrypt.hash(req.body.new_password, 10);
  UserDAO.updatePassword(db, req.user.id, newHash);
  res.json({ success: true, data: { message: '密码修改成功' } });
}));

function sanitizeUser(user: any) {
   
  const { password_hash, ...safe } = user;
  return safe;
}

export default router;
