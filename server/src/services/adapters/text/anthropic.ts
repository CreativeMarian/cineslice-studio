// Anthropic Claude 文本适配器
// v1.0 - 支持 Claude 3.5 Sonnet, Claude 3 Opus 等

import type { TextAdapter, TextGenerateParams, TextGenerateResult } from '../base';
import { AIError, httpRequest } from '../base';
import { registerTextFactory } from '../registry';

export class AnthropicTextAdapter implements TextAdapter {
  readonly provider = 'anthropic';
  readonly modelName: string;
  private apiKey: string;
  private baseUrl: string;

  constructor(modelName: string, apiKey: string, baseUrl?: string) {
    this.modelName = modelName;
    this.apiKey = apiKey;
    this.baseUrl = (baseUrl || 'https://api.anthropic.com').replace(/\/$/, '');
  }

  async generate(params: TextGenerateParams): Promise<TextGenerateResult> {
    const body: Record<string, unknown> = {
      model: this.modelName,
      max_tokens: params.maxTokens ?? 2048,
      temperature: params.temperature ?? 0.7,
      top_p: params.topP ?? 1.0,
      messages: [{ role: 'user', content: params.prompt }],
    };

    if (params.systemPrompt) {
      body.system = params.systemPrompt;
    }

    try {
      const data = await httpRequest<any>(`${this.baseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body,
      });

      const content = data.content?.find((c: any) => c.type === 'text')?.text ?? '';
      const usage = data.usage ?? {};

      return {
        content,
        usage: {
          promptTokens: usage.input_tokens ?? 0,
          completionTokens: usage.output_tokens ?? 0,
          totalTokens: (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0),
        },
        model: data.model || this.modelName,
        raw: data,
      };
    } catch (err) {
      if (err instanceof AIError) throw err;
      throw new AIError('AI_CALL_FAILED', `Anthropic 调用失败: ${(err as Error).message}`);
    }
  }
}

registerTextFactory('anthropic', (modelName, apiKey, endpointUrl) => {
  return new AnthropicTextAdapter(modelName, apiKey, endpointUrl);
});
