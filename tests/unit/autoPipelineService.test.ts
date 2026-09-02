import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock aiProxy 以避免适配器注册表动态 require 加载问题
vi.mock('../../server/src/services/aiProxy', () => ({
  aiProxy: {
    generateText: vi.fn(),
    generateImage: vi.fn(),
    generateVideo: vi.fn(),
    generateAudio: vi.fn(),
    getVideoTask: vi.fn(),
  },
}));

import { createTestDb, closeTestDb } from '../helpers/db';
import { ProjectDAO, ModelRegistryDAO, NovelChapterDAO, NovelEpisodeDAO, ensureLocalUser } from '../../server/src/models';
import { AutoPipelineService } from '../../server/src/services/autoPipelineService';
import type { SQLiteDatabase } from '../../server/src/config/sqliteDatabase';

describe('AutoPipelineService', () => {
  let db: SQLiteDatabase;
  let projectId: string;

  beforeEach(() => {
    db = createTestDb();
    ensureLocalUser(db);
    const project = ProjectDAO.create(db, { user_id: 'local_user', title: '测试自动流水线' });
    projectId = project.id;
  });

  afterEach(() => {
    closeTestDb(db);
  });

  describe('getFirstModel', () => {
    it('无已配置模型时返回 null', () => {
      const result = AutoPipelineService.getFirstModel(db, 'local_user', 'text');
      expect(result).toBeNull();
    });

    it('返回首个已激活的文本模型', () => {
      ModelRegistryDAO.create(db, {
        user_id: 'local_user',
        provider: 'doubao',
        model_name: 'doubao-seed-1-6',
        model_type: 'text',
        api_key: 'test-key',
      });
      const result = AutoPipelineService.getFirstModel(db, 'local_user', 'text');
      expect(result).not.toBeNull();
      expect(result?.provider).toBe('doubao');
      expect(result?.modelName).toBe('doubao-seed-1-6');
    });

    it('按 model_type 过滤，不返回其他类型模型', () => {
      ModelRegistryDAO.create(db, {
        user_id: 'local_user',
        provider: 'doubao',
        model_name: 'seedream',
        model_type: 'image',
        api_key: 'test-key',
      });
      const textResult = AutoPipelineService.getFirstModel(db, 'local_user', 'text');
      expect(textResult).toBeNull();
      const imageResult = AutoPipelineService.getFirstModel(db, 'local_user', 'image');
      expect(imageResult).not.toBeNull();
      expect(imageResult?.modelName).toBe('seedream');
    });

    it('is_default 模型优先返回', () => {
      ModelRegistryDAO.create(db, {
        user_id: 'local_user',
        provider: 'openai',
        model_name: 'gpt-4o',
        model_type: 'text',
        api_key: 'key1',
        is_default: false,
      });
      ModelRegistryDAO.create(db, {
        user_id: 'local_user',
        provider: 'doubao',
        model_name: 'doubao-seed-1-6',
        model_type: 'text',
        api_key: 'key2',
        is_default: true,
      });
      const result = AutoPipelineService.getFirstModel(db, 'local_user', 'text');
      expect(result?.provider).toBe('doubao');
    });
  });

  describe('stageNovel', () => {
    it('无章节时抛出错误', async () => {
      const task = { taskId: 'test', projectId, userId: 'local_user', status: 'running' as const, currentStage: 'novel', stageProgress: {}, startedAt: new Date().toISOString() };
      await expect(AutoPipelineService['stageNovel'](db, task)).rejects.toThrow('请先上传小说文件');
    });

    it('有章节时正常完成并记录进度', async () => {
      NovelChapterDAO.create(db, {
        user_id: 'local_user',
        project_id: projectId,
        chapter_number: 1,
        title: '第一章',
        content: '测试内容',
      });
      const task = { taskId: 'test', projectId, userId: 'local_user', status: 'running' as const, currentStage: 'novel', stageProgress: {}, startedAt: new Date().toISOString() };
      await AutoPipelineService['stageNovel'](db, task);
      expect(task.stageProgress['novel']).toContain('1 个章节');
    });
  });

  describe('stageScript', () => {
    it('无剧集时抛出错误', async () => {
      const task = { taskId: 'test', projectId, userId: 'local_user', status: 'running' as const, currentStage: 'script', stageProgress: {}, startedAt: new Date().toISOString() };
      await expect(AutoPipelineService['stageScript'](db, task)).rejects.toThrow('剧本内容为空');
    });

    it('剧本内容过短时抛出错误', async () => {
      NovelEpisodeDAO.create(db, {
        user_id: 'local_user',
        project_id: projectId,
        episode_number: 1,
        title: '第1集',
        script_content: '短',
      });
      const task = { taskId: 'test', projectId, userId: 'local_user', status: 'running' as const, currentStage: 'script', stageProgress: {}, startedAt: new Date().toISOString() };
      await expect(AutoPipelineService['stageScript'](db, task)).rejects.toThrow('剧本内容为空');
    });

    it('有足够剧本内容时正常完成', async () => {
      NovelEpisodeDAO.create(db, {
        user_id: 'local_user',
        project_id: projectId,
        episode_number: 1,
        title: '第1集',
        script_content: '这是一段足够长的剧本内容，包含场景描述和对话。',
      });
      const task = { taskId: 'test', projectId, userId: 'local_user', status: 'running' as const, currentStage: 'script', stageProgress: {}, startedAt: new Date().toISOString() };
      await AutoPipelineService['stageScript'](db, task);
      expect(task.stageProgress['script']).toContain('剧本长度');
    });
  });

  describe('start', () => {
    it('返回 running 状态的任务', () => {
      const task = AutoPipelineService.start(db, projectId, 'local_user');
      expect(task.status).toBe('running');
      expect(task.taskId).toBeDefined();
      expect(task.projectId).toBe(projectId);
      expect(task.currentStage).toBe('novel');
    });

    it('任务可通过 getTask 查询', () => {
      const task = AutoPipelineService.start(db, projectId, 'local_user');
      const found = AutoPipelineService.getTask(db, task.taskId);
      expect(found).toBeDefined();
      expect(found?.taskId).toBe(task.taskId);
    });

    it('查询不存在的任务返回 undefined', () => {
      const found = AutoPipelineService.getTask(db, 'nonexistent_task_id');
      expect(found).toBeUndefined();
    });
  });
});
