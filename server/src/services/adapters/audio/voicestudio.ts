// VoiceStudio 本地 TTS 音频适配器
// v1.0
// 对接 debpalash/VoiceStudio（开源本地 ElevenLabs 替代，47k stars，AGPL-3.0）
// 官方仓库: https://github.com/debpalash/VoiceStudio
// 接入端点（来自官方 backend/mcp_server.py 的实现事实）：
//   POST {baseUrl}/generate   form 提交（text / speed / num_step / language / profile_id / instruct）
//     响应体 = WAV 音频字节；响应头 X-Audio-Id / X-Audio-Duration / X-Gen-Time
//   GET  {baseUrl}/audio/{id}.wav   音频下载（files 模式返回的 URL）
//   GET  {baseUrl}/profiles         已保存音色列表（profile_id 从这拿，填角色卡 voice_profile）
// 本地回环（127.0.0.1）免认证；远程才需要 X-OmniVoice-Pin（本项目仅支持本机调用）
// 音色绑定：params.voice 直接透传 VoiceStudio 的 profile_id（在 VoiceStudio 里克隆/设计好音色后填写）

import type { AudioAdapter, AudioGenerateParams, AudioGenerateResult } from '../base';
import { AIError } from '../base';
import { registerAudioFactory } from '../registry';

export class VoiceStudioAudioAdapter implements AudioAdapter {
  readonly provider = 'voicestudio';
  readonly modelName: string;
  private baseUrl: string;

  constructor(modelName: string, _apiKey?: string, endpointUrl?: string) {
    this.modelName = modelName || 'voicestudio-omnivoice';
    this.baseUrl = (endpointUrl || 'http://127.0.0.1:3900').replace(/\/+$/, '');
  }

  async generate(params: AudioGenerateParams): Promise<AudioGenerateResult> {
    try {
      const form = new URLSearchParams();
      form.set('text', params.text);
      form.set('speed', String(params.speed ?? 1.0));
      form.set('num_step', '16'); // 8=快稿 16=均衡 32=高质量
      // 短剧中文为主；VoiceStudio 支持 646 语言，传 Auto 则自动检测
      form.set('language', params.language || 'zh');
      // voice 参数透传 profile_id（角色卡 voice_profile 里填 `{"voice": "<profile_id>"}`）
      if (params.voice) form.set('profile_id', params.voice);

      const response = await fetch(`${this.baseUrl}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form.toString(),
        // VoiceStudio 本地 GPU 队列 + 首次生成可能触发模型下载（约 2.3GB），
        // 超时放宽到 10 分钟；若后端自行配置了更长预算，此值只是前端兜底
        signal: AbortSignal.timeout(600_000),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new AIError(
          'AI_CALL_FAILED',
          `VoiceStudio TTS 调用失败: HTTP ${response.status} ${text.substring(0, 200)}`
        );
      }

      const durationRaw = response.headers.get('X-Audio-Duration');
      const arrayBuffer = await response.arrayBuffer();
      const audioBase64 = Buffer.from(arrayBuffer).toString('base64');

      // WAV 直出：data URL 交给 audio stage 落盘（扩展名按 mime 动态识别为 .wav）
      return {
        audioUrl: `data:audio/wav;base64,${audioBase64}`,
        durationSeconds: durationRaw ? Number(durationRaw) : 0,
        voice: params.voice || '',
      };
    } catch (err) {
      if (err instanceof AIError) throw err;
      throw new AIError('AI_CALL_FAILED', `VoiceStudio TTS 调用失败: ${(err as Error).message}`);
    }
  }
}

registerAudioFactory('voicestudio', (modelName, apiKey, endpointUrl) => {
  return new VoiceStudioAudioAdapter(modelName, apiKey, endpointUrl);
});
