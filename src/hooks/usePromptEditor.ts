// PromptEditor 状态钩子：管理提示词预览的展开 / 加载 / 保存 / 重置。
// 每个创作环节持有独立实例；保存的自定义提示词通过 customPrompt 返回，
// 触发生成时在请求 body 中传入 custom_prompt。
import { useCallback, useEffect, useRef, useState } from 'react';
import type { PromptPreview } from '../services/promptService';

export interface UsePromptEditorResult {
  /** 面板是否展开（对应 PromptEditor 的 expanded / onExpandedChange） */
  open: boolean;
  setOpen: (v: boolean) => void;
  toggle: () => void;
  /** 当前提示词（系统默认或已保存的自定义） */
  prompt: string;
  contextSummary: string;
  loading: boolean;
  /** 本次会话内保存过的自定义提示词；未保存过为 null。生成时传入 custom_prompt */
  customPrompt: string | null;
  /** 保存自定义提示词（会话内记忆，刷新后由后端按需返回） */
  save: (value: string) => Promise<void>;
  /** 重置为系统默认提示词（重新拉取预览） */
  reset: () => Promise<void>;
}

export function usePromptEditor(fetcher: () => Promise<PromptPreview>): UsePromptEditorResult {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [contextSummary, setContextSummary] = useState('');
  const [loading, setLoading] = useState(false);
  const [customPrompt, setCustomPrompt] = useState<string | null>(null);
  const fetchedRef = useRef(false);
  // fetcher 每次渲染可能换闭包（依赖 episodeId / shotId 等），用 ref 保持最新
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const fetchPreview = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetcherRef.current();
      setPrompt(res.prompt ?? '');
      setContextSummary(res.contextSummary ?? '');
      fetchedRef.current = true;
    } catch {
      // 错误已由 apiClient toast；保留旧值，避免闪烁
    } finally {
      setLoading(false);
    }
  }, []);

  // 首次展开时自动拉取预览提示词
  useEffect(() => {
    if (open && !fetchedRef.current && !loading) {
      void fetchPreview();
    }
  }, [open, loading, fetchPreview]);

  const toggle = useCallback(() => setOpen((prev) => !prev), []);

  const save = useCallback(async (value: string) => {
    setCustomPrompt(value);
    setPrompt(value);
  }, []);

  const reset = useCallback(async () => {
    await fetchPreview();
    setCustomPrompt(null);
  }, [fetchPreview]);

  return { open, setOpen, toggle, prompt, contextSummary, loading, customPrompt, save, reset };
}
