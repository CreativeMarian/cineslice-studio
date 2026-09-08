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

// 真实数据完成度检测（不依赖流水线状态机，用户手动操作也能正确判定）
// 返回每个生产阶段的实际内容数量与完成标记，供前端做步骤门控与下一步引导
router.get('/progress', asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const projectId = req.params.id;
  const project = ProjectDAO.getByIdAndUser(db, projectId, req.user.id);
  if (!project) throw createError(404, 'NOT_FOUND', '项目不存在');

  const count = (sql: string, ...args: any[]) => {
    const row: any = db.prepare(sql).get(...args);
    return Number(row?.c || 0);
  };

  const cNovel = count('SELECT COUNT(*) c FROM novel_chapters WHERE project_id = ?', projectId);
  const cEpisodes = count('SELECT COUNT(*) c FROM novel_episodes WHERE project_id = ?', projectId);
  const cScript = count('SELECT COUNT(*) c FROM novel_episodes WHERE project_id = ? AND LENGTH(TRIM(script_content)) > 0', projectId);

  const epRows = db.prepare('SELECT id FROM novel_episodes WHERE project_id = ?').all(projectId) as Array<{ id: string }>;
  const epIds = epRows.map(r => r.id);
  const inList = epIds.length > 0 ? epIds.map(() => '?').join(',') : 'NULL';
  const epArgs = epIds as any[];

  const cCharacters = epIds.length > 0
    ? count(`SELECT COUNT(*) c FROM script_characters WHERE episode_id IN (${inList})`, ...epArgs) : 0;
  const cScenes = epIds.length > 0
    ? count(`SELECT COUNT(*) c FROM script_scenes WHERE episode_id IN (${inList})`, ...epArgs) : 0;
  const cShots = epIds.length > 0
    ? count(`SELECT COUNT(*) c FROM shots WHERE episode_id IN (${inList})`, ...epArgs) : 0;
  const cKeyframes = count(
    'SELECT COUNT(*) c FROM shot_keyframes k JOIN shots s ON k.shot_id = s.id JOIN novel_episodes e ON s.episode_id = e.id WHERE e.project_id = ? AND k.image_url IS NOT NULL AND k.image_url != ?',
    projectId, ''
  );
  const cVideos = count(
    "SELECT COUNT(*) c FROM shot_video_intervals v JOIN shots s ON v.shot_id = s.id JOIN novel_episodes e ON s.episode_id = e.id WHERE e.project_id = ? AND v.status = 'completed' AND v.video_url IS NOT NULL AND v.video_url != ''",
    projectId
  );

  const stages = {
    novel: { done: cNovel > 0, count: cNovel, label: '小说上传' },
    episodes: { done: cEpisodes > 0, count: cEpisodes, label: '剧集拆分' },
    script: { done: cScript > 0, count: cScript, label: '剧本生成' },
    characters: { done: cCharacters > 0, count: cCharacters, label: '角色设定' },
    scenes: { done: cScenes > 0, count: cScenes, label: '场景设定' },
    shots: { done: cShots > 0, count: cShots, label: '分镜生成' },
    keyframes: { done: cKeyframes > 0, count: cKeyframes, label: '关键帧' },
    video: { done: cVideos > 0, count: cVideos, label: '视频生成' },
  };
  const order = ['novel', 'episodes', 'script', 'characters', 'scenes', 'shots', 'keyframes', 'video'] as const;
  const completedCount = order.filter(k => stages[k].done).length;
  const firstPending = order.find(k => !stages[k].done) || null;
  const allDone = firstPending === null;

  res.json({
    success: true,
    data: {
      projectId,
      stages,
      completedCount,
      totalStages: order.length,
      firstPending,
      allDone,
    },
  });
}));

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
