import apiClient from './apiClient';
import type { GenerationTask, ApiResponse } from '../types';

export const taskService = {
  list: (params?: { status?: string; project_id?: string }) =>
    apiClient.get<unknown, ApiResponse<GenerationTask[]>>('/tasks', { params }),

  get: (taskId: string) =>
    apiClient.get<unknown, ApiResponse<GenerationTask>>(`/tasks/${taskId}`),

  cancel: (taskId: string) =>
    apiClient.post<unknown, ApiResponse<void>>(`/tasks/${taskId}/cancel`),
};
