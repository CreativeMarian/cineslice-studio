// 模型配置路由
// v2.0 - 扩充模型列表

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { ModelRegistryDAO } from '../models';
import { createError, asyncHandler } from '../middleware/errorHandler';
import { validateBody } from '../middleware/validate';
import { aiProxy } from '../services/aiProxy';
import type { Database, ModelMetadata } from '../types';

const router = Router();

function getDb(req: Request): Database {
  return req.app.locals.db as Database;
}

const modelSchema = z.object({
  provider: z.string(),
  model_name: z.string(),
  model_type: z.enum(['text', 'image', 'video', 'audio']).optional(),
  model_types: z.array(z.enum(['text', 'image', 'video', 'audio'])).optional(),
  api_key: z.string(),
  endpoint_url: z.string().url().optional(),
  is_default: z.boolean().optional(),
  config: z.string().optional(),
  recommended_for: z.array(z.string()).optional(),
  supports_audio: z.boolean().optional(),
});

// 内置模型元数据（全量扩充）
const BUILTIN_MODELS: ModelMetadata[] = [
  // ==================== 文本模型（19个） ====================
  // 豆包
  { provider: 'doubao', modelName: 'doubao-seed-1-6', modelType: 'text', displayName: '豆包 Seed 1.6', description: '豆包最新推理模型，支持256K上下文，剧本创作与复杂推理强', supportsJson: true, supportsReferenceImages: false, maxTokens: 256000, costPer1K: 0.0016 },
  { provider: 'doubao', modelName: 'doubao-1-5-pro-32k', modelType: 'text', displayName: '豆包 1.5 Pro 32K', description: '豆包专业版，32K上下文，综合能力强', supportsJson: true, supportsReferenceImages: false, maxTokens: 32000, costPer1K: 0.0008 },
  { provider: 'doubao', modelName: 'doubao-1-5-lite', modelType: 'text', displayName: '豆包 1.5 Lite', description: '豆包轻量版，速度快成本低', supportsJson: true, supportsReferenceImages: false, maxTokens: 32000, costPer1K: 0.0003 },
  // DeepSeek
  { provider: 'deepseek', modelName: 'deepseek-chat', modelType: 'text', displayName: 'DeepSeek Chat', description: 'DeepSeek 对话模型，推理能力强，性价比高', supportsJson: true, supportsReferenceImages: false, maxTokens: 64000, costPer1K: 0.00028 },
  { provider: 'deepseek', modelName: 'deepseek-reasoner', modelType: 'text', displayName: 'DeepSeek R1', description: 'DeepSeek 推理模型，复杂逻辑与剧本结构分析优异', supportsJson: true, supportsReferenceImages: false, maxTokens: 64000, costPer1K: 0.0014 },
  // 通义千问
  { provider: 'qwen', modelName: 'qwen-max', modelType: 'text', displayName: '通义千问 Max', description: '阿里旗舰模型，中文理解与生成优秀', supportsJson: true, supportsReferenceImages: false, maxTokens: 32000, costPer1K: 0.0012 },
  { provider: 'qwen', modelName: 'qwen-plus', modelType: 'text', displayName: '通义千问 Plus', description: '阿里平衡型模型，性能与成本兼顾', supportsJson: true, supportsReferenceImages: false, maxTokens: 128000, costPer1K: 0.0008 },
  { provider: 'qwen', modelName: 'qwen-turbo', modelType: 'text', displayName: '通义千问 Turbo', description: '阿里快速模型，延迟低适合实时交互', supportsJson: true, supportsReferenceImages: false, maxTokens: 128000, costPer1K: 0.0003 },
  // 智谱
  { provider: 'zhipu', modelName: 'glm-4-plus', modelType: 'text', displayName: 'GLM-4 Plus', description: '智谱增强版模型，长文本与推理能力提升', supportsJson: true, supportsReferenceImages: false, maxTokens: 128000, costPer1K: 0.0015 },
  { provider: 'zhipu', modelName: 'glm-4-flash', modelType: 'text', displayName: 'GLM-4 Flash', description: '智谱免费快速模型，速度极快', supportsJson: true, supportsReferenceImages: false, maxTokens: 128000, costPer1K: 0.0001 },
  // 月之暗面
  { provider: 'moonshot', modelName: 'moonshot-v1-128k', modelType: 'text', displayName: 'Kimi 128K', description: '月之暗面超长上下文模型，支持128K', supportsJson: true, supportsReferenceImages: false, maxTokens: 128000, costPer1K: 0.0048 },
  { provider: 'moonshot', modelName: 'moonshot-v1-32k', modelType: 'text', displayName: 'Kimi 32K', description: '月之暗面长上下文模型，支持32K', supportsJson: true, supportsReferenceImages: false, maxTokens: 32000, costPer1K: 0.0024 },
  // MiniMax
  { provider: 'minimax', modelName: 'abab6.5s-chat', modelType: 'text', displayName: 'MiniMax abab6.5s', description: 'MiniMax 对话模型，角色扮演能力突出', supportsJson: true, supportsReferenceImages: false, maxTokens: 24576, costPer1K: 0.0003 },
  // 讯飞
  { provider: 'xfyun', modelName: 'spark-v4.0', modelType: 'text', displayName: '讯飞星火 V4.0', description: '讯飞星火4.0版本，最新旗舰', supportsJson: true, supportsReferenceImages: false, maxTokens: 8000, costPer1K: 0.0015 },
  { provider: 'xfyun', modelName: 'spark-v3.5', modelType: 'text', displayName: '讯飞星火 V3.5', description: '讯飞星火3.5版本，通用能力强', supportsJson: true, supportsReferenceImages: false, maxTokens: 8000, costPer1K: 0.001 },
  // OpenAI
  { provider: 'openai', modelName: 'gpt-4o', modelType: 'text', displayName: 'GPT-4o', description: 'OpenAI 旗舰多模态模型，强推理与代码能力', supportsJson: true, supportsReferenceImages: true, maxTokens: 128000, costPer1K: 0.005 },
  { provider: 'openai', modelName: 'gpt-4o-mini', modelType: 'text', displayName: 'GPT-4o Mini', description: 'OpenAI 轻量快速模型，成本仅为 GPT-4o 的 1/10', supportsJson: true, supportsReferenceImages: true, maxTokens: 128000, costPer1K: 0.00015 },
  // Anthropic
  { provider: 'anthropic', modelName: 'claude-3-5-sonnet', modelType: 'text', displayName: 'Claude 3.5 Sonnet', description: 'Anthropic 高性能模型，长文本与分析出色', supportsJson: true, supportsReferenceImages: true, maxTokens: 200000, costPer1K: 0.003 },
  // Google
  { provider: 'google', modelName: 'gemini-1.5-pro', modelType: 'text', displayName: 'Gemini 1.5 Pro', description: 'Google 长上下文模型，支持 1M token', supportsJson: true, supportsReferenceImages: true, maxTokens: 1000000, costPer1K: 0.0025 },
  // 硅基流动 - 开源文本模型
  { provider: 'siliconflow', modelName: 'Qwen/Qwen2.5-72B-Instruct', modelType: 'text', displayName: 'Qwen2.5 72B (硅基流动)', description: '通义千问2.5 72B开源模型，硅基流动托管，中文理解优秀', supportsJson: true, supportsReferenceImages: false, maxTokens: 32768, costPer1K: 0.0008 },
  { provider: 'siliconflow', modelName: 'Qwen/Qwen2.5-32B-Instruct', modelType: 'text', displayName: 'Qwen2.5 32B (硅基流动)', description: '通义千问2.5 32B开源模型，硅基流动托管，性价比高', supportsJson: true, supportsReferenceImages: false, maxTokens: 32768, costPer1K: 0.0004 },
  { provider: 'siliconflow', modelName: 'deepseek-ai/DeepSeek-V3', modelType: 'text', displayName: 'DeepSeek V3 (硅基流动)', description: 'DeepSeek V3开源旗舰模型，硅基流动托管，推理能力强', supportsJson: true, supportsReferenceImages: false, maxTokens: 65536, costPer1K: 0.001 },
  { provider: 'siliconflow', modelName: 'deepseek-ai/DeepSeek-R1', modelType: 'text', displayName: 'DeepSeek R1 (硅基流动)', description: 'DeepSeek R1推理模型，硅基流动托管，复杂逻辑分析优异', supportsJson: true, supportsReferenceImages: false, maxTokens: 65536, costPer1K: 0.0014 },
  { provider: 'siliconflow', modelName: 'meta-llama/Meta-Llama-3.1-70B-Instruct', modelType: 'text', displayName: 'Llama 3.1 70B (硅基流动)', description: 'Meta Llama 3.1 70B开源模型，硅基流动托管', supportsJson: true, supportsReferenceImages: false, maxTokens: 131072, costPer1K: 0.0008 },
  { provider: 'siliconflow', modelName: 'mistralai/Mixtral-8x7B-Instruct-v0.1', modelType: 'text', displayName: 'Mixtral 8x7B (硅基流动)', description: 'Mixtral 8x7B MoE开源模型，硅基流动托管，高性价比', supportsJson: true, supportsReferenceImages: false, maxTokens: 32768, costPer1K: 0.0003 },
  { provider: 'siliconflow', modelName: 'google/gemma-2-27b-it', modelType: 'text', displayName: 'Gemma 2 27B (硅基流动)', description: 'Google Gemma 2 27B开源模型，硅基流动托管', supportsJson: true, supportsReferenceImages: false, maxTokens: 32768, costPer1K: 0.0005 },
  { provider: 'ollama', modelName: 'llama3.1', modelType: 'text', displayName: 'Ollama Llama 3.1 (本地免费)', description: '通过Ollama本地部署开源模型，完全免费', supportsJson: true, supportsReferenceImages: false, maxTokens: 131072, costPer1K: 0 },
  { provider: 'ollama', modelName: 'qwen2.5', modelType: 'text', displayName: 'Ollama Qwen 2.5 (本地免费)', description: '通过Ollama本地部署通义千问2.5，完全免费', supportsJson: true, supportsReferenceImages: false, maxTokens: 32768, costPer1K: 0 },

  // ==================== 图像模型（13个） ====================
  // 豆包
  { provider: 'doubao-image', modelName: 'doubao-seedream-4-5', modelType: 'image', displayName: '豆包 Seedream 4.5', description: '字节最新图像生成模型，画质精细风格多样', supportsJson: false, supportsReferenceImages: true, costPerImage: 0.012 },
  { provider: 'doubao-image', modelName: 'doubao-seedream-3-0', modelType: 'image', displayName: '豆包 Seedream 3.0', description: '字节图像生成模型，稳定可靠', supportsJson: false, supportsReferenceImages: true, costPerImage: 0.008 },
  // 通义万相
  { provider: 'qwen-image', modelName: 'wanx-v1', modelType: 'image', displayName: '通义万相 V1', description: '阿里巴巴文生图模型，中文场景理解好', supportsJson: false, supportsReferenceImages: false, costPerImage: 0.015 },
  { provider: 'qwen-image', modelName: 'wanx2.1-t2i', modelType: 'image', displayName: '通义万相 2.1', description: '阿里最新文生图模型，画质与提示词理解提升', supportsJson: false, supportsReferenceImages: false, costPerImage: 0.02 },
  // Wan 2.7 Image Pro（通义千问 / DashScope 万相旗舰版）
  { provider: 'wan', modelName: 'wan2.7-image-pro', modelType: 'image', displayName: 'Wan 2.7 Image Pro', description: '阿里巴巴万相2.7旗舰版，文生图/图生图/图像编辑/多图参考，文字渲染强主体一致性好', supportsJson: false, supportsReferenceImages: true, costPerImage: 0.5 },
  // 智谱
  { provider: 'zhipu-image', modelName: 'cogview-3', modelType: 'image', displayName: 'CogView 3', description: '智谱 AI 文生图模型，画质精细', supportsJson: false, supportsReferenceImages: false, costPerImage: 0.02 },
  { provider: 'zhipu-image', modelName: 'cogview-4', modelType: 'image', displayName: 'CogView 4', description: '智谱最新图像生成模型，细节丰富', supportsJson: false, supportsReferenceImages: false, costPerImage: 0.025 },
  // Stability
  { provider: 'stability', modelName: 'stable-diffusion-xl', modelType: 'image', displayName: 'Stable Diffusion XL', description: 'Stability AI 开源图像模型，可本地部署', supportsJson: false, supportsReferenceImages: true, costPerImage: 0.02 },
  { provider: 'stability', modelName: 'stable-diffusion-3', modelType: 'image', displayName: 'Stable Diffusion 3', description: 'Stability AI 最新图像模型，文字渲染能力强', supportsJson: false, supportsReferenceImages: true, costPerImage: 0.03 },
  // OpenAI
  { provider: 'openai-image', modelName: 'dall-e-3', modelType: 'image', displayName: 'DALL·E 3', description: 'OpenAI 文生图模型，提示词理解能力强', supportsJson: false, supportsReferenceImages: false, costPerImage: 0.04 },
  // Ideogram
  { provider: 'ideogram', modelName: 'ideogram-v2', modelType: 'image', displayName: 'Ideogram V2', description: 'Ideogram 图像模型，文字渲染能力强', supportsJson: false, supportsReferenceImages: false, costPerImage: 0.03 },
  // Recraft
  { provider: 'recraft', modelName: 'recraft-v3', modelType: 'image', displayName: 'Recraft V3', description: 'Recraft 矢量风格图像模型，适合插画', supportsJson: false, supportsReferenceImages: true, costPerImage: 0.02 },
  // FLUX
  { provider: 'flux', modelName: 'flux-1.1-pro', modelType: 'image', displayName: 'FLUX 1.1 Pro', description: 'Black Forest Labs 旗舰图像模型，写实能力强', supportsJson: false, supportsReferenceImages: true, costPerImage: 0.04 },
  // 硅基流动 - 开源图像模型
  { provider: 'siliconflow', modelName: 'black-forest-labs/FLUX.1-schnell', modelType: 'image', displayName: 'FLUX.1 Schnell (硅基流动)', description: 'FLUX.1 Schnell开源快速图像模型，4步出图，硅基流动托管', supportsJson: false, supportsReferenceImages: true, costPerImage: 0.004 },
  { provider: 'siliconflow', modelName: 'black-forest-labs/FLUX.1-dev', modelType: 'image', displayName: 'FLUX.1 Dev (硅基流动)', description: 'FLUX.1 Dev开源图像模型，画质精细，硅基流动托管', supportsJson: false, supportsReferenceImages: true, costPerImage: 0.012 },
  { provider: 'siliconflow', modelName: 'stabilityai/stable-diffusion-xl-base-1.0', modelType: 'image', displayName: 'SDXL 1.0 (硅基流动)', description: 'Stable Diffusion XL 1.0开源图像模型，生态丰富，硅基流动托管', supportsJson: false, supportsReferenceImages: true, costPerImage: 0.004 },
  { provider: 'siliconflow', modelName: 'stabilityai/sdxl-turbo', modelType: 'image', displayName: 'SDXL Turbo (硅基流动)', description: 'SDXL Turbo开源快速图像模型，1-4步出图，硅基流动托管', supportsJson: false, supportsReferenceImages: true, costPerImage: 0.002 },
  { provider: 'siliconflow', modelName: 'Kwai-Kolors/Kolors', modelType: 'image', displayName: 'Kolors (硅基流动)', description: '快手Kolors开源图像模型，中文理解好，硅基流动托管', supportsJson: false, supportsReferenceImages: true, costPerImage: 0.008 },
  { provider: 'siliconflow', modelName: 'ZJ-96/AnimeFlux', modelType: 'image', displayName: 'AnimeFlux (硅基流动)', description: 'AnimeFlux开源动漫风格图像模型，硅基流动托管', supportsJson: false, supportsReferenceImages: true, costPerImage: 0.008 },

  // ==================== 视频模型（15个） ====================
  // 豆包（火山引擎 Seedance）
  { provider: 'doubao', modelName: 'doubao-seedance-1-0-pro-fast-251015', modelType: 'video', displayName: '豆包 Seedance Pro Fast 251015', description: '字节火山引擎最新视频生成模型，高速版，图生视频，支持1080p', supportsJson: false, supportsReferenceImages: true, supportsAudio: true, costPerVideo: 0.15 },
  { provider: 'doubao', modelName: 'doubao-seedance-1-0-pro', modelType: 'video', displayName: '豆包 Seedance Pro', description: '字节火山引擎视频生成模型，高画质', supportsJson: false, supportsReferenceImages: true, supportsAudio: false, costPerVideo: 0.15 },
  { provider: 'doubao', modelName: 'doubao-seedance-1-0-lite', modelType: 'video', displayName: '豆包 Seedance Lite', description: '字节火山引擎轻量视频生成，速度快', supportsJson: false, supportsReferenceImages: true, supportsAudio: false, costPerVideo: 0.08 },
  // 可灵
  { provider: 'kling', modelName: 'kling-v1-5', modelType: 'video', displayName: '可灵 1.5', description: '快手可灵视频模型，中文场景理解强', supportsJson: false, supportsReferenceImages: true, supportsAudio: false, costPerVideo: 0.08 },
  { provider: 'kling', modelName: 'kling-v1-6', modelType: 'video', displayName: '可灵 1.6', description: '快手可灵最新视频模型，运动一致性提升', supportsJson: false, supportsReferenceImages: true, supportsAudio: false, costPerVideo: 0.1 },
  // 即梦
  { provider: 'jimeng', modelName: 'jimeng-v2', modelType: 'video', displayName: '即梦 V2', description: '字节即梦最新视频生成模型', supportsJson: false, supportsReferenceImages: true, supportsAudio: false, costPerVideo: 0.1 },
  { provider: 'jimeng', modelName: 'jimeng-v1', modelType: 'video', displayName: '即梦 V1', description: '字节即梦视频生成模型', supportsJson: false, supportsReferenceImages: true, supportsAudio: false, costPerVideo: 0.08 },
  // 海螺
  { provider: 'hailuo', modelName: 'hailuo-v1', modelType: 'video', displayName: '海螺 V1', description: 'Hailuo AI 视频生成模型', supportsJson: false, supportsReferenceImages: true, supportsAudio: false, costPerVideo: 0.07 },
  { provider: 'hailuo', modelName: 'hailuo-v2', modelType: 'video', displayName: '海螺 V2', description: 'Hailuo AI 最新视频生成模型，画质提升', supportsJson: false, supportsReferenceImages: true, supportsAudio: false, costPerVideo: 0.09 },
  // MiniMax
  { provider: 'minimax', modelName: 'minimax-h3', modelType: 'video', displayName: 'MiniMax H3', description: 'MiniMax 海螺 H3 视频生成模型，高保真运动', supportsJson: false, supportsReferenceImages: true, supportsAudio: false, costPerVideo: 0.08 },
  { provider: 'minimax', modelName: 'minimax-video-01', modelType: 'video', displayName: 'MiniMax Video 01', description: 'MiniMax 视频生成模型', supportsJson: false, supportsReferenceImages: true, supportsAudio: false, costPerVideo: 0.07 },
  // HappyHorse（通义千问 / DashScope）
  { provider: 'happyhorse', modelName: 'happyhorse-1.1-i2v', modelType: 'video', displayName: 'HappyHorse 1.1 I2V', description: '阿里巴巴通义千问视频生成，人物ID保持、动作流畅、音画同步', supportsJson: false, supportsReferenceImages: true, supportsAudio: true, costPerVideo: 0.27 },
  // Agnes AI
  { provider: 'agnes', modelName: 'agnes-video-v2.0', modelType: 'video', displayName: 'Agnes Video V2.0', description: 'Agnes AI 视频生成，文生视频、图生视频、关键帧动画，电影级输出', supportsJson: false, supportsReferenceImages: true, supportsAudio: false, costPerVideo: 0 },
  // Runway
  { provider: 'runway', modelName: 'runway-gen3-alpha', modelType: 'video', displayName: 'Runway Gen3 Alpha', description: 'Runway 旗舰视频生成模型，电影级画质', supportsJson: false, supportsReferenceImages: true, supportsAudio: false, costPerVideo: 0.2 },
  { provider: 'runway', modelName: 'runway-gen3-turbo', modelType: 'video', displayName: 'Runway Gen3 Turbo', description: 'Runway 高速视频生成模型', supportsJson: false, supportsReferenceImages: true, supportsAudio: false, costPerVideo: 0.15 },
  // Pika
  { provider: 'pika', modelName: 'pika-2.0', modelType: 'video', displayName: 'Pika 2.0', description: 'Pika Labs 视频模型，角色一致性好', supportsJson: false, supportsReferenceImages: true, supportsAudio: false, costPerVideo: 0.12 },
  { provider: 'pika', modelName: 'pika-1.0', modelType: 'video', displayName: 'Pika 1.0', description: 'Pika Labs 经典视频生成模型', supportsJson: false, supportsReferenceImages: true, supportsAudio: false, costPerVideo: 0.1 },

  // ==================== 音频模型（8个） ====================
  // 豆包
  { provider: 'doubao', modelName: 'doubao-tts', modelType: 'audio', displayName: '豆包语音 TTS', description: '字节跳动语音合成，中文音色丰富', supportsJson: false, supportsReferenceImages: false, defaultVoice: 'zh_female_qingxin', costPerSecond: 0.0002 },
  // OpenAI
  { provider: 'openai', modelName: 'tts-1', modelType: 'audio', displayName: 'OpenAI TTS', description: 'OpenAI 语音合成，自然流畅', supportsJson: false, supportsReferenceImages: false, defaultVoice: 'alloy', costPerSecond: 0.00015 },
  { provider: 'openai', modelName: 'tts-1-hd', modelType: 'audio', displayName: 'OpenAI TTS HD', description: 'OpenAI 高清语音合成', supportsJson: false, supportsReferenceImages: false, defaultVoice: 'alloy', costPerSecond: 0.0003 },
  // ElevenLabs
  { provider: 'elevenlabs', modelName: 'elevenlabs-v2', modelType: 'audio', displayName: 'ElevenLabs V2', description: 'ElevenLabs 语音合成，多语言音色自然', supportsJson: false, supportsReferenceImages: false, defaultVoice: 'Rachel', costPerSecond: 0.0003 },
  { provider: 'elevenlabs', modelName: 'elevenlabs-multilingual', modelType: 'audio', displayName: 'ElevenLabs Multilingual', description: 'ElevenLabs 多语言语音合成', supportsJson: false, supportsReferenceImages: false, defaultVoice: 'Rachel', costPerSecond: 0.0003 },
  // Azure
  { provider: 'azure', modelName: 'azure-tts', modelType: 'audio', displayName: 'Azure TTS', description: '微软 Azure 语音合成，企业级稳定', supportsJson: false, supportsReferenceImages: false, defaultVoice: 'zh-CN-XiaoxiaoNeural', costPerSecond: 0.0002 },
  // 讯飞
  { provider: 'xfyun', modelName: 'xfyun-tts', modelType: 'audio', displayName: '讯飞语音 TTS', description: '科大讯飞语音合成，中文发音标准', supportsJson: false, supportsReferenceImages: false, defaultVoice: 'xiaoyan', costPerSecond: 0.0002 },
  // 通义
  { provider: 'qwen', modelName: 'qwen-tts', modelType: 'audio', displayName: '通义语音 TTS', description: '阿里巴巴语音合成模型', supportsJson: false, supportsReferenceImages: false, defaultVoice: 'zh_female_qingxin', costPerSecond: 0.0002 },
  // 开源/免费 TTS
  { provider: 'edge-tts', modelName: 'edge-tts-zh-CN-XiaoxiaoNeural', modelType: 'audio', displayName: 'Edge TTS (免费开源)', description: '微软Edge浏览器免费TTS，完全免费无需API Key，支持400+音色', supportsJson: false, supportsReferenceImages: false, defaultVoice: 'zh-CN-XiaoxiaoNeural', costPerSecond: 0 },
];

