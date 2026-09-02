// OpenAI TTS 音频适配器
// v1.0
// API 文档: https://platform.openai.com/docs/api-reference/audio/createSpeech

import type { AudioAdapter, AudioGenerateParams, AudioGenerateResult } from '../base';
import { AIError } from '../base';
import { registerAudioFactory } from '../registry';

export class OpenAIAudioAdapter implements AudioAdapter {
  readonly provider = 'openai';
  readonly modelName: string;
  private apiKey: string;
  private baseUrl: string;

  constructor(modelName: string, apiKey: string, endpointUrl?: string) {
    this.modelName = modelName;
    this.apiKey = apiKey;
    this.baseUrl = endpointUrl || 'https://api.openai.com/v1';
  }

  async generate(params: AudioGenerateParams): Promise<AudioGenerateResult> {
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
      });

      if (!response.ok) {
        const text = await response.text();
        throw new AIError('AI_CALL_FAILED', `OpenAI TTS 调用失败: HTTP ${response.status} ${text.substring(0, 200)}`);
      }

      // 将音频 buffer 转为 base64 data URL
      const arrayBuffer = await response.arrayBuffer();
      const audioBase64 = Buffer.from(arrayBuffer).toString('base64');
      const audioUrl = `data:audio/mp3;base64,${audioBase64}`;

      return {
        audioUrl,
        durationSeconds: 0, // OpenAI TTS 不返回时长，需客户端计算
        voice: params.voice || 'alloy',
      };
    } catch (err) {
      if (err instanceof AIError) throw err;
      throw new AIError('AI_CALL_FAILED', `OpenAI TTS 调用失败: ${(err as Error).message}`);
    }
  }
}

registerAudioFactory('openai', (modelName, apiKey, endpointUrl) => {
  return new OpenAIAudioAdapter(modelName, apiKey, endpointUrl);
});
