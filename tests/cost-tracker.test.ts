// 成本统计单元测试
import { describe, it, expect } from 'vitest';
import { costTracker } from '../server/src/services/costTracker';

describe('costTracker.estimateCost', () => {
  describe('文本模型成本', () => {
    it('应正确计算文本模型成本', () => {
      const cost = costTracker.estimateCost('openai', 'gpt-4o', 'text', 1000);
      expect(cost).toBeCloseTo(0.005, 5);
    });

    it('应正确计算大量tokens成本', () => {
      const cost = costTracker.estimateCost('openai', 'gpt-4o', 'text', 100000);
      expect(cost).toBeCloseTo(0.5, 3);
    });

    it('未知文本模型应使用默认价格', () => {
      const cost = costTracker.estimateCost('unknown', 'unknown-model', 'text', 1000);
      expect(cost).toBeCloseTo(0.002, 5);
    });

    it('tokens为0时成本应为0', () => {
      const cost = costTracker.estimateCost('openai', 'gpt-4o', 'text', 0);
      expect(cost).toBe(0);
    });
  });

  describe('图像模型成本', () => {
    it('应正确计算图像模型成本', () => {
      const cost = costTracker.estimateCost('doubao-image', 'doubao-seedream-5-0-pro-260628', 'image', 0, 1);
      expect(cost).toBeCloseTo(0.008, 5);
    });

    it('应正确计算多张图像成本', () => {
      const cost = costTracker.estimateCost('doubao-image', 'doubao-image-generation', 'image', 0, 5);
      expect(cost).toBeCloseTo(0.02, 5);
    });

    it('未知图像模型应使用默认价格', () => {
      const cost = costTracker.estimateCost('unknown', 'unknown-model', 'image', 0, 1);
      expect(cost).toBeCloseTo(0.02, 5);
    });

    it('图像数量为0时成本应为0', () => {
      const cost = costTracker.estimateCost('doubao-image', 'doubao-image-generation', 'image', 0, 0);
      expect(cost).toBe(0);
    });
  });

  describe('视频模型成本', () => {
    it('应正确计算视频模型成本', () => {
      const cost = costTracker.estimateCost('doubao-video', 'doubao-seedance-2-5-260628', 'video', 0, 0, 10);
      expect(cost).toBeCloseTo(0.03, 5);
    });

    it('应正确计算长视频成本', () => {
      const cost = costTracker.estimateCost('doubao-video', 'doubao-seedance-1-0-pro', 'video', 0, 0, 60);
      expect(cost).toBeCloseTo(0.12, 5);
    });

    it('未知视频模型应使用默认价格', () => {
      const cost = costTracker.estimateCost('unknown', 'unknown-model', 'video', 0, 0, 10);
      expect(cost).toBeCloseTo(0.02, 5);
    });

    it('视频时长为0时成本应为0', () => {
      const cost = costTracker.estimateCost('doubao-video', 'doubao-seedance-2-5-260628', 'video', 0, 0, 0);
      expect(cost).toBe(0);
    });
  });

  describe('音频模型成本', () => {
    it('应正确计算音频模型成本', () => {
      const cost = costTracker.estimateCost('doubao-audio', 'seed-audio-1.0', 'audio', 0, 0, 0, 1000);
      expect(cost).toBeCloseTo(0.0003, 5);
    });

    it('应正确计算长文本音频成本', () => {
      const cost = costTracker.estimateCost('doubao-audio', 'seed-audio-1.0', 'audio', 0, 0, 0, 10000);
      expect(cost).toBeCloseTo(0.003, 5);
    });

    it('未知音频模型应使用默认价格', () => {
      const cost = costTracker.estimateCost('unknown', 'unknown-model', 'audio', 0, 0, 0, 1000);
      expect(cost).toBeCloseTo(0.0002, 5);
    });

    it('音频字符数为0时成本应为0', () => {
      const cost = costTracker.estimateCost('doubao-audio', 'seed-audio-1.0', 'audio', 0, 0, 0, 0);
      expect(cost).toBe(0);
    });
  });
});
