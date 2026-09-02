// Ideogram 图像适配器
// v1.0 - 支持 Ideogram 2.0

import type { ImageAdapter, ImageGenerateParams, ImageGenerateResult } from '../base';
import { AIError, httpRequest } from '../base';
import { registerImageFactory } from '../registry';

export class IdeogramImageAdapter implements ImageAdapter {
  readonly provider = 'ideogram';
  readonly modelName: string;
  private apiKey: string;
  private baseUrl: string;

  constructor(modelName: string, apiKey: string, baseUrl?: string) {
    this.modelName = modelName || 'ideogram-2.0';
    this.apiKey = apiKey;
    this.baseUrl = (baseUrl || 'https://api.ideogram.ai').replace(/\/$/, '');
  }

  async generate(params: ImageGenerateParams): Promise<ImageGenerateResult> {
    const size = params.size || '1024x1024';
    const [width, height] = size.split('x').map(Number);

    const body: Record<string, unknown> = {
      image_request: {
        prompt: params.prompt,
        negative_prompt: params.negativePrompt || '',
        model: this.modelName,
        num_images: params.count || 1,
        resolution: `${width}x${height}`,
      },
    };

    try {
      const data = await httpRequest<any>(`${this.baseUrl}/generate`, {
        method: 'POST',
        headers: { 'Api-Key': this.apiKey },
        body,
      });

      const images = (data.data || []).map((item: any) => ({
        url: item.url,
        prompt: params.prompt,
      }));

      return { images, model: this.modelName, raw: data };
    } catch (err) {
      if (err instanceof AIError) throw err;
      throw new AIError('AI_CALL_FAILED', `Ideogram 调用失败: ${(err as Error).message}`);
    }
  }
}

registerImageFactory('ideogram', (modelName, apiKey, endpointUrl) => {
  return new IdeogramImageAdapter(modelName, apiKey, endpointUrl);
});
