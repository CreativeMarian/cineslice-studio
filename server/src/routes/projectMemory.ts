// P0-1: 项目记忆 API 路由
// 提供角色圣经/世界观/剧情摘要/伏笔/关系图谱的查询和管理
// P2修复(IDOR): 所有路由补项目归属校验（getByIdAndUser），防止跨用户读写他人项目记忆

import { Router } from 'express';
import type { Database } from '../types';
import {
  ProjectBibleDAO,
  StoryForeshadowDAO,
  CharacterRelationshipDAO,
  ProjectDAO,
} from '../models';
import { projectMemoryService } from '../services/projectMemoryService';
import { createError, asyncHandler } from '../middleware/errorHandler';

export function createProjectMemoryRouter(db: Database): Router {
  const router = Router();

  /** 项目归属校验：项目不存在或不属于当前用户时抛 404 */
  function assertProjectOwner(projectId: string, userId: string): void {
    const project = ProjectDAO.getByIdAndUser(db, projectId, userId);
    if (!project) throw createError(404, 'NOT_FOUND', '项目不存在');
  }

  // 获取项目全部记忆
  router.get('/:projectId/memory', asyncHandler(async (req, res) => {
    const { projectId } = req.params;
    assertProjectOwner(projectId, (req as any).user?.id || '');
    const bibles = ProjectBibleDAO.listByProject(db, projectId);
    const foreshadows = StoryForeshadowDAO.listByProject(db, projectId);
    const relationships = CharacterRelationshipDAO.listByProject(db, projectId);
    res.json({
      success: true,
      data: { bibles, foreshadows, relationships },
    });
  }));

  // 获取特定类型圣经
  router.get('/:projectId/memory/bible/:type', asyncHandler(async (req, res) => {
    const { projectId, type } = req.params;
    assertProjectOwner(projectId, (req as any).user?.id || '');
    const bible = ProjectBibleDAO.getByProjectAndType(db, projectId, type as any);
    res.json({ success: true, data: bible });
  }));

  // 手动触发全量记忆生成
  router.post('/:projectId/memory/generate', asyncHandler(async (req, res) => {
    const { projectId } = req.params;
    const userId = (req as any).user?.id || 'local_user';
    assertProjectOwner(projectId, userId);
    const result = await projectMemoryService.generateAllMemory(db, userId, projectId);
    res.json({
      success: true,
      data: {
        characterBible: result.characterBible,
        worldSetting: result.worldSetting,
        foreshadows: result.foreshadows,
      },
    });
  }));

  // 更新圣经内容
  router.put('/:projectId/memory/bible/:bibleId', asyncHandler(async (req, res) => {
    const { projectId, bibleId } = req.params;
    assertProjectOwner(projectId, (req as any).user?.id || '');
    // 资源级校验：圣经必须属于该项目
    const bible = ProjectBibleDAO.getById(db, bibleId);
    if (!bible || bible.project_id !== projectId) throw createError(404, 'NOT_FOUND', '圣经不存在');
    const { content, generated_by } = req.body;
    const updated = ProjectBibleDAO.update(db, bibleId, { content, generated_by });
    res.json({ success: true, data: updated });
  }));

  // 伏笔列表
  router.get('/:projectId/memory/foreshadows', asyncHandler(async (req, res) => {
    const { projectId } = req.params;
    assertProjectOwner(projectId, (req as any).user?.id || '');
    const { status } = req.query;
    const foreshadows = StoryForeshadowDAO.listByProject(db, projectId, status as any);
    res.json({ success: true, data: foreshadows });
  }));

  // 标记伏笔已回收
  router.put('/:projectId/memory/foreshadows/:id/resolve', asyncHandler(async (req, res) => {
    const { projectId, id } = req.params;
    assertProjectOwner(projectId, (req as any).user?.id || '');
    // 资源级校验：伏笔必须属于该项目
    const foreshadow = StoryForeshadowDAO.getById(db, id);
    if (!foreshadow || foreshadow.project_id !== projectId) throw createError(404, 'NOT_FOUND', '伏笔不存在');
    const { resolved_episode_id, resolution_note } = req.body;
    const updated = StoryForeshadowDAO.resolve(db, id, resolved_episode_id, resolution_note || '');
    res.json({ success: true, data: updated });
  }));

  // 角色关系图谱
  router.get('/:projectId/memory/relationships', asyncHandler(async (req, res) => {
    const { projectId } = req.params;
    assertProjectOwner(projectId, (req as any).user?.id || '');
    const relationships = CharacterRelationshipDAO.listByProject(db, projectId);
    res.json({ success: true, data: relationships });
  }));

  // 获取记忆注入文本（调试用）
  router.get('/:projectId/memory/injection', asyncHandler(async (req, res) => {
    const { projectId } = req.params;
    assertProjectOwner(projectId, (req as any).user?.id || '');
    const injection = projectMemoryService.buildMemoryInjection(db, projectId);
    res.json({ success: true, data: injection });
  }));

  return router;
}
