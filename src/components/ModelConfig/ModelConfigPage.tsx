import { useEffect, useMemo, useState, useRef } from 'react';
import { Cpu, Type, Image, Video, Volume2, ArrowLeft, Server, CheckCircle2, ExternalLink, Zap, Loader2, Search, X, ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Tabs, LoadingState, EmptyState, Badge, Card, Input } from '../ui';
import { ModelCard } from './ModelCard';
import { CustomModelModal, type CustomModelData } from './CustomModelModal';
import { useModelStore } from '../../stores/useModelStore';
import { getModelsByType, type ModelMeta } from '../../types/model';
import type { ModelType } from '../../types';

const typeConfig: Array<{
  key: ModelType;
  label: string;
  icon: typeof Type;
  desc: string;
}> = [
  { key: 'text', label: '文本模型', icon: Type, desc: '剧本生成、角色提取、分镜创作' },
  { key: 'image', label: '图像模型', icon: Image, desc: '角色概念图、场景图、关键帧' },
  { key: 'video', label: '视频模型', icon: Video, desc: '镜头视频片段生成' },
  { key: 'audio', label: '音频模型', icon: Volume2, desc: '配音、旁白、音效生成' },
];

interface ProviderGroup {
  provider: string;
  providerName: string;
  signupUrl?: string;
  models: ModelMeta[];
}

function groupByProvider(models: ModelMeta[]): ProviderGroup[] {
  const map = new Map<string, ProviderGroup>();
  for (const m of models) {
    if (!map.has(m.provider)) {
      map.set(m.provider, {
        provider: m.provider,
        providerName: m.providerName,
        signupUrl: m.signupUrl,
        models: [],
      });
    }
    map.get(m.provider)!.models.push(m);
  }
  return Array.from(map.values());
}

