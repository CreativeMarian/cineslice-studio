import { useState, useCallback } from 'react';

interface UseGenerationResult<T> {
  generate: (params?: unknown) => Promise<T | null>;
  isLoading: boolean;
  error: string | null;
}

/**
 * 通用 AI 生成 Hook
 * 统一处理 loading、error 状态
 */
export function useGeneration<T>(
  generateFn: (params: unknown) => Promise<T>
): UseGenerationResult<T> {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(
    async (params?: unknown) => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await generateFn(params);
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : '生成失败';
        setError(message);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [generateFn]
  );

  return { generate, isLoading, error };
}
