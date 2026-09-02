// localStorage 持久化的模型选择（记忆用户上次选择）
import { useState, useEffect } from 'react';

export function useStoredModelKey(storageKey: string): [string, (val: string) => void] {
  const [value, setValue] = useState(() => {
    try { return localStorage.getItem(storageKey) || ''; } catch { return ''; }
  });

  useEffect(() => {
    try { localStorage.setItem(storageKey, value); } catch { /* ignore */ }
  }, [value, storageKey]);

  return [value, setValue];
}
