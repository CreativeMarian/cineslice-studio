// 流水线状态管理服务
// v1.0 - 支持全自动/半自动模式，阶段推进、回退、重试

import type { Database, Project, PipelineStage, StageStatus, PipelineStatusData, PipelineStageStatus, PipelineMode } from '../types';
import { ProjectDAO } from '../models';

// 流水线阶段定义与顺序
export const PIPELINE_STAGES: PipelineStage[] = [
  'novel',
  'episodes',
  'script',
  'characters',
  'scenes',
  'shots',
  'keyframes',
  'video',
  'audio',
  'export',
];

// 阶段显示名称
export const STAGE_LABELS: Record<PipelineStage, string> = {
  novel: '小说上传',
  episodes: '剧集拆分',
  script: '剧本生成',
  characters: '角色设定',
  scenes: '场景设定',
  shots: '分镜生成',
  keyframes: '关键帧',
  video: '视频生成',
  audio: '配音生成',
  export: '拼接成片',
};

// 阶段对应的模型类型
export const STAGE_MODEL_TYPE: Record<PipelineStage, 'text' | 'image' | 'video' | 'audio'> = {
  novel: 'text',
  episodes: 'text',
  script: 'text',
  characters: 'text',
  scenes: 'text',
  shots: 'text',
  keyframes: 'image',
  video: 'video',
  audio: 'audio',
  export: 'video',
};

function createEmptyStages(): PipelineStageStatus[] {
  return PIPELINE_STAGES.map(stage => ({
    stage,
    status: 'pending' as StageStatus,
    started_at: null,
    completed_at: null,
    error: null,
    model_used: null,
  }));
}

