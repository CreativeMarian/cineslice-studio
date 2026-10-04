// 三步新建项目向导（ProjectWizard）
// 第一步：选择输入模式 + 视觉风格 + 画面比例 + 项目名称
// 第二步：按模式输入内容（一句话 / 大纲 / 小说文本 + txt 上传）
// 第三步：AI 生成剧本预览（可编辑）→ 确认创建进入项目 / 重新生成
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Lightbulb, ListTree, BookOpen, Wand2, RefreshCw, Check, ArrowRight,
  ArrowLeft, Upload, FileText, Clapperboard, Loader2, Lock,
} from 'lucide-react';
import { Modal, Button, Input, Textarea, Badge } from '../ui';
import { projectService, type CreateFromInputResult } from '../../services/projectService';
import { useUIStore } from '../../stores/useUIStore';
import { showApiError, getResponseErrorMessage } from '../../utils/error';
import { VISUAL_STYLES, ASPECT_RATIOS, PROJECT_NAME_MAX_LENGTH } from '../../constants';
import type { InputMode } from '../../types';

const MODE_OPTIONS: Array<{
  value: InputMode;
  label: string;
  desc: string;
  icon: typeof Lightbulb;
  placeholder: string;
}> = [
  {
    value: 'one_liner',
    label: '一句话创意',
    desc: '从一个灵感开始，AI 自动扩写成完整剧本',
    icon: Lightbulb,
    placeholder: '例如：一个穿越到古代的现代医生，用现代医术拯救了一个王朝',
  },
  {
    value: 'outline',
    label: '故事大纲',
    desc: '提供人物设定、故事主线与关键情节，AI 编排成剧本',
    icon: ListTree,
    placeholder: '输入故事大纲，包含人物设定、故事主线、关键情节...',
  },
  {
    value: 'novel',
    label: '小说文本',
    desc: '粘贴或上传小说文本，AI 改编为分集剧本',
    icon: BookOpen,
    placeholder: '粘贴或上传小说文本...',
  },
];

export interface ProjectWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 初始输入模式（如从"上传小说"快捷入口进入时预选 novel） */
  initialMode?: InputMode;
}

