// Stability AI 图像适配器
// v1.0 - 支持 SD3, SDXL

import type { ImageAdapter, ImageGenerateParams, ImageGenerateResult } from '../base';
import { AIError } from '../base';
import { registerImageFactory } from '../registry';

export class StabilityImageAdapter implements ImageAdapter {
  readonly provider = 'stability';
  readonly modelName: string;
  private apiKey: string;
  private baseUrl: string;

  constructor(modelName: string, apiKey: string, baseUrl?: string) {
    this.modelName = modelName || 'sd3';
    this.apiKey = apiKey;
    this.baseUrl = (baseUrl || 'https://api.stability.ai').replace(/\/$/, '');
  }

  async generate(params: ImageGenerateParams): Promise<ImageGenerateResult> {
    const size = params.size || '1024x1024';
    const [width, height] = size.split('x').map(Number);

    const body = new FormData();
    body.append('prompt', params.prompt);
    body.append('output_format', 'png');
    body.append('width', String(width));
    body.append('height', String(height));
    if (params.negativePrompt) body.append('negative_prompt', params.negativePrompt);
    if (params.count) body.append('samples', String(params.count));

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120000);
      const response = await fetch(`${this.baseUrl}/v2beta/stable-image/generate/sd3`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.apiKey}`, Accept: 'application/json' },
        body,
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) {
        const text = await response.text();
        if (response.status === 429) throw new AIError('AI_RATE_LIMITED', 'Stability AI 限流', true);
        throw new AIError('AI_CALL_FAILED', `Stability AI 错误: ${text.substring(0, 500)}`);
      }

      const data: any = await response.json();
      const images = [{ url: `data:image/png;base64,${data.image}`, prompt: params.prompt }];
      return { images, model: this.modelName, raw: data };
    } catch (err) {
      if (err instanceof AIError) throw err;
      throw new AIError('AI_CALL_FAILED', `Stability AI 调用失败: ${(err as Error).message}`);
    }
  }
}

registerImageFactory('stability', (modelName, apiKey, endpointUrl) => {
  return new StabilityImageAdapter(modelName, apiKey, endpointUrl);
});
