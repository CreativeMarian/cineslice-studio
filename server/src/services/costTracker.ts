// API 调用成本统计
// v1.0

import type { Database, ModelType } from '../types';
import { CostRecordDAO } from '../models';

// 简化的成本估算（每 1K tokens 的美元价格，实际可配置）
const COST_PER_1K_TOKENS: Record<string, number> = {
  // OpenAI
  'openai:gpt-4o': 0.005,
  'openai:gpt-4o-mini': 0.00015,
  // Anthropic
  'anthropic:claude-3-5-sonnet': 0.003,
  'anthropic:claude-3-5-haiku': 0.0008,
  'anthropic:claude-3-opus': 0.015,
  // Google Gemini
  'google:gemini-1.5-pro': 0.0025,
  'google:gemini-1.5-flash': 0.000075,
  'google:gemini-2.0-flash': 0.0001,
  // 火山引擎·豆包（Seed 2.0/2.1 系列，可直接用模型名调用）
  'doubao:doubao-seed-2-1-pro-260628': 0.0016,
  'doubao:doubao-seed-2-1-turbo-260628': 0.0008,
  'doubao:doubao-seed-2-0-pro-260215': 0.0016,
  'doubao:doubao-seed-2-0-lite-260428': 0.0004,
  'doubao:doubao-seed-2-0-mini-260428': 0.0002,
  // 旧版兼容（需接入点 ID）
  'doubao:doubao-1-5-pro-32k': 0.0008,
  'doubao:doubao-1-5-pro-256k': 0.0012,
  'doubao:doubao-1-5-lite-32k': 0.0004,
  'doubao:doubao-1-5-vision-pro-32k': 0.001,
  'doubao:doubao-pro': 0.0008,
  'doubao:doubao-lite': 0.0003,
  // 阿里通义千问
  'qwen:qwen-max': 0.0012,
  'qwen:qwen-plus': 0.0004,
  'qwen:qwen-turbo': 0.00015,
  'qwen:qwen-long': 0.0005,
  // 智谱 GLM
  'zhipu:glm-4': 0.001,
  'zhipu:glm-4-flash': 0,
  'zhipu:glm-4-plus': 0.0007,
  // DeepSeek
  'deepseek:deepseek-chat': 0.00028,
  'deepseek:deepseek-v4-flash': 0.00027,
  'deepseek:deepseek-v4-pro': 0.00027,
  'deepseek:deepseek-reasoner': 0.0015,
  // 月之暗面 Kimi
  'kimi:kimi-chat': 0.0006,
  'kimi:kimi-k2': 0.0007,
  'moonshot:moonshot-v1-8k': 0.0012,
  'moonshot:moonshot-v1-32k': 0.0024,
  // MiniMax
  'minimax:abab-6.5': 0.001,
  'minimax:abab6.5s-chat': 0.0003,
  // 讯飞星火
  'spark:spark-4.0': 0.0015,
  'xfyun:generalv3.5': 0.001,
};

const IMAGE_COST_PER_IMAGE: Record<string, number> = {
  'openai-image:dall-e-3': 0.04,
  'stability:sd3': 0.03,
  'qwen-image:wanx-v1': 0.004,
  'zhipu-image:cogview-4': 0.005,
  'doubao-image:doubao-image-generation': 0.004,
  'doubao-image:doubao-seedream-4-5': 0.004,
  'doubao-image:doubao-seedream-5-0-pro-260628': 0.008,
  'ideogram:ideogram-2.0': 0.03,
  'recraft:recraft-v3': 0.01,
  'flux:flux-pro': 0.05,
};

// 视频生成成本（按秒计算，美元）
// 注意：这是估算值，因为大多数视频API不返回实际用量
// 实际成本可能因分辨率、模型版本、活动优惠等因素有所不同
const VIDEO_COST_PER_SECOND: Record<string, number> = {
  'doubao-video:doubao-seedance-1-0-pro': 0.002,
  'doubao-video:doubao-seedance-1-0-lite': 0.001,
  'doubao-video:doubao-seedance-2-5-260628': 0.003,
  'openai-video:sora': 0.02,
  'kling:kling-v1': 0.005,
  'runway:gen-3': 0.01,
  'pika:pi ka-1.0': 0.008,
};

// 音频生成成本（按1K字符计算，美元）
// 注意：这是估算值，实际成本可能因音色、语速、活动优惠等因素有所不同
const AUDIO_COST_PER_1K_CHARS: Record<string, number> = {
  'doubao-audio:doubao-tts': 0.0002,
  'doubao-audio:seed-audio-1.0': 0.0003,
  'openai-audio:tts-1': 0.015,
  'openai-audio:tts-1-hd': 0.03,
  'elevenlabs:eleven_multilingual_v2': 0.0003,
  'azure:zh-CN-XiaoxiaoNeural': 0.0001,
};

export const costTracker = {
  /**
   * 估算 API 调用成本
   * @param provider 模型提供商
   * @param modelName 模型名称
   * @param modelType 模型类型：text/image/video/audio
   * @param tokens 文本 tokens 数（text 类型）
   * @param imageCount 图像张数（image 类型）
   * @param videoSeconds 视频秒数（video 类型）
   * @param audioChars 音频字符数（audio 类型）
   * @returns 成本（美元）
   */
  estimateCost(
    provider: string,
    modelName: string,
    modelType: ModelType,
    tokens = 0,
    imageCount = 0,
    videoSeconds = 0,
    audioChars = 0
  ): number {
    const key = `${provider}:${modelName}`;
    if (modelType === 'text') {
      const rate = COST_PER_1K_TOKENS[key] || 0.002;
      return (tokens / 1000) * rate;
    }
    if (modelType === 'image') {
      const rate = IMAGE_COST_PER_IMAGE[key] || 0.02;
      return imageCount * rate;
    }
    if (modelType === 'video') {
      const rate = VIDEO_COST_PER_SECOND[key] || 0.002;
      return videoSeconds * rate;
    }
    if (modelType === 'audio') {
      const rate = AUDIO_COST_PER_1K_CHARS[key] || 0.0002;
      return (audioChars / 1000) * rate;
    }
    return 0;
  },

  /**
   * 记录 API 调用成本
   */
  async record(
    db: Database,
    userId: string,
    provider: string,
    modelName: string,
    modelType: ModelType,
    tokens = 0,
    imageCount = 0,
    videoSeconds = 0,
    audioChars = 0
  ): Promise<void> {
    try {
      const cost = this.estimateCost(provider, modelName, modelType, tokens, imageCount, videoSeconds, audioChars);
      CostRecordDAO.create(db, {
        user_id: userId,
        provider,
        model_name: modelName,
        model_type: modelType,
        tokens,
        image_count: imageCount,
        video_seconds: videoSeconds,
        audio_chars: audioChars,
        cost,
      });
    } catch (err) {
      console.error('[CostTracker] 成本记录失败（不影响主流程）:', (err as Error).message);
    }
  },

  getTotal(db: Database, userId: string): { totalTokens: number; totalCost: number } {
    return CostRecordDAO.getTotalByUser(db, userId);
  },

  getHistory(db: Database, userId: string, limit = 100) {
    return CostRecordDAO.listByUser(db, userId, limit);
  },
};
