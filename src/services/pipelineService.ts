import apiClient, { type RequestConfig } from './apiClient';
import { API_PATHS } from '../constants/api';
import type { PipelineStatusData, PipelineMode, ApiResponse } from '../types';

// 真实数据完成度（步骤门控与下一步引导用）
export interface StageProgress {
  done: boolean;
  count: number;
  label: string;
}
export interface ProjectProgressData {
  projectId: string;
  stages: Record<string, StageProgress>;
  completedCount: number;
  totalStages: number;
  firstPending: string | null;
  allDone: boolean;
}

export const pipelineService = {
  getProgress: (projectId: string) =>
    apiClient.get<unknown, ApiResponse<ProjectProgressData>>(
      API_PATHS.pipelineProgress(projectId)
    ),
  getStatus: (projectId: string) =>
    apiClient.get<unknown, ApiResponse<PipelineStatusData & { mode: PipelineMode; stage_labels: Record<string, string>; stage_order: string[] }>>(
      API_PATHS.pipelineStatus(projectId)
    ),

  setMode: (projectId: string, mode: PipelineMode) =>
    apiClient.put<unknown, ApiResponse<PipelineStatusData & { mode: PipelineMode }>>(
      API_PATHS.pipelineMode(projectId),
      { mode }
    ),

  start: (projectId: string) =>
    apiClient.post<unknown, ApiResponse<PipelineStatusData & { mode: PipelineMode }>>(
      API_PATHS.pipelineStart(projectId)
    ),

  next: (projectId: string) =>
    apiClient.post<unknown, ApiResponse<PipelineStatusData>>(
      API_PATHS.pipelineNext(projectId)
    ),

  retry: (projectId: string) =>
    apiClient.post<unknown, ApiResponse<PipelineStatusData>>(
      API_PATHS.pipelineRetry(projectId)
    ),

  rollback: (projectId: string) =>
    apiClient.post<unknown, ApiResponse<PipelineStatusData>>(
      API_PATHS.pipelineRollback(projectId)
    ),

  reset: (projectId: string) =>
    apiClient.post<unknown, ApiResponse<PipelineStatusData>>(
      API_PATHS.pipelineReset(projectId)
    ),

  completeStage: (projectId: string, stage: string) =>
    apiClient.post<unknown, ApiResponse<PipelineStatusData>>(
      API_PATHS.pipelineStageComplete(projectId, stage)
    ),

  failStage: (projectId: string, stage: string, error: string) =>
    apiClient.post<unknown, ApiResponse<PipelineStatusData>>(
      API_PATHS.pipelineStageFail(projectId, stage),
      { error }
    ),

  // 全自动流水线
  autoRun: (projectId: string) =>
    apiClient.post<unknown, ApiResponse<{ taskId: string; status: string; message: string }>>(
      API_PATHS.pipelineAutoRun(projectId)
    ),

  getAutoRunStatus: (projectId: string, taskId: string, config?: RequestConfig) =>
    apiClient.get<unknown, ApiResponse<{
      taskId: string;
      projectId: string;
      userId: string;
      status: 'running' | 'completed' | 'failed' | 'cancelled' | 'interrupted';
      currentStage: string;
      stageProgress: Record<string, string>;
      error?: string;
      startedAt: string;
      completedAt?: string;
    }>>(
      API_PATHS.pipelineAutoRunStatus(projectId, taskId),
      config
    ),

  getCurrentAutoRun: (projectId: string, config?: RequestConfig) =>
    apiClient.get<unknown, ApiResponse<{
      taskId: string;
      projectId: string;
      userId: string;
      status: 'running' | 'completed' | 'failed' | 'cancelled' | 'interrupted';
      currentStage: string;
      stageProgress: Record<string, string>;
      error?: string;
      startedAt: string;
      completedAt?: string;
    } | null>>(
      API_PATHS.pipelineAutoRunCurrent(projectId),
      config
    ),

  cancelAutoRun: (projectId: string, taskId: string) =>
    apiClient.post<unknown, ApiResponse<{ message: string }>>(
      API_PATHS.pipelineAutoRunCancel(projectId, taskId)
    ),

  // 恢复中断的全自动任务
  resumeAutoRun: (projectId: string, taskId: string) =>
    apiClient.post<unknown, ApiResponse<{
      taskId: string;
      status: string;
      currentStage: string;
      stageProgress?: Record<string, string>;
      message: string;
    }>>(
      API_PATHS.pipelineAutoRunResume(projectId, taskId)
    ),
};
