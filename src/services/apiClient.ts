// 基于标准 fetch �?API 客户�?
// 替代 axios，确保所有请求在 DevTools Network �?Fetch/XHR 中可�?

import { useUIStore } from '../stores/useUIStore';

interface RequestConfig {
  params?: Record<string, unknown>;
  headers?: Record<string, string>;
  responseType?: 'json' | 'blob' | 'text';
  timeout?: number;
  /** 是否静默错误（不显示 Toast），默认 false */
  silent?: boolean;
}

// 兼容 axios 错误结构，便于现有代�?err?.response?.data?.message 访问
export class ApiError extends Error {
  response?: {
    status: number;
    data: unknown;
  };
  constructor(message: string, status?: number, data?: unknown) {
    super(message);
    this.name = 'ApiError';
    if (status !== undefined) {
      this.response = { status, data };
    }
  }
}

const BASE_URL = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '');
const DEFAULT_TIMEOUT = 600000; // AI 生成可能较慢，设 2 分钟

function buildUrl(url: string, params?: Record<string, unknown>): string {
  const fullUrl = url.startsWith('http') ? url : `${BASE_URL}${url}`;
  if (!params || Object.keys(params).length === 0) return fullUrl;
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      usp.append(key, String(value));
    }
  }
  const query = usp.toString();
  return query ? `${fullUrl}${fullUrl.includes('?') ? '&' : '?'}${query}` : fullUrl;
}

async function request(
  method: string,
  url: string,
  data?: unknown,
  config: RequestConfig = {}
): Promise<unknown> {
  const { headers = {}, responseType = 'json', timeout = DEFAULT_TIMEOUT, silent = false } = config;
  const token = localStorage.getItem('token');

  const finalHeaders: Record<string, string> = { ...headers };
  if (token) {
    finalHeaders['Authorization'] = `Bearer ${token}`;
  }

  // FormData 时不手动设置 Content-Type，让浏览器自动设�?boundary
  let body: BodyInit | undefined;
  if (data !== undefined && data !== null) {
    if (data instanceof FormData) {
      body = data;
      // 关键：删除调用方可能传入�?Content-Type，让浏览器自动添加带 boundary 的正确头
      delete finalHeaders['Content-Type'];
      delete finalHeaders['content-type'];
    } else {
      if (!finalHeaders['Content-Type']) {
        finalHeaders['Content-Type'] = 'application/json';
      }
      body = JSON.stringify(data);
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(buildUrl(url, config.params), {
      method,
      headers: finalHeaders,
      body,
      signal: controller.signal,
      credentials: 'include',
    });

    // 401 �?跳登录（服务端模式）
    if (response.status === 401 && import.meta.env.VITE_RUN_MODE === 'server') {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }

    let result: unknown;
    if (responseType === 'blob') {
      result = await response.blob();
    } else if (responseType === 'text') {
      result = await response.text();
    } else {
      const text = await response.text();
      try {
        result = text ? JSON.parse(text) : null;
      } catch {
        result = text;
      }
    }

    if (!response.ok) {
      const errorData = (result as any)?.error || result;
      const errorMsg = (errorData as any)?.message || `HTTP ${response.status}`;
      // 统一错误提示事件
      if ((errorData as any)?.message) {
        window.dispatchEvent(
          new CustomEvent('api-error', { detail: errorData })
        );
      }
      // 自动显示 Toast�?01 除外，会跳转登录�?
      if (!silent && response.status !== 401) {
        try {
          const store = useUIStore.getState();
          const isCritical = response.status >= 500;
          store.showToast(errorMsg, 'error', { severity: isCritical ? 'critical' : 'normal' });
        } catch {}
      }
      throw new ApiError(errorMsg, response.status, result);
    }

    return result;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if ((err as Error).name === 'AbortError') {
      const timeoutErr = new ApiError('请求超时，请稍后重试');
      if (!silent) {
        try { useUIStore.getState().showToast('请求超时，请稍后重试', 'error', { severity: 'normal' }); } catch {}
      }
      throw timeoutErr;
    }
    const netErr = new ApiError((err as Error).message || '网络请求失败');
    if (!silent) {
      try { useUIStore.getState().showToast((err as Error).message || '网络请求失败', 'error', { severity: 'critical' }); } catch {}
    }
    throw netErr;
  } finally {
    clearTimeout(timer);
  }
}

const apiClient = {
  get: <T = unknown, R = T>(url: string, config?: RequestConfig): Promise<R> =>
    request('GET', url, undefined, config) as unknown as Promise<R>,

  post: <T = unknown, R = T>(url: string, data?: unknown, config?: RequestConfig): Promise<R> =>
    request('POST', url, data, config) as unknown as Promise<R>,

  put: <T = unknown, R = T>(url: string, data?: unknown, config?: RequestConfig): Promise<R> =>
    request('PUT', url, data, config) as unknown as Promise<R>,

  delete: <T = unknown, R = T>(url: string, config?: RequestConfig): Promise<R> =>
    request('DELETE', url, undefined, config) as unknown as Promise<R>,

  patch: <T = unknown, R = T>(url: string, data?: unknown, config?: RequestConfig): Promise<R> =>
    request('PATCH', url, data, config) as unknown as Promise<R>,
};

export default apiClient;
