import { useState, useEffect, useMemo } from 'react';
import { Sparkles, ChevronDown, Zap, DollarSign, Star, Check } from 'lucide-react';
import { Select } from '../ui';
import { useModelStore } from '../../stores/useModelStore';
import { getModelKey } from '../../types/model';
import { sortModelsWithDefaultFirst } from '../../utils';
import { modelConfigService } from '../../services/modelConfigService';
import type { ModelType, ModelConfig } from '../../types';

interface ModelRecommendSelectorProps {
  modelType: ModelType;
  value: string;
  onChange: (modelKey: string) => void;
  stage?: string;
}

// 各阶段推荐模型配置（前端兜底，当后端无推荐时使用）
const FALLBACK_RECOMMENDATIONS: Record<string, { provider: string; model: string; reason: string; speed: '快' | '中' | '慢'; cost: '低' | '中' | '高'; quality: number }[]> = {
  text: [
    { provider: 'deepseek', model: 'deepseek-chat', reason: '长文本推理强，剧本创作性价比高', speed: '中', cost: '低', quality: 4 },
    { provider: 'doubao', model: 'doubao-seed-2-1-pro-260628', reason: '中文语感好，国产剧本适配', speed: '中', cost: '中', quality: 4 },
    { provider: 'moonshot', model: 'kimi-k2', reason: '长上下文，适合万字小说分析', speed: '中', cost: '中', quality: 4 },
  ],
  image: [
    { provider: 'doubao', model: 'seedream-4.5-pro', reason: '写实感强，人脸一致性好', speed: '中', cost: '中', quality: 5 },
    { provider: 'dashscope', model: 'wanx-v4', reason: '中文场景理解好，光影自然', speed: '快', cost: '低', quality: 4 },
  ],
  video: [
    { provider: 'doubao', model: 'seedance-1-0-pro-250528', reason: '场景氛围好，光影流动自然', speed: '中', cost: '中', quality: 4 },
    { provider: 'kling', model: 'kling-v2', reason: '人物面部表情自然，一致性好', speed: '中', cost: '中', quality: 5 },
  ],
  audio: [
    { provider: 'doubao', model: 'speech-01', reason: '中文自然，多音色支持', speed: '快', cost: '低', quality: 4 },
  ],
};

