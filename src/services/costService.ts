// 成本统计服务
// v1.0

import apiClient from './apiClient';
import type { ApiResponse, CostSummary, CostRecord } from '../types';

export const costService = {
  summary: (days?: number) =>
    apiClient.get<unknown, ApiResponse<CostSummary>>('/costs/summary', { params: days ? { days } : {} }),

  records: (limit = 100) =>
    apiClient.get<unknown, ApiResponse<CostRecord[]>>('/costs/records', { params: { limit } }),
};
