// 自定义 OpenAI 兼容音频适配器
// v1.0
// 支持所有 OpenAI 兼容的 TTS API（如硅基流动、本地部署的 TTS 服务等）

import type { AudioAdapter, AudioGenerateParams, AudioGenerateResult } from '../base';
import { AIError } from '../base';
import { registerAudioFactory } from '../registry';

export class CustomOpenAIAudioAdapter implements AudioAdapter {
  readonly provider = 'custom-openai';
  readonly modelName: string;
  private apiKey: string;
  private baseUrl: string;

  constructor(modelName: string, apiKey: string, endpointUrl?: string) {
    this.modelName = modelName || 'tts-1';
    this.apiKey = apiKey;
    this.baseUrl = (endpointUrl || 'https://api.openai.com/v1').replace(/\/$/, '');
  }

  async generate(params: AudioGenerateParams): Promise<AudioGenerateResult> {
    if (!this.apiKey) {
      throw new AIError('AI_CALL_FAILED', '自定义音频模型缺少 API Key 配置', false);
    }

    try {
      const response = await fetch(`${this.baseUrl}/audio/speech`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.modelName,
          input: params.text,
          voice: params.voice || 'alloy',
          speed: params.speed || 1.0,
        }),
        // 挂起的 TTS 连接会永久阻塞请求
        signal: AbortSignal.timeout(60_000),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new AIError('AI_CALL_FAILED', `自定义音频模型调用失败: HTTP ${response.status} ${text.substring(0, 200)}`);
      }

      // 将音频 buffer 转为 base64 data URL
      const arrayBuffer = await response.arrayBuffer();
      const audioBase64 = Buffer.from(arrayBuffer).toString('base64');
      const audioUrl = `data:audio/mp3;base64,${audioBase64}`;

      return {
        audioUrl,
        durationSeconds: 0, // 需客户端计算
        voice: params.voice || 'alloy',
      };
    } catch (err) {
      if (err instanceof AIError) throw err;
      throw new AIError('AI_CALL_FAILED', `自定义音频模型调用失败: ${(err as Error).message}`);
    }
  }
}

registerAudioFactory('custom-openai', (modelName, apiKey, endpointUrl) => {
  return new CustomOpenAIAudioAdapter(modelName, apiKey, endpointUrl);
});
