// 视频模型参数配置测试
// 验证 getVideoModelConfig 根据模型返回正确的参数选项

import { describe, it, expect } from 'vitest';
import {
  getVideoModelConfig,
  VIDEO_MODEL_CONFIGS,
  DEFAULT_VIDEO_CONFIG,
} from '../../src/config/videoModelConfig';

describe('视频模型参数配置', () => {
  describe('精确匹配', () => {
    it('豆包 Seedance 1.0 Pro 应返回正确配置', () => {
      const config = getVideoModelConfig('doubao:doubao-seedance-1-0-pro-250528');
      expect(config.ratios.length).toBe(6);
      expect(config.resolutions.map(r => r.value)).toEqual(['720p', '1080p']);
      expect(config.durations.map(d => d.value)).toEqual([5, 10]);
      expect(config.supportsSubtitles).toBe(false);
      expect(config.defaultResolution).toBe('1080p');
      expect(config.defaultDuration).toBe(5);
    });

    it('豆包 Seedance 2.5 应支持 4K 和 30秒', () => {
      const config = getVideoModelConfig('doubao:doubao-seedance-2-5-260628');
      expect(config.resolutions.map(r => r.value)).toContain('4k');
      expect(config.durations.map(d => d.value)).toContain(30);
    });

    it('可灵 Kling V3 应支持字幕和 4K', () => {
      const config = getVideoModelConfig('kling:kling-v3');
      expect(config.supportsSubtitles).toBe(true);
      expect(config.resolutions.map(r => r.value)).toContain('4k');
      expect(config.ratios.length).toBe(3); // 仅 16:9, 9:16, 1:1
    });

    it('可灵 Kling V1 应不支持 4K', () => {
      const config = getVideoModelConfig('kling:kling-v1');
      expect(config.resolutions.map(r => r.value)).not.toContain('4k');
      expect(config.supportsSubtitles).toBe(false);
    });

    it('海螺 H3 应支持原生 2K', () => {
      const config = getVideoModelConfig('minimax:MiniMax-H3');
      expect(config.resolutions.map(r => r.value)).toContain('2k');
      expect(config.defaultResolution).toBe('2k');
      expect(config.durations.map(d => d.value)).toContain(15);
    });

    it('即梦 3.0 应支持全部 6 种比例', () => {
      const config = getVideoModelConfig('jimeng:jimeng-video-3-0');
      expect(config.ratios.length).toBe(6);
      expect(config.resolutions.map(r => r.value)).toEqual(['720p', '1080p']);
    });
  });

  describe('provider 前缀匹配', () => {
    it('未知 doubao 视频模型应回退到最高版本 Seedance 配置', () => {
      const config = getVideoModelConfig('doubao:unknown-video-model');
      // doubao 有多个版本，未知模型回退到最高版本（2.5）
      expect(config).toBe(VIDEO_MODEL_CONFIGS['doubao:doubao-seedance-2-5-260628']);
    });

    it('未知 kling 模型应回退到 Kling V3 配置', () => {
      const config = getVideoModelConfig('kling:unknown-model');
      expect(config).toBe(VIDEO_MODEL_CONFIGS['kling:kling-v3']);
    });

    it('未知 minimax 模型应回退到 H3 配置', () => {
      const config = getVideoModelConfig('minimax:unknown-model');
      expect(config).toBe(VIDEO_MODEL_CONFIGS['minimax:MiniMax-H3']);
    });
  });

  describe('模型名关键词匹配', () => {
    it('模型名包含 seedance 应匹配豆包配置', () => {
      const config = getVideoModelConfig('unknown-provider:doubao-seedance-2-0');
      expect(config.recommendation).toContain('Seedance');
    });

    it('模型名包含 kling 应匹配可灵配置', () => {
      const config = getVideoModelConfig('unknown-provider:kling-v2-turbo');
      expect(config.recommendation).toContain('可灵');
    });

    it('模型名包含 hailuo 应匹配海螺配置', () => {
      const config = getVideoModelConfig('unknown-provider:MiniMax-Hailuo-02');
      expect(config.recommendation).toContain('海螺');
    });

    it('模型名包含 海螺 应匹配海螺配置', () => {
      const config = getVideoModelConfig('unknown-provider:海螺-H3');
      expect(config.recommendation).toContain('海螺');
    });

    it('模型名包含 jimeng 应匹配即梦配置', () => {
      const config = getVideoModelConfig('unknown-provider:jimeng-video-2-0');
      expect(config.recommendation).toContain('即梦');
    });
  });

  describe('默认配置', () => {
    it('完全未知的模型应返回默认配置', () => {
      const config = getVideoModelConfig('unknown:completely-unknown-model');
      expect(config).toBe(DEFAULT_VIDEO_CONFIG);
    });

    it('默认配置应包含基础选项', () => {
      expect(DEFAULT_VIDEO_CONFIG.ratios.length).toBe(6);
      expect(DEFAULT_VIDEO_CONFIG.resolutions.length).toBe(2);
      expect(DEFAULT_VIDEO_CONFIG.durations.length).toBe(2);
      expect(DEFAULT_VIDEO_CONFIG.supportsSubtitles).toBe(false);
    });
  });

  describe('配置完整性', () => {
    it('所有配置都应包含必填字段', () => {
      for (const [key, config] of Object.entries(VIDEO_MODEL_CONFIGS)) {
        expect(config.ratios.length).toBeGreaterThan(0, `${key} 缺少 ratios`);
        expect(config.resolutions.length).toBeGreaterThan(0, `${key} 缺少 resolutions`);
        expect(config.durations.length).toBeGreaterThan(0, `${key} 缺少 durations`);
        expect(typeof config.supportsSubtitles).toBe('boolean', `${key} 缺少 supportsSubtitles`);
        expect(config.recommendation.length).toBeGreaterThan(0, `${key} 缺少 recommendation`);
        expect(config.defaultRatio).toBeDefined(`${key} 缺少 defaultRatio`);
        expect(config.defaultResolution).toBeDefined(`${key} 缺少 defaultResolution`);
        expect(config.defaultDuration).toBeDefined(`${key} 缺少 defaultDuration`);
      }
    });

    it('默认值应在可选值范围内', () => {
      for (const [key, config] of Object.entries(VIDEO_MODEL_CONFIGS)) {
        expect(config.ratios.some(r => r.value === config.defaultRatio))
          .toBe(true, `${key} defaultRatio 不在可选范围内`);
        expect(config.resolutions.some(r => r.value === config.defaultResolution))
          .toBe(true, `${key} defaultResolution 不在可选范围内`);
        expect(config.durations.some(d => d.value === config.defaultDuration))
          .toBe(true, `${key} defaultDuration 不在可选范围内`);
      }
    });
  });
});