export function ModelRecommendSelector({ modelType, value, onChange, stage }: ModelRecommendSelectorProps) {
  const { configs, loadConfigs, getDefaultModel } = useModelStore();
  const [showAll, setShowAll] = useState(false);
  const [backendRecommended, setBackendRecommended] = useState<ModelConfig[]>([]);
  const [loadingRecommend, setLoadingRecommend] = useState(false);

  useEffect(() => {
    if (configs[modelType]?.length === 0) {
      loadConfigs();
    }
  }, [modelType, configs, loadConfigs]);

  // 从后端获取阶段推荐模型
  useEffect(() => {
    if (!stage) return;
    setLoadingRecommend(true);
    modelConfigService.getRecommended(stage)
      .then(res => {
        if (res.success && res.data) {
          setBackendRecommended(res.data as ModelConfig[]);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingRecommend(false));
  }, [stage]);

  const configuredModels = useMemo(() => sortModelsWithDefaultFirst(configs[modelType]?.filter((m) => m.is_active) || []), [configs, modelType]);

  // 自动选默认/推荐
  useEffect(() => {
    if (!value && configuredModels.length > 0) {
      // 优先选后端推荐的第一个
      if (backendRecommended.length > 0) {
        const first = backendRecommended[0];
        onChange(getModelKey(first.provider, first.model_name));
        return;
      }
      const defaultModel = getDefaultModel(modelType);
      if (defaultModel) {
        onChange(getModelKey(defaultModel.provider, defaultModel.model_name));
      }
    }
  }, [value, configuredModels, modelType, getDefaultModel, onChange, backendRecommended]);

  // 后端推荐模型的 key 集合
  const backendRecKeys = useMemo(() =>
    new Set(backendRecommended.map(m => getModelKey(m.provider, m.model_name))),
    [backendRecommended]
  );

  // 前端兜底推荐
  const configuredKeys = new Set(configuredModels.map(m => getModelKey(m.provider, m.model_name)));
  const fallbackRecs = (FALLBACK_RECOMMENDATIONS[modelType] || []).filter(r =>
    configuredKeys.has(getModelKey(r.provider, r.model))
  );

  // 合并推荐：优先后端，后端为空用前端兜底
  const hasBackendRecs = backendRecommended.length > 0;
  const recommendations: any[] = hasBackendRecs
    ? backendRecommended.filter(m => configuredKeys.has(getModelKey(m.provider, m.model_name)))
    : fallbackRecs;

  const speedColor: Record<string, string> = { '快': 'text-green-500', '中': 'text-yellow-500', '慢': 'text-red-500' };
  const costColor: Record<string, string> = { '低': 'text-green-500', '中': 'text-yellow-500', '高': 'text-red-500' };

  if (configuredModels.length === 0) {
    const typeLabel = modelType === 'text' ? '文本' : modelType === 'image' ? '图像' : modelType === 'video' ? '视频' : '音频';
    return (
      <div className="text-sm text-yellow-500 bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-3 py-2">
        请先在模型配置中添加{typeLabel}模型
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* 推荐模型 */}
      {recommendations.length > 0 && !showAll && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-[var(--ink-3)] flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-[var(--accent)]" />
            {stage ? `阶段推荐（${stage}）` : '智能推荐'}
            {loadingRecommend && <span className="text-[10px] text-[var(--ink-3)]">加载中...</span>}
          </p>
          {recommendations.map((rec: any) => {
            const key = hasBackendRecs
              ? getModelKey(rec.provider, rec.model_name)
              : getModelKey(rec.provider, rec.model);
            const isSelected = value === key;
            const reason = hasBackendRecs ? (rec.description || '系统推荐模型') : rec.reason;
            return (
              <button
                key={key}
                onClick={() => onChange(key)}
                className={`w-full text-left p-3 rounded-lg border transition-all ${
                  isSelected
                    ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                    : 'border-[var(--border)] hover:border-[var(--accent)]/50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm font-medium text-[var(--ink-1)]">{rec.provider}</span>
                    <span className="text-xs text-[var(--ink-3)] truncate">
                      {hasBackendRecs ? rec.model_name : rec.model}
                    </span>
                    <span className="text-[9px] bg-[var(--accent)]/20 text-[var(--accent)] px-1.5 py-0.5 rounded flex-shrink-0">
                      推荐
                    </span>
                  </div>
                  {isSelected && <Check className="w-4 h-4 text-[var(--accent)] flex-shrink-0" />}
                </div>
                <p className="text-xs text-[var(--ink-3)] mt-1">{reason}</p>
                {!hasBackendRecs && (
                  <div className="flex items-center gap-3 mt-2 text-[10px]">
                    <span className={`flex items-center gap-1 ${speedColor[rec.speed]}`}>
                      <Zap className="w-3 h-3" /> {rec.speed}
                    </span>
                    <span className={`flex items-center gap-1 ${costColor[rec.cost]}`}>
                      <DollarSign className="w-3 h-3" /> {rec.cost}
                    </span>
                    <span className="flex items-center gap-1 text-[var(--ink-3)]">
                      <Star className="w-3 h-3" /> {rec.quality}/5
                    </span>
                  </div>
                )}
              </button>
            );
          })}
          <button
            onClick={() => setShowAll(true)}
            className="w-full text-center text-xs text-[var(--ink-3)] hover:text-[var(--accent)] py-1 flex items-center justify-center gap-1"
          >
            查看所有模型
            <ChevronDown className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* 所有模型下拉 */}
      {(showAll || recommendations.length === 0) && (
        <div>
          {recommendations.length > 0 && (
            <p className="text-xs font-medium text-[var(--ink-3)] mb-2">所有可用模型</p>
          )}
          <Select value={value} onValueChange={onChange} placeholder="选择模型">
            {configuredModels.map((model) => {
              const key = getModelKey(model.provider, model.model_name);
              const isRecommended = backendRecKeys.has(key);
              return (
                <Select.Item key={model.id} value={key}>
                  {model.provider} / {model.model_name}
                  {model.is_default && ' (默认)'}
                  {isRecommended && ' ⭐推荐'}
                </Select.Item>
              );
            })}
          </Select>
        </div>
      )}
    </div>
  );
}
