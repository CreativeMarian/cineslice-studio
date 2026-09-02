import apiClient from './apiClient';
import type { ApiResponse } from '../types';

// 音频生成结果
export interface AudioGenerateResult {
  audioUrl: string;
  durationSeconds: number;
  voice: string;
}

// 剧集 TTS 结果（音频已保存到服务器）
export interface EpisodeTTSResult {
  audioUrl: string;
  fileName: string;
  voice: string;
  durationSeconds: number;
}

// ============================================================
// TTS 音色列表（按提供商分组）
// ============================================================

export interface TTSVoice {
  value: string;
  label: string;
  provider: string; // 对应模型 provider，如 'openai' / 'doubao'
  gender?: 'male' | 'female' | 'neutral';
  description?: string;
}

// OpenAI TTS 音色
const OPENAI_VOICES: TTSVoice[] = [
  { value: 'alloy', label: 'Alloy（中性）', provider: 'openai', gender: 'neutral' },
  { value: 'echo', label: 'Echo（男声）', provider: 'openai', gender: 'male' },
  { value: 'fable', label: 'Fable（英国口音）', provider: 'openai', gender: 'male' },
  { value: 'onyx', label: 'Onyx（低沉男声）', provider: 'openai', gender: 'male' },
  { value: 'nova', label: 'Nova（女声）', provider: 'openai', gender: 'female' },
  { value: 'shimmer', label: 'Shimmer（明亮女声）', provider: 'openai', gender: 'female' },
];

// 豆包大模型 TTS 音色（火山引擎 openspeech V1 接口）
// 注意：旧音色 zh_female_qingxin 等不被 V1 接口支持，必须使用大模型音色
const DOUBAO_VOICES: TTSVoice[] = [
  { value: 'M392', label: '灿灿（女声，情感丰富）', provider: 'doubao', gender: 'female', description: '大模型音色，适合短剧配音' },
  { value: 'M389', label: '炅炅（男声，磁性）', provider: 'doubao', gender: 'male', description: '大模型音色，适合旁白和男主' },
  { value: 'M402', label: '炀炀（男声，年轻）', provider: 'doubao', gender: 'male', description: '大模型音色，适合年轻角色' },
  { value: 'M401', label: '渝渝（女声，温柔）', provider: 'doubao', gender: 'female', description: '大模型音色，适合抒情场景' },
  { value: 'M388', label: '擎苍（男声，沉稳）', provider: 'doubao', gender: 'male', description: '大模型音色，适合成熟角色' },
  { value: 'M399', label: '知夏（女声，清亮）', provider: 'doubao', gender: 'female', description: '大模型音色，适合活泼角色' },
  { value: 'M404', label: '慕寒（男声，冷峻）', provider: 'doubao', gender: 'male', description: '大模型音色，适合高冷角色' },
  { value: 'M400', label: '晚晴（女声，成熟）', provider: 'doubao', gender: 'female', description: '大模型音色，适合御姐角色' },
];

// 全量音色列表
export const ALL_TTS_VOICES: TTSVoice[] = [...OPENAI_VOICES, ...DOUBAO_VOICES];

// 兼容旧代码：默认导出 OpenAI 音色（保持 TTS_VOICES 名称）
export const TTS_VOICES = OPENAI_VOICES.map(({ value, label }) => ({ value, label }));

/**
 * 根据模型 key（格式 "provider:modelName"）获取对应提供商的音色列表
 * 如果无法识别提供商，返回全部音色
 */
export function getVoicesForModel(modelKey: string): TTSVoice[] {
  if (!modelKey) return ALL_TTS_VOICES;
  const provider = modelKey.split(':')[0]?.toLowerCase();
  const filtered = ALL_TTS_VOICES.filter((v) => v.provider === provider);
  return filtered.length > 0 ? filtered : ALL_TTS_VOICES;
}

/**
 * 获取某提供商的默认音色
 */
export function getDefaultVoiceForProvider(provider: string): string {
  const voices = ALL_TTS_VOICES.filter((v) => v.provider === provider.toLowerCase());
  return voices[0]?.value || 'alloy';
}

export const audioService = {
  /** 通用文本转语音，返回 base64 data URL */
  generateAudio: (params: {
    provider: string;
    modelName: string;
    text: string;
    voice?: string;
    speed?: number;
  }) =>
    apiClient.post<unknown, ApiResponse<AudioGenerateResult>>('/ai/audio', params),

  /** 为某集剧本生成配音，音频保存到服务器并返回可访问 URL */
  generateEpisodeTTS: (
    episodeId: string,
    params: {
      provider: string;
      modelName: string;
      voice?: string;
      speed?: number;
    }
  ) =>
    apiClient.post<unknown, ApiResponse<EpisodeTTSResult>>(
      `/episodes/${episodeId}/tts`,
      params
    ),
};