export function ProjectWizard({ open, onOpenChange, initialMode }: ProjectWizardProps) {
  const navigate = useNavigate();
  const { showToast } = useUIStore();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [title, setTitle] = useState('');
  const [inputMode, setInputMode] = useState<InputMode>(initialMode || 'one_liner');
  const [visualStyle, setVisualStyle] = useState(VISUAL_STYLES[0]);
  const [aspectRatio, setAspectRatio] = useState(ASPECT_RATIOS[0]);
  const [content, setContent] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState<CreateFromInputResult | null>(null);
  const [scriptDraft, setScriptDraft] = useState('');
  /** 用户是否手动编辑过剧本（编辑过则在确认创建时回写首集 script_content） */
  const [hasEditedScript, setHasEditedScript] = useState(false);
  /** 生成成功时保存的首集 ID（用于回写编辑后的剧本） */
  const [createdEpisodeId, setCreatedEpisodeId] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 打开时重置为初始状态（保留 external 传入的 initialMode）
  useEffect(() => {
    if (open) {
      setStep(1);
      setTitle('');
      setInputMode(initialMode || 'one_liner');
      setVisualStyle(VISUAL_STYLES[0]);
      setAspectRatio(ASPECT_RATIOS[0]);
      setContent('');
      setGenerating(false);
      setGenerated(null);
      setScriptDraft('');
      setHasEditedScript(false);
      setCreatedEpisodeId('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const currentMode = MODE_OPTIONS.find((m) => m.value === inputMode)!;

  const handleClose = () => onOpenChange(false);

  const canGoNext = step === 1
    ? title.trim().length > 0
    : content.trim().length > 0;

  /** 第一步 → 第二步 */
  const handleStep1Next = () => {
    if (!title.trim()) {
      showToast('请输入项目名称', 'error');
      return;
    }
    setStep(2);
  };

  /** 第二步 → 第三步：调用 AI 生成剧本 */
  const handleGenerate = async () => {
    if (!content.trim()) {
      showToast('请输入创作内容', 'error');
      return;
    }
    setGenerating(true);
    setStep(3);
    try {
      const res = await projectService.createFromInput({
        input_mode: inputMode,
        content: content.trim(),
        title: title.trim(),
        visual_style: visualStyle,
        aspect_ratio: aspectRatio,
      });
      if (res.success && res.data) {
        setGenerated(res.data);
        setScriptDraft(res.data.script || '');
        setCreatedEpisodeId(res.data.episodes?.[0]?.id || '');
        setHasEditedScript(false);
        showToast('剧本生成完成，请确认后创建项目', 'success');
      } else {
        showToast(getResponseErrorMessage(res, '剧本生成失败'), 'error');
        setStep(2);
      }
    } catch (err: unknown) {
      showApiError(showToast, err, '剧本生成失败，请重试');
      setStep(2);
    } finally {
      setGenerating(false);
    }
  };

  /** 重新生成 */
  const handleRegenerate = () => {
    setGenerated(null);
    setScriptDraft('');
    setHasEditedScript(false);
    setCreatedEpisodeId('');
    handleGenerate();
  };

  /** 确认创建 → 进入项目（若用户编辑过剧本，先回写首集 script_content） */
  const handleConfirm = async () => {
    if (!generated?.project?.id) {
      showToast('项目数据尚未就绪，请重新生成', 'error');
      return;
    }
    if (hasEditedScript && scriptDraft.trim() && createdEpisodeId) {
      try {
        const res = await projectService.updateEpisode(createdEpisodeId, { script_content: scriptDraft });
        if (!res.success) {
          showToast(getResponseErrorMessage(res, '剧本保存失败'), 'error');
          return;
        }
      } catch (err: unknown) {
        showApiError(showToast, err, '剧本保存失败，请重试');
        return;
      }
    }
    onOpenChange(false);
    // P2-16: 创建成功后直接进入该项目的「剧本」页，便于立即校对/编辑剧本
    navigate(`/project/${generated.project.id}/script`);
  };

  /** 上传 txt 小说文件，内容追加到文本域 */
  const handleFileUpload = (file: File) => {
    if (!file.name.toLowerCase().endsWith('.txt') && !file.type.includes('text')) {
      showToast('仅支持 .txt 文本文件', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || '');
      setContent((prev) => (prev ? `${prev}\n\n${text}` : text));
      showToast(`已读取 ${file.name}（${text.length} 字）`, 'success');
    };
    reader.onerror = () => showToast('文件读取失败', 'error');
    reader.readAsText(file);
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      size="xl"
      title="创建新项目"
      description="三步完成：选择模式 → 输入内容 → AI 生成剧本并确认"
    >
      {/* 步骤指示器 */}
      <div className="flex items-center gap-2 mb-5">
        {[
          { no: 1, label: '选择模式' },
          { no: 2, label: '输入内容' },
          { no: 3, label: 'AI 生成确认' },
        ].map((s, i) => (
          <div key={s.no} className="flex items-center gap-2">
            {i > 0 && <div className="w-6 h-px bg-[var(--border)]" />}
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                step === s.no
                  ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
                  : step > s.no
                  ? 'text-[var(--ink-2)]'
                  : 'text-[var(--ink-3)]'
              }`}
            >
              <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] ${
                step > s.no ? 'bg-[var(--accent)] text-white' : step === s.no ? 'bg-[var(--accent)]/20' : 'bg-[var(--panel-3)]'
              }`}>
                {step > s.no ? <Check className="w-2.5 h-2.5" /> : s.no}
              </span>
              {s.label}
            </div>
          </div>
        ))}
      </div>

      {/* ───── 第一步：选择输入模式 + 风格/比例/名称 ───── */}
      {step === 1 && (
        <div className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-[var(--ink-2)] mb-2">
              输入模式 <span className="text-[var(--ink-3)] text-xs">（决定创作起点）</span>
            </label>
            <div className="grid grid-cols-3 gap-3">
              {MODE_OPTIONS.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setInputMode(m.value)}
                  className={`p-4 rounded-xl border-2 text-left transition-all group ${
                    inputMode === m.value
                      ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                      : 'border-[var(--border)] hover:border-[var(--accent)]/50 hover:bg-[var(--panel-2)]/50'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <m.icon className={`w-5 h-5 ${inputMode === m.value ? 'text-[var(--accent)]' : 'text-[var(--ink-3)]'}`} />
                    <span className="text-sm font-medium text-[var(--ink-1)]">{m.label}</span>
                  </div>
                  <p className="text-xs text-[var(--ink-3)] leading-relaxed">{m.desc}</p>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--ink-2)] mb-2">
              项目名称 <span className="text-[var(--term-red)]">*</span>
              <span className="text-xs font-normal text-[var(--ink-3)] ml-2">必填 · 最长 {PROJECT_NAME_MAX_LENGTH} 字</span>
            </label>
            <Input
              placeholder="为你的项目起个名字"
              value={title}
              maxLength={PROJECT_NAME_MAX_LENGTH}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && canGoNext && handleStep1Next()}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-[var(--ink-2)] mb-2 flex items-center gap-1.5">
                <Clapperboard className="w-4 h-4 text-[var(--accent)]" /> 视觉风格
              </label>
              {/* P2-8: 卡片式选择，已选项高亮显示（边框 + 背景 + 对勾） */}
              <div className="grid grid-cols-2 gap-2">
                {VISUAL_STYLES.map((s) => {
                  const selected = visualStyle === s;
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setVisualStyle(s)}
                      className={`px-2.5 py-2 rounded-xl border-2 text-sm font-medium transition-all text-left flex items-center justify-between gap-1 ${
                        selected
                          ? 'border-[var(--accent)] bg-[var(--accent-soft)]/60 text-[var(--accent)] shadow-[0_0_0_1px_var(--accent-glow)]'
                          : 'border-[var(--border)] text-[var(--ink-2)] hover:border-[var(--accent)]/50 hover:bg-[var(--panel-2)]/60'
                      }`}
                    >
                      <span className="truncate">{s}</span>
                      {selected && <Check className="w-3.5 h-3.5 flex-shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--ink-2)] mb-2 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-[var(--accent)]" /> 画面比例
              </label>
              {/* P2-8: 卡片式选择，已选项高亮显示 */}
              <div className="grid grid-cols-2 gap-2">
                {ASPECT_RATIOS.map((r) => {
                  const selected = aspectRatio === r;
                  return (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setAspectRatio(r)}
                      className={`px-2.5 py-2 rounded-xl border-2 text-sm font-medium transition-all text-left flex items-center justify-between gap-1 ${
                        selected
                          ? 'border-[var(--accent)] bg-[var(--accent-soft)]/60 text-[var(--accent)] shadow-[0_0_0_1px_var(--accent-glow)]'
                          : 'border-[var(--border)] text-[var(--ink-2)] hover:border-[var(--accent)]/50 hover:bg-[var(--panel-2)]/60'
                      }`}
                    >
                      <span>{r}</span>
                      {selected && <Check className="w-3.5 h-3.5 flex-shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="flex items-start gap-2 p-3 rounded-lg bg-[var(--accent-soft)]/40 border border-[var(--accent)]/20">
            <Lock className="w-4 h-4 text-[var(--accent)] flex-shrink-0 mt-0.5" />
            <p className="text-xs text-[var(--ink-2)]">
              视觉风格与画面比例在<b>创建后锁定</b>，全片视觉统一。如需更改请新建项目。
            </p>
          </div>
        </div>
      )}

      {/* ───── 第二步：输入内容 ───── */}
      {step === 2 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm text-[var(--ink-2)]">
            <Badge variant="accent">{currentMode.label}</Badge>
            <span className="text-xs text-[var(--ink-3)]">「{title}」· {visualStyle} · {aspectRatio}</span>
          </div>

          {inputMode === 'one_liner' ? (
            <div>
              <label className="block text-sm font-medium text-[var(--ink-2)] mb-2">一句话创意</label>
              <Input
                placeholder={currentMode.placeholder}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="h-12 text-base"
              />
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-[var(--ink-2)]">
                  {inputMode === 'novel' ? '小说文本' : '故事大纲'}
                </label>
                {inputMode === 'novel' && (
                  <>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".txt,text/plain"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleFileUpload(f);
                        e.target.value = '';
                      }}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      leftIcon={<Upload className="w-3.5 h-3.5" />}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      上传 txt 文件
                    </Button>
                  </>
                )}
              </div>
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={12}
                className="font-mono text-xs"
                placeholder={currentMode.placeholder}
              />
              <p className="text-xs text-[var(--ink-3)] mt-1.5">
                {content.length.toLocaleString()} 字{inputMode === 'novel' ? ' · 可直接粘贴，或上传 txt 文件自动填入' : ''}
              </p>
            </div>
          )}
        </div>
      )}

      {/* ───── 第三步：AI 生成 + 确认 ───── */}
      {step === 3 && (
        <div className="space-y-4">
          {generating ? (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="relative w-16 h-16 mb-4">
                <Loader2 className="w-16 h-16 text-[var(--accent)] animate-spin" />
                <Wand2 className="w-6 h-6 text-[var(--accent)] absolute inset-0 m-auto" />
              </div>
              <p className="text-base font-semibold text-[var(--ink-1)]">AI 正在创作剧本...</p>
              <p className="text-sm text-[var(--ink-3)] mt-1">
                正在基于「{currentMode.label}」生成角色、场景与分镜草稿
              </p>
            </div>
          ) : generated ? (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <FileText className="w-4 h-4 text-[var(--accent)]" />
                <span className="text-sm font-medium text-[var(--ink-1)]">剧本预览</span>
                <span className="text-xs text-[var(--ink-3)]">可直接编辑，确认后进入项目</span>
              </div>
              <Textarea
                value={scriptDraft}
                onChange={(e) => {
                  setScriptDraft(e.target.value);
                  setHasEditedScript(true);
                }}
                rows={14}
                className="font-mono text-xs"
                placeholder="AI 生成的剧本将显示在这里..."
              />
            </div>
          ) : (
            <div className="text-center py-12 text-[var(--ink-3)] text-sm">
              生成失败，请返回重试
            </div>
          )}
        </div>
      )}

      {/* 底部操作 */}
      <div className="flex items-center justify-between">
        <div>
          {step === 2 && (
            <Button variant="ghost" leftIcon={<ArrowLeft className="w-4 h-4" />} onClick={() => setStep(1)}>
              上一步
            </Button>
          )}
          {step === 3 && !generating && generated && (
            <Button variant="ghost" leftIcon={<ArrowLeft className="w-4 h-4" />} onClick={() => setStep(2)}>
              上一步
            </Button>
          )}
        </div>
        <div className="flex items-center gap-3">
          {step === 1 && (
            <>
              <Button variant="secondary" onClick={handleClose}>取消</Button>
              <Button onClick={handleStep1Next} rightIcon={<ArrowRight className="w-4 h-4" />}>
                下一步
              </Button>
            </>
          )}
          {step === 2 && (
            <>
              <Button variant="secondary" onClick={handleClose}>取消</Button>
              <Button
                onClick={handleGenerate}
                disabled={!canGoNext}
                leftIcon={<Wand2 className="w-4 h-4" />}
              >
                AI 生成剧本
              </Button>
            </>
          )}
          {step === 3 && !generating && (
            <>
              <Button
                variant="secondary"
                onClick={handleRegenerate}
                leftIcon={<RefreshCw className="w-4 h-4" />}
              >
                重新生成
              </Button>
              <Button
                onClick={handleConfirm}
                disabled={!generated?.project?.id}
                leftIcon={<Check className="w-4 h-4" />}
              >
                确认创建
              </Button>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
