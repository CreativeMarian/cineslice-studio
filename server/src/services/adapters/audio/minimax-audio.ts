// MiniMax 语音合成适配器
// v1.0
// API 文档: https://platform.minimaxi.com/document/T2A%20v2
// 端点: https://api.minimaxi.com/v1/t2a_v2

import type { AudioAdapter, AudioGenerateParams, AudioGenerateResult } from '../base';
import { AIError } from '../base';
import { registerAudioFactory } from '../registry';

export class MiniMaxAudioAdapter implements AudioAdapter {
  readonly provider = 'minimax';
  readonly modelName: string;
  private apiKey: string;
  private baseUrl: string;

  constructor(modelName: string, apiKey: string, endpointUrl?: string) {
    this.modelName = modelName || 'speech-2.8-hd';
    this.apiKey = apiKey;
    this.baseUrl = (endpointUrl || 'https://api.minimaxi.com/v1').replace(/\/$/, '');
  }

  async generate(params: AudioGenerateParams): Promise<AudioGenerateResult> {
    if (!this.apiKey) {
      throw new AIError('AI_CALL_FAILED', 'MiniMax 语音缺少 API Key 配置', false);
    }

    try {
      const voiceId = params.voice || 'female-shaonv';
      const speed = params.speed ?? 1.0;

      const response = await fetch(`${this.baseUrl}/t2a_v2`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.modelName,
          text: params.text,
          voice_setting: {
            voice_id: voiceId,
            speed: speed,
            vol: 1.0,
            pitch: 0,
          },
          audio_setting: {
            sample_rate: 32000,
            bitrate: 128000,
            format: 'mp3',
            channel: 1,
          },
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new AIError('AI_CALL_FAILED', `MiniMax 语音调用失败: HTTP ${response.status} ${text.substring(0, 200)}`);
      }

      const data = await response.json() as any;

      // MiniMax T2A v2 返回 audio 字段（base64 编码的音频数据）
      if (data?.audio) {
        const audioUrl = `data:audio/mp3;base64,${data.audio}`;
        return {
          audioUrl,
          durationSeconds: data?.duration || 0,
          voice: voiceId,
        };
      }

      // 如果返回的是音频文件URL
      if (data?.audio_file) {
        return {
          audioUrl: data.audio_file,
          durationSeconds: data?.duration || 0,
          voice: voiceId,
        };
      }

      throw new AIError('AI_CALL_FAILED', `MiniMax 语音返回格式异常: ${JSON.stringify(data).substring(0, 200)}`);
    } catch (err) {
      if (err instanceof AIError) throw err;
      throw new AIError('AI_CALL_FAILED', `MiniMax 语音调用失败: ${(err as Error).message}`);
    }
  }
}

registerAudioFactory('minimax', (modelName, apiKey, endpointUrl) => {
  return new MiniMaxAudioAdapter(modelName, apiKey, endpointUrl);
});
