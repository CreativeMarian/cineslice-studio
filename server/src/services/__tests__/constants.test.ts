// constants 单元测试（P3-12）
// 覆盖：getVideoRatio 各比例映射 / 未知与空值回退 / PHASE_NAMES / 超时常量
// 运行：npx vitest run server/src/services/__tests__/constants.test.ts
import { describe, it, expect } from 'vitest';
import {
  getVideoRatio,
  PHASE_NAMES,
  VIDEO_TASK_TIMEOUT_MS,
  COMFY_LOCAL_VIDEO_TASK_TIMEOUT_MS,
  ASPECT_RATIO_TO_VIDEO_RATIO,
  VIDEO_PROMPT_MAX_LENGTH,
} from '../../constants';

describe('getVideoRatio', () => {
  it('支持的比例原样映射', () => {
    expect(getVideoRatio('1:1')).toBe('1:1');
    expect(getVideoRatio('4:3')).toBe('4:3');
    expect(getVideoRatio('3:4')).toBe('3:4');
    expect(getVideoRatio('21:9')).toBe('21:9');
    expect(getVideoRatio('9:16')).toBe('9:16');
  });

  it('未知比例回退 16:9', () => {
    expect(getVideoRatio('16:10')).toBe('16:9');
    expect(getVideoRatio('2.35:1')).toBe('16:9');
    expect(getVideoRatio('whatever')).toBe('16:9');
  });

  it('null / undefined / 空字符串回退 16:9', () => {
    expect(getVideoRatio(null)).toBe('16:9');
    expect(getVideoRatio(undefined)).toBe('16:9');
    expect(getVideoRatio('')).toBe('16:9');
  });

  it('带空白输入会 trim 后匹配', () => {
    expect(getVideoRatio(' 1:1 ')).toBe('1:1');
    expect(getVideoRatio('  4:3  ')).toBe('4:3');
  });

  it('映射表与 getVideoRatio 行为一致（防表与函数漂移）', () => {
    for (const [key, val] of Object.entries(ASPECT_RATIO_TO_VIDEO_RATIO)) {
      expect(getVideoRatio(key)).toBe(val);
    }
  });
});

describe('常量', () => {
  it('PHASE_NAMES 为固定四阶段顺序', () => {
    expect(PHASE_NAMES).toEqual(['开场引入', '矛盾升级', '高潮爆发', '收束悬念']);
    expect(PHASE_NAMES.length).toBe(4);
  });

  it('视频任务超时常量数值正确（云端 10 分钟 / ComfyUI 本地 24 小时兜底）', () => {
    expect(VIDEO_TASK_TIMEOUT_MS).toBe(10 * 60 * 1000);
    expect(COMFY_LOCAL_VIDEO_TASK_TIMEOUT_MS).toBe(24 * 60 * 60 * 1000);
    expect(COMFY_LOCAL_VIDEO_TASK_TIMEOUT_MS).toBeGreaterThan(VIDEO_TASK_TIMEOUT_MS);
  });

  it('VIDEO_PROMPT_MAX_LENGTH 与视频提示词截断预算一致（300）', () => {
    expect(VIDEO_PROMPT_MAX_LENGTH).toBe(300);
  });
});
