// Recraft 图像适配器
// v1.0 - 支持 Recraft V3

import type { ImageAdapter, ImageGenerateParams, ImageGenerateResult } from '../base';
import { AIError, httpRequest } from '../base';
import { registerImageFactory } from '../registry';

export class RecraftImageAdapter implements ImageAdapter {
  readonly provider = 'recraft';
  readonly modelName: string;
  private apiKey: string;
  private baseUrl: string;

  constructor(modelName: string, apiKey: string, baseUrl?: string) {
    this.modelName = modelName || 'recraft-v3';
    this.apiKey = apiKey;
    this.baseUrl = (baseUrl || 'https://external.api.recraft.ai').replace(/\/$/, '');
  }

  async generate(params: ImageGenerateParams): Promise<ImageGenerateResult> {
    const body: Record<string, unknown> = {
      prompt: params.prompt,
      model: this.modelName,
      n: params.count || 1,
      size: params.size || '1024x1024',
      response_format: 'url',
    };

    if (params.negativePrompt) {
      body.negative_prompt = params.negativePrompt;
    }
    if (params.style) {
      body.style = params.style;
    }

    try {
      const data = await httpRequest<any>(`${this.baseUrl}/v1/images/generations`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.apiKey}` },
        body,
      });

      const images = (data.data || []).map((item: any) => ({
        url: item.url,
        prompt: params.prompt,
      }));

      return { images, model: this.modelName, raw: data };
    } catch (err) {
      if (err instanceof AIError) throw err;
      throw new AIError('AI_CALL_FAILED', `Recraft 调用失败: ${(err as Error).message}`);
    }
  }
}

registerImageFactory('recraft', (modelName, apiKey, endpointUrl) => {
  return new RecraftImageAdapter(modelName, apiKey, endpointUrl);
});
