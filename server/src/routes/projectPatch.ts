// 项目补丁路由
// v1.0 - 用于项目数据迁移和修复

import { Router, Request, Response } from 'express';
import { ProjectDAO, NovelChapterDAO, NovelEpisodeDAO } from '../models';
import { createError, asyncHandler } from '../middleware/errorHandler';
import type { Database } from '../types';

const router = Router();

function getDb(req: Request): Database {
  return req.app.locals.db as Database;
}

// 获取项目补丁信息
router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const project = ProjectDAO.getByIdAndUser(db, req.params.id, req.user.id);
  if (!project) throw createError(404, 'NOT_FOUND', '项目不存在');

  const chapters = NovelChapterDAO.listByProject(db, req.params.id);
  const episodes = NovelEpisodeDAO.listByProject(db, req.params.id);

  res.json({
    success: true,
    data: {
      project,
      stats: {
        chaptersCount: chapters.length,
        episodesCount: episodes.length,
        totalWords: chapters.reduce((sum, c) => sum + c.word_count, 0),
      },
    },
  });
}));

// 应用补丁（重新计算字数等）
router.post('/:id/recalculate', asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const project = ProjectDAO.getByIdAndUser(db, req.params.id, req.user.id);
  if (!project) throw createError(404, 'NOT_FOUND', '项目不存在');

  const chapters = NovelChapterDAO.listByProject(db, req.params.id);
  for (const ch of chapters) {
    NovelChapterDAO.update(db, ch.id, { content: ch.content }); // 触发字数重算
  }

  const episodes = NovelEpisodeDAO.listByProject(db, req.params.id);
  for (const ep of episodes) {
    NovelEpisodeDAO.update(db, ep.id, { script_content: ep.script_content });
  }

  res.json({ success: true, data: { message: '字数重算完成', chaptersCount: chapters.length, episodesCount: episodes.length } });
}));

export default router;