export const PipelineService = {
  /** 初始化项目流水线状态 */
  initPipeline(db: Database, projectId: string, mode: PipelineMode = 'semi-auto'): PipelineStatusData {
    const stages = createEmptyStages();
    // novel 阶段默认为 pending，用户上传后变为 done
    const status: PipelineStatusData = {
      current_stage: 'novel',
      stages,
      overall_status: 'pending',
      last_updated: new Date().toISOString(),
    };
    ProjectDAO.update(db, projectId, {
      mode,
      pipeline_status: JSON.stringify(status),
    } as Partial<Project>);
    return status;
  },

  /** 获取项目流水线状态 */
  getStatus(db: Database, projectId: string): PipelineStatusData {
    const project = ProjectDAO.getById(db, projectId);
    if (!project) {
      return {
        current_stage: 'novel',
        stages: createEmptyStages(),
        overall_status: 'pending',
        last_updated: new Date().toISOString(),
      };
    }
    if (!project.pipeline_status) {
      return this.initPipeline(db, projectId, project.mode || 'semi-auto');
    }
    try {
      return JSON.parse(project.pipeline_status) as PipelineStatusData;
    } catch {
      return this.initPipeline(db, projectId, project.mode || 'semi-auto');
    }
  },

  /** 保存流水线状态 */
  saveStatus(db: Database, projectId: string, status: PipelineStatusData): void {
    status.last_updated = new Date().toISOString();
    ProjectDAO.update(db, projectId, {
      pipeline_status: JSON.stringify(status),
    } as Partial<Project>);
  },

  /** 获取项目模式 */
  getMode(db: Database, projectId: string): PipelineMode {
    const project = ProjectDAO.getById(db, projectId);
    return (project?.mode as PipelineMode) || 'semi-auto';
  },

  /** 设置项目模式 */
  setMode(db: Database, projectId: string, mode: PipelineMode): void {
    ProjectDAO.update(db, projectId, { mode } as Partial<Project>);
  },

  /** 标记阶段开始运行 */
  startStage(db: Database, projectId: string, stage: PipelineStage, modelUsed?: string): PipelineStatusData {
    const status = this.getStatus(db, projectId);
    const stageStatus = status.stages.find(s => s.stage === stage);
    if (stageStatus) {
      stageStatus.status = 'running';
      stageStatus.started_at = new Date().toISOString();
      stageStatus.error = null;
      if (modelUsed) stageStatus.model_used = modelUsed;
    }
    status.current_stage = stage;
    status.overall_status = 'running';
    this.saveStatus(db, projectId, status);
    return status;
  },

  /** 标记阶段完成 */
  completeStage(db: Database, projectId: string, stage: PipelineStage): PipelineStatusData {
    const status = this.getStatus(db, projectId);
    const stageStatus = status.stages.find(s => s.stage === stage);
    if (stageStatus) {
      stageStatus.status = 'done';
      stageStatus.completed_at = new Date().toISOString();
      stageStatus.error = null;
    }
    // 计算整体状态
    const allDone = status.stages.every(s => s.status === 'done');
    if (allDone) {
      status.overall_status = 'done';
    } else {
      const mode = this.getMode(db, projectId);
      // 找到下一个待处理阶段
      const nextStage = status.stages.find(s => s.status === 'pending');
      if (nextStage) {
        if (mode === 'auto') {
          // 自动模式：自动启动下一阶段
          nextStage.status = 'running';
          nextStage.started_at = new Date().toISOString();
          status.current_stage = nextStage.stage;
          status.overall_status = 'running';
        } else {
          // 半自动模式：下一阶段等待确认
          nextStage.status = 'awaiting_confirmation';
          status.current_stage = nextStage.stage;
          status.overall_status = 'awaiting_confirmation';
        }
      }
    }
    this.saveStatus(db, projectId, status);
    return status;
  },

  /** 标记阶段失败 */
  failStage(db: Database, projectId: string, stage: PipelineStage, error: string): PipelineStatusData {
    const status = this.getStatus(db, projectId);
    const stageStatus = status.stages.find(s => s.stage === stage);
    if (stageStatus) {
      stageStatus.status = 'failed';
      stageStatus.error = error;
    }
    status.overall_status = 'failed';
    status.current_stage = stage;
    this.saveStatus(db, projectId, status);
    return status;
  },

  /** 推进到下一阶段（半自动模式下用户确认后调用） */
  next(db: Database, projectId: string): PipelineStatusData {
    const status = this.getStatus(db, projectId);
    // 找到第一个待处理或等待确认的阶段并启动它
    const nextStage = status.stages.find(s => s.status === 'pending' || s.status === 'awaiting_confirmation');
    if (nextStage) {
      nextStage.status = 'running';
      nextStage.started_at = new Date().toISOString();
      nextStage.error = null;
      status.current_stage = nextStage.stage;
      status.overall_status = 'running';
    }
    this.saveStatus(db, projectId, status);
    return status;
  },

  /** 重试失败阶段 */
  retry(db: Database, projectId: string): PipelineStatusData {
    const status = this.getStatus(db, projectId);
    const failedStage = status.stages.find(s => s.status === 'failed');
    if (failedStage) {
      failedStage.status = 'running';
      failedStage.started_at = new Date().toISOString();
      failedStage.error = null;
      status.current_stage = failedStage.stage;
      status.overall_status = 'running';
    }
    this.saveStatus(db, projectId, status);
    return status;
  },

  /** 回退到上一阶段 */
  rollback(db: Database, projectId: string): PipelineStatusData {
    const status = this.getStatus(db, projectId);
    const currentIndex = PIPELINE_STAGES.indexOf(status.current_stage);
    if (currentIndex <= 0) return status;
    const prevStageName = PIPELINE_STAGES[currentIndex - 1];

    // 重置当前阶段及之后所有阶段为 pending（避免后续已完成阶段残留）
    for (let i = currentIndex; i < PIPELINE_STAGES.length; i++) {
      const stageStatus = status.stages.find(s => s.stage === PIPELINE_STAGES[i]);
      if (stageStatus) {
        stageStatus.status = 'pending';
        stageStatus.started_at = null;
        stageStatus.completed_at = null;
        stageStatus.error = null;
      }
    }

    // 上一阶段设为 awaiting_confirmation
    const prevStageStatus = status.stages.find(s => s.stage === prevStageName);
    if (prevStageStatus) {
      prevStageStatus.status = 'awaiting_confirmation';
      prevStageStatus.completed_at = null;
      prevStageStatus.error = null;
    }
    status.current_stage = prevStageName;
    status.overall_status = 'awaiting_confirmation';
    this.saveStatus(db, projectId, status);
    return status;
  },

  /** 获取下一个待处理阶段 */
  getNextStage(db: Database, projectId: string): PipelineStage | null {
    const status = this.getStatus(db, projectId);
    const next = status.stages.find(s => s.status === 'pending' || s.status === 'awaiting_confirmation');
    return next ? next.stage : null;
  },

  /** 检查是否所有阶段完成 */
  isComplete(db: Database, projectId: string): boolean {
    const status = this.getStatus(db, projectId);
    return status.stages.every(s => s.status === 'done');
  },

  /** 重置整个流水线 */
  reset(db: Database, projectId: string): PipelineStatusData {
    const mode = this.getMode(db, projectId);
    return this.initPipeline(db, projectId, mode);
  },
};
