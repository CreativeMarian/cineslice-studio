// 字节豆包文本适配器（火山引擎）
// v1.0 - 支持 Doubao-pro, Doubao-lite 等，OpenAI 兼容接口

import { OpenAICompatibleTextAdapter } from './openai';
import { registerTextFactory } from '../registry';

export class DoubaoTextAdapter extends OpenAICompatibleTextAdapter {
  constructor(modelName: string, apiKey: string, baseUrl?: string) {
    super('doubao', modelName, apiKey, baseUrl || 'https://ark.cn-beijing.volces.com/api/v3');
  }
}

registerTextFactory('doubao', (modelName, apiKey, endpointUrl) => {
  return new DoubaoTextAdapter(modelName, apiKey, endpointUrl);
});
