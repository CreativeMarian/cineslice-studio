// P0-2: 视觉记忆库 API 路由
// P2修复(IDOR): GET 路由补项目归属校验（getByIdAndUser），防止跨用户读取他人项目视觉记忆

import { Router } from 'express';
import type { Database } from '../types';
import { VisualMemoryDAO, ProjectDAO } from '../models';
import { visualMemoryService } from '../services/visualMemoryService';
import { createError, asyncHandler } from '../middleware/errorHandler';

export function createVisualMemoryRouter(db: Database): Router {
  const router = Router();

  /** 项目归属校验：项目不存在或不属于当前用户时抛 404 */
  function assertProjectOwner(projectId: string, userId: string): void {
    const project = ProjectDAO.getByIdAndUser(db, projectId, userId);
    if (!project) throw createError(404, 'NOT_FOUND', '项目不存在');
  }

  // 获取项目视觉记忆统计
  router.get('/:projectId/visual-memory/stats', asyncHandler(async (req, res) => {
    const { projectId } = req.params;
    assertProjectOwner(projectId, (req as any).user?.id || '');
    const total = VisualMemoryDAO.countByProject(db, projectId);
    const byType: Record<string, number> = {};
    ['character', 'scene', 'prop', 'keyframe', 'general'].forEach(type => {
      byType[type] = VisualMemoryDAO.listByType(db, projectId, type as any, 1000).length;
    });
    res.json({ success: true, data: { total, byType } });
  }));

  // 获取视觉记忆列表
  router.get('/:projectId/visual-memory', asyncHandler(async (req, res) => {
    const { projectId } = req.params;
    assertProjectOwner(projectId, (req as any).user?.id || '');
    const { type, entity, limit } = req.query;
    let memories;
    if (entity) {
      memories = VisualMemoryDAO.listByEntity(db, projectId, String(entity), type as any, Number(limit) || 20);
    } else if (type) {
      memories = VisualMemoryDAO.listByType(db, projectId, type as any, Number(limit) || 50);
    } else {
      memories = VisualMemoryDAO.listByProject(db, projectId, Number(limit) || 100);
    }
    res.json({ success: true, data: memories });
  }));

  // 手动触发已有数据入库
  router.post('/:projectId/visual-memory/index', asyncHandler(async (req, res) => {
    const { projectId } = req.params;
    const userId = (req as any).user?.id || 'local_user';
    assertProjectOwner(projectId, userId);
    const { episodeId } = req.body;
    if (!episodeId) {
      throw createError(400, 'MISSING_EPISODE', '需要 episodeId');
    }
    const indexed = visualMemoryService.indexExistingKeyframes(db, projectId, episodeId);
    res.json({ success: true, data: { indexed } });
  }));

  // 标记为优质参考图
  router.put('/visual-memory/:id/reference', (req, res) => {
    const { id } = req.params;
    const { quality_score } = req.body;
    const updated = VisualMemoryDAO.markAsReference(db, id, quality_score || 0.8);
    res.json({ success: true, data: updated });
  });

  // 删除视觉记忆
  router.delete('/visual-memory/:id', (req, res) => {
    const { id } = req.params;
    VisualMemoryDAO.delete(db, id);
    res.json({ success: true });
  });

  return router;
}
