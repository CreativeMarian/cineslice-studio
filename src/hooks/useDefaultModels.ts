import { useState, useEffect, useCallback } from 'react';
import { preferenceService } from '../services/preferenceService';
import type { ModelType } from '../types';

const STORAGE_KEY = 'moo-default-models';

interface DefaultModels {
  text: string;
  image: string;
  video: string;
  audio: string;
  vision: string;
}

const emptyModels: DefaultModels = { text: '', image: '', video: '', audio: '', vision: '' };

function loadFromStorage(): DefaultModels {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...emptyModels, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return emptyModels;
}

/**
 * 获取用户设置的默认模型
 * 优先从 localStorage 读取，同时从后端同步
 */
export function useDefaultModels() {
  const [models, setModels] = useState<DefaultModels>(loadFromStorage());
  const [isLoading, setIsLoading] = useState(false);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await preferenceService.get();
      if (res.success && res.data) {
        const loaded: DefaultModels = {
          text: res.data.default_text_model || '',
          image: res.data.default_image_model || '',
          video: res.data.default_video_model || '',
          audio: res.data.default_audio_model || '',
          vision: res.data.default_vision_model || '',
        };
        setModels(loaded);
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(loaded));
        } catch { /* ignore */ }
      }
    } catch {
      // 静默失败，使用 localStorage 中的值
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const getDefaultModel = useCallback((type: ModelType): string => {
    return models[type] || '';
  }, [models]);

  return {
    models,
    isLoading,
    refresh,
    getDefaultModel,
    hasTextModel: !!models.text,
    hasImageModel: !!models.image,
    hasVideoModel: !!models.video,
    hasAudioModel: !!models.audio,
  };
}
