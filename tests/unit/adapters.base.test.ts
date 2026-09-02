import { describe, it, expect, vi, afterEach } from 'vitest';
import { httpRequest, AIError } from '../../server/src/services/adapters/base';

describe('adapters/base - httpRequest', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('成功返回 JSON 数据', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify({ result: 'ok' })),
    } as any);

    const result = await httpRequest<{ result: string }>('http://test.com', { method: 'GET' });
    expect(result).toEqual({ result: 'ok' });
  });

  it('429 状态码抛出 AI_RATE_LIMITED 且可重试', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: () => Promise.resolve('rate limited'),
    } as any);

    await expect(httpRequest('http://test.com', { method: 'GET' })).rejects.toMatchObject({
      code: 'AI_RATE_LIMITED',
      retryable: true,
    });
  });

  it('500 状态码抛出 AI_CALL_FAILED 且可重试', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve('server error'),
    } as any);

    await expect(httpRequest('http://test.com', { method: 'GET' })).rejects.toMatchObject({
      code: 'AI_CALL_FAILED',
      retryable: true,
    });
  });

  it('400 状态码抛出 AI_CALL_FAILED 且不可重试', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: () => Promise.resolve('bad request'),
    } as any);

    await expect(httpRequest('http://test.com', { method: 'GET' })).rejects.toMatchObject({
      code: 'AI_CALL_FAILED',
      retryable: false,
    });
  });

  it('网络错误抛出 AI_CALL_FAILED 且可重试', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network down'));

    await expect(httpRequest('http://test.com', { method: 'GET' })).rejects.toMatchObject({
      code: 'AI_CALL_FAILED',
      retryable: true,
    });
  });

  it('超时抛出 AI_CALL_FAILED 且可重试', async () => {
    // mock fetch 监听 signal，abort 时抛出 AbortError
    global.fetch = vi.fn().mockImplementation((_url: string, options?: any) => {
      return new Promise((_, reject) => {
        if (options?.signal) {
          options.signal.addEventListener('abort', () => {
            const err = new Error('The operation was aborted.');
            err.name = 'AbortError';
            reject(err);
          });
        }
      });
    });

    await expect(
      httpRequest('http://test.com', { method: 'GET', timeout: 50 })
    ).rejects.toMatchObject({
      code: 'AI_CALL_FAILED',
      retryable: true,
    });
  }, 5000);

  it('非 JSON 响应返回纯文本', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve('plain text response'),
    } as any);

    const result = await httpRequest<string>('http://test.com', { method: 'GET' });
    expect(result).toBe('plain text response');
  });
});

describe('adapters/base - AIError', () => {
  it('创建 AIError 实例', () => {
    const err = new AIError('AI_CALL_FAILED', 'test error', true);
    expect(err.code).toBe('AI_CALL_FAILED');
    expect(err.message).toBe('test error');
    expect(err.retryable).toBe(true);
    expect(err.name).toBe('AIError');
  });

  it('默认不可重试', () => {
    const err = new AIError('AI_CALL_FAILED', 'test');
    expect(err.retryable).toBe(false);
  });
});
