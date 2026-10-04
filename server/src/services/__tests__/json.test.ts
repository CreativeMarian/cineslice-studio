// utils/json 单元测试（P3-12）
// 覆盖：safeJsonParse / safeJsonStringify 边界（null、undefined、非法 JSON、循环引用）
// 运行：npx vitest run server/src/services/__tests__/json.test.ts
import { describe, it, expect } from 'vitest';
import { safeJsonParse, safeJsonStringify } from '../../utils/json';

describe('safeJsonParse', () => {
  it('合法 JSON 字符串返回解析结果', () => {
    expect(safeJsonParse('{"a":1}', {})).toEqual({ a: 1 });
    expect(safeJsonParse('[1,2,3]', [])).toEqual([1, 2, 3]);
    expect(safeJsonParse('"text"', null)).toBe('text');
  });

  it('null / undefined / 空字符串 返回 fallback', () => {
    expect(safeJsonParse(null, 'fb')).toBe('fb');
    expect(safeJsonParse(undefined, 'fb')).toBe('fb');
    expect(safeJsonParse('', 'fb')).toBe('fb');
  });

  it('非法 JSON 返回 fallback 且不抛异常', () => {
    expect(safeJsonParse('not json', [])).toEqual([]);
    expect(safeJsonParse('{bad', { fallback: true })).toEqual({ fallback: true });
    expect(() => safeJsonParse('{bad', null)).not.toThrow();
  });

  it('自定义 fallback 类型透传（泛型）', () => {
    expect(safeJsonParse<string[]>('nope', ['x'])).toEqual(['x']);
    expect(safeJsonParse<number>(null, 0)).toBe(0);
  });
});

describe('safeJsonStringify', () => {
  it('普通对象/数组序列化为 JSON 字符串', () => {
    expect(safeJsonStringify({ a: 1, b: 'x' })).toBe('{"a":1,"b":"x"}');
    expect(safeJsonStringify([1, 2])).toBe('[1,2]');
  });

  it('循环引用返回 fallback（默认 null），不抛异常', () => {
    const circular: any = { name: 'loop' };
    circular.self = circular;
    expect(safeJsonStringify(circular)).toBeNull();
    expect(safeJsonStringify(circular, 'fallback-str')).toBe('fallback-str');
    expect(() => safeJsonStringify(circular)).not.toThrow();
  });

  it('undefined 值统一回退到 fallback/null（与返回类型一致）', () => {
    expect(safeJsonStringify(undefined)).toBeNull();
    expect(safeJsonStringify(undefined, 'fb')).toBe('fb');
  });

  it('null / 原始值按 JSON 规则序列化', () => {
    expect(safeJsonStringify(null)).toBe('null');
    expect(safeJsonStringify(42)).toBe('42');
    expect(safeJsonStringify('str')).toBe('"str"');
  });
});
