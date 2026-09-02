import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User } from '../types';
import { authService } from '../services/authService';

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isLocal: boolean;

  setUser: (user: User | null) => void;
  setToken: (token: string | null) => void;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  fetchCurrentUser: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isLoading: false,
      isLocal: import.meta.env.VITE_RUN_MODE === 'local',

      setUser: (user) => set({ user }),
      setToken: (token) => {
        if (token) {
          localStorage.setItem('token', token);
        } else {
          localStorage.removeItem('token');
        }
        set({ token });
      },

      login: async (username, password) => {
        set({ isLoading: true });
        try {
          const res = await authService.login({ username, password });
          if (res.success && res.data) {
            get().setToken(res.data.token);
            set({ user: res.data.user });
          }
        } finally {
          set({ isLoading: false });
        }
      },

      logout: () => {
        get().setToken(null);
        set({ user: null });
      },

      fetchCurrentUser: async () => {
        set({ isLoading: true });
        try {
          const res = await authService.me();
          if (res.success && res.data) {
            set({ user: res.data });
          }
        } catch {
          // 本地模式下后端可能未启动，静默处理
        } finally {
          set({ isLoading: false });
        }
      },
    }),
    {
      name: 'moo-auth-storage',
      partialize: (state) => ({ user: state.user, token: state.token }),
    }
  )
);
