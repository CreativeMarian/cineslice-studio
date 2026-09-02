import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../stores/useAuthStore';
import { LoadingState } from './ui';

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isLocal, token, isLoading } = useAuthStore();
  const location = useLocation();

  // 本地模式直接放行
  if (isLocal) return <>{children}</>;

  // 加载中
  if (isLoading) return <LoadingState message="验证登录状态..." />;

  // 未登录跳转
  if (!token) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <>{children}</>;
}
