// 统一 API 错误处理工具
// 消除各页面重复的 `err?.response?.data?.message || err?.message || '兜底文案'`
// 与 `(res as any)?.error?.message || '兜底文案'` 模式。

import type { ApiResponse } from '../types';

/**
 * 从异常对象中提取可展示的中文错误信息。
 * 兼容 apiClient 抛出的 ApiError（err.response.data 为后端 JSON 响应体，
 * 形如 { error?: { message?: string }, message?: string }）以及普通 Error。
 * @param err      捕获到的异常（unknown，无需 as any）
 * @param fallback 无法提取时展示的兜底文案
 */
export function getApiErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) {
    // apiClient 的 ApiError 把响应体放在 err.response.data（保持 axios 兼容结构）
    const responseData = (err as { response?: { data?: unknown } }).response?.data;
    if (responseData && typeof responseData === 'object') {
      const obj = responseData as { error?: { message?: unknown }; message?: unknown };
      const msg = obj.error?.message ?? obj.message;
      if (typeof msg === 'string' && msg.trim()) return msg;
    }
    if (err.message.trim()) return err.message;
  }
  return fallback;
}

/**
 * 从业务失败响应（res.success === false）中提取错误信息。
 * @param res      失败响应对象（可为 null/undefined，安全访问）
 * @param fallback 无法提取时展示的兜底文案
 */
export function getResponseErrorMessage(
  res: Pick<ApiResponse, 'error'> | null | undefined,
  fallback: string
): string {
  return res?.error?.message?.trim() || fallback;
}

/**
 * 提取 HTTP 状态码（兼容 apiClient 的 ApiError.response.status）。
 * 用于 409 冲突等需要按状态码分支处理的场景。
 * @param err 捕获到的异常
 */
export function getApiErrorStatus(err: unknown): number | undefined {
  if (err instanceof Error) {
    return (err as { response?: { status?: number } }).response?.status;
  }
  return undefined;
}

/**
 * 提取错误信息并通过 showToast 弹出错误提示（统一入口，减少重复调用）。
 * @param showToast useUIStore 的 showToast
 * @param err       捕获到的异常
 * @param fallback  兜底文案
 */
export function showApiError(
  showToast: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void,
  err: unknown,
  fallback: string
): void {
  showToast(getApiErrorMessage(err, fallback), 'error');
}
