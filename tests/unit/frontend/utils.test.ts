// 前端纯工具函数单元测试（P3-12）
// 覆盖：通用工具（cn/generateId/formatRelativeTime/排序/管线路由）与统一错误提取（utils/error.ts）

import { describe, it, expect } from 'vitest';
import {
  cn,
  generateId,
  formatRelativeTime,
  sortModelsWithDefaultFirst,
  getPipelineStageFromPath,
  getPipelineStageIndex,
  isPipelineStageDone,
} from '../../../src/utils/index';
import { getApiErrorMessage, getResponseErrorMessage, getApiErrorStatus } from '../../../src/utils/error';
import type { ProjectProgressData, StageProgress } from '../../../src/services/pipelineService';

describe('cn', () => {
  it('拼接非空字符串并过滤非字符串/空串', () => {
    expect(cn('a', 'b')).toBe('a b');
    expect(cn('a', '', 'c')).toBe('a c');
    expect(cn('a', 0, false, null, undefined)).toBe('a');
    expect(cn()).toBe('');
  });
});

describe('generateId', () => {
  it('两次生成不重复且格式为 时间戳_随机串', () => {
    const a = generateId();
    const b = generateId();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[a-z0-9]+_[a-z0-9]{8}$/);
  });
});

describe('formatRelativeTime', () => {
  it('按距当前时间给出友好文案', () => {
    expect(formatRelativeTime(new Date(Date.now() - 30 * 1000).toISOString())).toBe('刚刚');
    expect(formatRelativeTime(new Date(Date.now() - 5 * 60 * 1000).toISOString())).toBe('5分钟前');
    expect(formatRelativeTime(new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString())).toBe('3小时前');
    expect(formatRelativeTime(new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString())).toBe('2天前');
  });
});

describe('sortModelsWithDefaultFirst', () => {
  it('默认模型排首位且不修改原数组', () => {
    const input = [
      { id: 1, is_default: false },
      { id: 2, is_default: true },
      { id: 3, is_default: false },
    ];
    const sorted = sortModelsWithDefaultFirst(input);
    expect(sorted.map((m) => m.id)).toEqual([2, 1, 3]);
    expect(input.map((m) => m.id)).toEqual([1, 2, 3]); // 原数组未被修改
  });

  it('无默认模型时保持原顺序', () => {
    const input = [{ id: 1 }, { id: 2 }, { id: 3 }];
    expect(sortModelsWithDefaultFirst(input).map((m) => m.id)).toEqual([1, 2, 3]);
  });
});

describe('管线路由解析', () => {
  it('getPipelineStageFromPath 映射各管线段', () => {
    expect(getPipelineStageFromPath('/project/p1')).toBe('outline');
    expect(getPipelineStageFromPath('/project/p1/')).toBe('outline');
    expect(getPipelineStageFromPath('/project/p1/characters')).toBe('characters');
    expect(getPipelineStageFromPath('/project/p1/character/c1')).toBe('characters');
    expect(getPipelineStageFromPath('/project/p1/art')).toBe('art');
    expect(getPipelineStageFromPath('/project/p1/art/scenes/s1')).toBe('art');
    expect(getPipelineStageFromPath('/project/p1/script')).toBe('script');
    expect(getPipelineStageFromPath('/project/p1/director')).toBe('director');
    expect(getPipelineStageFromPath('/')).toBeNull();
    expect(getPipelineStageFromPath('/projects')).toBeNull();
  });

  it('getPipelineStageIndex 返回 0-4 或 -1', () => {
    expect(getPipelineStageIndex('/project/p1')).toBe(0);
    expect(getPipelineStageIndex('/project/p1/characters')).toBe(1);
    expect(getPipelineStageIndex('/project/p1/art')).toBe(2);
    expect(getPipelineStageIndex('/project/p1/script')).toBe(3);
    expect(getPipelineStageIndex('/project/p1/director')).toBe(4);
    expect(getPipelineStageIndex('/nope')).toBe(-1);
  });

  it('isPipelineStageDone 按后端完成度判断', () => {
    const stage = (done: boolean): StageProgress => ({ done, count: 1, label: '' });
    const progress: ProjectProgressData = {
      projectId: 'p1',
      stages: { novel: stage(true), episodes: stage(true), characters: stage(false) },
      completedCount: 2,
      totalStages: 3,
      firstPending: 'characters',
      allDone: false,
    };
    expect(isPipelineStageDone('outline', progress)).toBe(true);
    expect(isPipelineStageDone('characters', progress)).toBe(false);
    expect(isPipelineStageDone('director', null)).toBe(false);
  });
});

describe('统一错误提取 utils/error', () => {
  it('getApiErrorMessage 从 ApiError.response.data.error.message 提取', () => {
    const err = Object.assign(new Error('请求失败'), {
      response: { status: 400, data: { error: { message: '角色名称不能为空' } } },
    });
    expect(getApiErrorMessage(err, '默认文案')).toBe('角色名称不能为空');
  });

  it('getApiErrorMessage 兼容 { message } 与普通 Error，空对象走兜底', () => {
    const err1 = Object.assign(new Error('x'), { response: { data: { message: '普通消息' } } });
    expect(getApiErrorMessage(err1, '默认文案')).toBe('普通消息');
    expect(getApiErrorMessage(new Error('直接错误'), '默认文案')).toBe('直接错误');
    expect(getApiErrorMessage(null, '默认文案')).toBe('默认文案');
    expect(getApiErrorMessage('字符串异常', '默认文案')).toBe('默认文案');
  });

  it('getResponseErrorMessage 只读 res.error.message，缺失走兜底', () => {
    expect(getResponseErrorMessage({ error: { code: 'CONFLICT', message: '资源冲突' } }, '兜底')).toBe('资源冲突');
    expect(getResponseErrorMessage({ error: { code: 'X', message: '' } }, '兜底')).toBe('兜底');
    expect(getResponseErrorMessage(null, '兜底')).toBe('兜底');
    expect(getResponseErrorMessage(undefined, '兜底')).toBe('兜底');
  });

  it('getApiErrorStatus 返回 HTTP 状态码，409 冲突分支可用', () => {
    const err409 = Object.assign(new Error('conflict'), { response: { status: 409 } });
    expect(getApiErrorStatus(err409)).toBe(409);
    expect(getApiErrorStatus(new Error('普通错误'))).toBeUndefined();
  });
});
