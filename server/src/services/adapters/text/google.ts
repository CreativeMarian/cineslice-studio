// Google Gemini 文本适配器
// v1.0 - 支持 Gemini 1.5 Pro, Gemini 1.5 Flash 等

import type { TextAdapter, TextGenerateParams, TextGenerateResult } from '../base';
import { AIError, httpRequest } from '../base';
import { registerTextFactory } from '../registry';

export class GoogleTextAdapter implements TextAdapter {
  readonly provider = 'google';
  readonly modelName: string;
  private apiKey: string;
  private baseUrl: string;

  constructor(modelName: string, apiKey: string, baseUrl?: string) {
    this.modelName = modelName;
    this.apiKey = apiKey;
    this.baseUrl = (baseUrl || 'https://generativelanguage.googleapis.com').replace(/\/$/, '');
  }

  async generate(params: TextGenerateParams): Promise<TextGenerateResult> {
    const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];

    if (params.systemPrompt) {
      contents.push({ role: 'user', parts: [{ text: params.systemPrompt }] });
      contents.push({ role: 'model', parts: [{ text: '好的，我明白了。' }] });
    }
    contents.push({ role: 'user', parts: [{ text: params.prompt }] });

    const body: Record<string, unknown> = {
      contents,
      generationConfig: {
        temperature: params.temperature ?? 0.7,
        maxOutputTokens: params.maxTokens ?? 2048,
        topP: params.topP ?? 1.0,
        responseMimeType: params.responseFormat === 'json' ? 'application/json' : 'text/plain',
      },
    };

    try {
      const data = await httpRequest<any>(
        `${this.baseUrl}/v1beta/models/${this.modelName}:generateContent?key=${this.apiKey}`,
        { method: 'POST', body }
      );

      const content = data.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') ?? '';
      const usage = data.usageMetadata ?? {};

      return {
        content,
        usage: {
          promptTokens: usage.promptTokenCount ?? 0,
          completionTokens: usage.candidatesTokenCount ?? 0,
          totalTokens: usage.totalTokenCount ?? 0,
        },
        model: this.modelName,
        raw: data,
      };
    } catch (err) {
      if (err instanceof AIError) throw err;
      throw new AIError('AI_CALL_FAILED', `Google Gemini 调用失败: ${(err as Error).message}`);
    }
  }
}

registerTextFactory('google', (modelName, apiKey, endpointUrl) => {
  return new GoogleTextAdapter(modelName, apiKey, endpointUrl);
});
