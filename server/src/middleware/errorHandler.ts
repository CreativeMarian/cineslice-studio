// 全局错误处理 + 统一响应格式
// v1.1 - 支持 AIError 类型，返回具体错误信息

import { Request, Response, NextFunction } from 'express';
import { AIError } from '../services/adapters/base';

export class AppError extends Error {
  status: number;
  code: string;
  retryable?: boolean;

  constructor(status: number, code: string, message: string, retryable = false) {
    super(message);
    this.status = status;
    this.code = code;
    this.retryable = retryable;
    this.name = 'AppError';
  }
}

export function createError(status: number, code: string, message: string): AppError {
  return new AppError(status, code, message);
}

export function errorHandler(err: Error | AppError, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    console.error(`[ERROR ${err.status}] ${err.code}: ${err.message}`);
    return res.status(err.status).json({
      success: false,
      error: { code: err.code, message: err.message },
    });
  }

  // AI 适配器错误（AIError）
  if (err instanceof AIError) {
    console.error(`[AI ERROR] ${err.code}: ${err.message}`);
    const status = err.code === 'AI_RATE_LIMITED' ? 429 : 502;
    return res.status(status).json({
      success: false,
      error: { code: err.code, message: err.message },
    });
  }

  // multer 文件过大错误
  if (err.name === 'MulterError' && (err as any).code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({
      success: false,
      error: { code: 'FILE_TOO_LARGE', message: '文件超过 10MB 限制' },
    });
  }

  // multer 其他错误（如缺少 boundary、文件类型不支持等）
  if (err.name === 'MulterError') {
    const multerErr = err as any;
    const messages: Record<string, string> = {
      LIMIT_PART_COUNT: '上传文件数量超出限制',
      LIMIT_FILE_COUNT: '上传文件数量超出限制',
      LIMIT_FIELD_KEY: '字段名过长',
      LIMIT_FIELD_VALUE: '字段值过长',
      LIMIT_FIELD_COUNT: '字段数量超出限制',
      LIMIT_UNEXPECTED_FILE: '意外的文件字段',
      MISSING_FIELD_NAME: '缺少字段名',
    };
    const msg = messages[multerErr.code] || `文件上传失败：${multerErr.message || multerErr.code}`;
    console.error(`[MulterError ${multerErr.code}] ${msg}`);
    return res.status(400).json({
      success: false,
      error: { code: 'UPLOAD_ERROR', message: msg },
    });
  }

  // multipart 解析错误（如缺少 boundary）
  if ((err as any).message && (
    (err as any).message.includes('boundary') ||
    (err as any).message.includes('multipart') ||
    (err as any).message.includes('Unexpected end of form')
  )) {
    console.error('[MultipartError]', (err as any).message);
    return res.status(400).json({
      success: false,
      error: { code: 'UPLOAD_ERROR', message: '文件上传解析失败，请重试' },
    });
  }

  // JSON 解析错误
  if ((err as any).type === 'entity.parse.failed') {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: '请求体 JSON 格式错误' },
    });
  }

  console.error('[INTERNAL ERROR]', err);
  res.status(500).json({
    success: false,
    error: { code: 'INTERNAL_ERROR', message: '服务器内部错误' },
  });
}

// 异步路由包装器，捕获 async 错误
export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
