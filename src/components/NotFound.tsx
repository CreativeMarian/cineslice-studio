import { useNavigate } from 'react-router-dom';
import { Home, AlertTriangle } from 'lucide-react';
import { Button } from './ui';

export function NotFound() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[var(--page)] flex items-center justify-center px-4">
      <div className="text-center">
        <div className="w-20 h-20 rounded-full bg-[var(--accent-soft)] flex items-center justify-center mx-auto mb-6">
          <AlertTriangle className="w-10 h-10 text-[var(--accent)]" />
        </div>
        <h1 className="text-6xl font-bold text-[var(--ink-1)] mb-2 font-[var(--font-display)]">404</h1>
        <p className="text-lg text-[var(--ink-3)] mb-8">页面未找到</p>
        <Button onClick={() => navigate('/')} leftIcon={<Home className="w-4 h-4" />}>
          返回首页
        </Button>
      </div>
    </div>
  );
}
