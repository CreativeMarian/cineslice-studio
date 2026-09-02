// Ollama 文本适配器
// v1.0 - 本地部署开源大模型，完全免费，OpenAI兼容接口
// 官方文档: https://github.com/ollama/ollama/blob/main/docs/openai.md
// 安装: curl -fsSL https://ollama.com/install.sh | sh (Linux/Mac)
//       下载 Windows 安装包: https://ollama.com/download/windows
// 拉取模型: ollama pull llama3.1 / ollama pull qwen2.5
// 启动服务: ollama serve (默认 http://localhost:11434)

import { OpenAICompatibleTextAdapter } from './openai';
import { registerTextFactory } from '../registry';

export class OllamaTextAdapter extends OpenAICompatibleTextAdapter {
  constructor(modelName: string, apiKey: string, baseUrl?: string) {
    // Ollama 默认不需要 API Key，但为了兼容接口，传入任意值即可
    // 默认端点: http://localhost:11434/v1
    super('ollama', modelName, apiKey || 'ollama', baseUrl || 'http://localhost:11434/v1');
  }
}

// 注册 Ollama 适配器
registerTextFactory('ollama', (modelName, apiKey, endpointUrl) => {
  return new OllamaTextAdapter(modelName, apiKey, endpointUrl);
});
