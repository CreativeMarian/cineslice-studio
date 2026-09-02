// 自定义 OpenAI 兼容图像适配器
// v1.0
// 支持所有 OpenAI 兼容的图像生成 API（如硅基流动、Together AI、本地 Ollama 等）

import type { ImageAdapter, ImageGenerateParams, ImageGenerateResult } from '../base';
import { AIError, httpRequest } from '../base';
import { registerImageFactory } from '../registry';

export class CustomOpenAIImageAdapter implements ImageAdapter {
  readonly provider = 'custom-openai';
  readonly modelName: string;
  private apiKey: string;
  private baseUrl: string;

  constructor(modelName: string, apiKey: string, baseUrl?: string) {
    this.modelName = modelName;
    this.apiKey = apiKey;
    this.baseUrl = (baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');
  }

  async generate(params: ImageGenerateParams): Promise<ImageGenerateResult> {
    const size = params.size || '1024x1024';
    const body: Record<string, unknown> = {
      model: this.modelName,
      prompt: params.prompt,
      n: params.count || 1,
      size,
      response_format: 'url',
    };

    if (params.negativePrompt) {
      body.prompt = `${params.prompt}。避免：${params.negativePrompt}`;
    }

    try {
      const data = await httpRequest<any>(`${this.baseUrl}/images/generations`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.apiKey}` },
        body,
      });

      const images = (data.data || []).map((item: any) => ({
        url: item.url || item.b64_json || '',
        prompt: item.revised_prompt || params.prompt,
      }));

      return { images, model: this.modelName, raw: data };
    } catch (err) {
      if (err instanceof AIError) throw err;
      throw new AIError('AI_CALL_FAILED', `自定义图像模型调用失败: ${(err as Error).message}`);
    }
  }
}

registerImageFactory('custom-openai', (modelName, apiKey, endpointUrl) => {
  return new CustomOpenAIImageAdapter(modelName, apiKey, endpointUrl);
});