// 已配置列表（按 type 分组）
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const all = ModelRegistryDAO.listByUser(db, req.user.id);
  const grouped: Record<string, typeof all> = { text: [], image: [], video: [], audio: [] };
  for (const m of all) {
    if (!grouped[m.model_type]) grouped[m.model_type] = [];
    // 不返回 api_key
     
    const { api_key, ...safe } = m as any;
    grouped[m.model_type].push(safe);
  }
  res.json({ success: true, data: grouped });
}));

// 系统支持的所有模型元数据
router.get('/available', (_req: Request, res: Response) => {
  res.json({ success: true, data: BUILTIN_MODELS });
});

// 添加/更新模型配置
router.post('/', validateBody(modelSchema), asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const body = req.body;

  // 自定义模型多选类型处理：为每种类型创建一条记录
  if (body.provider === 'custom-openai' && body.model_types && Array.isArray(body.model_types) && body.model_types.length > 0) {
    // 先删除该用户该 provider/model_name 的所有旧记录（避免重复）
    const allModels = ModelRegistryDAO.listByUser(db, req.user.id);
    for (const m of allModels) {
      if (m.provider === body.provider && m.model_name === body.model_name) {
        ModelRegistryDAO.delete(db, m.id);
      }
    }
    // 为每种类型创建新记录
    const results = [];
    for (const modelType of body.model_types) {
      const model = ModelRegistryDAO.upsert(db, {
        user_id: req.user.id,
        provider: body.provider,
        model_name: body.model_name,
        model_type: modelType,
        api_key: body.api_key,
        endpoint_url: body.endpoint_url,
        config: body.config,
      });
      results.push(model);
    }
     
    const { api_key, ...safe } = results[0] as any;
    res.json({ success: true, data: { ...safe, model_types: body.model_types } });
  } else {
    // 普通模型：单类型
    const model = ModelRegistryDAO.upsert(db, {
      user_id: req.user.id,
      ...body,
    });
     
    const { api_key, ...safe } = model as any;
    res.json({ success: true, data: safe });
  }
}));

