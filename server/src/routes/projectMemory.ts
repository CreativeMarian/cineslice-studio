// P0-1: 项目记忆 API 路由
// 提供角色圣经/世界观/剧情摘要/伏笔/关系图谱的查询和管理

import { Router } from 'express';
import type { Database } from '../types';
import {
  ProjectBibleDAO,
  StoryForeshadowDAO,
  CharacterRelationshipDAO,
} from '../models';
import { projectMemoryService } from '../services/projectMemoryService';

export function createProjectMemoryRouter(db: Database): Router {
  const router = Router();

  // 获取项目全部记忆
  router.get('/:projectId/memory', (req, res) => {
    const { projectId } = req.params;
    const bibles = ProjectBibleDAO.listByProject(db, projectId);
    const foreshadows = StoryForeshadowDAO.listByProject(db, projectId);
    const relationships = CharacterRelationshipDAO.listByProject(db, projectId);
    res.json({
      success: true,
      data: { bibles, foreshadows, relationships },
    });
  });

  // 获取特定类型圣经
  router.get('/:projectId/memory/bible/:type', (req, res) => {
    const { projectId, type } = req.params;
    const bible = ProjectBibleDAO.getByProjectAndType(db, projectId, type as any);
    res.json({ success: true, data: bible });
  });

  // 手动触发全量记忆生成
  router.post('/:projectId/memory/generate', async (req, res) => {
    const { projectId } = req.params;
    const userId = (req as any).user?.id || 'local_user';
    try {
      const result = await projectMemoryService.generateAllMemory(db, userId, projectId);
      res.json({
        success: true,
        data: {
          characterBible: result.characterBible,
          worldSetting: result.worldSetting,
          foreshadows: result.foreshadows,
        },
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: { code: 'GENERATE_FAILED', message: err.message } });
    }
  });

  // 更新圣经内容
  router.put('/:projectId/memory/bible/:bibleId', (req, res) => {
    const { bibleId } = req.params;
    const { content, generated_by } = req.body;
    const updated = ProjectBibleDAO.update(db, bibleId, { content, generated_by });
    res.json({ success: true, data: updated });
  });

  // 伏笔列表
  router.get('/:projectId/memory/foreshadows', (req, res) => {
    const { projectId } = req.params;
    const { status } = req.query;
    const foreshadows = StoryForeshadowDAO.listByProject(db, projectId, status as any);
    res.json({ success: true, data: foreshadows });
  });

  // 标记伏笔已回收
  router.put('/:projectId/memory/foreshadows/:id/resolve', (req, res) => {
    const { id } = req.params;
    const { resolved_episode_id, resolution_note } = req.body;
    const updated = StoryForeshadowDAO.resolve(db, id, resolved_episode_id, resolution_note || '');
    res.json({ success: true, data: updated });
  });

  // 角色关系图谱
  router.get('/:projectId/memory/relationships', (req, res) => {
    const { projectId } = req.params;
    const relationships = CharacterRelationshipDAO.listByProject(db, projectId);
    res.json({ success: true, data: relationships });
  });

  // 获取记忆注入文本（调试用）
  router.get('/:projectId/memory/injection', (req, res) => {
    const { projectId } = req.params;
    const injection = projectMemoryService.buildMemoryInjection(db, projectId);
    res.json({ success: true, data: injection });
  });

  return router;
}
