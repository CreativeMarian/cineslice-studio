import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Select } from '../ui';
import { useModelStore } from '../../stores/useModelStore';
import { getModelKey } from '../../types/model';
import { supportsFLF2V, hasPromptSkillForModel } from '../../config/videoModelConfig';
import type { ModelType } from '../../types';

const TYPE_ICONS: Record<ModelType, string> = {
  text: '📝',
  image: '🖼️',
  video: '🎬',
  audio: '🎵',
  vision: '👁️',
};

const TYPE_LABELS: Record<ModelType, string> = {
  text: '文本',
  image: '图片',
  video: '视频',
  audio: '音频',
  vision: '视觉',
};

interface ModelSelectorProps {
  modelType: ModelType;
  value: string;
  onChange: (modelKey: string) => void;
  placeholder?: string;
  showTypeIcon?: boolean;
}

export function ModelSelector({ modelType, value, onChange, placeholder, showTypeIcon = true }: ModelSelectorProps) {
  const { configs, loadConfigs, getDefaultModel } = useModelStore();
  const navigate = useNavigate();

  useEffect(() => {
    if (configs[modelType]?.length === 0) {
      loadConfigs();
    }
  }, [modelType, configs, loadConfigs]);

  // 严格按类型过滤，确保不会混淆
  const configuredModels = useMemo(
    () => configs[modelType]?.filter((m) => m.is_active && m.model_type === modelType) || [],
    [configs, modelType]
  );

  // 如果没有选中值，自动选默认
  useEffect(() => {
    if (!value && configuredModels.length > 0) {
      const defaultModel = getDefaultModel(modelType);
      if (defaultModel) {
        onChange(getModelKey(defaultModel.provider, defaultModel.model_name));
      }
    }
  }, [value, configuredModels, modelType, getDefaultModel, onChange]);

  if (configuredModels.length === 0) {
    return (
      <div className="text-sm text-yellow-500 bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-3 py-2">
        未配置任何{TYPE_LABELS[modelType]}模型，请先
        <button onClick={() => navigate('/models')} className="underline ml-1 text-[var(--accent)] hover:opacity-80">
          配置模型
        </button>
      </div>
    );
  }

  return (
    <Select value={value} onValueChange={onChange} placeholder={placeholder || `选择${TYPE_LABELS[modelType]}生成模型`}>
      {configuredModels.map((model) => {
        const key = getModelKey(model.provider, model.model_name);
        return (
          <Select.Item key={model.id} value={key}>
            <span className="flex items-center gap-1.5 min-w-0 w-full">
              {showTypeIcon && <span className="flex-shrink-0">{TYPE_ICONS[modelType]}</span>}
              <span className="truncate min-w-0 flex-1">{model.provider} / {model.model_name}</span>
              {model.is_default && <span className="text-[var(--accent)] text-xs flex-shrink-0">(默认)</span>}
              {modelType === 'video' && (
                <>
                  {supportsFLF2V(key) && (
                    <span className="text-xs flex-shrink-0" title="支持首尾帧：起止画面双锁定，人物/场景一致性更强，视频更符合预期">
                      🔄
                    </span>
                  )}
                  {hasPromptSkillForModel(model.provider, model.model_name) && (
                    <span className="text-xs flex-shrink-0" title="已内置该模型的官方提示词 Skill：解析剧本后自动按官方提示词规范生成分镜/关键帧/视频提示词，出片质量更稳">
                      🎯
                    </span>
                  )}
                  <span className="text-xs flex-shrink-0" title={model.supports_audio ? '该模型支持生成带音频的视频' : '该模型只生成无声视频'}>
                    {model.supports_audio ? '🔊' : '🔇'}
                  </span>
                </>
              )}
            </span>
          </Select.Item>
        );
      })}
    </Select>
  );
}
