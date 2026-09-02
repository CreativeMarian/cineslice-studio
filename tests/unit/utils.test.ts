import { describe, it, expect } from 'vitest';
import { generateId, now, countWords, buildUpdateQuery } from '../../server/src/models';

describe('模型工具函数', () => {
  describe('generateId', () => {
    it('无前缀时返回 16 位十六进制字符串', () => {
      const id = generateId();
      expect(id).toMatch(/^[0-9a-f]{16}$/);
    });

    it('有前缀时格式为 prefix_xxxx', () => {
      const id = generateId('user');
      expect(id).toMatch(/^user_[0-9a-f]{16}$/);
    });

    it('两次调用不重复', () => {
      const id1 = generateId();
      const id2 = generateId();
      expect(id1).not.toBe(id2);
    });
  });

  describe('now', () => {
    it('返回 ISO 8601 格式字符串', () => {
      const result = now();
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });

  describe('countWords', () => {
    it('空字符串返回 0', () => {
      expect(countWords('')).toBe(0);
    });

    it('null/undefined 返回 0', () => {
      expect(countWords(null as any)).toBe(0);
      expect(countWords(undefined as any)).toBe(0);
    });

    it('纯中文按字数统计', () => {
      expect(countWords('你好世界')).toBe(4);
    });

    it('纯英文按单词数统计', () => {
      expect(countWords('hello world foo')).toBe(3);
    });

    it('中英文混合分别统计后相加', () => {
      expect(countWords('你好 world 测试 foo')).toBe(6);
    });

    it('标点符号不计入', () => {
      expect(countWords('你好，世界！Hello.')).toBe(5);
    });
  });

  describe('buildUpdateQuery', () => {
    it('生成正确的 UPDATE SQL 和参数', () => {
      const result = buildUpdateQuery('users', { id: 'u1', name: 'test', age: 25 });
      expect(result.sql).toContain('UPDATE users SET');
      expect(result.sql).toContain('name = ?');
      expect(result.sql).toContain('age = ?');
      expect(result.sql).toContain('updated_at = ?');
      expect(result.sql).toContain('WHERE id = ?');
      expect(result.params).toHaveLength(4);
      expect(result.params[0]).toBe('test');
      expect(result.params[1]).toBe(25);
      expect(result.params[3]).toBe('u1');
    });

    it('只有 id 字段时返回空 SQL', () => {
      const result = buildUpdateQuery('users', { id: 'u1' });
      expect(result.sql).toBe('');
      expect(result.params).toEqual([]);
    });

    it('支持自定义 id 字段名', () => {
      const result = buildUpdateQuery('projects', { project_id: 'p1', title: 'test' }, 'project_id');
      expect(result.sql).toContain('WHERE project_id = ?');
      expect(result.params[2]).toBe('p1');
    });
  });
});
