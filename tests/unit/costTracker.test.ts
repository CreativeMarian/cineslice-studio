import { describe, it, expect } from 'vitest';
import { costTracker } from '../../server/src/services/costTracker';

describe('costTracker', () => {
  describe('estimateCost - 文本模型', () => {
    it('已知模型价格计算正确', () => {
      const cost = costTracker.estimateCost('openai', 'gpt-4o', 'text', 1000);
      expect(cost).toBe(0.005);
    });

    it('doubao-pro 价格计算正确', () => {
      const cost = costTracker.estimateCost('doubao', 'doubao-pro', 'text', 2000);
      expect(cost).toBe(0.0016);
    });

    it('0 tokens 成本为 0', () => {
      const cost = costTracker.estimateCost('openai', 'gpt-4o', 'text', 0);
      expect(cost).toBe(0);
    });

    it('未知模型使用默认价格 $0.002/1K', () => {
      const cost = costTracker.estimateCost('unknown', 'model-x', 'text', 1000);
      expect(cost).toBe(0.002);
    });

    it('大 token 数计算正确', () => {
      const cost = costTracker.estimateCost('openai', 'gpt-4o-mini', 'text', 100000);
      expect(cost).toBe(0.015);
    });
  });

  describe('estimateCost - 图像模型', () => {
    it('dall-e-3 单张价格正确', () => {
      const cost = costTracker.estimateCost('openai-image', 'dall-e-3', 'image', 0, 1);
      expect(cost).toBe(0.04);
    });

    it('多张图片价格累加', () => {
      const cost = costTracker.estimateCost('openai-image', 'dall-e-3', 'image', 0, 4);
      expect(cost).toBe(0.16);
    });

    it('未知图像模型使用默认价格 $0.02/张', () => {
      const cost = costTracker.estimateCost('unknown-img', 'model-y', 'image', 0, 1);
      expect(cost).toBe(0.02);
    });

    it('0 张图片成本为 0', () => {
      const cost = costTracker.estimateCost('openai-image', 'dall-e-3', 'image', 0, 0);
      expect(cost).toBe(0);
    });
  });

  describe('estimateCost - 其他类型', () => {
    it('video 类型返回 0', () => {
      const cost = costTracker.estimateCost('any', 'model', 'video', 1000, 5);
      expect(cost).toBe(0);
    });

    it('audio 类型返回 0', () => {
      const cost = costTracker.estimateCost('any', 'model', 'audio', 1000, 5);
      expect(cost).toBe(0);
    });
  });
});