export function ModelConfigPage() {
  const navigate = useNavigate();
  const { configs, isLoading, loadConfigs, upsertConfig } = useModelStore();
  const [providerKeys, setProviderKeys] = useState<Record<string, { apiKey: string; endpoint: string }>>({});
  const [applyingProvider, setApplyingProvider] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<ModelType>('text');
  const [expandedProviders, setExpandedProviders] = useState<Record<string, boolean>>({});
  const [showCustomModal, setShowCustomModal] = useState(false);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // 初始化展开状态：已配置模型的厂商默认展开
  useEffect(() => {
    if (!isLoading && configs) {
      const initial: Record<string, boolean> = {};
      for (const type of Object.keys(configs) as ModelType[]) {
        const configured = configs[type]?.filter(c => c.is_active) || [];
        for (const c of configured) {
          initial[`${c.provider}-${type}`] = true;
        }
      }
      setExpandedProviders(prev => ({ ...initial, ...prev }));
    }
  }, [isLoading, configs]);

  const toggleProvider = (provider: string, type: ModelType) => {
    const key = `${provider}-${type}`;
    setExpandedProviders(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const expandAll = (type: ModelType) => {
    const groups = groupedByType[type];
    const next: Record<string, boolean> = {};
    for (const g of groups) {
      next[`${g.provider}-${type}`] = true;
    }
    setExpandedProviders(prev => ({ ...prev, ...next }));
  };

  const collapseAll = (type: ModelType) => {
    const groups = groupedByType[type];
    const next: Record<string, boolean> = {};
    for (const g of groups) {
      next[`${g.provider}-${type}`] = false;
    }
    setExpandedProviders(prev => ({ ...prev, ...next }));
  };

  const isProviderExpanded = (provider: string, type: ModelType) => {
    return expandedProviders[`${provider}-${type}`] ?? true; // 默认展开
  };

  useEffect(() => {
    loadConfigs();
  }, [loadConfigs]);

  const handleApplyToProvider = async (group: ProviderGroup, type: ModelType) => {
    const key = `${group.provider}-${type}`;
    const { apiKey, endpoint } = providerKeys[key] || { apiKey: '', endpoint: '' };
    if (!apiKey.trim()) return;

    setApplyingProvider(group.provider);
    try {
      for (const meta of group.models) {
        await upsertConfig({
          provider: meta.provider,
          model_name: meta.modelName,
          model_type: meta.modelType,
          api_key: apiKey.trim(),
          endpoint_url: endpoint.trim() || undefined,
          is_default: false,
        });
      }
      await loadConfigs();
    } finally {
      setApplyingProvider(null);
    }
  };

  const handleSaveCustomModel = async (model: CustomModelData) => {
    // 为每个选择的模型类型创建一个配置记录
    for (const type of model.model_types) {
      await upsertConfig({
        provider: model.provider,
        model_name: model.model_name,
        model_type: type,
        api_key: model.api_key,
        endpoint_url: model.endpoint_url,
        is_default: false,
        config: model.config || '{}',
      });
    }
    await loadConfigs();
    // 切换到第一个选择的类型标签
    if (model.model_types.length > 0) {
      setActiveTab(model.model_types[0]);
    }
  };

  const allModels = useMemo(() => {
    return typeConfig.flatMap(({ key }) => getModelsByType(key).map((m) => ({ ...m, _type: key })));
  }, []);

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return allModels.filter((m) =>
      m.displayName.toLowerCase().includes(q) ||
      m.modelName.toLowerCase().includes(q) ||
      m.providerName.toLowerCase().includes(q) ||
      m.description.toLowerCase().includes(q) ||
      (m.scenarios && m.scenarios.some((s) => s.toLowerCase().includes(q)))
    ).slice(0, 20);
  }, [searchQuery, allModels]);

  const scrollToModel = (provider: string, modelName: string, type: ModelType) => {
    setActiveTab(type);
    setSearchQuery('');
    setTimeout(() => {
      const key = `${provider}-${modelName}-${type}`;
      const el = cardRefs.current[key];
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.style.outline = '2px solid var(--accent)';
        el.style.outlineOffset = '4px';
        setTimeout(() => { el.style.outline = ''; el.style.outlineOffset = ''; }, 2000);
      }
    }, 100);
  };

  const getConfigForModel = (provider: string, modelName: string, type: ModelType) => {
    return configs[type]?.find((c) => c.provider === provider && c.model_name === modelName);
  };

  const totalConfigured = Object.values(configs).flat().filter((c) => c.is_active).length;

  // 直接计算（React Compiler 无法保留此处的手动 memoization，交由编译器自动优化）
  const groupedByType: Record<string, ProviderGroup[]> = {};
  for (const { key } of typeConfig) {
    // 获取预定义模型，将Ollama本地模型归为自定义模型分组
    const predefinedModels = getModelsByType(key).map((m) => {
      if (m.provider === 'ollama') {
        return { ...m, provider: 'custom-openai', providerName: '自定义模型' };
      }
      return m;
    });
    // 获取用户添加的自定义模型（provider为custom-openai）
    const customModels = (configs[key] || [])
      .filter((c) => c.provider === 'custom-openai')
      .map((c) => ({
        provider: c.provider,
        providerName: '自定义模型',
        modelName: c.model_name,
        displayName: c.model_name,
        modelType: c.model_type as ModelType,
        description: '用户自定义的 OpenAI 兼容模型',
        signupUrl: undefined,
        scenarios: [],
        supports: {
          customEndpoint: true,
        },
      } as ModelMeta));
    // 合并预定义模型和自定义模型
    const allModels = [...predefinedModels, ...customModels];
    groupedByType[key] = groupByProvider(allModels);
  }

  return (
    <>
    <div className="min-h-screen bg-[var(--page)]">
      <header className="border-b border-[var(--border)] bg-[var(--bg)]/80 backdrop-blur-xl sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center gap-4">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-lg hover:bg-[var(--panel-2)] text-[var(--ink-3)] hover:text-[var(--ink-1)] transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] flex items-center justify-center shadow-[0_4px_16px_rgba(249,115,22,0.3)]">
              <Cpu className="w-5 h-5 text-[var(--on-accent)]" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-[var(--ink-1)] font-[var(--font-display)]">模型配置</h1>
              <p className="text-xs text-[var(--ink-3)]">按厂商归类管理 AI 模型 API Key</p>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-3 flex-1 max-w-md">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--ink-3)]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索模型、厂商、场景..."
                className="w-full pl-9 pr-8 py-2 rounded-lg bg-[var(--panel-2)] border border-[var(--border)] text-sm text-[var(--ink-1)] placeholder:text-[var(--ink-3)] focus:outline-none focus:border-[var(--accent)] transition-colors"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--ink-3)] hover:text-[var(--ink-1)]">
                  <X className="w-4 h-4" />
                </button>
              )}
              {/* 搜索结果下拉 */}
              {searchQuery && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-[var(--bg)] border border-[var(--border)] rounded-xl shadow-[var(--shadow-float)] max-h-96 overflow-y-auto z-50">
                  {searchResults.length === 0 ? (
                    <div className="p-4 text-center text-sm text-[var(--ink-3)]">未找到匹配的模型</div>
                  ) : (
                    searchResults.map((m) => (
                      <button
                        key={`${m.provider}-${m.modelName}-${m._type}`}
                        onClick={() => scrollToModel(m.provider, m.modelName, m._type as ModelType)}
                        className="w-full text-left px-4 py-3 hover:bg-[var(--panel-2)] transition-colors border-b border-[var(--border)] last:border-0 flex items-center gap-3"
                      >
                        <div className="w-8 h-8 rounded-lg bg-[var(--panel-2)] flex items-center justify-center text-xs font-bold text-[var(--ink-2)] flex-shrink-0">
                          {m.providerName.slice(0, 2)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-[var(--ink-1)]">{m.displayName}</div>
                          <div className="text-xs text-[var(--ink-3)] truncate">{m.providerName} · {m.description}</div>
                          {m.scenarios && m.scenarios.length > 0 && (
                            <div className="flex gap-1 mt-1">
                              {m.scenarios.slice(0, 2).map((s) => (
                                <span key={s} className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--accent-soft)] text-[var(--accent)]">{s}</span>
                              ))}
                            </div>
                          )}
                        </div>
                        <span className="text-[10px] text-[var(--ink-3)] bg-[var(--panel-2)] px-2 py-0.5 rounded-full flex-shrink-0">
                          {m._type === 'text' ? '文本' : m._type === 'image' ? '图像' : m._type === 'video' ? '视频' : '音频'}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
            <button
              onClick={() => setShowCustomModal(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-[var(--accent)] to-[var(--accent-2)] text-[var(--on-accent)] text-sm font-medium hover:brightness-110 active:brightness-95 transition-all shadow-[0_2px_8px_rgba(249,115,22,0.3)] hover:shadow-[0_4px_16px_rgba(249,115,22,0.4)] hover:-translate-y-0.5 flex-shrink-0"
            >
              <Plus className="w-4 h-4" />
              自定义
            </button>
            <Badge variant="accent" className="text-sm px-3 py-1 flex-shrink-0">
              <CheckCircle2 className="w-3.5 h-3.5" />
              已配置 {totalConfigured}
            </Badge>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-6">
        {isLoading ? (
          <LoadingState message="加载模型配置..." />
        ) : (
          <Tabs defaultValue="text" value={activeTab} onValueChange={(v) => setActiveTab(v as ModelType)}>
            <Tabs.List>
              {typeConfig.map(({ key, label, icon: Icon }) => (
                <Tabs.Trigger key={key} value={key}>
                  <Icon className="w-4 h-4 mr-2" />
                  {label}
                  <span className="ml-2 text-xs text-[var(--ink-3)] bg-[var(--panel-2)] px-1.5 py-0.5 rounded-full">
                    {configs[key]?.filter((c) => c.is_active).length || 0}
                  </span>
                </Tabs.Trigger>
              ))}
            </Tabs.List>

            {typeConfig.map(({ key, desc }) => {
              const groups = groupedByType[key];
              const allModels = groups.flatMap((g) => g.models);
              const configuredCount = configs[key]?.filter((c) => c.is_active).length || 0;
              return (
                <Tabs.Content key={key} value={key}>
                  <Card className="p-4 mb-6 flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-[var(--accent-soft)] flex items-center justify-center flex-shrink-0">
                      <Server className="w-5 h-5 text-[var(--accent)]" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-[var(--ink-1)] font-medium">{desc}</p>
                      <p className="text-xs text-[var(--ink-3)]">
                        {groups.length} 家厂商 · {allModels.length} 个模型 · 已配置 {configuredCount}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => expandAll(key)}
                        className="p-1.5 rounded-lg hover:bg-[var(--panel-2)] text-[var(--ink-3)] hover:text-[var(--ink-1)] transition-colors"
                        title="全部展开"
                      >
                        <ChevronsUpDown className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => collapseAll(key)}
                        className="p-1.5 rounded-lg hover:bg-[var(--panel-2)] text-[var(--ink-3)] hover:text-[var(--ink-1)] transition-colors"
                        title="全部收起"
                      >
                        <ChevronsDownUp className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="w-32 h-2 rounded-full bg-[var(--panel-2)] overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-[var(--accent)] to-[var(--accent-2)] rounded-full transition-all duration-500"
                        style={{ width: `${allModels.length ? (configuredCount / allModels.length) * 100 : 0}%` }}
                      />
                    </div>
                  </Card>

                  {allModels.length === 0 ? (
                    <EmptyState title="暂无可用模型" description="该类型暂未支持模型" />
                  ) : (
                    <div className="space-y-8">
                      {groups.map((group) => {
                        const expanded = isProviderExpanded(group.provider, key);
                        const groupConfiguredCount = group.models.filter(m => 
                          configs[key]?.some(c => c.provider === m.provider && c.model_name === m.modelName && c.is_active)
                        ).length;
                        return (
                        <section key={group.provider} className="border border-[var(--border)] rounded-xl overflow-hidden bg-[var(--bg)]/50">
                          <button
                            onClick={() => toggleProvider(group.provider, key)}
                            className="w-full flex items-center justify-between p-3 hover:bg-[var(--panel-2)]/50 transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              {expanded ? (
                                <ChevronDown className="w-4 h-4 text-[var(--ink-3)]" />
                              ) : (
                                <ChevronRight className="w-4 h-4 text-[var(--ink-3)]" />
                              )}
                              <div className="w-8 h-8 rounded-lg bg-[var(--panel-2)] flex items-center justify-center text-xs font-bold text-[var(--ink-2)] border border-[var(--border)]">
                                {group.providerName.slice(0, 2)}
                              </div>
                              <h3 className="text-sm font-semibold text-[var(--ink-1)] font-[var(--font-display)]">
                                {group.providerName}
                              </h3>
                              <span className="text-xs text-[var(--ink-3)] bg-[var(--panel-2)] px-2 py-0.5 rounded-full">
                                {group.models.length} 个模型
                              </span>
                              {groupConfiguredCount > 0 && (
                                <span className="text-xs text-green-600 bg-green-50 dark:bg-green-900/20 px-2 py-0.5 rounded-full flex items-center gap-1">
                                  <CheckCircle2 className="w-3 h-3" />
                                  已配置 {groupConfiguredCount}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-3">
                              {group.signupUrl && (
                                <a
                                  href={group.signupUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="text-xs text-[var(--accent)] hover:underline inline-flex items-center gap-1 transition-opacity hover:opacity-80"
                                >
                                  <ExternalLink className="w-3 h-3" />
                                  获取 API Key
                                </a>
                              )}
                            </div>
                          </button>

                          {expanded && (
                            <div className="p-4 pt-0 border-t border-[var(--border)]">
                              {/* 厂商级统一 API Key 配置 */}
                              <div className="mb-4 p-3 rounded-xl bg-[var(--panel-1)] border border-[var(--border)]">
                                <div className="flex items-center gap-2 mb-2">
                                  <Zap className="w-3.5 h-3.5 text-[var(--accent)]" />
                                  <span className="text-xs font-medium text-[var(--ink-2)]">统一配置 API Key（应用到该厂商全部 {group.models.length} 个模型）</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Input
                                    type="password"
                                    placeholder={`输入 ${group.providerName} API Key`}
                                    value={providerKeys[`${group.provider}-${key}`]?.apiKey || ''}
                                    onChange={(e) => setProviderKeys((prev) => ({
                                      ...prev,
                                      [`${group.provider}-${key}`]: { ...(prev[`${group.provider}-${key}`] || { endpoint: '' }), apiKey: e.target.value },
                                    }))}
                                    className="flex-1"
                                  />
                                  {group.models[0]?.supports.customEndpoint && (
                                    <Input
                                      type="text"
                                      placeholder="Endpoint（可选）"
                                      value={providerKeys[`${group.provider}-${key}`]?.endpoint || ''}
                                      onChange={(e) => setProviderKeys((prev) => ({
                                        ...prev,
                                        [`${group.provider}-${key}`]: { ...(prev[`${group.provider}-${key}`] || { apiKey: '' }), endpoint: e.target.value },
                                      }))}
                                      className="w-48"
                                    />
                                  )}
                                  <button
                                    onClick={() => handleApplyToProvider(group, key)}
                                    disabled={applyingProvider === group.provider || !providerKeys[`${group.provider}-${key}`]?.apiKey.trim()}
                                    className="px-4 py-2 rounded-lg bg-[var(--accent)] text-[var(--on-accent)] text-xs font-medium hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity flex items-center gap-1.5 flex-shrink-0"
                                  >
                                    {applyingProvider === group.provider ? (
                                      <><Loader2 className="w-3.5 h-3.5 animate-spin" /> 应用中...</>
                                    ) : (
                                      <>应用到全部</>
                                    )}
                                  </button>
                                </div>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {group.models.map((meta) => (
                                  <div
                                    key={`${meta.provider}-${meta.modelName}-${key}`}
                                    ref={(el) => { cardRefs.current[`${meta.provider}-${meta.modelName}-${key}`] = el; }}
                                  >
                                    <ModelCard
                                      meta={meta}
                                      config={getConfigForModel(meta.provider, meta.modelName, key)}
                                    />
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </section>
                        );
                      })}
                    </div>
                  )}
                </Tabs.Content>
              );
            })}
          </Tabs>
        )}
      </main>
    </div>
    <CustomModelModal
      isOpen={showCustomModal}
      onClose={() => setShowCustomModal(false)}
      onSave={handleSaveCustomModel}
      defaultType={activeTab}
    />
    </>
  );
}
