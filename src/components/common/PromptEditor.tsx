// 通用提示词编辑器（PromptEditor）
// 可折叠面板：默认折叠，展开后显示完整提示词；支持 展示 / 编辑 / 重置 三种状态。
// 展示：等宽字体 12px，可滚动（max-height 300px），背景 --panel-2，圆角 8px，padding 12px；
// 编辑：textarea（同样等宽字体）；保存调用 onSave，取消放弃编辑；
// 重置：恢复系统默认提示词（调用 onReset，带确认）；
// 底部：字数统计 + contextSummary（如"已填入：3个角色、2个场景"）；
// 编辑中有未保存修改时，标题旁显示 "●" 标记；加载中显示 Spinner。
import { useState } from 'react';
import { ChevronDown, FileCode2, Pencil, RotateCcw, Save, X } from 'lucide-react';
import { Button, Spinner } from '../ui';
import { cn } from '../../utils';

export interface PromptEditorProps {
  /** 面板标题，默认"提示词" */
  title?: string;
  /** 当前提示词（系统默认或已保存的自定义） */
  prompt: string;
  /** 上下文摘要（如"已填入：3个角色、2个场景"） */
  contextSummary?: string;
  /** 加载中（拉取预览提示词时） */
  isLoading?: boolean;
  /** 保存自定义提示词 */
  onSave: (customPrompt: string) => void | Promise<void>;
  /** 重置为系统默认提示词 */
  onReset?: () => void | Promise<void>;
  /** 默认是否折叠，默认 true */
  defaultCollapsed?: boolean;
  /** 受控展开态（由页面"提示词"按钮控制）；不传则组件内部自管理 */
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  className?: string;
}

export function PromptEditor({
  title = '提示词',
  prompt,
  contextSummary,
  isLoading = false,
  onSave,
  onReset,
  defaultCollapsed = true,
  expanded,
  onExpandedChange,
  className,
}: PromptEditorProps) {
  const [internalExpanded, setInternalExpanded] = useState(!defaultCollapsed);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const isExpanded = expanded !== undefined ? expanded : internalExpanded;
  const setExpanded = (v: boolean) => {
    if (onExpandedChange !== undefined) onExpandedChange(v);
    else setInternalExpanded(v);
  };

  /** 有未保存修改：编辑中且草稿与当前提示词不同 */
  const hasUnsavedChanges = editing && draft !== prompt;
  const charCount = editing ? draft.length : prompt.length;

  const handleEdit = () => {
    setDraft(prompt);
    setEditing(true);
  };

  const handleCancelEdit = () => {
    setEditing(false);
  };

  const handleSave = async () => {
    if (!editing) return;
    setIsSaving(true);
    try {
      await onSave(draft);
      setEditing(false);
    } catch {
      // 保存失败保持编辑态（错误提示由调用方处理）
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    if (!onReset) return;
    if (!window.confirm(`确定将${title}重置为系统默认吗？当前自定义内容将被覆盖。`)) return;
    setIsResetting(true);
    try {
      await onReset();
      setEditing(false);
    } catch {
      // 重置失败保持现状
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className={cn('rounded-xl border border-[var(--border)] bg-[var(--card-bg)] overflow-hidden', className)}>
      {/* 面板头：折叠开关 + 标题 + ● 标记 + 操作按钮 */}
      <div className="flex items-center gap-2 px-3.5 py-2.5">
        <button
          type="button"
          onClick={() => setExpanded(!isExpanded)}
          className="flex items-center gap-2 flex-1 min-w-0 text-left hover:opacity-75 transition-opacity"
          aria-expanded={isExpanded}
        >
          <ChevronDown
            className={cn('w-4 h-4 text-[var(--ink-3)] transition-transform flex-shrink-0', isExpanded && 'rotate-180')}
          />
          <FileCode2 className="w-4 h-4 text-[var(--accent)] flex-shrink-0" />
          <span className="text-sm font-medium text-[var(--ink-1)] truncate">{title}</span>
          {hasUnsavedChanges && (
            <span
              className="w-1.5 h-1.5 rounded-full bg-[var(--color-warning)] flex-shrink-0"
              title="有未保存的修改"
            />
          )}
        </button>

        {isExpanded && (
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {!editing ? (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  leftIcon={<Pencil className="w-3.5 h-3.5" />}
                  onClick={handleEdit}
                  disabled={isLoading || !prompt}
                  title="编辑提示词"
                >
                  编辑
                </Button>
                {onReset && (
                  <Button
                    size="sm"
                    variant="ghost"
                    leftIcon={<RotateCcw className="w-3.5 h-3.5" />}
                    onClick={handleReset}
                    isLoading={isResetting}
                    disabled={isLoading || !prompt}
                    title="恢复为系统默认提示词"
                  >
                    重置
                  </Button>
                )}
              </>
            ) : (
              <>
                <Button
                  size="sm"
                  leftIcon={<Save className="w-3.5 h-3.5" />}
                  onClick={handleSave}
                  isLoading={isSaving}
                  disabled={!draft.trim()}
                  title="保存自定义提示词"
                >
                  保存
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  leftIcon={<X className="w-3.5 h-3.5" />}
                  onClick={handleCancelEdit}
                  disabled={isSaving}
                  title="放弃编辑"
                >
                  取消
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      {/* 面板体：展示 / 编辑 + 底部统计 */}
      {isExpanded && (
        <div className="px-3.5 pb-3.5 pt-1 border-t border-[var(--border)]">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Spinner size="sm" />
              <span className="ml-2 text-xs text-[var(--ink-3)]">正在加载提示词...</span>
            </div>
          ) : editing ? (
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              autoFocus
              className="w-full min-h-[96px] max-h-[300px] overflow-auto resize-y rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-3 py-3 text-xs font-mono leading-relaxed text-[var(--ink-1)] placeholder:text-[var(--ink-3)] focus:outline-none focus:border-[var(--accent)]"
              placeholder="编辑提示词..."
            />
          ) : (
            <pre className="max-h-[300px] overflow-auto rounded-lg bg-[var(--panel-2)] px-3 py-3 text-xs font-mono leading-relaxed text-[var(--ink-2)] whitespace-pre-wrap break-words">
              {prompt || '暂无提示词'}
            </pre>
          )}

          <div className="mt-2 flex items-center gap-3 flex-wrap">
            <span className="text-xs text-[var(--ink-3)] font-mono">{charCount.toLocaleString()} 字</span>
            {contextSummary && <span className="text-xs text-[var(--ink-3)]">{contextSummary}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

/** "提示词" 幽灵按钮：小图标 + 文字，放在主操作按钮旁，点击展开 PromptEditor */
export function PromptToggleButton({
  active = false,
  onClick,
  className,
}: {
  active?: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <Button
      size="md"
      variant="ghost"
      leftIcon={<FileCode2 className="w-4 h-4" />}
      onClick={onClick}
      title="查看/编辑当前环节使用的提示词"
      className={className}
    >
      提示词
      {active && <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] ml-1" />}
    </Button>
  );
}
