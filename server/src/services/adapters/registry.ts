// 适配器注册与工厂
// v1.1 - 音频工厂支持 config 参数

import type { TextAdapter, ImageAdapter, VideoAdapter, AudioAdapter } from './base';
import { AIError } from './base';

// 文本适配器工厂
type TextFactory = (modelName: string, apiKey: string, endpointUrl?: string) => TextAdapter;
type ImageFactory = (modelName: string, apiKey: string, endpointUrl?: string) => ImageAdapter;
type VideoFactory = (modelName: string, apiKey: string, endpointUrl?: string) => VideoAdapter;
type AudioFactory = (modelName: string, apiKey: string, endpointUrl?: string, config?: string) => AudioAdapter;

const textFactories = new Map<string, TextFactory>();
const imageFactories = new Map<string, ImageFactory>();
const videoFactories = new Map<string, VideoFactory>();
const audioFactories = new Map<string, AudioFactory>();

export function registerTextFactory(provider: string, factory: TextFactory): void {
  textFactories.set(provider, factory);
}

export function registerImageFactory(provider: string, factory: ImageFactory): void {
  imageFactories.set(provider, factory);
}

export function registerVideoFactory(provider: string, factory: VideoFactory): void {
  videoFactories.set(provider, factory);
}

export function registerAudioFactory(provider: string, factory: AudioFactory): void {
  audioFactories.set(provider, factory);
}

export function getTextAdapter(provider: string, modelName: string, apiKey: string, endpointUrl?: string): TextAdapter {
  const factory = textFactories.get(provider);
  if (!factory) {
    throw new AIError('AI_CALL_FAILED', `不支持的文本模型厂商: ${provider}`);
  }
  return factory(modelName, apiKey, endpointUrl);
}

export function getImageAdapter(provider: string, modelName: string, apiKey: string, endpointUrl?: string): ImageAdapter {
  const factory = imageFactories.get(provider);
  if (!factory) {
    throw new AIError('AI_CALL_FAILED', `不支持的图像模型厂商: ${provider}`);
  }
  return factory(modelName, apiKey, endpointUrl);
}

export function getVideoAdapter(provider: string, modelName: string, apiKey: string, endpointUrl?: string): VideoAdapter {
  const factory = videoFactories.get(provider);
  if (!factory) {
    throw new AIError('AI_CALL_FAILED', `不支持的视频模型厂商: ${provider}`);
  }
  return factory(modelName, apiKey, endpointUrl);
}

export function getAudioAdapter(provider: string, modelName: string, apiKey: string, endpointUrl?: string, config?: string): AudioAdapter {
  const factory = audioFactories.get(provider);
  if (!factory) {
    throw new AIError('AI_CALL_FAILED', `不支持的音频模型厂商: ${provider}`);
  }
  return factory(modelName, apiKey, endpointUrl, config);
}

export function listTextProviders(): string[] {
  return Array.from(textFactories.keys());
}

export function listImageProviders(): string[] {
  return Array.from(imageFactories.keys());
}

// 注意：各适配器的注册在 ./index.ts 中通过静态 import 按序完成，
// 避免本模块与适配器模块循环依赖（require 已移除）。
