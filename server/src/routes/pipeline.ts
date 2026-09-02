// 流水线路由
// v1.0 - 全自动/半自动流水线状态管理

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { ProjectDAO } from '../models';
import { PipelineService, PIPELINE_STAGES, STAGE_LABELS } from '../services/pipelineService';
import { AutoPipelineService } from '../services/autoPipelineService';
import { createError, asyncHandler } from '../middleware/errorHandler';
import { validateBody } from '../middleware/validate';
import type { Database, PipelineMode } from '../types';

const router = Router({ mergeParams: true });

function getDb(req: Request): Database {
  return req.app.locals.db as Database;
}

const modeSchema = z.object({
  mode: z.enum(['auto', 'semi-auto']),
});

// 获取流水线状态
router.get('/status', asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const project = ProjectDAO.getByIdAndUser(db, req.params.id, req.user.id);
  if (!project) throw createError(404, 'NOT_FOUND', '项目不存在');

  const status = PipelineService.getStatus(db, req.params.id);
  const mode = PipelineService.getMode(db, req.params.id);

  res.json({
    success: true,
    data: {
      mode,
      ...status,
      stage_labels: STAGE_LABELS,
      stage_order: PIPELINE_STAGES,
    },
  });
}));

// 设置流水线模式
router.put('/mode', validateBody(modeSchema), asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const project = ProjectDAO.getByIdAndUser(db, req.params.id, req.user.id);
  if (!project) throw createError(404, 'NOT_FOUND', '项目不存在');

  PipelineService.setMode(db, req.params.id, req.body.mode as PipelineMode);
  const status = PipelineService.getStatus(db, req.params.id);

  res.json({
    success: true,
    data: { mode: req.body.mode, ...status },
  });
}));

// 启动/初始化流水线
router.post('/start', asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const project = ProjectDAO.getByIdAndUser(db, req.params.id, req.user.id);
  if (!project) throw createError(404, 'NOT_FOUND', '项目不存在');

  const mode = (project.mode as PipelineMode) || 'semi-auto';
  const status = PipelineService.initPipeline(db, req.params.id, mode);

  // 自动模式下，标记 novel 阶段为 running（如果已有章节则直接完成）
  if (mode === 'auto') {
    PipelineService.startStage(db, req.params.id, 'novel');
  }

  res.json({ success: true, data: { mode, ...status } });
}));

// 推进到下一阶段（半自动确认）
router.post('/next', asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const project = ProjectDAO.getByIdAndUser(db, req.params.id, req.user.id);
  if (!project) throw createError(404, 'NOT_FOUND', '项目不存在');

  const status = PipelineService.next(db, req.params.id);
  res.json({ success: true, data: status });
}));

// 重试失败阶段
router.post('/retry', asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const project = ProjectDAO.getByIdAndUser(db, req.params.id, req.user.id);
  if (!project) throw createError(404, 'NOT_FOUND', '项目不存在');

  const status = PipelineService.retry(db, req.params.id);
  res.json({ success: true, data: status });
}));

// 回退到上一阶段
router.post('/rollback', asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const project = ProjectDAO.getByIdAndUser(db, req.params.id, req.user.id);
  if (!project) throw createError(404, 'NOT_FOUND', '项目不存在');

  const status = PipelineService.rollback(db, req.params.id);
  res.json({ success: true, data: status });
}));

// 重置流水线
router.post('/reset', asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const project = ProjectDAO.getByIdAndUser(db, req.params.id, req.user.id);
  if (!project) throw createError(404, 'NOT_FOUND', '项目不存在');

  const status = PipelineService.reset(db, req.params.id);
  res.json({ success: true, data: status });
}));

