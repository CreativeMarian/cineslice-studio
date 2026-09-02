// 豆包 TTS 音频适配器（字节跳动 openspeech v3 API）
// v3.0 - 改用 seed-audio-1.0 模型，支持音效/音乐/多说话人
// API 文档: https://www.volcengine.com/docs/6561/1257584
// 端点: https://openspeech.bytedance.com/api/v3/tts/create
// 认证: X-Api-Key header

import type { AudioAdapter, AudioGenerateParams, AudioGenerateResult } from '../base';
import { AIError } from '../base';
import { registerAudioFactory } from '../registry';

export class DoubaoAudioAdapter implements AudioAdapter {
  readonly provider = 'doubao';
  readonly modelName: string;
  private apiKey: string;
  private baseUrl: string;
  private sampleRate: number;
  private format: string;

  constructor(modelName: string, apiKey: string, endpointUrl?: string, configStr?: string) {
    // 默认使用 seed-audio-1.0 模型（v3 API）
    this.modelName = modelName || 'seed-audio-1.0';
    this.apiKey = apiKey;
    this.baseUrl = (endpointUrl || 'https://openspeech.bytedance.com/api/v3/tts/create').replace(/\/$/, '');
    this.sampleRate = 48000;
    this.format = 'mp3';

    // 从 config JSON 中解析可选参数
    if (configStr) {
      try {
        const cfg = JSON.parse(configStr);
        if (cfg.sample_rate && typeof cfg.sample_rate === 'number') {
          this.sampleRate = cfg.sample_rate;
        }
        if (cfg.format && typeof cfg.format === 'string') {
          this.format = cfg.format;
        }
        // 兼容旧配置：如果有 modelOverride 则使用它作为模型名
        if (cfg.modelOverride && typeof cfg.modelOverride === 'string') {
          (this as any).modelName = cfg.modelOverride;
        }
      } catch {
        // 解析失败，使用默认值
      }
    }
  }

  async generate(params: AudioGenerateParams): Promise<AudioGenerateResult> {
    // 校验 apiKey
    if (!this.apiKey) {
      throw new AIError(
        'AI_CALL_FAILED',
        '豆包 TTS 缺少 API Key 配置，请在模型配置中填写 X-Api-Key',
        false
      );
    }

    const voice = params.voice || '';
    const speed = params.speed ?? 1.0;
    // v3 API speech_rate: 0 为正常语速，旧 speed_ratio 1.0 对应 0
    const speechRate = Math.round((speed - 1.0) * 100);

    // 构建 text_prompt：如果有 voice 参数，添加说话人描述
    let textPrompt = params.text;
    if (voice && voice !== 'zh_female_qingxin') {
      // 将 voice 类型映射为简单的说话人描述前缀
      const speakerDesc = this.mapVoiceToSpeaker(voice);
      if (speakerDesc) {
        textPrompt = `${speakerDesc}说道：${params.text}`;
      }
    }

    const body = {
      model: this.modelName,
      text_prompt: textPrompt,
      audio_config: {
        format: this.format,
        sample_rate: this.sampleRate,
        pitch_rate: 0,
        speech_rate: speechRate,
        loudness_rate: 0,
      },
      watermark: {},
    };

    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'X-Api-Key': this.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const text = await response.text();
      let data: any;
      try {
        data = JSON.parse(text);
      } catch {
        data = { error: text };
      }

      if (!response.ok) {
        const msg = data.message || data.error || `HTTP ${response.status}`;
        throw new AIError('AI_CALL_FAILED', `豆包 TTS 调用失败: ${msg}`, false);
      }

      // v3 API 响应: { audio: "base64_encoded_mp3" }
      const audioBase64 = data.audio || data.data || '';
      if (!audioBase64) {
        throw new AIError('AI_CALL_FAILED', '豆包 TTS 返回为空音频数据', false);
      }

      const audioUrl = `data:audio/${this.format};base64,${audioBase64}`;

      // v3 API 不直接返回时长，估算（中文约 4字/秒）
      const charCount = params.text.replace(/\s/g, '').length;
      const durationSeconds = Math.max(1, Math.round(charCount / 4));

      return {
        audioUrl,
        durationSeconds,
        voice: voice || 'default',
      };
    } catch (err) {
      if (err instanceof AIError) throw err;
      throw new AIError('AI_CALL_FAILED', `豆包 TTS 调用失败: ${(err as Error).message}`, false);
    }
  }

  /**
   * 将旧版 voice_type 映射为 v3 API 的说话人描述
   */
  private mapVoiceToSpeaker(voice: string): string {
    const voiceMap: Record<string, string> = {
      'zh_female_qingxin': '年轻女性，清新自然的语气',
      'zh_female_wanwanxiaohe': '年轻女性，温柔甜美的语气',
      'zh_male_chunhou': '中年男性，醇厚低沉的语气',
      'zh_male_qingsong': '年轻男性，轻松自然的语气',
      'zh_male_yangguang': '年轻男性，阳光活力的语气',
    };
    return voiceMap[voice] || '';
  }
}

registerAudioFactory('doubao', (modelName, apiKey, endpointUrl, config) => {
  return new DoubaoAudioAdapter(modelName, apiKey, endpointUrl, config);
});
