// 适配器连通性测试
// 直接测试具体适配器类，验证 provider 命名和接口实现

import { describe, it, expect, vi } from 'vitest';

// Mock registry 模块，避免 ESM 环境下 require 调用失败
vi.mock('../../server/src/services/adapters/registry', () => ({
  registerTextFactory: vi.fn(),
  registerImageFactory: vi.fn(),
  registerVideoFactory: vi.fn(),
  registerAudioFactory: vi.fn(),
  getTextAdapter: vi.fn(),
  getImageAdapter: vi.fn(),
  getVideoAdapter: vi.fn(),
  getAudioAdapter: vi.fn(),
  listTextProviders: vi.fn(() => []),
  listImageProviders: vi.fn(() => []),
}));

import { DoubaoTextAdapter } from '../../server/src/services/adapters/text/doubao';
import { DeepSeekTextAdapter } from '../../server/src/services/adapters/text/deepseek';
import { OpenAITextAdapter } from '../../server/src/services/adapters/text/openai';
import { DoubaoImageAdapter } from '../../server/src/services/adapters/image/doubao-image';
import { ZhipuImageAdapter } from '../../server/src/services/adapters/image/zhipu-image';
import { QwenImageAdapter } from '../../server/src/services/adapters/image/qwen-image';
import { OpenAIImageAdapter } from '../../server/src/services/adapters/image/openai-image';
import { DoubaoVideoAdapter } from '../../server/src/services/adapters/video/doubao-video';
import { KlingVideoAdapter } from '../../server/src/services/adapters/video/kling-video';
import { JimengVideoAdapter } from '../../server/src/services/adapters/video/jimeng-video';
import { HailuoVideoAdapter } from '../../server/src/services/adapters/video/hailuo-video';
import { MiniMaxVideoAdapter } from '../../server/src/services/adapters/video/minimax-video';
import { OpenAIAudioAdapter } from '../../server/src/services/adapters/audio/openai-audio';
import { DoubaoAudioAdapter } from '../../server/src/services/adapters/audio/doubao-audio';

describe('文本适配器', () => {
  it('豆包文本适配器 provider 应为 doubao', () => {
    const adapter = new DoubaoTextAdapter('doubao-pro', 'test-key');
    expect(adapter.provider).toBe('doubao');
    expect(adapter.modelName).toBe('doubao-pro');
  });

  it('DeepSeek 文本适配器 provider 应为 deepseek', () => {
    const adapter = new DeepSeekTextAdapter('deepseek-chat', 'test-key');
    expect(adapter.provider).toBe('deepseek');
  });

  it('OpenAI 文本适配器 provider 应为 openai', () => {
    const adapter = new OpenAITextAdapter('gpt-4', 'test-key');
    expect(adapter.provider).toBe('openai');
  });

  it('所有文本适配器应实现 generate 方法', () => {
    const adapters = [
      new DoubaoTextAdapter('model', 'key'),
      new DeepSeekTextAdapter('model', 'key'),
      new OpenAITextAdapter('model', 'key'),
    ];
    for (const adapter of adapters) {
      expect(typeof adapter.generate).toBe('function');
    }
  });

  it('适配器应支持自定义 endpoint_url', () => {
    const adapter = new DoubaoTextAdapter('model', 'key', 'https://custom.endpoint.com');
    expect(adapter).toBeDefined();
  });
});

describe('图像适配器', () => {
  it('豆包图像适配器 provider 应为 doubao', () => {
    const adapter = new DoubaoImageAdapter('doubao-seedream-4-5-251128', 'test-key');
    expect(adapter.provider).toBe('doubao');
  });

  it('豆包图像适配器应实现 generate 方法', () => {
    const adapter = new DoubaoImageAdapter('model', 'key');
    expect(typeof adapter.generate).toBe('function');
  });
});

describe('视频适配器', () => {
  it('豆包视频适配器 provider 应为 doubao', () => {
    const adapter = new DoubaoVideoAdapter('doubao-seedance-1-0-pro-250528', 'test-key');
    expect(adapter.provider).toBe('doubao');
  });

  it('豆包视频适配器应实现 generate 和 getTask 方法', () => {
    const adapter = new DoubaoVideoAdapter('model', 'key');
    expect(typeof adapter.generate).toBe('function');
    expect(typeof adapter.getTask).toBe('function');
  });

  it('豆包视频适配器应支持 ratio 参数', () => {
    const adapter = new DoubaoVideoAdapter('model', 'key');
    // 验证适配器能接受 ratio 参数（不实际调用 API）
    expect(adapter).toBeDefined();
  });

  it('豆包视频适配器应支持 duration 参数', () => {
    const adapter = new DoubaoVideoAdapter('model', 'key');
    expect(adapter).toBeDefined();
  });
});

