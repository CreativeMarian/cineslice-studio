// Edge TTS 音频适配器
// v1.1 - 微软Edge浏览器免费TTS，完全免费，支持400+音色
// 
// ⚠️ 重要：Edge TTS 需要启动本地 Python 服务
// 
// 部署步骤：
// 1. 安装 Python 3.8+
// 2. 安装 edge-tts: pip install edge-tts
// 3. 启动服务: python edge_tts_server.py (脚本在 server/scripts/ 目录)
// 4. 默认服务地址: http://127.0.0.1:5000
//
// 支持的音色（中文）：
// - zh-CN-XiaoxiaoNeural (晓晓，女声，自然)
// - zh-CN-YunxiNeural (云希，男声，沉稳)
// - zh-CN-YunyangNeural (云扬，男声，新闻)
// - zh-CN-XiaoyiNeural (晓伊，女声，活泼)
// - zh-CN-XiaohanNeural (晓涵，女声，温柔)
// - zh-CN-XiaomengNeural (晓梦，女声，甜美)
// 更多音色: edge-tts --list-voices

import type { AudioAdapter, AudioGenerateParams, AudioGenerateResult } from '../base';
import { AIError, httpRequest } from '../base';
import { registerAudioFactory } from '../registry';

export class EdgeTTSAdapter implements AudioAdapter {
  readonly provider = 'edge-tts';
  readonly modelName: string;
  private voice: string;
  private rate: string;
  private pitch: string;
  private baseUrl: string;

  constructor(modelName: string, _apiKey?: string, endpointUrl?: string, config?: string) {
    this.modelName = modelName || 'edge-tts-zh-CN-XiaoxiaoNeural';
    
    // 从模型名中提取音色
    const voiceMatch = this.modelName.match(/edge-tts-(.+)/);
    this.voice = voiceMatch ? voiceMatch[1] : 'zh-CN-XiaoxiaoNeural';
    
    // 从config中解析参数
    this.rate = '+0%';
    this.pitch = '+0Hz';
    if (config) {
      try {
        const cfg = JSON.parse(config);
        if (cfg.voice) this.voice = cfg.voice;
        if (cfg.rate) this.rate = cfg.rate;
        if (cfg.pitch) this.pitch = cfg.pitch;
      } catch {
        // 忽略配置解析错误
      }
    }
    
    // Edge TTS 服务地址（需要本地启动 Python 服务）
    this.baseUrl = (endpointUrl || 'http://127.0.0.1:5000').replace(/\/$/, '');
  }

  async generate(params: AudioGenerateParams): Promise<AudioGenerateResult> {
    const text = params.text || '';
    if (!text) {
      throw new AIError('AI_CALL_FAILED', '文本内容不能为空');
    }

    try {
      // 调用本地 Edge TTS Python 服务
      const response = await httpRequest<Buffer>(`${this.baseUrl}/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: {
          text: text,
          voice: this.voice,
          rate: this.rate,
          pitch: this.pitch,
        },
      });

      // 转换为 base64
      const audioBase64 = Buffer.from(response).toString('base64');
      
      return {
        audioUrl: `data:audio/mpeg;base64,${audioBase64}`,
        durationSeconds: Math.ceil(text.length / 5),
        voice: this.voice,
      };
    } catch (err: any) {
      if (err.code === 'ECONNREFUSED') {
        throw new AIError('AI_CALL_FAILED', 
          '无法连接 Edge TTS 服务。请按以下步骤启动：\n' +
          '1. pip install edge-tts\n' +
          '2. python server/scripts/edge_tts_server.py\n' +
          '3. 服务默认运行在 http://127.0.0.1:5000'
        );
      }
      throw new AIError('AI_CALL_FAILED', `Edge TTS 调用失败: ${err.message}`);
    }
  }

  // 获取支持的音色列表
  static getSupportedVoices(): string[] {
    return [
      'zh-CN-XiaoxiaoNeural',
      'zh-CN-YunxiNeural',
      'zh-CN-YunyangNeural',
      'zh-CN-XiaoyiNeural',
      'zh-CN-XiaohanNeural',
      'zh-CN-XiaomengNeural',
      'zh-CN-XiaomoNeural',
      'zh-CN-XiaoqiuNeural',
      'zh-CN-XiaoruiNeural',
      'zh-CN-XiaoshuangNeural',
      'zh-CN-XiaoxuanNeural',
      'zh-CN-XiaoyanNeural',
      'zh-CN-XiaoyouNeural',
      'zh-CN-XiaozhenNeural',
      'zh-CN-YunfengNeural',
      'zh-CN-YunhaoNeural',
      'zh-CN-YunjianNeural',
      'zh-CN-YunxiaNeural',
      'zh-CN-YunyeNeural',
      'zh-CN-YunzeNeural',
    ];
  }
}

// 注册 Edge TTS 适配器
registerAudioFactory('edge-tts', (modelName, apiKey, endpointUrl, config) => {
  return new EdgeTTSAdapter(modelName, apiKey, endpointUrl, config);
});
