import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Film, User, Lock, Eye, EyeOff, Sparkles, Clapperboard, Wand2 } from 'lucide-react';
import { Button, Input } from './ui';
import { useAuthStore } from '../stores/useAuthStore';

export function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { login, isLoading } = useAuthStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await login(username, password);
      navigate('/');
    } catch {
      setError('用户名或密码错误');
    }
  };

  return (
    <div className="min-h-screen flex bg-[var(--page)]">
      {/* 左侧视觉区 */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden">
        {/* 渐变背景 */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#1a1508] via-[var(--page)] to-[#0d1117]" />
        <div className="absolute inset-0 opacity-30" style={{
          backgroundImage: 'radial-gradient(circle at 30% 20%, rgba(249,115,22,0.15) 0%, transparent 50%), radial-gradient(circle at 70% 80%, rgba(251,146,60,0.1) 0%, transparent 50%)'
        }} />

        {/* 装饰元素 */}
        <div className="absolute top-20 left-20 w-64 h-64 rounded-full bg-[var(--accent)]/5 blur-3xl" />
        <div className="absolute bottom-20 right-20 w-80 h-80 rounded-full bg-[var(--accent-2)]/5 blur-3xl" />

        <div className="relative z-10 flex flex-col justify-center px-16 py-20">
          {/* Logo */}
          <div className="flex items-center gap-3 mb-12">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] flex items-center justify-center shadow-[0_8px_32px_rgba(249,115,22,0.4)]">
              <Film className="w-6 h-6 text-[var(--on-accent)]" />
            </div>
            <span className="text-xl font-bold text-[var(--ink-1)] font-[var(--font-display)]">CineSlice Studio</span>
          </div>

          {/* 大标题 */}
          <h1 className="text-5xl font-bold text-[var(--ink-1)] leading-tight mb-6 font-[var(--font-display)] tracking-tight">
            从小说到成片<br />
            <span className="text-gradient">AI 全流程创作</span>
          </h1>
          <p className="text-lg text-[var(--ink-2)] mb-12 max-w-md leading-relaxed">
            上传小说，AI 自动解析章节、生成剧本、提取角色、生成分镜——让每一个故事都能被看见。
          </p>

          {/* 特性列表 */}
          <div className="space-y-4">
            {[
              { icon: Wand2, text: '智能剧本生成，30 家 AI 模型任选' },
              { icon: Clapperboard, text: '自动分镜与关键帧，导演级画面' },
              { icon: Sparkles, text: '角色/场景/道具资产一键提取' },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-3 text-[var(--ink-2)]">
                <div className="w-8 h-8 rounded-lg bg-[var(--accent-soft)] flex items-center justify-center flex-shrink-0">
                  <item.icon className="w-4 h-4 text-[var(--accent)]" />
                </div>
                <span className="text-sm">{item.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 右侧表单区 */}
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          {/* 移动端 Logo */}
          <div className="lg:hidden flex items-center justify-center gap-3 mb-10">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] flex items-center justify-center">
              <Film className="w-6 h-6 text-[var(--on-accent)]" />
            </div>
            <span className="text-xl font-bold text-[var(--ink-1)] font-[var(--font-display)]">CineSlice Studio</span>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-bold text-[var(--ink-1)] mb-2 font-[var(--font-display)]">欢迎回来</h2>
            <p className="text-sm text-[var(--ink-2)]">登录你的账户，继续创作</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <Input
              label="用户名"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="请输入用户名"
              leftIcon={<User className="w-4 h-4" />}
              required
            />
            <Input
              label="密码"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="请输入密码"
              leftIcon={<Lock className="w-4 h-4" />}
              rightIcon={
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="hover:text-[var(--ink-1)] transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              }
              required
            />

            {error && (
              <div className="text-sm text-[var(--color-danger)] bg-[rgba(255,107,90,0.1)] px-3 py-2 rounded-[var(--radius-control)]">
                {error}
              </div>
            )}

            <Button type="submit" className="w-full" size="lg" isLoading={isLoading}>
              登录
            </Button>
          </form>

          <div className="mt-6 text-center text-sm text-[var(--ink-2)]">
            还没有账号？{' '}
            <Link to="/register" className="text-[var(--accent)] hover:underline font-medium">
              去注册
            </Link>
          </div>

          <div className="mt-8 pt-6 border-t border-[var(--border)]">
            <p className="text-xs text-[var(--ink-3)] text-center">
              本地模式下无需登录，直接进入 <Link to="/" className="text-[var(--accent)] hover:underline">工作台</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
