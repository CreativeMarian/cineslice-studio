import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type Theme = 'light' | 'dark' | 'system';

export type ToastType = 'success' | 'error' | 'warning' | 'info';
export type ToastSeverity = 'normal' | 'critical';

export interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
  severity?: ToastSeverity;
  duration?: number;
}

interface UIState {
  sidebarCollapsed: boolean;
  theme: Theme;
  activeModal: string | null;
  toasts: ToastItem[];

  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  openModal: (modal: string) => void;
  closeModal: () => void;
  showToast: (message: string, type?: ToastType, options?: { severity?: ToastSeverity; duration?: number }) => void;
  hideToast: (id: string) => void;
  clearToasts: () => void;
}

function applyTheme(theme: Theme) {
  let isDark = theme === 'dark';
  if (theme === 'system') {
    isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  }
  document.documentElement.classList.toggle('dark', isDark);
}

// 监听系统主题变化
if (typeof window !== 'undefined') {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    const stored = localStorage.getItem('moo-ui-storage');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (parsed.state?.theme === 'system') {
          document.documentElement.classList.toggle('dark', e.matches);
        }
      } catch {}
    }
  });
}

let toastIdCounter = 0;
function generateToastId(): string {
  toastIdCounter += 1;
  return `toast-${Date.now()}-${toastIdCounter}`;
}

export const useUIStore = create<UIState>()(
  persist(
    (set, get) => ({
      sidebarCollapsed: false,
      theme: 'dark',
      activeModal: null,
      toasts: [],

      toggleSidebar: () =>
        set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),

      setTheme: (theme) => {
        applyTheme(theme);
        set({ theme });
      },

      toggleTheme: () =>
        set((state) => {
          const newTheme = state.theme === 'dark' ? 'light' : 'dark';
          applyTheme(newTheme);
          return { theme: newTheme };
        }),

      openModal: (modal) => set({ activeModal: modal }),
      closeModal: () => set({ activeModal: null }),

      showToast: (message, type = 'info', options) => {
        const id = generateToastId();
        const duration = options?.duration || (type === 'error' && options?.severity === 'critical' ? 8000 : type === 'error' ? 5000 : 3500);
        const toast: ToastItem = {
          id,
          message,
          type,
          severity: options?.severity || 'normal',
          duration,
        };
        set((state) => ({ toasts: [...state.toasts, toast] }));

        // 自动消失
        setTimeout(() => {
          get().hideToast(id);
        }, duration);
      },

      hideToast: (id) =>
        set((state) => ({
          toasts: state.toasts.filter((t) => t.id !== id),
        })),

      clearToasts: () => set({ toasts: [] }),
    }),
    {
      name: 'moo-ui-storage',
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        theme: state.theme,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) applyTheme(state.theme);
      },
    }
  )
);
