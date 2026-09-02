// 通义万相图像适配器（阿里 DashScope）
// v1.0

import type { ImageAdapter, ImageGenerateParams, ImageGenerateResult } from '../base';
import { AIError, httpRequest } from '../base';
import { registerImageFactory } from '../registry';

export class QwenImageAdapter implements ImageAdapter {
  readonly provider = 'qwen';
  readonly modelName: string;
  private apiKey: string;
  private baseUrl: string;

  constructor(modelName: string, apiKey: string, baseUrl?: string) {
    this.modelName = modelName || 'wanx-v1';
    this.apiKey = apiKey;
    this.baseUrl = (baseUrl || 'https://dashscope.aliyuncs.com').replace(/\/$/, '');
  }

  async generate(params: ImageGenerateParams): Promise<ImageGenerateResult> {
    const size = params.size || '1024*1024';
    const dashScopeSize = size.replace('x', '*');

    const body: Record<string, unknown> = {
      model: this.modelName,
      input: { prompt: params.prompt, negative_prompt: params.negativePrompt || '' },
      parameters: { size: dashScopeSize, n: params.count || 1 },
    };

    try {
      // 异步任务模式：先提交任务
      const taskData = await httpRequest<any>(`${this.baseUrl}/api/v1/services/aigc/text2image/image-synthesis`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.apiKey}`, 'X-DashScope-Async': 'enable' },
        body,
      });

      const taskId = taskData.output?.task_id;
      if (!taskId) {
        throw new AIError('AI_CALL_FAILED', '通义万相未返回任务 ID');
      }

      // 轮询任务结果
      let result: any = null;
      for (let i = 0; i < 60; i++) {
        await new Promise(r => setTimeout(r, 2000));
        result = await httpRequest<any>(`${this.baseUrl}/api/v1/tasks/${taskId}`, {
          method: 'GET',
          headers: { Authorization: `Bearer ${this.apiKey}` },
        });
        const status = result.output?.task_status;
        if (status === 'SUCCEEDED') break;
        if (status === 'FAILED') {
          throw new AIError('AI_CALL_FAILED', `通义万相生成失败: ${result.output?.message || '未知错误'}`);
        }
      }

      const images = (result?.output?.results || []).map((item: any) => ({
        url: item.url,
        prompt: params.prompt,
      }));

      return { images, model: this.modelName, raw: result };
    } catch (err) {
      if (err instanceof AIError) throw err;
      throw new AIError('AI_CALL_FAILED', `通义万相调用失败: ${(err as Error).message}`);
    }
  }
}

registerImageFactory('qwen', (modelName, apiKey, endpointUrl) => {
  return new QwenImageAdapter(modelName, apiKey, endpointUrl);
});
// 向后兼容：保留 qwen-image 别名
registerImageFactory('qwen-image', (modelName, apiKey, endpointUrl) => {
  return new QwenImageAdapter(modelName, apiKey, endpointUrl);
});
