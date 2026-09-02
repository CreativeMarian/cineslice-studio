import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb, closeTestDb } from '../helpers/db';
import { ProjectDAO, ensureLocalUser } from '../../server/src/models';
import { PipelineService, PIPELINE_STAGES } from '../../server/src/services/pipelineService';
import type { SQLiteDatabase } from '../../server/src/config/sqliteDatabase';

describe('PipelineService', () => {
  let db: SQLiteDatabase;
  let projectId: string;

  beforeEach(() => {
    db = createTestDb();
    ensureLocalUser(db);
    const project = ProjectDAO.create(db, { user_id: 'local_user', title: '测试流水线' });
    projectId = project.id;
  });

  afterEach(() => {
    closeTestDb(db);
  });

  describe('initPipeline', () => {
    it('初始化流水线状态，所有阶段为 pending', () => {
      const status = PipelineService.initPipeline(db, projectId, 'semi-auto');
      expect(status.stages).toHaveLength(PIPELINE_STAGES.length);
      expect(status.stages.every(s => s.status === 'pending')).toBe(true);
      expect(status.current_stage).toBe('novel');
      expect(status.overall_status).toBe('pending');
    });

    it('初始化 auto 模式', () => {
      const status = PipelineService.initPipeline(db, projectId, 'auto');
      expect(status.stages).toHaveLength(PIPELINE_STAGES.length);
    });
  });

  describe('getStatus', () => {
    it('未初始化时自动初始化', () => {
      const status = PipelineService.getStatus(db, projectId);
      expect(status.stages).toHaveLength(PIPELINE_STAGES.length);
    });

    it('返回已保存的状态', () => {
      PipelineService.initPipeline(db, projectId, 'auto');
      PipelineService.startStage(db, projectId, 'novel');
      const status = PipelineService.getStatus(db, projectId);
      const novelStage = status.stages.find(s => s.stage === 'novel');
      expect(novelStage?.status).toBe('running');
    });
  });

  describe('startStage', () => {
    it('标记阶段为 running', () => {
      PipelineService.initPipeline(db, projectId, 'semi-auto');
      const status = PipelineService.startStage(db, projectId, 'episodes');
      const episodes = status.stages.find(s => s.stage === 'episodes');
      expect(episodes?.status).toBe('running');
      expect(episodes?.started_at).not.toBeNull();
      expect(status.overall_status).toBe('running');
    });
  });

  describe('completeStage - semi-auto', () => {
    it('完成后下一阶段变为 awaiting_confirmation', () => {
      PipelineService.initPipeline(db, projectId, 'semi-auto');
      PipelineService.startStage(db, projectId, 'novel');
      const status = PipelineService.completeStage(db, projectId, 'novel');
      const novel = status.stages.find(s => s.stage === 'novel');
      const episodes = status.stages.find(s => s.stage === 'episodes');
      expect(novel?.status).toBe('done');
      expect(episodes?.status).toBe('awaiting_confirmation');
      expect(status.overall_status).toBe('awaiting_confirmation');
    });
  });

  describe('completeStage - auto', () => {
    it('完成后自动推进下一阶段为 running', () => {
      PipelineService.initPipeline(db, projectId, 'auto');
      PipelineService.startStage(db, projectId, 'novel');
      const status = PipelineService.completeStage(db, projectId, 'novel');
      const episodes = status.stages.find(s => s.stage === 'episodes');
      expect(episodes?.status).toBe('running');
      expect(status.current_stage).toBe('episodes');
    });
  });

  describe('failStage', () => {
    it('标记阶段失败并记录错误', () => {
      PipelineService.initPipeline(db, projectId, 'semi-auto');
      PipelineService.startStage(db, projectId, 'episodes');
      const status = PipelineService.failStage(db, projectId, 'episodes', 'API调用失败');
      const episodes = status.stages.find(s => s.stage === 'episodes');
      expect(episodes?.status).toBe('failed');
      expect(episodes?.error).toBe('API调用失败');
      expect(status.overall_status).toBe('failed');
    });
  });

  describe('next', () => {
    it('半自动模式下推进到下一阶段', () => {
      PipelineService.initPipeline(db, projectId, 'semi-auto');
      PipelineService.startStage(db, projectId, 'novel');
      PipelineService.completeStage(db, projectId, 'novel');
      const status = PipelineService.next(db, projectId);
      expect(status.current_stage).toBe('episodes');
      const episodes = status.stages.find(s => s.stage === 'episodes');
      expect(episodes?.status).toBe('running');
    });
  });

  describe('retry', () => {
    it('重试失败阶段', () => {
      PipelineService.initPipeline(db, projectId, 'semi-auto');
      PipelineService.startStage(db, projectId, 'episodes');
      PipelineService.failStage(db, projectId, 'episodes', '失败');
      const status = PipelineService.retry(db, projectId);
      const episodes = status.stages.find(s => s.stage === 'episodes');
      expect(episodes?.status).toBe('running');
      expect(episodes?.error).toBeNull();
    });
  });

  describe('rollback', () => {
    it('回退到上一阶段', () => {
      PipelineService.initPipeline(db, projectId, 'semi-auto');
      PipelineService.startStage(db, projectId, 'novel');
      PipelineService.completeStage(db, projectId, 'novel');
      PipelineService.next(db, projectId);
      const status = PipelineService.rollback(db, projectId);
      expect(status.current_stage).toBe('novel');
      const episodes = status.stages.find(s => s.stage === 'episodes');
      expect(episodes?.status).toBe('pending');
    });

    it('回归：回退时重置当前及之后所有阶段为 pending（不只是当前阶段）', () => {
      // 模拟：novel, episodes, script, characters 都已完成
      PipelineService.initPipeline(db, projectId, 'semi-auto');
      const stagesToComplete = ['novel', 'episodes', 'script', 'characters'];
      for (const stage of stagesToComplete) {
        PipelineService.startStage(db, projectId, stage as any);
        PipelineService.completeStage(db, projectId, stage as any);
      }
      // 当前在 scenes 阶段（characters 完成后 auto 推进或 next 推进）
      PipelineService.next(db, projectId);
      expect(PipelineService.getStatus(db, projectId).current_stage).toBe('scenes');

      // 从 scenes 回退到 characters
      const status = PipelineService.rollback(db, projectId);
      expect(status.current_stage).toBe('characters');

      // 关键断言：回退点及之后所有阶段都必须是 pending/awaiting
      const rollbackPointIndex = PIPELINE_STAGES.indexOf('characters');
      for (let i = rollbackPointIndex; i < PIPELINE_STAGES.length; i++) {
        const stageName = PIPELINE_STAGES[i];
        const stageStatus = status.stages.find(s => s.stage === stageName);
        if (i === rollbackPointIndex) {
          expect(stageStatus?.status).toBe('awaiting_confirmation');
        } else {
          expect(stageStatus?.status).toBe('pending');
        }
      }

      // 回退点之前的阶段保持 done
      for (let i = 0; i < rollbackPointIndex; i++) {
        const stageName = PIPELINE_STAGES[i];
        const stageStatus = status.stages.find(s => s.stage === stageName);
        expect(stageStatus?.status).toBe('done');
      }
    });

    it('回退后 isComplete 不应误判为 true（回归：旧bug后续阶段残留 done）', () => {
      PipelineService.initPipeline(db, projectId, 'semi-auto');
      // 完成前5个阶段
      for (const stage of ['novel', 'episodes', 'script', 'characters', 'scenes']) {
        PipelineService.startStage(db, projectId, stage as any);
        PipelineService.completeStage(db, projectId, stage as any);
      }
      PipelineService.next(db, projectId); // 推进到 shots
      // 回退到 scenes
      PipelineService.rollback(db, projectId);
      // isComplete 必须为 false（shots 及之后阶段已被重置为 pending）
      expect(PipelineService.isComplete(db, projectId)).toBe(false);
    });

    it('在第一阶段回退无效（返回原状态）', () => {
      PipelineService.initPipeline(db, projectId, 'semi-auto');
      PipelineService.startStage(db, projectId, 'novel');
      const status = PipelineService.rollback(db, projectId);
      // novel 是第一阶段，回退无效，current_stage 仍为 novel
      expect(status.current_stage).toBe('novel');
    });
  });

  describe('isComplete', () => {
    it('所有阶段完成时返回 true', () => {
      PipelineService.initPipeline(db, projectId, 'auto');
      for (const stage of PIPELINE_STAGES) {
        PipelineService.startStage(db, projectId, stage);
        PipelineService.completeStage(db, projectId, stage);
      }
      expect(PipelineService.isComplete(db, projectId)).toBe(true);
    });

    it('未全部完成时返回 false', () => {
      PipelineService.initPipeline(db, projectId, 'auto');
      expect(PipelineService.isComplete(db, projectId)).toBe(false);
    });
  });

  describe('getMode / setMode', () => {
    it('设置和获取模式', () => {
      PipelineService.setMode(db, projectId, 'auto');
      expect(PipelineService.getMode(db, projectId)).toBe('auto');
      PipelineService.setMode(db, projectId, 'semi-auto');
      expect(PipelineService.getMode(db, projectId)).toBe('semi-auto');
    });
  });
});
