import { useState } from 'react';
import { Eye, EyeOff, Trash2, Zap, Star, AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';
import { Button, Input, Badge, Modal } from '../ui';
import { useModelStore } from '../../stores/useModelStore';
import { useUIStore } from '../../stores/useUIStore';
import type { ModelConfig } from '../../types';
import type { ModelMeta } from '../../types/model';

interface ModelCardProps {
  meta: ModelMeta;
  config?: ModelConfig;
  /** 默认展开（如搜索定位到该卡片时由外部传入） */
  defaultExpanded?: boolean;
}

const TYPE_ICONS: Record<string, string> = {
  text: '📝',
  image: '🖼️',
  video: '🎬',
  audio: '🎵',
};

export function ModelCard({ meta, config, defaultExpanded = false }: ModelCardProps) {
  const { upsertConfig, deleteConfig, testConfig, setDefault, configs } = useModelStore();
  const { showToast } = useUIStore();

  const [expanded, setExpanded] = useState(defaultExpanded);
  const [apiKey, setApiKey] = useState(config?.api_key || '');
  const [endpoint, setEndpoint] = useState(config?.endpoint_url || '');
  const [configJson, setConfigJson] = useState(() => {
    if (config?.config && typeof config.config === 'object') {
      return JSON.stringify(config.config, null, 2);
    }
    return '';
  });
  const [endpointId, setEndpointId] = useState(() => {
    if (config?.config && typeof config.config === 'object') {
      return (config.config as Record<string, unknown>).modelOverride as string || '';
    }
    return '';
  });
  const [configError, setConfigError] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);
  const [confirmSwitch, setConfirmSwitch] = useState(false);

  const isConfigured = !!config?.is_active;
  const testStatus = config?.last_test_status;
  const requiresEndpointId = meta.requiresEndpointId || meta.provider === 'doubao' || meta.provider === 'doubao-image';
  const requiresAppId = meta.requiresAppId || (meta.provider === 'doubao' && meta.modelType === 'audio');
  const supportsAudio = meta.supports?.audio === true;

  const handleSave = async () => {
    // 校验 JSON 配置
    let mergedConfig = configJson.trim();

    // 火山方舟接入点 ID 合并到 config JSON
    if (requiresEndpointId && endpointId.trim()) {
      try {
        const parsed = mergedConfig ? JSON.parse(mergedConfig) : {};
        parsed.modelOverride = endpointId.trim();
        mergedConfig = JSON.stringify(parsed);
      } catch {
        setConfigError('高级配置 JSON 格式错误，请检查语法');
        return;
      }
    }

    if (mergedConfig) {
      try {
        JSON.parse(mergedConfig);
      } catch {
        setConfigError('高级配置 JSON 格式错误，请检查语法');
        return;
      }
    }
    setConfigError('');

    // API Key 校验：未配置时必须填写，已配置时留空则使用原有值
    const finalApiKey = apiKey.trim() || config?.api_key || '';
    if (!finalApiKey) {
      showToast('请输入 API Key', 'error');
      return;
    }

    try {
      await upsertConfig({
        provider: meta.provider,
        model_name: meta.modelName,
        model_type: meta.modelType,
        api_key: finalApiKey,
        endpoint_url: endpoint.trim() || undefined,
        config: mergedConfig || undefined,
        supports_audio: supportsAudio,
      });
      showToast('配置已保存', 'success');
    } catch (err: any) {
      showToast(`保存失败: ${err.message}`, 'error');
    }
  };

  const handleTest = async () => {
    if (!config?.id) {
      showToast('请先保存配置后再测试', 'error');
      return;
    }
    setIsTesting(true);
    setTestResult(null);
    try {
      const result = await testConfig(config.id);
      if (result && result.status === 'success') {
        setTestResult('success');
        showToast(`连接成功 (${result.latencyMs}ms)`, 'success');
      } else {
        setTestResult('error');
        const errorMsg = result?.error || '连接失败';
        showToast(errorMsg, 'error');
      }
    } catch (err: any) {
      setTestResult('error');
      showToast(`测试失败: ${err.message}`, 'error');
    } finally {
      setIsTesting(false);
    }
  };

  const handleDelete = async () => {
    if (!config?.id) return;
    try {
      await deleteConfig(config.id);
      showToast('配置已删除', 'success');
    } catch (err: any) {
      showToast(`删除失败: ${err.message}`, 'error');
    }
  };

  const handleSetDefault = async () => {
    if (!config?.id) return;
    // 真实切换判断：已存在当前默认且目标不同 → 弹风险确认
    const currentDefault = configs[meta.modelType]?.find((c) => c.is_default);
    const isRealSwitch = currentDefault && currentDefault.id !== config.id;
    if (isRealSwitch) {
      setConfirmSwitch(true);
      return;
    }
    await doSetDefault();
  };

  const doSetDefault = async () => {
    if (!config?.id) return;
    try {
      await setDefault(config.id);
      setConfirmSwitch(false);
      showToast('已设为默认模型', 'success');
    } catch (err: any) {
      setConfirmSwitch(false);
      showToast(`设置失败: ${err.message}`, 'error');
    }
  };

  const typeLabel = meta.modelType === 'video' ? '视频生成' : meta.modelType === 'text' ? '文本' : meta.modelType === 'image' ? '图像' : meta.modelType === 'audio' ? '音频' : '视觉';

  return (
    <>
    <div className={`border border-[var(--border)] rounded-lg bg-[var(--card-bg)] transition-colors overflow-hidden ${expanded ? 'border-[var(--accent)]' : 'hover:border-[var(--accent)]'}`}>
      {/* 可点击头部：点击展开/收起配置区 */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left hover:bg-[var(--panel-2)]/40 transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="text-xl flex-shrink-0">{TYPE_ICONS[meta.modelType]}</span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 min-w-0">
              <h3 className="font-semibold text-[var(--ink-1)] truncate">{meta.displayName}</h3>
              {config?.is_default && (
                <Badge variant="warning" dot className="flex-shrink-0">默认</Badge>
              )}
            </div>
            <p className="text-xs text-[var(--ink-3)] truncate font-mono">{meta.modelName}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {testStatus === 'success' ? (
            <Badge variant="success" dot>已连接</Badge>
          ) : testStatus === 'failed' ? (
            <Badge variant="danger" dot>连接失败</Badge>
          ) : isConfigured ? (
            <Badge variant="warning" dot>已配置</Badge>
          ) : (
            <Badge variant="default" dot>未配置</Badge>
          )}
          <span className="text-[var(--ink-3)]">
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </span>
        </div>
      </button>

      {/* 配置区：点击头部展开后显示 */}
      {expanded && (
        <div className="px-4 pb-4 pt-1 border-t border-[var(--border)]">
          {/* 描述 */}
          <p className="text-sm text-[var(--ink-3)] mt-3">{meta.description}</p>

          {/* 费用预估 */}
          {meta.costEstimate && (
            <div className="mt-3 p-2 bg-[var(--bg)] rounded-md border border-[var(--border)]">
              <div className="text-xs font-medium text-[var(--ink-2)] mb-1">💰 费用参考</div>
              <div className="flex flex-wrap gap-2 text-xs text-[var(--ink-3)]">
                {meta.costEstimate.per1kTokens && (
                  <span>文本: ¥{meta.costEstimate.per1kTokens.toFixed(4)}/千token</span>
                )}
                {meta.costEstimate.perImage && (
                  <span>图片: ¥{meta.costEstimate.perImage.toFixed(3)}/张</span>
                )}
                {meta.costEstimate.perVideo && (
                  <span>视频: ¥{meta.costEstimate.perVideo.toFixed(2)}/条</span>
                )}
                {meta.costEstimate.perSecond && (
                  <span>音频: ¥{meta.costEstimate.perSecond.toFixed(4)}/秒</span>
                )}
              </div>
            </div>
          )}

          {/* 配置提示 */}
          {meta.configHint && (
            <div className="mt-3 p-2 bg-blue-50 dark:bg-blue-900/20 rounded-md border border-blue-200 dark:border-blue-800">
              <div className="text-xs text-blue-700 dark:text-blue-300">💡 {meta.configHint}</div>
            </div>
          )}

          {/* 音频支持标记 */}
          {supportsAudio && (
            <div className="mt-3">
              <Badge variant="info">🔊 支持视频自带音频生成</Badge>
            </div>
          )}

          {/* API Key */}
          <div className="mt-3">
            <label className="block text-sm font-medium text-[var(--ink-2)] mb-1">API Key</label>
            <div className="relative">
              <Input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={isConfigured && !apiKey ? '已配置 API Key，留空则不修改' : '输入 API Key'}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--ink-3)] hover:text-[var(--ink)]"
              >
                {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* 火山方舟接入点 ID */}
          {requiresEndpointId && (
            <div className="mt-3">
              <label className="block text-sm font-medium text-[var(--ink-2)] mb-1">
                <span className="text-[var(--accent)]">⚡</span> 接入点 ID（Endpoint ID）
                <span className="text-[var(--ink-3)] ml-1">· OpenAI 兼容路由模式</span>
              </label>
              <Input
                type="text"
                value={endpointId}
                onChange={(e) => setEndpointId(e.target.value)}
                placeholder="ep-xxxxxxxxxx-xxxxx（智能路由模型可填模型名）"
              />
              <p className="text-xs text-[var(--ink-3)] mt-1">
                在 <a href="https://console.volcengine.com/ark" target="_blank" rel="noopener noreferrer" className="underline hover:text-[var(--accent)]">火山方舟控制台</a> 创建接入点后，将 ID 填入此处。系统自动以 JSON 格式通过 OpenAI 兼容路由调用。智能路由模型可直接填模型名（如 doubao-seedream-5-0-pro-260628）。
              </p>
            </div>
          )}

          {/* 高级选项 */}
          <div className="mt-3">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="text-sm text-[var(--accent)] hover:underline flex items-center gap-1"
            >
              {showAdvanced ? '收起高级选项' : '展开高级选项'}
            </button>

            {showAdvanced && (
              <div className="mt-3 space-y-3">
                {/* 自定义 Endpoint */}
                {meta.supports?.customEndpoint && (
                  <div>
                    <label className="block text-sm font-medium text-[var(--ink-2)] mb-1">自定义 Endpoint URL</label>
                    <Input
                      type="text"
                      value={endpoint}
                      onChange={(e) => setEndpoint(e.target.value)}
                      placeholder="自定义 Endpoint URL（可选）"
                    />
                  </div>
                )}

                {/* 高级配置 JSON */}
                <div>
                  <label className="block text-sm font-medium text-[var(--ink-2)] mb-1">
                    高级配置（JSON）
                    {requiresEndpointId && <span className="text-[var(--ink-3)] ml-1">· 接入点 ID 等特殊参数</span>}
                    {requiresAppId && <span className="text-[var(--ink-3)] ml-1">· AppID 等特殊参数</span>}
                    {!requiresEndpointId && !requiresAppId && <span className="text-[var(--ink-3)] ml-1">· 可选高级参数</span>}
                  </label>
                  <textarea
                    value={configJson}
                    onChange={(e) => setConfigJson(e.target.value)}
                    placeholder={
                      requiresEndpointId && endpointId
                        ? '接入点 ID 已在上方填写，此处可配置其他参数'
                        : requiresAppId
                        ? '{\n  "appid": "你的AppID"\n}'
                        : requiresEndpointId
                        ? '{\n  "modelOverride": "ep-xxx"\n}'
                        : '{\n  // 可选高级参数，留空则使用默认配置\n}'
                    }
                    rows={4}
                    className="w-full px-3 py-2 text-sm border border-[var(--border)] rounded-md bg-[var(--bg)] text-[var(--ink)] font-mono focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                  />
                  {configError && <p className="text-xs text-red-500 mt-1">{configError}</p>}
                  <p className="text-xs text-[var(--ink-3)] mt-1">
                    {requiresEndpointId && endpointId ? (
                      <>
                        接入点 ID 已在上方专用输入框填写，系统自动将 <code className="bg-[var(--bg)] px-1 rounded">modelOverride</code> 合并到 JSON 配置，通过 OpenAI 兼容路由调用。
                        {requiresAppId && (
                          <> 还需在此处配置 AppID：<code className="bg-[var(--bg)] px-1 rounded">{"{\"appid\":\"你的AppID\"}"}</code></>
                        )}
                      </>
                    ) : requiresAppId ? (
                      <>此模型需要配置 AppID，格式：<code className="bg-[var(--bg)] px-1 rounded">{"{\"appid\":\"你的AppID\"}"}</code></>
                    ) : (
                      <>留空则不修改。大多数模型只需 API Key 即可，无需配置此项。{meta.docsUrl && <> 详见 <a href={meta.docsUrl} target="_blank" rel="noopener noreferrer" className="underline hover:text-[var(--accent)]">官方文档</a></>}</>
                    )}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* 操作按钮 */}
          <div className="flex items-center gap-2 flex-wrap mt-3">
            <Button onClick={handleSave} size="sm">
              <Zap size={14} className="mr-1" /> 保存
            </Button>
            <Button onClick={handleTest} size="sm" variant="outline" disabled={isTesting || !isConfigured}>
              {isTesting ? '测试中...' : '测试连接'}
            </Button>
            {testResult === 'success' && <span className="text-green-500 text-sm">✓</span>}
            {testResult === 'error' && <span className="text-red-500 text-sm">✗</span>}
            {isConfigured && (
              <>
                <Button onClick={handleSetDefault} size="sm" variant="ghost" disabled={config?.is_default}>
                  <Star size={14} className="mr-1" /> 设为默认
                </Button>
                <Button onClick={handleDelete} size="sm" variant="ghost" className="text-red-500 hover:text-red-600 dark:text-red-400">
                  <Trash2 size={14} className="mr-1" /> 删除
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
    <Modal
      open={confirmSwitch}
      onOpenChange={setConfirmSwitch}
      title={meta.modelType === 'video' ? '切换视频生成模型' : `切换${typeLabel}模型`}
      size="md"
      footer={
        <>
          <Button variant="outline" size="sm" onClick={() => setConfirmSwitch(false)}>取消</Button>
          <Button size="sm" onClick={doSetDefault}>确认切换</Button>
        </>
      }
    >
      {meta.modelType === 'video' ? (
        <div className="space-y-3 text-sm text-[var(--ink-2)]">
          <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300">
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>切换视频模型会影响后续出片质量与一致性，请确认以下风险：</span>
          </div>
          <ul className="list-disc pl-5 space-y-1.5 text-[var(--ink-2)]">
            <li>已生成的分镜提示词成品按旧模型官方规范重构，切换后将失效；系统会在下次生成视频时自动按新模型规范重新重构（会消耗少量 AI 额度与时间）</li>
            <li>已生成的关键帧、概念图、视频片段与新模型可能存在风格与一致性差异，建议切换后先对重点镜头重新生成验证</li>
            <li>剧本分析缓存保留（导演视角分析不随模型变化），无需重新分析</li>
          </ul>
        </div>
      ) : (
        <p className="text-sm text-[var(--ink-2)]">
          后续生成将使用该模型。已生成的内容（分镜、图片、视频等）与新模型可能存在风格差异，建议切换后对重点内容重新生成验证。
        </p>
      )}
    </Modal>
    </>
  );
}
