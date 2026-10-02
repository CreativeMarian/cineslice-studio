// P0-2: 视觉记忆库 API 路由
import { Router } from 'express';
import type { Database } from '../types';
import { VisualMemoryDAO } from '../models';
import { visualMemoryService } from '../services/visualMemoryService';

export function createVisualMemoryRouter(db: Database): Router {
  const router = Router();

  // 获取项目视觉记忆统计
  router.get('/:projectId/visual-memory/stats', (req, res) => {
    const { projectId } = req.params;
    const total = VisualMemoryDAO.countByProject(db, projectId);
    const byType: Record<string, number> = {};
    ['character', 'scene', 'prop', 'keyframe', 'general'].forEach(type => {
      byType[type] = VisualMemoryDAO.listByType(db, projectId, type as any, 1000).length;
    });
    res.json({ success: true, data: { total, byType } });
  });

  // 获取视觉记忆列表
  router.get('/:projectId/visual-memory', (req, res) => {
    const { projectId } = req.params;
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
  });

  // 手动触发已有数据入库
  router.post('/:projectId/visual-memory/index', (req, res) => {
    const { projectId } = req.params;
    const { episodeId } = req.body;
    try {
      if (!episodeId) {
        return res.status(400).json({ success: false, error: { code: 'MISSING_EPISODE', message: '需要 episodeId' } });
      }
      const indexed = visualMemoryService.indexExistingKeyframes(db, projectId, episodeId);
      res.json({ success: true, data: { indexed } });
    } catch (err: any) {
      res.status(500).json({ success: false, error: { code: 'INDEX_FAILED', message: err.message } });
    }
  });

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
