// OpenAI 文本适配器
// v2.1 - 使用官方 OpenAI SDK，支持自定义模型、超时设置、类型安全

import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import type { TextAdapter, TextGenerateParams, TextGenerateResult } from '../base';
import { AIError } from '../base';
import { registerTextFactory } from '../registry';

// 用法类型定义
interface UsageInfo {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

export class OpenAICompatibleTextAdapter implements TextAdapter {
  readonly provider: string;
  readonly modelName: string;
  protected apiKey: string;
  protected baseUrl: string;
  protected client: OpenAI;
  protected timeout: number;

  constructor(provider: string, modelName: string, apiKey: string, baseUrl: string, timeout?: number) {
    this.provider = provider;
    this.modelName = modelName;
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.timeout = timeout ?? 120000; // 默认120秒超时（文本生成可能需要较长时间）

    // 使用官方 OpenAI SDK 初始化客户端
    // dangerouslyAllowBrowser: 后端 Node.js 环境中某些全局变量可能导致 SDK 误判为浏览器环境，显式允许
    this.client = new OpenAI({
      apiKey: this.apiKey,
      baseURL: this.baseUrl,
      timeout: this.timeout,
      maxRetries: 0, // 不在 SDK 层重试，由 aiProxy 层统一处理重试
      dangerouslyAllowBrowser: true,
    });
  }

  async generate(params: TextGenerateParams): Promise<TextGenerateResult> {
    const messages: ChatCompletionMessageParam[] = [];
    if (params.systemPrompt) {
      messages.push({ role: 'system', content: params.systemPrompt });
    }
    // 多模态：带图片时构造 image_url 数组（VLM 视频质量门用）
    if (params.images && params.images.length > 0) {
      const contentParts: ChatCompletionMessageParam['content'] = [
        { type: 'text', text: params.prompt },
        ...params.images.map(url => ({
          type: 'image_url' as const,
          image_url: { url },
        })),
      ];
      messages.push({ role: 'user', content: contentParts });
    } else {
      messages.push({ role: 'user', content: params.prompt });
    }

    try {
      // 使用官方 SDK 调用 chat.completions.create
      const completion = await this.client.chat.completions.create({
        model: this.modelName,
        messages,
        temperature: params.temperature ?? 0.7,
        max_tokens: params.maxTokens ?? 2048,
        top_p: params.topP ?? 1.0,
        response_format: params.responseFormat === 'json' ? { type: 'json_object' } : undefined,
      });

      const content = completion.choices?.[0]?.message?.content ?? '';
      const usage: UsageInfo = completion.usage ?? {};

      return {
        content,
        usage: {
          promptTokens: usage.prompt_tokens ?? 0,
          completionTokens: usage.completion_tokens ?? 0,
          totalTokens: usage.total_tokens ?? 0,
        },
        model: completion.model || this.modelName,
        raw: completion,
      };
    } catch (err: unknown) {
      if (err instanceof AIError) throw err;

      // 处理 OpenAI SDK 的错误
      const openaiErr = err as {
        message?: string;
        status?: number;
        error?: { message?: string; code?: string };
      };

      const errorMessage = openaiErr?.message || openaiErr?.error?.message || (err as Error).message || '未知错误';
      const errorCode = openaiErr?.status || openaiErr?.error?.code || 'AI_CALL_FAILED';

      // 判断是否可重试（429限流、500/502/503服务器错误）
      const retryableStatuses = [429, 500, 502, 503, 504];
      const isRetryable = openaiErr?.status ? retryableStatuses.includes(openaiErr.status) : false;

      const aiError = new AIError(
        errorCode as 'AI_CALL_FAILED' | 'AI_RATE_LIMITED',
        `OpenAI 调用失败: ${errorMessage}`
      );
      aiError.retryable = isRetryable;
      throw aiError;
    }
  }
}

// 官方 OpenAI
export class OpenAITextAdapter extends OpenAICompatibleTextAdapter {
  constructor(modelName: string, apiKey: string, baseUrl?: string) {
    super('openai', modelName, apiKey, baseUrl || 'https://api.openai.com/v1');
  }
}

// 注册官方 OpenAI
registerTextFactory('openai', (modelName, apiKey, endpointUrl) => {
  return new OpenAITextAdapter(modelName, apiKey, endpointUrl);
});

// 注册自定义 OpenAI 兼容模型（provider 为 custom-openai）
registerTextFactory('custom-openai', (modelName, apiKey, endpointUrl) => {
  return new OpenAICompatibleTextAdapter('custom-openai', modelName, apiKey, endpointUrl || 'https://api.openai.com/v1');
});
