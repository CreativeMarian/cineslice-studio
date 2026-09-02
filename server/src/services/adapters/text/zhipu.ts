// 智谱 GLM 文本适配器
// v1.0 - 支持 GLM-4, GLM-4 Flash 等，OpenAI 兼容接口

import { OpenAICompatibleTextAdapter } from './openai';
import { registerTextFactory } from '../registry';

export class ZhipuTextAdapter extends OpenAICompatibleTextAdapter {
  constructor(modelName: string, apiKey: string, baseUrl?: string) {
    super('zhipu', modelName, apiKey, baseUrl || 'https://open.bigmodel.cn/api/paas/v4');
  }
}

registerTextFactory('zhipu', (modelName, apiKey, endpointUrl) => {
  return new ZhipuTextAdapter(modelName, apiKey, endpointUrl);
});
