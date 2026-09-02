import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { rateLimit } from '../../server/src/middleware/rateLimiter';

function makeReq(ip: string): Request {
  return { ip, socket: { remoteAddress: ip } } as unknown as Request;
}

function makeRes() {
  const headers: Record<string, string> = {};
  return {
    headers,
    statusCode: 0,
    body: null as unknown,
    set(name: string, value: string) { headers[name.toLowerCase()] = value; },
    status(code: number) { this.statusCode = code; return this; },
    json(payload: unknown) { this.body = payload; return this; },
  } as unknown as Response;
}

describe('rateLimiter', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('窗口内放行前 max 个请求', () => {
    const middleware = rateLimit({ windowMs: 60_000, max: 3 });
    const next = vi.fn();

    for (let i = 0; i < 3; i++) {
      middleware(makeReq('192.0.2.11'), makeRes(), next);
    }
    expect(next).toHaveBeenCalledTimes(3);
  });

  it('超过限制返回 429 并携带 Retry-After', () => {
    const middleware = rateLimit({ windowMs: 60_000, max: 2 });
    const next = vi.fn();

    middleware(makeReq('192.0.2.12'), makeRes(), next);
    middleware(makeReq('192.0.2.12'), makeRes(), next);

    const res = makeRes();
    middleware(makeReq('192.0.2.12'), res, next);

    expect(res.statusCode).toBe(429);
    expect((res.body as { error: { code: string } }).error.code).toBe('RATE_LIMITED');
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
    expect(next).toHaveBeenCalledTimes(2);
  });

  it('不同 IP 互不影响', () => {
    const middleware = rateLimit({ windowMs: 60_000, max: 1 });
    const next = vi.fn();

    middleware(makeReq('1.1.1.1'), makeRes(), next);
    middleware(makeReq('2.2.2.2'), makeRes(), next);
    expect(next).toHaveBeenCalledTimes(2);
  });

  it('窗口过期后重新计数', () => {
    vi.useFakeTimers();
    const middleware = rateLimit({ windowMs: 1_000, max: 1 });
    const next = vi.fn();

    middleware(makeReq('192.0.2.14'), makeRes(), next);
    middleware(makeReq('192.0.2.14'), makeRes(), next);
    expect(next).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1_100);
    middleware(makeReq('192.0.2.14'), makeRes(), next);
    expect(next).toHaveBeenCalledTimes(2);
  });
});
