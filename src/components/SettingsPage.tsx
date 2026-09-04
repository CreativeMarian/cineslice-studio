import { useState, useEffect } from 'react';
import { Settings as SettingsIcon, ArrowLeft, Palette, Bell, Database, Info, Save, Sun, Moon, Monitor, FileText, Image, Video, Mic } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Card, Tabs, Badge, Button } from './ui';
import { ModelSelector } from './ModelConfig/ModelSelector';
import { preferenceService, type UserPreferences } from '../services/preferenceService';
import { useUIStore } from '../stores/useUIStore';

const STORAGE_KEY = 'moo-default-models';

interface DefaultModels {
  text: string;
  image: string;
  video: string;
  audio: string;
}

function loadFromStorage(): DefaultModels {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { text: '', image: '', video: '', audio: '' };
}

function saveToStorage(models: DefaultModels) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(models));
  } catch { /* ignore */ }
}

export function SettingsPage() {
  const navigate = useNavigate();
  const { theme, setTheme, showToast } = useUIStore();
  const [, setPrefs] = useState<UserPreferences | null>(null);
  const [models, setModels] = useState<DefaultModels>(loadFromStorage());
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
    preferenceService.get().then((res) => {
      if (res.success && res.data) {
        setPrefs(res.data);
        const loaded: DefaultModels = {
          text: res.data.default_text_model || '',
          image: res.data.default_image_model || '',
          video: res.data.default_video_model || '',
          audio: res.data.default_audio_model || '',
        };
        setModels(loaded);
        saveToStorage(loaded);
      }
    }).catch(() => {}).finally(() => setIsLoading(false));
  }, []);

  const handleThemeChange = (t: 'light' | 'dark' | 'system') => {
    setTheme(t);
    savePrefs({ theme: t });
  };

  const savePrefs = async (data: Partial<UserPreferences>) => {
    setIsSaving(true);
    try {
      const res = await preferenceService.update(data);
      if (res.success && res.data) {
        setPrefs(res.data);
        showToast('设置已保存', 'success');
      }
    } catch {
      showToast('保存失败', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveDefaults = () => {
    saveToStorage(models);
    savePrefs({
      default_text_model: models.text || null,
      default_image_model: models.image || null,
      default_video_model: models.video || null,
      default_audio_model: models.audio || null,
    });
  };

  const modelConfigs = [
    { key: 'text' as const, label: '文本模型', icon: FileText, desc: '用于剧本生成、角色/场景提取、分镜生成等文本类任务', placeholder: '选择默认文本模型' },
    { key: 'image' as const, label: '首尾帧模型', icon: Image, desc: '用于角色/场景概念图、关键帧（首帧/尾帧）等图像生成', placeholder: '选择默认图像模型' },
    { key: 'video' as const, label: '视频模型', icon: Video, desc: '用于分镜视频片段生成（图生视频/文生视频）', placeholder: '选择默认视频模型' },
    { key: 'audio' as const, label: '音频模型', icon: Mic, desc: '用于配音、背景音乐、音效等音频生成', placeholder: '选择默认音频模型' },
  ];

  return (
    <div className="min-h-screen bg-[var(--page)]">
      <header className="border-b border-[var(--border)] bg-[var(--card-bg)] sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center gap-4">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-lg hover:bg-[var(--panel-2)] text-[var(--ink-3)] hover:text-[var(--ink-1)] transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] flex items-center justify-center shadow-[0_4px_12px_rgba(43, 116, 245, 0.25)]">
              <SettingsIcon className="w-5 h-5 text-[var(--on-accent)]" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-[var(--ink-1)] font-[var(--font-display)]">设置</h1>
              <p className="text-xs text-[var(--ink-3)]">应用偏好与系统配置</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-6">
        <Tabs defaultValue="appearance">
          <Tabs.List>
            <Tabs.Trigger value="appearance">
              <Palette className="w-4 h-4 mr-2" /> 外观
            </Tabs.Trigger>
            <Tabs.Trigger value="models">
              <SettingsIcon className="w-4 h-4 mr-2" /> 默认模型
            </Tabs.Trigger>
            <Tabs.Trigger value="notifications">
              <Bell className="w-4 h-4 mr-2" /> 通知
            </Tabs.Trigger>
            <Tabs.Trigger value="data">
              <Database className="w-4 h-4 mr-2" /> 数据
            </Tabs.Trigger>
            <Tabs.Trigger value="about">
              <Info className="w-4 h-4 mr-2" /> 关于
            </Tabs.Trigger>
          </Tabs.List>

          <Tabs.Content value="appearance">
            <Card className="p-6">
              <h3 className="font-medium text-[var(--ink-1)] mb-4">主题设置</h3>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { value: 'light' as const, label: '浅色', icon: Sun },
                  { value: 'dark' as const, label: '深色', icon: Moon },
                  { value: 'system' as const, label: '跟随系统', icon: Monitor },
                ].map(({ value, label, icon: Icon }) => (
                  <button
                    key={value}
                    onClick={() => handleThemeChange(value)}
                    className={`p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-2 ${
                      theme === value
                        ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                        : 'border-[var(--border)] hover:border-[var(--ink-3)]'
                    }`}
                  >
                    <Icon className="w-6 h-6 text-[var(--ink-2)]" />
                    <span className="text-sm font-medium text-[var(--ink-1)]">{label}</span>
                  </button>
                ))}
              </div>
            </Card>
          </Tabs.Content>

          <Tabs.Content value="models">
            <Card className="p-6">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h3 className="font-medium text-[var(--ink-1)]">默认模型配置</h3>
                  <p className="text-xs text-[var(--ink-3)] mt-1">为各生成环节设置默认模型，无需每次手动选择</p>
                </div>
                <Badge variant="default">4 类模型</Badge>
              </div>

              {isLoading ? (
                <div className="py-8 text-center text-[var(--ink-3)] text-sm">加载中...</div>
              ) : (
                <div className="space-y-5">
                  {modelConfigs.map(({ key, label, icon: Icon, desc, placeholder }) => (
                    <div key={key} className="p-4 rounded-xl bg-[var(--panel-2)]/50 border border-[var(--border)]">
                      <div className="flex items-start gap-3 mb-3">
                        <div className="w-9 h-9 rounded-lg bg-[var(--accent-soft)] flex items-center justify-center flex-shrink-0">
                          <Icon className="w-5 h-5 text-[var(--accent)]" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <label className="block text-sm font-medium text-[var(--ink-1)] mb-1">{label}</label>
                          <p className="text-xs text-[var(--ink-3)] mb-2">{desc}</p>
                          <ModelSelector
                            modelType={key}
                            value={models[key]}
                            onChange={(v) => setModels((prev) => ({ ...prev, [key]: v }))}
                            placeholder={placeholder}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-3 mt-6 pt-5 border-t border-[var(--border)]">
                <Button onClick={handleSaveDefaults} isLoading={isSaving} leftIcon={<Save className="w-4 h-4" />}>
                  保存默认模型
                </Button>
                <p className="text-xs text-[var(--ink-3)]">
                  设置后，剧本/角色/分镜/视频等生成环节将自动使用对应默认模型
                </p>
              </div>
            </Card>
          </Tabs.Content>

          <Tabs.Content value="notifications">
            <Card className="p-6">
              <h3 className="font-medium text-[var(--ink-1)] mb-4">通知设置</h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-[var(--ink-1)]">生成完成通知</p>
                    <p className="text-xs text-[var(--ink-3)]">AI 生成任务完成时提醒</p>
                  </div>
                  <Badge variant="success">已开启</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-[var(--ink-1)]">错误提示</p>
                    <p className="text-xs text-[var(--ink-3)]">生成失败时显示错误详情</p>
                  </div>
                  <Badge variant="success">已开启</Badge>
                </div>
              </div>
            </Card>
          </Tabs.Content>

          <Tabs.Content value="data">
            <Card className="p-6">
              <h3 className="font-medium text-[var(--ink-1)] mb-4">数据管理</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 rounded-lg bg-[var(--panel-2)]">
                  <div>
                    <p className="text-sm font-medium text-[var(--ink-1)]">本地数据存储</p>
                    <p className="text-xs text-[var(--ink-3)]">SQLite 数据库位于 ./data/ 目录</p>
                  </div>
                  <Badge variant="default">本地模式</Badge>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg bg-[var(--panel-2)]">
                  <div>
                    <p className="text-sm font-medium text-[var(--ink-1)]">上传文件</p>
                    <p className="text-xs text-[var(--ink-3)]">用户上传的小说等文件位于 ./uploads/</p>
                  </div>
                  <Badge variant="default">本地模式</Badge>
                </div>
              </div>
            </Card>
          </Tabs.Content>

          <Tabs.Content value="about">
            <Card className="p-6 text-center">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] flex items-center justify-center mx-auto mb-4 shadow-[0_4px_16px_rgba(43, 116, 245, 0.25)]">
                <SettingsIcon className="w-8 h-8 text-[var(--on-accent)]" />
              </div>
              <h3 className="text-xl font-bold text-[var(--ink-1)] mb-1 font-[var(--font-display)]">CineSlice Studio</h3>
              <p className="text-sm text-[var(--ink-3)] mb-4">版本 1.0.0</p>
              <p className="text-sm text-[var(--ink-2)] max-w-md mx-auto leading-relaxed">
                AI 驱动的全流程影视创作工具，涵盖小说上传、章节解析、剧集剧本、角色/场景/道具资产、分镜关键帧、视频片段到成片导出的完整工作流。
              </p>
            </Card>
          </Tabs.Content>
        </Tabs>
      </main>
    </div>
  );
}
