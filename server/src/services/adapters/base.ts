// AI 适配器基类接口定义
// v1.1 - 文本适配器支持多模态图片输入（VLM 视频质量门用）

export interface TextGenerateParams {
  prompt: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  responseFormat?: 'text' | 'json';
  /** 多模态图片输入：data URL 或可访问 URL，供视觉理解模型（视频质量门/Critic 用） */
  images?: string[];
}

export interface TextGenerateResult {
  content: string;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
  model: string;
  raw?: unknown;
}

export interface ImageGenerateParams {
  prompt: string;
  negativePrompt?: string;
  size?: '512x512' | '1024x1024' | '1024x1792' | '1792x1024' | '2048x2048' | '2048x1152' | '2560x1440' | '1440x2560';
  count?: number;
  referenceImages?: string[];
  style?: string;
}

export interface ImageGenerateResult {
  images: { url: string; prompt?: string }[];
  model: string;
  raw?: unknown;
}

export interface VideoGenerateParams {
  prompt?: string;
  firstFrameImageUrl?: string;
  lastFrameImageUrl?: string;
  referenceImages?: string[]; // 一致性参考图（角色定妆照/场景/道具），视频模型支持时注入
  referenceVideos?: string[]; // 参考视频（flf2v 等支持时注入；默认禁用避免干扰尾帧）
  duration?: number;
  ratio?: '16:9' | '9:16' | '1:1' | '4:3' | '3:4' | '21:9';
  resolution?: '720p' | '1080p' | '2k' | '4k';
  motion?: string;
  subtitles?: boolean;
}

export interface VideoGenerateResult {
  taskId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  videoUrl?: string;
  estimatedTimeSeconds?: number;
  error?: string;
  progress?: number;
}

export interface AudioGenerateParams {
  text: string;
  voice?: string;
  speed?: number;
  language?: string;
}

export interface AudioGenerateResult {
  audioUrl: string;
  durationSeconds: number;
  voice: string;
}

export interface TextAdapter {
  readonly provider: string;
  readonly modelName: string;
  generate(params: TextGenerateParams): Promise<TextGenerateResult>;
}

export interface ImageAdapter {
  readonly provider: string;
  readonly modelName: string;
  generate(params: ImageGenerateParams): Promise<ImageGenerateResult>;
}

export interface VideoAdapter {
  readonly provider: string;
  readonly modelName: string;
  generate(params: VideoGenerateParams): Promise<VideoGenerateResult>;
  getTask?(taskId: string): Promise<VideoGenerateResult>;
}

export interface AudioAdapter {
  readonly provider: string;
  readonly modelName: string;
  generate(params: AudioGenerateParams): Promise<AudioGenerateResult>;
}

export class AIError extends Error {
  code: 'AI_CALL_FAILED' | 'AI_RATE_LIMITED';
  retryable: boolean;
  constructor(code: 'AI_CALL_FAILED' | 'AI_RATE_LIMITED', message: string, retryable = false) {
    super(message);
    this.code = code;
    this.retryable = retryable;
    this.name = 'AIError';
  }
}

// 二进制安全请求：audio 等返回原始字节（mp3/wav）的接口必须使用，
// 走 text() 会把二进制按 UTF-8 解码损坏（历史 bug：Edge TTS 输出损坏的 mp3）
export async function httpBinaryRequest(
  url: string,
  options: { method: string; headers?: Record<string, string>; body?: unknown; timeout?: number }
): Promise<Buffer> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeout || 120000);

  try {
    const response = await fetch(url, {
      method: options.method,
      headers: { 'Content-Type': 'application/json', ...options.headers },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      const msg = `HTTP ${response.status}: ${text.substring(0, 500)}`;
      if (response.status === 429) throw new AIError('AI_RATE_LIMITED', `请求被限流 ${msg}`, true);
      if (response.status >= 500) throw new AIError('AI_CALL_FAILED', `服务端错误 ${msg}`, true);
      throw new AIError('AI_CALL_FAILED', msg, false);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (err) {
    if (err instanceof AIError) throw err;
    if (err instanceof Error && err.name === 'AbortError') {
      throw new AIError('AI_CALL_FAILED', '请求超时', true);
    }
    throw new AIError('AI_CALL_FAILED', `网络错误: ${(err as Error).message}`, true);
  } finally {
    clearTimeout(timeout);
  }
}

// 通用 HTTP 请求辅助
export async function httpRequest<T>(
  url: string,
  options: { method: string; headers?: Record<string, string>; body?: unknown; timeout?: number }
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeout || 600000);

  try {
    const response = await fetch(url, {
      method: options.method,
      headers: { 'Content-Type': 'application/json', ...options.headers },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });

    const text = await response.text();
    let data: T;
    try {
      data = JSON.parse(text) as T;
    } catch {
      data = text as unknown as T;
    }

    if (!response.ok) {
      const status = response.status;
      const msg = typeof data === 'object' && data !== null && 'error' in data
        ? JSON.stringify((data as any).error)
        : `HTTP ${status}: ${text.substring(0, 500)}`;
      if (status === 429) {
        throw new AIError('AI_RATE_LIMITED', `请求被限流 ${msg}`, true);
      }
      if (status >= 500) {
        throw new AIError('AI_CALL_FAILED', `服务端错误 ${msg}`, true);
      }
      throw new AIError('AI_CALL_FAILED', msg, false);
    }

    return data;
  } catch (err) {
    if (err instanceof AIError) throw err;
    if (err instanceof Error && err.name === 'AbortError') {
      throw new AIError('AI_CALL_FAILED', '请求超时', true);
    }
    throw new AIError('AI_CALL_FAILED', `网络错误: ${(err as Error).message}`, true);
  } finally {
    clearTimeout(timeout);
  }
}
