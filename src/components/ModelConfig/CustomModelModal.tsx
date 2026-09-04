import { useState, useEffect, useCallback } from 'react';
import { X, Plus, CheckCircle2, Loader2, Zap } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { cn } from '../../utils';
import type { ModelType } from '../../types';

interface CustomModelModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (model: CustomModelData) => Promise<void>;
  defaultType?: ModelType;
}

export interface CustomModelData {
  provider: string;
  model_name: string;
  model_types: ModelType[];
  api_key: string;
  endpoint_url: string;
  display_name?: string;
  description?: string;
  config?: string;
}

const typeOptions: Array<{ value: ModelType; label: string; desc: string }> = [
  { value: 'text', label: '文本模型', desc: '剧本生成、角色提取、分镜创作' },
  { value: 'image', label: '图像模型', desc: '角色概念图、场景图、关键帧' },
  { value: 'video', label: '视频模型', desc: '镜头视频片段生成' },
  { value: 'audio', label: '音频模型', desc: '配音、旁白、音效生成' },
];

type TestStatus = 'idle' | 'testing' | 'success' | 'error';

export function CustomModelModal({ isOpen, onClose, onSave, defaultType = 'text' }: CustomModelModalProps) {
  const [modelName, setModelName] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [endpointUrl, setEndpointUrl] = useState('https://api.openai.com/v1');
  const [selectedTypes, setSelectedTypes] = useState<ModelType[]>([defaultType]);
  const [displayName, setDisplayName] = useState('');
  const [description, setDescription] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [testStatus, setTestStatus] = useState<TestStatus>('idle');
  const [testMessage, setTestMessage] = useState('');

  // 成本估算配置
  const [costPer1kTokens, setCostPer1kTokens] = useState('');
  const [costPerImage, setCostPerImage] = useState('');
  const [costPerVideo, setCostPerVideo] = useState('');
  const [costPerSecond, setCostPerSecond] = useState('');

  // 自适配：自动识别厂商和适用场景
  const [autoDetectedProvider, setAutoDetectedProvider] = useState('');
  const [autoScenarios, setAutoScenarios] = useState<string[]>([]);

  // 当 defaultType 变化时，同步更新 selectedTypes
  useEffect(() => {
    if (isOpen) {
      setSelectedTypes([defaultType]);
    }
  }, [defaultType, isOpen]);

  // 打开时重置表单
  useEffect(() => {
    if (isOpen) {
      setModelName('');
      setApiKey('');
      setEndpointUrl('https://api.openai.com/v1');
      setSelectedTypes([defaultType]);
      setDisplayName('');
      setDescription('');
      setError('');
      setTestStatus('idle');
      setTestMessage('');
    }
  }, [isOpen, defaultType]);

  const validateForm = useCallback((): string | null => {
    if (!modelName.trim()) return '请输入模型名称';
    if (!apiKey.trim()) return '请输入 API Key';
    if (!endpointUrl.trim()) return '请输入端点 URL';
    if (selectedTypes.length === 0) return '请至少选择一种模型类型';
    return null;
  }, [modelName, apiKey, endpointUrl, selectedTypes]);

  // 保存模型配置
  const handleSave = useCallback(async () => {

  setError('');

  const validationError = validateForm();
  if (validationError) {
    setError(validationError);
    return;
  }

  setIsSaving(true);
  try {
    // 构建 config JSON，包含成本估算和适用场景
    const configObj: Record<string, unknown> = {};
    if (costPer1kTokens) configObj.costPer1kTokens = parseFloat(costPer1kTokens);
    if (costPerImage) configObj.costPerImage = parseFloat(costPerImage);
    if (costPerVideo) configObj.costPerVideo = parseFloat(costPerVideo);
    if (costPerSecond) configObj.costPerSecond = parseFloat(costPerSecond);
    if (autoScenarios.length > 0) configObj.scenarios = autoScenarios;
    if (autoDetectedProvider) configObj.detectedProvider = autoDetectedProvider;

    await onSave({
      provider: 'custom-openai',
      model_name: modelName.trim(),
      model_types: selectedTypes,
      api_key: apiKey.trim(),
      endpoint_url: endpointUrl.trim(),
      display_name: displayName.trim() || undefined,
      description: description.trim() || undefined,
      config: Object.keys(configObj).length > 0 ? JSON.stringify(configObj) : '{}',
    });

    onClose();
  } catch (err: any) {
    setError(err?.message || '保存失败，请重试');
  } finally {
    setIsSaving(false);
  }

  }, [validateForm, modelName, apiKey, endpointUrl, selectedTypes, displayName, description,
    costPer1kTokens, costPerImage, costPerVideo, costPerSecond, autoScenarios, autoDetectedProvider,
    onSave, onClose]);

  // 键盘交互：Escape 关闭，Enter 提交
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        handleSave();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, handleSave]);

  // 自适配：根据端点 URL 自动识别厂商
  useEffect(() => {
    if (!endpointUrl) {
      setAutoDetectedProvider('');
      return;
    }
    const url = endpointUrl.toLowerCase();
    // ========== 国际大厂 ==========
    if (url.includes('api.openai.com') || url.includes('openai.azure.com')) setAutoDetectedProvider('OpenAI');
    else if (url.includes('api.anthropic.com')) setAutoDetectedProvider('Anthropic Claude');
    else if (url.includes('generativelanguage.googleapis.com') || url.includes('aistudio.google.com')) setAutoDetectedProvider('Google Gemini');
    else if (url.includes('api.mistral.ai')) setAutoDetectedProvider('Mistral AI');
    else if (url.includes('api.cohere.com')) setAutoDetectedProvider('Cohere');
    else if (url.includes('api.perplexity.ai')) setAutoDetectedProvider('Perplexity');
    // ========== 国内大厂 ==========
    else if (url.includes('api.deepseek.com')) setAutoDetectedProvider('DeepSeek');
    else if (url.includes('siliconflow')) setAutoDetectedProvider('硅基流动');
    else if (url.includes('api.moonshot.cn')) setAutoDetectedProvider('月之暗面 Kimi');
    else if (url.includes('dashscope') || url.includes('wanx') || url.includes('bailian.console.aliyun.com')) setAutoDetectedProvider('阿里通义千问/百炼');
    else if (url.includes('open.bigmodel.cn') || url.includes('zhipu')) setAutoDetectedProvider('智谱 AI');
    else if (url.includes('api.minimaxi.com')) setAutoDetectedProvider('MiniMax/海螺');
    else if (url.includes('volcengine.com') || url.includes('ark.cn-beijing') || url.includes('doubao')) setAutoDetectedProvider('字节豆包/火山引擎');
    else if (url.includes('klingai.com') || url.includes('kling.kuaishou.com')) setAutoDetectedProvider('快手可灵');
    else if (url.includes('jimeng') || url.includes('ai/overview')) setAutoDetectedProvider('即梦 AI');
    else if (url.includes('xfyun.cn') || url.includes('xinghuo.xfyun.cn')) setAutoDetectedProvider('科大讯飞星火');
    else if (url.includes('hunyuan.tencent.com') || url.includes('hunyuan.cloud.tencent.com')) setAutoDetectedProvider('腾讯混元');
    else if (url.includes('qianfan.cloud.baidu.com') || url.includes('aip.baidubce.com')) setAutoDetectedProvider('百度千帆');
    else if (url.includes('huaweicloud.com') || url.includes('pangu.huawei.com')) setAutoDetectedProvider('华为盘古');
    else if (url.includes('sensechat.com') || url.includes('sensetime.com')) setAutoDetectedProvider('商汤日日新');
    else if (url.includes('stepfun.com')) setAutoDetectedProvider('阶跃星辰');
    else if (url.includes('01.ai') || url.includes('lingyiwanwu')) setAutoDetectedProvider('零一万物');
    else if (url.includes('baichuan-ai.com')) setAutoDetectedProvider('百川智能');
    else if (url.includes('360.cn') || url.includes('360.com')) setAutoDetectedProvider('360 智脑');
    // ========== 云服务商 ==========
    else if (url.includes('build.nvidia.com') || url.includes('integrate.nvidia.com') || url.includes('api.nvcf.nvidia.com')) setAutoDetectedProvider('NVIDIA 英伟达');
    else if (url.includes('modelscope.cn') || url.includes('modelscope.ai')) setAutoDetectedProvider('魔搭社区 ModelScope');
    else if (url.includes('azure.com') && !url.includes('openai')) setAutoDetectedProvider('Microsoft Azure');
    else if (url.includes('amazonaws.com') || url.includes('bedrock')) setAutoDetectedProvider('AWS Bedrock');
    else if (url.includes('googleapis.com') && !url.includes('generativelanguage')) setAutoDetectedProvider('Google Vertex AI');
    // ========== AI 推理平台 ==========
    else if (url.includes('together.ai')) setAutoDetectedProvider('Together AI');
    else if (url.includes('groq.com')) setAutoDetectedProvider('Groq');
    else if (url.includes('fireworks.ai')) setAutoDetectedProvider('Fireworks AI');
    else if (url.includes('anyscale.com')) setAutoDetectedProvider('Anyscale');
    else if (url.includes('octoai.cloud') || url.includes('octo.ai')) setAutoDetectedProvider('OctoAI');
    else if (url.includes('lepton.run')) setAutoDetectedProvider('Lepton AI');
    else if (url.includes('modal.com')) setAutoDetectedProvider('Modal');
    else if (url.includes('banana.dev')) setAutoDetectedProvider('Banana');
    else if (url.includes('replicate.com')) setAutoDetectedProvider('Replicate');
    else if (url.includes('huggingface.co') || url.includes('hf.co')) setAutoDetectedProvider('HuggingFace');
    // ========== 本地部署 ==========
    else if (url.includes('localhost:11434') || url.includes('127.0.0.1:11434')) setAutoDetectedProvider('Ollama 本地');
    else if (url.includes('localhost') || url.includes('127.0.0.1')) setAutoDetectedProvider('本地部署');
    else setAutoDetectedProvider('自定义 OpenAI 兼容');
  }, [endpointUrl]);

  // 自适配：根据模型类型自动设置适用场景
  useEffect(() => {
    const scenarios: string[] = [];
    if (selectedTypes.includes('text')) {
      scenarios.push('剧本创作', '角色提取', '分镜生成', '内容分析', '剧情优化');
    }
    if (selectedTypes.includes('image')) {
      scenarios.push('角色概念图', '场景参考图', '关键帧生成', '风格图生成');
    }
    if (selectedTypes.includes('video')) {
      scenarios.push('镜头视频生成', '图生视频', '动态镜头');
    }
    if (selectedTypes.includes('audio')) {
      scenarios.push('配音生成', '旁白生成', '音效合成');
    }
    setAutoScenarios(scenarios);
  }, [selectedTypes]);


  // 测试连接
  const handleTestConnection = useCallback(async () => {
    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setTestStatus('testing');
    setTestMessage('');
    setError('');

    try {
      // 动态导入 OpenAI SDK 测试连接
      const { default: OpenAI } = await import('openai');
      const client = new OpenAI({
        apiKey: apiKey.trim(),
        baseURL: endpointUrl.trim().replace(/\/$/, ''),
        timeout: 10000, // 10秒超时
      });

      // 文本模型：调用 chat.completions 测试
      if (selectedTypes.includes('text')) {
        const completion = await client.chat.completions.create({
          model: modelName.trim(),
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 5,
          temperature: 0,
        });
        const content = completion.choices?.[0]?.message?.content || '';
        setTestStatus('success');
        setTestMessage(`连接成功！模型返回: ${content || '(空)'}`);
      }
      // 图像模型：调用 models.list 测试（不实际生成图片，节省成本）
      else if (selectedTypes.includes('image')) {
        try {
          await client.models.list();
          setTestStatus('success');
          setTestMessage('连接成功！API Key 和端点有效');
        } catch {
          // 某些兼容接口不支持 models.list，尝试生成一张小图
          try {
            await client.images.generate({
              model: modelName.trim(),
              prompt: 'test',
              size: '256x256',
              n: 1,
            });
            setTestStatus('success');
            setTestMessage(`连接成功！生成测试图片成功`);
          } catch (imgErr: any) {
            // 如果是认证错误，说明连接失败
            if (imgErr?.status === 401 || imgErr?.status === 403) {
              throw imgErr;
            }
            // 其他错误可能是模型不支持，但连接是通的
            setTestStatus('success');
            setTestMessage('连接成功！API Key 有效（模型可能不支持测试调用）');
          }
        }
      }
      // 视频/音频模型：调用 models.list 测试
      else {
        try {
          await client.models.list();
          setTestStatus('success');
          setTestMessage('连接成功！API Key 和端点有效');
        } catch {
          setTestStatus('success');
          setTestMessage('连接成功！（该接口可能不支持 models.list，请保存后实际使用验证）');
        }
      }
    } catch (err: any) {
      setTestStatus('error');
      const errorMsg = err?.message || err?.error?.message || '未知错误';
      const errorStatus = err?.status || '';
      setTestMessage(`连接失败${errorStatus ? ` (HTTP ${errorStatus})` : ''}: ${errorMsg}`);
    }
  }, [modelName, apiKey, endpointUrl, selectedTypes, validateForm]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* 背景遮罩 */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* 模态框 */}
      <div className="relative w-full max-w-lg bg-[var(--bg)] rounded-[var(--radius-shell)] border border-[var(--border)] shadow-[var(--shadow-float)] overflow-hidden animate-slide-up">
        {/* 头部 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] flex items-center justify-center shadow-[0_4px_12px_rgba(43, 116, 245, 0.25)]">
              <Plus className="w-5 h-5 text-[var(--on-accent)]" />
            </div>
            <div>
              <h3 className="font-bold text-[var(--ink-1)] text-lg">添加自定义模型</h3>
              <p className="text-xs text-[var(--ink-3)]">使用官方 OpenAI SDK，支持所有 OpenAI 兼容接口</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-[var(--panel-2)] text-[var(--ink-3)] hover:text-[var(--ink-1)] transition-colors"
            title="关闭 (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 表单内容 */}
        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* 模型类型选择（可多选） */}
          <div>
            <label className="block text-xs font-medium text-[var(--ink-2)] mb-2 tracking-wide uppercase">
              模型类型 <span className="text-[var(--ink-3)] normal-case">(可多选，选择后会出现在对应分类中)</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              {typeOptions.map((opt) => {
                const isSelected = selectedTypes.includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    onClick={() => {
                      setSelectedTypes(prev =>
                        isSelected
                          ? prev.filter(t => t !== opt.value)
                          : [...prev, opt.value]
                      );
                    }}
                    className={cn(
                      'p-3 rounded-[var(--radius-control)] border text-left transition-all duration-200 relative',
                      isSelected
                        ? 'border-[var(--accent)] bg-[var(--accent-soft)] shadow-[0_0_0_1px_var(--accent-soft)]'
                        : 'border-[var(--border)] bg-[var(--panel-2)] hover:border-[var(--border-hover)]'
                    )}
                  >
                    {isSelected && (
                      <div className="absolute top-2 right-2 w-4 h-4 rounded-full bg-[var(--accent)] flex items-center justify-center">
                        <CheckCircle2 className="w-3 h-3 text-white" />
                      </div>
                    )}
                    <div className="font-medium text-sm text-[var(--ink-1)]">{opt.label}</div>
                    <div className="text-xs text-[var(--ink-3)] mt-0.5">{opt.desc}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 模型名称 */}
          <Input
            label="模型名称 *"
            placeholder="例如：gpt-4o、claude-3-5-sonnet、custom-model"
            value={modelName}
            onChange={(e) => setModelName(e.target.value)}
          />

          {/* API Key */}
          <Input
            label="API Key *"
            type="password"
            placeholder="sk-..."
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />

          {/* 端点 URL */}
          <Input
            label="端点 URL *"
            placeholder="https://api.openai.com/v1"
            value={endpointUrl}
            onChange={(e) => setEndpointUrl(e.target.value)}
          />
          <p className="text-xs text-[var(--ink-3)] -mt-2">
            支持所有 OpenAI 兼容接口，例如：OpenAI、DeepSeek、硅基流动、Ollama 本地等
          </p>

          {/* 自适配：自动识别厂商 */}
          {autoDetectedProvider && (
            <div className="flex items-center gap-2 -mt-1">
              <span className="text-xs text-[var(--ink-3)]">自动识别：</span>
              <span className="text-xs font-medium text-[var(--accent)] bg-[var(--accent-soft)] px-2 py-0.5 rounded-full">
                {autoDetectedProvider}
              </span>
            </div>
          )}

          {/* 测试连接按钮 */}
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              onClick={handleTestConnection}
              disabled={testStatus === 'testing' || isSaving}
              className="gap-2"
            >
              {testStatus === 'testing' ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  测试中...
                </>
              ) : testStatus === 'success' ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                  测试通过
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4" />
                  测试连接
                </>
              )}
            </Button>
            {testStatus === 'success' && (
              <span className="text-xs text-green-600 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                {testMessage}
              </span>
            )}
            {testStatus === 'error' && (
              <span className="text-xs text-red-500 flex items-center gap-1">
                <X className="w-3 h-3" />
                {testMessage}
              </span>
            )}
          </div>

          {/* 显示名称（可选） */}
          <Input
            label="显示名称（可选）"
            placeholder="例如：我的自定义 GPT-4o"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />

          {/* 描述（可选） */}
          <div>
            <label className="block text-xs font-medium text-[var(--ink-2)] mb-1.5 tracking-wide uppercase">
              描述（可选）
            </label>
            <textarea
              className="w-full px-3 py-2.5 rounded-[var(--radius-control)] border bg-[var(--panel-2)] border-[var(--border)] text-[var(--ink-1)] placeholder-[var(--ink-3)] focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)] transition-all duration-200 resize-y min-h-[80px] text-sm leading-relaxed"
              placeholder="模型的特点、适用场景等"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {/* 自适配：适用场景 */}
          {autoScenarios.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-[var(--ink-2)] mb-1.5 tracking-wide uppercase">
                自适配适用场景
              </label>
              <div className="flex flex-wrap gap-1.5">
                {autoScenarios.map((scenario) => (
                  <span
                    key={scenario}
                    className="text-xs text-[var(--ink-2)] bg-[var(--panel-2)] border border-[var(--border)] px-2 py-1 rounded-full"
                  >
                    {scenario}
                  </span>
                ))}
              </div>
              <p className="text-xs text-[var(--ink-3)] mt-1">根据选择的模型类型自动适配，保存后生效</p>
            </div>
          )}

          {/* 成本估算配置（可选） */}
          <div>
            <label className="block text-xs font-medium text-[var(--ink-2)] mb-1.5 tracking-wide uppercase">
              成本估算（可选，用于费用预估）
            </label>
            <div className="grid grid-cols-2 gap-2">
              {selectedTypes.includes('text') && (
                <Input
                  label="文本 (元/千token)"
                  type="number"
                  step="0.0001"
                  placeholder="0.001"
                  value={costPer1kTokens}
                  onChange={(e) => setCostPer1kTokens(e.target.value)}
                />
              )}
              {selectedTypes.includes('image') && (
                <Input
                  label="图片 (元/张)"
                  type="number"
                  step="0.01"
                  placeholder="0.02"
                  value={costPerImage}
                  onChange={(e) => setCostPerImage(e.target.value)}
                />
              )}
              {selectedTypes.includes('video') && (
                <Input
                  label="视频 (元/条)"
                  type="number"
                  step="0.1"
                  placeholder="0.5"
                  value={costPerVideo}
                  onChange={(e) => setCostPerVideo(e.target.value)}
                />
              )}
              {selectedTypes.includes('audio') && (
                <Input
                  label="音频 (元/秒)"
                  type="number"
                  step="0.0001"
                  placeholder="0.0002"
                  value={costPerSecond}
                  onChange={(e) => setCostPerSecond(e.target.value)}
                />
              )}
            </div>
          </div>

          {/* 错误提示 */}
          {error && (
            <div className="p-3 rounded-[var(--radius-control)] bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.2)]">
              <p className="text-sm text-[var(--color-danger)]">{error}</p>
            </div>
          )}

          {/* 快捷键提示 */}
          <p className="text-xs text-[var(--ink-3)] text-center">
            快捷键：<kbd className="px-1.5 py-0.5 rounded bg-[var(--panel-2)] border border-[var(--border)] text-[10px]">Esc</kbd> 关闭
            <span className="mx-2">·</span>
            <kbd className="px-1.5 py-0.5 rounded bg-[var(--panel-2)] border border-[var(--border)] text-[10px]">Ctrl+Enter</kbd> 保存
          </p>
        </div>

        {/* 底部按钮 */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[var(--border)] bg-[var(--panel-2)]">
          <Button variant="ghost" onClick={onClose} disabled={isSaving}>
            取消
          </Button>
          <Button onClick={handleSave} disabled={isSaving} className="gap-2">
            {isSaving ? (
              <>
                <div className="w-4 h-4 border-2 border-[var(--on-accent)] border-t-transparent rounded-full animate-spin" />
                保存中...
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                保存模型
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
