// Black Forest FLUX 图像适配器
// v1.0 - 支持 FLUX.1 [pro/dev]，通过兼容 API

import type { ImageAdapter, ImageGenerateParams, ImageGenerateResult } from '../base';
import { AIError, httpRequest } from '../base';
import { registerImageFactory } from '../registry';

export class FluxImageAdapter implements ImageAdapter {
  readonly provider = 'flux';
  readonly modelName: string;
  private apiKey: string;
  private baseUrl: string;

  constructor(modelName: string, apiKey: string, baseUrl?: string) {
    this.modelName = modelName || 'flux-pro';
    this.apiKey = apiKey;
    // 默认使用 fal.ai 或其他兼容平台，用户可自定义 endpoint
    this.baseUrl = (baseUrl || 'https://api.bfl.ml').replace(/\/$/, '');
  }

  async generate(params: ImageGenerateParams): Promise<ImageGenerateResult> {
    const size = params.size || '1024x1024';
    const [width, height] = size.split('x').map(Number);

    const body: Record<string, unknown> = {
      prompt: params.prompt,
      width,
      height,
      steps: 30,
      guidance: 3.5,
      num_images: params.count || 1,
    };

    if (params.negativePrompt) {
      body.negative_prompt = params.negativePrompt;
    }

    try {
      // 异步任务模式
      const taskData = await httpRequest<any>(`${this.baseUrl}/v1/images`, {
        method: 'POST',
        headers: { 'X-Key': this.apiKey },
        body,
      });

      const taskId = taskData.id;
      if (!taskId) {
        throw new AIError('AI_CALL_FAILED', 'FLUX 未返回任务 ID');
      }

      // 轮询
      let result: any = null;
      for (let i = 0; i < 60; i++) {
        await new Promise(r => setTimeout(r, 2000));
        result = await httpRequest<any>(`${this.baseUrl}/v1/get_result?id=${taskId}`, {
          method: 'GET',
          headers: { 'X-Key': this.apiKey },
        });
        if (result.status === 'Ready' && result.result?.sample) break;
        if (result.status === 'Fail') {
          throw new AIError('AI_CALL_FAILED', `FLUX 生成失败: ${result.error || '未知错误'}`);
        }
      }

      const images = [{ url: result.result.sample, prompt: params.prompt }];
      return { images, model: this.modelName, raw: result };
    } catch (err) {
      if (err instanceof AIError) throw err;
      throw new AIError('AI_CALL_FAILED', `FLUX 调用失败: ${(err as Error).message}`);
    }
  }
}

registerImageFactory('flux', (modelName, apiKey, endpointUrl) => {
  return new FluxImageAdapter(modelName, apiKey, endpointUrl);
});