// 删除模型配置
router.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const model = ModelRegistryDAO.getById(db, req.params.id);
  if (!model || model.user_id !== req.user.id) throw createError(404, 'NOT_FOUND', '模型配置不存在');
  ModelRegistryDAO.delete(db, req.params.id);
  res.json({ success: true, data: { message: '模型配置已删除' } });
}));

// 测试连接
router.post('/:id/test', asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const model = ModelRegistryDAO.getById(db, req.params.id);
  if (!model || model.user_id !== req.user.id) throw createError(404, 'NOT_FOUND', '模型配置不存在');

  const result = await aiProxy.testConnection({
    db, userId: req.user.id,
    provider: model.provider,
    modelName: model.model_name,
    modelType: model.model_type,
  });

  ModelRegistryDAO.updateTestStatus(db, model.id, result.status);
  res.json({ success: true, data: result });
}));

// 设为默认
router.put('/:id/default', asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const model = ModelRegistryDAO.getById(db, req.params.id);
  if (!model || model.user_id !== req.user.id) throw createError(404, 'NOT_FOUND', '模型配置不存在');
  const updated = ModelRegistryDAO.setDefault(db, model.id);
   
  const { api_key, ...safe } = updated as any;
  res.json({ success: true, data: safe });
}));

// 根据阶段获取推荐模型
router.get('/recommended/:stage', asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const stage = req.params.stage;
  const recommended = ModelRegistryDAO.listRecommendedForStage(db, req.user.id, stage);
  if (recommended.length === 0) {
    const stageTypeMap: Record<string, string> = {
      episodes: 'text', script: 'text', characters: 'text', scenes: 'text',
      shots: 'text', images: 'image', keyframes: 'image', video: 'video', audio: 'audio',
    };
    const modelType = stageTypeMap[stage] || 'text';
    const allActive = ModelRegistryDAO.listByUserAndType(db, req.user.id, modelType);
    const safe = allActive.map(({ api_key: _api_key, ...rest }: any) => rest);
    return res.json({ success: true, data: safe, fallback: true });
  }
  const safe = recommended.map(({ api_key: _api_key, ...rest }: any) => rest);
  res.json({ success: true, data: safe, fallback: false });
}));

// 设置模型的推荐阶段
router.put('/:id/recommended-for', validateBody(z.object({ stages: z.array(z.string()) })), asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const model = ModelRegistryDAO.getById(db, req.params.id);
  if (!model || model.user_id !== req.user.id) throw createError(404, 'NOT_FOUND', '模型配置不存在');
  const updated = ModelRegistryDAO.setRecommendedFor(db, model.id, req.body.stages);
   
  const { api_key, ...safe } = updated as any;
  res.json({ success: true, data: safe });
}));

export default router;
