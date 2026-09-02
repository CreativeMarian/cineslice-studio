// 字节豆包图像适配器（火山引擎）
// v1.0

import type { ImageAdapter, ImageGenerateParams, ImageGenerateResult } from '../base';
import { AIError, httpRequest } from '../base';
import { registerImageFactory } from '../registry';

export class DoubaoImageAdapter implements ImageAdapter {
  readonly provider = 'doubao';
  readonly modelName: string;
  private apiKey: string;
  private baseUrl: string;

  constructor(modelName: string, apiKey: string, baseUrl?: string) {
    this.modelName = modelName || 'doubao-image-generation';
    this.apiKey = apiKey;
    this.baseUrl = (baseUrl || 'https://ark.cn-beijing.volces.com/api/v3').replace(/\/$/, '');
  }

  async generate(params: ImageGenerateParams): Promise<ImageGenerateResult> {
    const body: Record<string, unknown> = {
      model: this.modelName,
      prompt: params.prompt,
      size: params.size || '2048x2048',
      n: params.count || 1,
      response_format: 'url',
    };

    if (params.negativePrompt) {
      body.negative_prompt = params.negativePrompt;
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
      throw new AIError('AI_CALL_FAILED', `豆包图片生成调用失败: ${(err as Error).message}`);
    }
  }
}

registerImageFactory('doubao-image', (modelName, apiKey, endpointUrl) => {
  return new DoubaoImageAdapter(modelName, apiKey, endpointUrl);
});
// 兼容旧版 provider 名
registerImageFactory('doubao', (modelName, apiKey, endpointUrl) => {
  return new DoubaoImageAdapter(modelName, apiKey, endpointUrl);
});
