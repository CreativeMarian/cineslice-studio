// 讯飞星火文本适配器
// v1.0 - 支持 Spark V4, Spark Lite，OpenAI 兼容接口

import { OpenAICompatibleTextAdapter } from './openai';
import { registerTextFactory } from '../registry';

export class XfyunTextAdapter extends OpenAICompatibleTextAdapter {
  constructor(modelName: string, apiKey: string, baseUrl?: string) {
    super('xfyun', modelName, apiKey, baseUrl || 'https://spark-api-open.xf-yun.com/v1');
  }
}

registerTextFactory('xfyun', (modelName, apiKey, endpointUrl) => {
  return new XfyunTextAdapter(modelName, apiKey, endpointUrl);
});

// 别名：前端用 "spark"，对应后端 xfyun 适配器
registerTextFactory('spark', (modelName, apiKey, endpointUrl) => {
  return new XfyunTextAdapter(modelName, apiKey, endpointUrl);
});
