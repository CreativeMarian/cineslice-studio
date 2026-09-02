// 角色数据格式解析单元测试
import { describe, it, expect } from 'vitest';
import { parseCharactersInShot, serializeCharactersInShot } from '../server/src/models/shot';

describe('parseCharactersInShot', () => {
  it('应返回空数组当输入为null', () => {
    expect(parseCharactersInShot(null)).toEqual([]);
  });

  it('应返回空数组当输入为undefined', () => {
    expect(parseCharactersInShot(undefined)).toEqual([]);
  });

  it('应返回空数组当输入为空字符串', () => {
    expect(parseCharactersInShot('')).toEqual([]);
  });

  it('应正确解析数组格式', () => {
    const input = ['林小雨', '陈默'];
    expect(parseCharactersInShot(input)).toEqual(['林小雨', '陈默']);
  });

  it('应正确解析JSON字符串格式', () => {
    const input = '["林小雨", "陈默"]';
    expect(parseCharactersInShot(input)).toEqual(['林小雨', '陈默']);
  });

  it('应正确解析逗号分隔格式', () => {
    const input = '林小雨,陈默,老张';
    expect(parseCharactersInShot(input)).toEqual(['林小雨', '陈默', '老张']);
  });

  it('应正确解析中文逗号分隔格式', () => {
    const input = '林小雨，陈默，老张';
    expect(parseCharactersInShot(input)).toEqual(['林小雨', '陈默', '老张']);
  });

  it('应去除多余空格', () => {
    const input = ' 林小雨 , 陈默 ';
    expect(parseCharactersInShot(input)).toEqual(['林小雨', '陈默']);
  });

  it('应过滤空字符串元素', () => {
    const input = '林小雨,,陈默,';
    expect(parseCharactersInShot(input)).toEqual(['林小雨', '陈默']);
  });

  it('应过滤数组中的非字符串元素', () => {
    const input = ['林小雨', 123, null, '陈默', undefined];
    expect(parseCharactersInShot(input)).toEqual(['林小雨', '陈默']);
  });
});

describe('serializeCharactersInShot', () => {
  it('应返回null当输入为空数组', () => {
    expect(serializeCharactersInShot([])).toBeNull();
  });

  it('应返回null当输入为undefined', () => {
    expect(serializeCharactersInShot(undefined as any)).toBeNull();
  });

  it('应正确序列化为JSON字符串', () => {
    const input = ['林小雨', '陈默'];
    const result = serializeCharactersInShot(input);
    expect(result).toBe('["林小雨","陈默"]');
  });

  it('序列化后应能被parseCharactersInShot正确解析', () => {
    const input = ['林小雨', '陈默', '老张'];
    const serialized = serializeCharactersInShot(input);
    expect(serialized).not.toBeNull();
    const parsed = parseCharactersInShot(serialized!);
    expect(parsed).toEqual(input);
  });
});
