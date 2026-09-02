import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { useAuthStore } from '../stores/useAuthStore';

interface AuthContextValue {
  user: ReturnType<typeof useAuthStore.getState>['user'];
  isLocal: boolean;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  fetchCurrentUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { user, isLocal, isLoading, token, login, logout, fetchCurrentUser } = useAuthStore();

  useEffect(() => {
    // 本地模式或有 token 时获取用户信息
    if (isLocal || token) {
      fetchCurrentUser();
    }
  }, [isLocal, token, fetchCurrentUser]);

  const value: AuthContextValue = {
    user,
    isLocal,
    isLoading,
    isAuthenticated: isLocal || !!token,
    login,
    logout,
    fetchCurrentUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