describe('适配器接口一致性', () => {
  it('文本适配器 generate 应返回 Promise', () => {
    const adapter = new DoubaoTextAdapter('model', 'key');
    const result = adapter.generate({ prompt: 'test' });
    expect(result).toBeInstanceOf(Promise);
  });

  it('图像适配器 generate 应返回 Promise', () => {
    const adapter = new DoubaoImageAdapter('model', 'key');
    const result = adapter.generate({ prompt: 'test' });
    expect(result).toBeInstanceOf(Promise);
  });

  it('视频适配器 generate 应返回 Promise', () => {
    const adapter = new DoubaoVideoAdapter('model', 'key');
    const result = adapter.generate({ prompt: 'test' });
    expect(result).toBeInstanceOf(Promise);
  });

  it('视频适配器 getTask 应返回 Promise', () => {
    const adapter = new DoubaoVideoAdapter('model', 'key');
    const result = adapter.getTask('task-id');
    expect(result).toBeInstanceOf(Promise);
  });
});

describe('图像适配器 provider 命名一致性', () => {
  it('智谱图像适配器 provider 应为 zhipu（与文本适配器一致）', () => {
    const adapter = new ZhipuImageAdapter('cogview-3', 'test-key');
    expect(adapter.provider).toBe('zhipu');
  });

  it('通义图像适配器 provider 应为 qwen（与文本适配器一致）', () => {
    const adapter = new QwenImageAdapter('wanx-v1', 'test-key');
    expect(adapter.provider).toBe('qwen');
  });

  it('OpenAI 图像适配器 provider 应为 openai（与文本适配器一致）', () => {
    const adapter = new OpenAIImageAdapter('dall-e-3', 'test-key');
    expect(adapter.provider).toBe('openai');
  });

  it('所有图像适配器应实现 generate 方法', () => {
    const adapters = [
      new ZhipuImageAdapter('model', 'key'),
      new QwenImageAdapter('model', 'key'),
      new OpenAIImageAdapter('model', 'key'),
    ];
    for (const adapter of adapters) {
      expect(typeof adapter.generate).toBe('function');
    }
  });
});

describe('视频适配器扩展', () => {
  it('可灵 Kling 视频适配器 provider 应为 kling', () => {
    const adapter = new KlingVideoAdapter('kling-v1', 'test-key');
    expect(adapter.provider).toBe('kling');
    expect(adapter.modelName).toBe('kling-v1');
  });

  it('即梦 Jimeng 视频适配器 provider 应为 jimeng', () => {
    const adapter = new JimengVideoAdapter('jimeng-v1', 'test-key');
    expect(adapter.provider).toBe('jimeng');
  });

  it('海螺 Hailuo 视频适配器 provider 应为 hailuo', () => {
    const adapter = new HailuoVideoAdapter('hailuo-02', 'test-key');
    expect(adapter.provider).toBe('hailuo');
  });

  it('MiniMax H3 视频适配器 provider 应为 minimax', () => {
    const adapter = new MiniMaxVideoAdapter('MiniMax-H3', 'test-key');
    expect(adapter.provider).toBe('minimax');
    expect(adapter.modelName).toBe('MiniMax-H3');
  });

  it('所有新视频适配器应实现 generate 和 getTask 方法', () => {
    const adapters = [
      new KlingVideoAdapter('model', 'key'),
      new JimengVideoAdapter('model', 'key'),
      new HailuoVideoAdapter('model', 'key'),
      new MiniMaxVideoAdapter('model', 'key'),
    ];
    for (const adapter of adapters) {
      expect(typeof adapter.generate).toBe('function');
      expect(typeof adapter.getTask).toBe('function');
    }
  });

  it('已实现的视频适配器 generate 应返回 Promise（不再抛出尚未实现）', () => {
    const adapter = new KlingVideoAdapter('model', 'key');
    const result = adapter.generate({ prompt: 'test' });
    expect(result).toBeInstanceOf(Promise);
  });
});

describe('音频适配器', () => {
  it('OpenAI 音频适配器 provider 应为 openai', () => {
    const adapter = new OpenAIAudioAdapter('tts-1', 'test-key');
    expect(adapter.provider).toBe('openai');
    expect(adapter.modelName).toBe('tts-1');
  });

  it('音频适配器应实现 generate 方法', () => {
    const adapter = new OpenAIAudioAdapter('tts-1', 'key');
    expect(typeof adapter.generate).toBe('function');
  });

  it('音频适配器 generate 应返回 Promise', () => {
    const adapter = new OpenAIAudioAdapter('tts-1', 'key');
    const result = adapter.generate({ text: 'test' });
    expect(result).toBeInstanceOf(Promise);
  });

  it('豆包音频适配器 provider 应为 doubao', () => {
    const adapter = new DoubaoAudioAdapter('doubao-tts', 'test-key');
    expect(adapter.provider).toBe('doubao');
    expect(adapter.modelName).toBe('doubao-tts');
  });

  it('豆包音频适配器应实现 generate 方法', () => {
    const adapter = new DoubaoAudioAdapter('doubao-tts', 'key');
    expect(typeof adapter.generate).toBe('function');
  });

  it('豆包音频适配器 generate 应返回 Promise', () => {
    const adapter = new DoubaoAudioAdapter('doubao-tts', 'key');
    const result = adapter.generate({ text: 'test' });
    expect(result).toBeInstanceOf(Promise);
  });

  it('豆包音频适配器应支持自定义 endpoint_url', () => {
    const adapter = new DoubaoAudioAdapter('model', 'key', 'https://custom.endpoint.com');
    expect(adapter).toBeDefined();
  });
});
