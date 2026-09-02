import { useState } from 'react';
import { User, Mail, LogOut, Palette, Sun, Moon } from 'lucide-react';
import { Modal, Input, Button, Tabs } from './ui';
import { useAuthStore } from '../stores/useAuthStore';
import { useUIStore } from '../stores/useUIStore';
import { authService } from '../services/authService';

interface ProfileModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProfileModal({ open, onOpenChange }: ProfileModalProps) {
  const { user, isLocal, logout } = useAuthStore();
  const { theme, setTheme, showToast } = useUIStore();
  const [displayName, setDisplayName] = useState(user?.display_name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await authService.updateProfile({ display_name: displayName });
      if (res.success && res.data) {
        useAuthStore.getState().setUser(res.data);
        showToast('资料已更新', 'success');
      }
    } catch {
      showToast('更新失败', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogout = () => {
    logout();
    onOpenChange(false);
    window.location.href = '/login';
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="个人资料"
      size="md"
      footer={
        <>
          {!isLocal && (
            <Button variant="danger" leftIcon={<LogOut className="w-4 h-4" />} onClick={handleLogout}>
              退出登录
            </Button>
          )}
          <Button onClick={handleSave} isLoading={isSaving}>
            保存
          </Button>
        </>
      }
    >
      <Tabs defaultValue="profile">
        <Tabs.List>
          <Tabs.Trigger value="profile">
            <User className="w-4 h-4 mr-2" /> 资料
          </Tabs.Trigger>
          <Tabs.Trigger value="appearance">
            <Palette className="w-4 h-4 mr-2" /> 外观
          </Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="profile">
          <div className="space-y-4">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] flex items-center justify-center shadow-[0_4px_12px_rgba(249,115,22,0.3)]">
                <User className="w-8 h-8 text-[var(--on-accent)]" />
              </div>
              <div>
                <p className="font-semibold text-[var(--ink-1)]">{user?.display_name || '本地用户'}</p>
                <p className="text-sm text-[var(--ink-3)]">
                  {isLocal ? '本地模式 - 无需登录' : `@${user?.username}`}
                </p>
              </div>
            </div>

            <Input
              label="显示名称"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              leftIcon={<User className="w-4 h-4" />}
            />

            {!isLocal && (
              <Input
                label="邮箱"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                leftIcon={<Mail className="w-4 h-4" />}
              />
            )}

            {isLocal && (
              <div className="p-3 rounded-lg bg-[var(--accent-soft)] border border-[var(--accent)]/20">
                <p className="text-sm text-[var(--accent)]">
                  当前为本地模式，所有数据存储在本地 SQLite 数据库中。
                </p>
              </div>
            )}
          </div>
        </Tabs.Content>

        <Tabs.Content value="appearance">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[var(--ink-2)] mb-3">
                主题
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setTheme('light')}
                  className={`p-4 rounded-lg border text-left transition-all ${
                    theme === 'light'
                      ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                      : 'border-[var(--border)] hover:border-[var(--ink-3)]'
                  }`}
                >
                  <div className="w-full h-16 rounded bg-[var(--panel-2)] mb-2 flex items-center justify-center">
                    <Sun className="w-6 h-6 text-[var(--accent)]" />
                  </div>
                  <p className="text-sm font-medium text-[var(--ink-1)]">浅色</p>
                </button>
                <button
                  onClick={() => setTheme('dark')}
                  className={`p-4 rounded-lg border text-left transition-all ${
                    theme === 'dark'
                      ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                      : 'border-[var(--border)] hover:border-[var(--ink-3)]'
                  }`}
                >
                  <div className="w-full h-16 rounded bg-[var(--ink-1)] mb-2 flex items-center justify-center">
                    <Moon className="w-6 h-6 text-[var(--accent)]" />
                  </div>
                  <p className="text-sm font-medium text-[var(--ink-1)]">深色</p>
                </button>
              </div>
            </div>
          </div>
        </Tabs.Content>
      </Tabs>
    </Modal>
  );
}
