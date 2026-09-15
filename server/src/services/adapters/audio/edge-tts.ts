// Edge TTS 音频适配器
// v2.0 - 本地 CLI 合成（默认，稳定可靠，无需常驻 Python 服务）
//       - 兼容 HTTP 服务模式（配置 endpointUrl 时优先走 HTTP）
// 
// ⚠️ 需要安装 edge-tts：pip install edge-tts（提供 edge-tts.exe CLI）
// CLI 定位顺序：EDGE_TTS_CLI 环境变量 > 常见 Scripts 路径 > PATH

import { execFile } from 'child_process';
import { promisify } from 'util';
import os from 'os';
import path from 'path';
import fs from 'fs';
import type { AudioAdapter, AudioGenerateParams, AudioGenerateResult } from '../base';
import { AIError, httpBinaryRequest } from '../base';
import { registerAudioFactory } from '../registry';
import { toEdgeTtsVoice } from '../../voiceAssignment';

const execFileAsync = promisify(execFile);

function resolveCli(): string | null {
  const env = process.env.EDGE_TTS_CLI;
  if (env && fs.existsSync(env)) return env;
  // 常见安装位置（python Scripts）
  const candidates = [
    process.env.EDGE_TTS_CLI,
    'edge-tts',
  ];
  for (const c of candidates) {
    if (c) return c; // edge-tts 依赖 PATH 解析
  }
  return null;
}

export class EdgeTTSAdapter implements AudioAdapter {
  readonly provider = 'edge-tts';
  readonly modelName: string;
  private voice: string;
  private rate: string;
  private pitch: string;
  private baseUrl: string | null;
  private cli: string;

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
    
    // HTTP 服务模式（配置了非默认 endpoint 时走 HTTP；默认 endpointUrl 为空 → 本地 CLI）
    this.baseUrl = endpointUrl && endpointUrl.trim() ? endpointUrl.replace(/\/$/, '') : null;
    this.cli = resolveCli() || 'edge-tts';
  }

  private async synthViaCli(text: string, rate: string, voice: string): Promise<Buffer> {
    const outfile = path.join(os.tmpdir(), `edge_tts_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.mp3`);
    const args = ['--text', text, '--voice', voice, '--rate', rate, '--pitch', this.pitch, '--write-media', outfile];
    let lastErr = 'unknown';
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        if (fs.existsSync(outfile)) fs.unlinkSync(outfile);
        await execFileAsync(this.cli, args, { timeout: 120000, windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
        if (fs.existsSync(outfile)) {
          const data = fs.readFileSync(outfile);
          if (data.length > 0) return data;
          lastErr = 'empty audio';
        } else {
          lastErr = 'no output file';
        }
      } catch (e: any) {
        lastErr = e.message || String(e);
      }
      if (attempt < 3) await new Promise(r => setTimeout(r, 2000));
    }
    throw new AIError('AI_CALL_FAILED', `Edge TTS 本地合成失败: ${lastErr}`);
  }

  async generate(params: AudioGenerateParams): Promise<AudioGenerateResult> {
    const text = params.text || '';
    if (!text) {
      throw new AIError('AI_CALL_FAILED', '文本内容不能为空');
    }

    // 按角色分配音色（v1.1）：params.voice 为角色音色档案/动态分配结果。
    // MiniMax 风格音色（zh_male_*/zh_female_*）经映射归一化为 edge-tts 音色；zh-CN-* 直接透传；
    // 未传或无法映射时保持模型默认音色（避免男角色出女声等错位）。
    let effectiveVoice = this.voice;
    if (params.voice) {
      const mapped = toEdgeTtsVoice(params.voice);
      if (mapped) effectiveVoice = mapped;
    }

    // 按目标时长自动计算语速：中文常速约 4.2 字/秒（+0%），
    // 目标 5 秒镜头 → 超过约 21 字的台词自动加速，保证说话不被画面截断
    const targetSec = 5;
    const chars = text.replace(/\s/g, '').length;
    let ratePercent = 0;
    if (chars > 0 && targetSec > 0) {
      const needed = Math.ceil((chars / 4.2) / targetSec * 100); // 需要的语速百分比
      ratePercent = Math.max(0, Math.min(80, Math.round((needed - 100) / 5) * 5)); // clamp 0%~+80%，按5%取整
    }
    const rateStr = `${ratePercent >= 0 ? '+' : ''}${ratePercent}%`;

    try {
      let audioBuffer: Buffer;
      if (this.baseUrl) {
        // HTTP 服务模式
        const response = await httpBinaryRequest(`${this.baseUrl}/tts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: {
            text: text,
            voice: effectiveVoice,
            rate: rateStr,
            pitch: this.pitch,
          },
        });
        audioBuffer = response;
      } else {
        // 本地 CLI 模式（默认）
        audioBuffer = await this.synthViaCli(text, rateStr, effectiveVoice);
      }

      // 转换为 base64
      const audioBase64 = audioBuffer.toString('base64');
      
      return {
        audioUrl: `data:audio/mpeg;base64,${audioBase64}`,
        durationSeconds: Math.ceil(text.length / 5),
        voice: effectiveVoice,
      };
    } catch (err: any) {
      if (err instanceof AIError) throw err;
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
