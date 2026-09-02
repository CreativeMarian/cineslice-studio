import apiClient from './apiClient';
import type { PipelineStatusData, PipelineMode, ApiResponse } from '../types';

export const pipelineService = {
  getStatus: (projectId: string) =>
    apiClient.get<unknown, ApiResponse<PipelineStatusData & { mode: PipelineMode; stage_labels: Record<string, string>; stage_order: string[] }>>(
      `/projects/${projectId}/pipeline/status`
    ),

  setMode: (projectId: string, mode: PipelineMode) =>
    apiClient.put<unknown, ApiResponse<PipelineStatusData & { mode: PipelineMode }>>(
      `/projects/${projectId}/pipeline/mode`,
      { mode }
    ),

  start: (projectId: string) =>
    apiClient.post<unknown, ApiResponse<PipelineStatusData & { mode: PipelineMode }>>(
      `/projects/${projectId}/pipeline/start`
    ),

  next: (projectId: string) =>
    apiClient.post<unknown, ApiResponse<PipelineStatusData>>(
      `/projects/${projectId}/pipeline/next`
    ),

  retry: (projectId: string) =>
    apiClient.post<unknown, ApiResponse<PipelineStatusData>>(
      `/projects/${projectId}/pipeline/retry`
    ),

  rollback: (projectId: string) =>
    apiClient.post<unknown, ApiResponse<PipelineStatusData>>(
      `/projects/${projectId}/pipeline/rollback`
    ),

  reset: (projectId: string) =>
    apiClient.post<unknown, ApiResponse<PipelineStatusData>>(
      `/projects/${projectId}/pipeline/reset`
    ),

  completeStage: (projectId: string, stage: string) =>
    apiClient.post<unknown, ApiResponse<PipelineStatusData>>(
      `/projects/${projectId}/pipeline/stage/${stage}/complete`
    ),

  failStage: (projectId: string, stage: string, error: string) =>
    apiClient.post<unknown, ApiResponse<PipelineStatusData>>(
      `/projects/${projectId}/pipeline/stage/${stage}/fail`,
      { error }
    ),

  // 全自动流水线
  autoRun: (projectId: string) =>
    apiClient.post<unknown, ApiResponse<{ taskId: string; status: string; message: string }>>(
      `/projects/${projectId}/pipeline/auto-run`
    ),

  getAutoRunStatus: (projectId: string, taskId: string) =>
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
      `/projects/${projectId}/pipeline/auto-run/${taskId}`
    ),

  getCurrentAutoRun: (projectId: string) =>
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
      `/projects/${projectId}/pipeline/auto-run/current`
    ),

  cancelAutoRun: (projectId: string, taskId: string) =>
    apiClient.post<unknown, ApiResponse<{ message: string }>>(
      `/projects/${projectId}/pipeline/auto-run/${taskId}/cancel`
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
      `/projects/${projectId}/pipeline/auto-run/${taskId}/resume`
    ),
};