// 标记阶段完成（供内部生成完成后调用）
router.post('/stage/:stage/complete', asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const project = ProjectDAO.getByIdAndUser(db, req.params.id, req.user.id);
  if (!project) throw createError(404, 'NOT_FOUND', '项目不存在');

  const stage = req.params.stage as any;
  if (!PIPELINE_STAGES.includes(stage)) {
    throw createError(400, 'INVALID_STAGE', `无效阶段: ${stage}`);
  }

  const status = PipelineService.completeStage(db, req.params.id, stage);
  res.json({ success: true, data: status });
}));

// 标记阶段失败
router.post('/stage/:stage/fail', validateBody(z.object({ error: z.string() })), asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const project = ProjectDAO.getByIdAndUser(db, req.params.id, req.user.id);
  if (!project) throw createError(404, 'NOT_FOUND', '项目不存在');

  const stage = req.params.stage as any;
  if (!PIPELINE_STAGES.includes(stage)) {
    throw createError(400, 'INVALID_STAGE', `无效阶段: ${stage}`);
  }

  const status = PipelineService.failStage(db, req.params.id, stage, req.body.error);
  res.json({ success: true, data: status });
}));

// 启动全自动流水线（异步执行，立即返回 taskId）
router.post('/auto-run', asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const project = ProjectDAO.getByIdAndUser(db, req.params.id, req.user.id);
  if (!project) throw createError(404, 'NOT_FOUND', '项目不存在');

  let task;
  try {
    task = AutoPipelineService.start(db, req.params.id, req.user.id);
  } catch (err: any) {
    // start() 在已有运行中任务时抛错 —— 这是并发冲突，应返回 409 而不是 500
    if ((err as Error).message?.includes('已有进行中的全自动任务')) {
      throw createError(409, 'PIPELINE_ALREADY_RUNNING', (err as Error).message);
    }
    throw err;
  }
  res.json({
    success: true,
    data: {
      taskId: task.taskId,
      status: task.status,
      message: '全自动流水线已启动，将自动执行所有阶段',
    },
  });
}));

// 查询全自动流水线任务状态
router.get('/auto-run/current', asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const project = ProjectDAO.getByIdAndUser(db, req.params.id, req.user.id);
  if (!project) throw createError(404, 'NOT_FOUND', '项目不存在');

  const task = AutoPipelineService.getCurrentRunningTask(db, req.params.id);
  if (!task) {
    return res.json({ success: true, data: null });
  }
  res.json({ success: true, data: task });
}));

// 取消全自动流水线任务（校验任务归属，防止跨用户取消/续跑）
router.post('/auto-run/:taskId/cancel', asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const task = AutoPipelineService.getTask(db, req.params.taskId);
  if (!task || task.userId !== req.user.id) throw createError(404, 'NOT_FOUND', '任务不存在或已结束');
  const cancelled = AutoPipelineService.cancel(db, req.params.taskId);
  if (!cancelled) throw createError(404, 'NOT_FOUND', '任务不存在或已结束');
  res.json({ success: true, data: { message: '任务已取消' } });
}));

// 恢复中断的全自动流水线任务（校验任务归属，防止替他人触发付费调用）
router.post('/auto-run/:taskId/resume', asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const existing = AutoPipelineService.getTask(db, req.params.taskId);
  if (!existing || existing.userId !== req.user.id) throw createError(404, 'NOT_FOUND', '任务不存在');
  const task = AutoPipelineService.resume(db, req.params.taskId);
  if (!task) throw createError(404, 'NOT_FOUND', '任务不存在');
  res.json({
    success: true,
    data: {
      taskId: task.taskId,
      status: task.status,
      currentStage: task.currentStage,
      message: `任务已恢复，从阶段 ${task.currentStage} 继续执行`,
    },
  });
}));

// 查询全自动流水线任务状态（仅任务归属人可见）
router.get('/auto-run/:taskId', asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const task = AutoPipelineService.getTask(db, req.params.taskId);
  if (!task || task.userId !== req.user.id) throw createError(404, 'NOT_FOUND', '任务不存在或已过期');
  res.json({ success: true, data: task });
}));

export default router;
