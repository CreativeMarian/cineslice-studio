import { useState, useEffect } from 'react';
import { Settings as SettingsIcon, ArrowLeft, Palette, Bell, Database, Info, Save, Sun, Moon, Monitor, FileText, Image, Video, Mic, Brain, Sparkles, BookOpen, Globe, ListTree, Users, FolderOpen, Lock, Ratio, Type } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Card, Tabs, Badge, Button } from './ui';
import { ModelSelector } from './ModelConfig/ModelSelector';
import { preferenceService, type UserPreferences } from '../services/preferenceService';
import { useUIStore } from '../stores/useUIStore';
import { useProjectStore } from '../stores/useProjectStore';
import apiClient from '../services/apiClient';
import { API_PATHS } from '../constants/api';
import { showApiError } from '../utils/error';

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

  // P0-1: 项目记忆
  const { currentProject } = useProjectStore();
  const [memoryData, setMemoryData] = useState<{ bibles: any[]; foreshadows: any[]; relationships: any[] } | null>(null);
  const [isGeneratingMemory, setIsGeneratingMemory] = useState(false);
  const [activeMemoryTab, setActiveMemoryTab] = useState<'character' | 'world' | 'story' | 'foreshadows'>('character');

  const loadMemory = async () => {
    if (!currentProject?.id) return;
    try {
      const res = await apiClient.get<unknown, { success?: boolean; data?: any }>(API_PATHS.projectMemory(currentProject.id));
      if (res.success && res.data) {
        setMemoryData(res.data);
      }
    } catch {
      setMemoryData(null);
    }
  };

  const handleGenerateMemory = async () => {
    if (!currentProject?.id) {
      showToast('请先选择一个项目', 'error');
      return;
    }
    setIsGeneratingMemory(true);
    try {
      const res = await apiClient.post<unknown, { success?: boolean; data?: any }>(API_PATHS.projectMemoryGenerate(currentProject.id));
      if (res.success) {
        showToast('项目记忆生成成功，角色圣经/世界观/剧情摘要已更新', 'success');
        await loadMemory();
      } else {
        showToast('项目记忆生成失败', 'error');
      }
    } catch (err: unknown) {
      showApiError(showToast, err, '项目记忆生成失败');
    } finally {
      setIsGeneratingMemory(false);
    }
  };

  // P0-2: 视觉记忆库
  const [visualMemory, setVisualMemory] = useState<any[]>([]);
  const [visualStats, setVisualStats] = useState<{ total: number; characters: number; scenes: number; keyframes: number; references: number } | null>(null);
  const [visualFilter, setVisualFilter] = useState<'all' | 'character' | 'scene' | 'keyframe'>('all');
  const [isIndexingVisual, setIsIndexingVisual] = useState(false);

  const loadVisualMemory = async () => {
    if (!currentProject?.id) return;
    try {
      const [listRes, statsRes] = await Promise.all([
        apiClient.get<unknown, { success?: boolean; data?: any[] }>(API_PATHS.projectVisualMemory(currentProject.id)),
        apiClient.get<unknown, { success?: boolean; data?: any }>(API_PATHS.projectVisualMemoryStats(currentProject.id)),
      ]);
      if (listRes.success && listRes.data) setVisualMemory(listRes.data);
      if (statsRes.success && statsRes.data) setVisualStats(statsRes.data);
    } catch {
      setVisualMemory([]);
    }
  };

  const handleIndexVisualMemory = async () => {
    if (!currentProject?.id) return;
    setIsIndexingVisual(true);
    try {
      const res = await apiClient.post<unknown, { success?: boolean; data?: any }>(API_PATHS.projectVisualMemoryIndex(currentProject.id), {});
      if (res.success) {
        showToast(`视觉记忆索引完成：${res.data?.indexed || 0} 张`, 'success');
        await loadVisualMemory();
      }
    } catch {
      showToast('视觉记忆索引失败', 'error');
    } finally {
      setIsIndexingVisual(false);
    }
  };

  const handleToggleReference = async (id: string, isReference: boolean) => {
    try {
      await apiClient.put(API_PATHS.visualMemoryReference(id), { is_reference: !isReference });
      await loadVisualMemory();
    } catch {
      showToast('操作失败', 'error');
    }
  };

  const handleDeleteVisual = async (id: string) => {
    try {
      await apiClient.delete(API_PATHS.visualMemoryItem(id));
      showToast('已删除', 'success');
      await loadVisualMemory();
    } catch {
      showToast('删除失败', 'error');
    }
  };

  useEffect(() => {
    if (currentProject?.id) {
      loadMemory();
      loadVisualMemory();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProject?.id]);

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
            <Tabs.Trigger value="project">
              <FolderOpen className="w-4 h-4 mr-2" /> 项目
            </Tabs.Trigger>
            <Tabs.Trigger value="memory">
              <Brain className="w-4 h-4 mr-2" /> 项目记忆
            </Tabs.Trigger>
            <Tabs.Trigger value="visual-memory">
              <Image className="w-4 h-4 mr-2" /> 视觉记忆
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

          <Tabs.Content value="memory">
            <Card className="p-6">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h3 className="font-medium text-[var(--ink-1)] flex items-center gap-2">
                    <Brain className="w-5 h-5 text-[var(--accent)]" /> 项目长期记忆
                  </h3>
                  <p className="text-xs text-[var(--ink-3)] mt-1">角色圣经 / 世界观 / 剧情摘要 / 伏笔追踪，生成时自动注入保证跨剧集一致性</p>
                </div>
                <Button
                  variant="primary"
                  size="sm"
                  leftIcon={<Sparkles className="w-4 h-4" />}
                  onClick={handleGenerateMemory}
                  isLoading={isGeneratingMemory}
                >
                  {memoryData && memoryData.bibles.length > 0 ? '重新生成' : '生成项目记忆'}
                </Button>
              </div>

              {!currentProject ? (
                <div className="text-center py-12 text-[var(--ink-3)]">
                  <Brain className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">请先在项目中打开设置页</p>
                </div>
              ) : (
                <>
                  {/* 记忆子标签 */}
                  <div className="flex gap-2 mb-4 border-b border-[var(--border)] pb-3">
                    {[
                      { key: 'character', label: '角色圣经', icon: Users },
                      { key: 'world', label: '世界观', icon: Globe },
                      { key: 'story', label: '剧情摘要', icon: BookOpen },
                      { key: 'foreshadows', label: '伏笔追踪', icon: ListTree },
                    ].map(tab => (
                      <button
                        key={tab.key}
                        onClick={() => setActiveMemoryTab(tab.key as 'character' | 'world' | 'story' | 'foreshadows')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                          activeMemoryTab === tab.key
                            ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
                            : 'text-[var(--ink-3)] hover:bg-[var(--panel-2)]'
                        }`}
                      >
                        <tab.icon className="w-3.5 h-3.5" />
                        {tab.label}
                        {tab.key === 'foreshadows' && (memoryData?.foreshadows?.length ?? 0) > 0 && (
                          <Badge variant="accent" className="ml-1">{memoryData?.foreshadows?.filter((f: any) => f.status === 'open').length}</Badge>
                        )}
                      </button>
                    ))}
                  </div>

                  {/* 记忆内容展示 */}
                  <div className="max-h-96 overflow-y-auto rounded-lg bg-[var(--panel-2)] p-4">
                    {activeMemoryTab === 'character' && (
                      memoryData?.bibles?.find((b: any) => b.bible_type === 'character')?.content ? (
                        <pre className="text-xs text-[var(--ink-1)] whitespace-pre-wrap font-sans leading-relaxed">
                          {memoryData.bibles.find((b: any) => b.bible_type === 'character').content}
                        </pre>
                      ) : (
                        <p className="text-xs text-[var(--ink-3)] text-center py-8">暂无角色圣经，点击「生成项目记忆」创建</p>
                      )
                    )}
                    {activeMemoryTab === 'world' && (
                      memoryData?.bibles?.find((b: any) => b.bible_type === 'world')?.content ? (
                        <pre className="text-xs text-[var(--ink-1)] whitespace-pre-wrap font-sans leading-relaxed">
                          {memoryData.bibles.find((b: any) => b.bible_type === 'world').content}
                        </pre>
                      ) : (
                        <p className="text-xs text-[var(--ink-3)] text-center py-8">暂无世界观设定</p>
                      )
                    )}
                    {activeMemoryTab === 'story' && (
                      memoryData?.bibles?.find((b: any) => b.bible_type === 'story')?.content ? (
                        <pre className="text-xs text-[var(--ink-1)] whitespace-pre-wrap font-sans leading-relaxed">
                          {memoryData.bibles.find((b: any) => b.bible_type === 'story').content}
                        </pre>
                      ) : (
                        <p className="text-xs text-[var(--ink-3)] text-center py-8">暂无剧情摘要</p>
                      )
                    )}
                    {activeMemoryTab === 'foreshadows' && (
                      (memoryData?.foreshadows?.length ?? 0) > 0 ? (
                        <div className="space-y-2">
                          {memoryData?.foreshadows?.map((f: any, i: number) => (
                            <div key={f.id || i} className="flex items-start gap-3 p-3 rounded-lg bg-[var(--panel)] border border-[var(--border)]">
                              <Badge variant={f.status === 'open' ? 'warning' : 'success'} className="flex-shrink-0 mt-0.5">
                                {f.status === 'open' ? '待回收' : '已回收'}
                              </Badge>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs text-[var(--ink-1)]">{f.description}</p>
                                <p className="text-xs text-[var(--ink-3)] mt-1">重要性: {'⭐'.repeat(f.importance || 1)}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-[var(--ink-3)] text-center py-8">暂无识别到的伏笔</p>
                      )
                    )}
                  </div>

                  {/* 记忆统计 */}
                  {memoryData && (
                    <div className="grid grid-cols-4 gap-3 mt-4">
                      <div className="text-center p-3 rounded-lg bg-[var(--panel-2)]">
                        <p className="text-lg font-bold text-[var(--accent)]">{memoryData.bibles?.length || 0}</p>
                        <p className="text-xs text-[var(--ink-3)]">记忆文档</p>
                      </div>
                      <div className="text-center p-3 rounded-lg bg-[var(--panel-2)]">
                        <p className="text-lg font-bold text-[var(--accent)]">{memoryData.foreshadows?.filter((f: any) => f.status === 'open').length || 0}</p>
                        <p className="text-xs text-[var(--ink-3)]">待回收伏笔</p>
                      </div>
                      <div className="text-center p-3 rounded-lg bg-[var(--panel-2)]">
                        <p className="text-lg font-bold text-[var(--accent)]">{memoryData.relationships?.length || 0}</p>
                        <p className="text-xs text-[var(--ink-3)]">角色关系</p>
                      </div>
                      <div className="text-center p-3 rounded-lg bg-[var(--panel-2)]">
                        <p className="text-lg font-bold text-green-500">✓</p>
                        <p className="text-xs text-[var(--ink-3)]">自动注入</p>
                      </div>
                    </div>
                  )}
                </>
              )}
            </Card>
          </Tabs.Content>

          <Tabs.Content value="visual-memory">
            <Card className="p-6">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h3 className="font-medium text-[var(--ink-1)] flex items-center gap-2">
                    <Image className="w-5 h-5 text-[var(--accent)]" /> 视觉记忆库
                  </h3>
                  <p className="text-xs text-[var(--ink-3)] mt-1">自动收录历史关键帧，按角色/场景分组，视频生成时自动检索作为参考</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  leftIcon={<Sparkles className="w-4 h-4" />}
                  onClick={handleIndexVisualMemory}
                  isLoading={isIndexingVisual}
                >
                  重新索引
                </Button>
              </div>

              {!currentProject ? (
                <div className="text-center py-12 text-[var(--ink-3)]">
                  <Image className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">请先在项目中打开设置页</p>
                </div>
              ) : (
                <>
                  {/* 统计卡片 */}
                  {visualStats && (
                    <div className="grid grid-cols-5 gap-3 mb-4">
                      <div className="text-center p-3 rounded-lg bg-[var(--panel-2)]">
                        <p className="text-lg font-bold text-[var(--accent)]">{visualStats.total}</p>
                        <p className="text-xs text-[var(--ink-3)]">总帧数</p>
                      </div>
                      <div className="text-center p-3 rounded-lg bg-[var(--panel-2)]">
                        <p className="text-lg font-bold text-blue-500">{visualStats.characters}</p>
                        <p className="text-xs text-[var(--ink-3)]">角色帧</p>
                      </div>
                      <div className="text-center p-3 rounded-lg bg-[var(--panel-2)]">
                        <p className="text-lg font-bold text-green-500">{visualStats.scenes}</p>
                        <p className="text-xs text-[var(--ink-3)]">场景帧</p>
                      </div>
                      <div className="text-center p-3 rounded-lg bg-[var(--panel-2)]">
                        <p className="text-lg font-bold text-purple-500">{visualStats.keyframes}</p>
                        <p className="text-xs text-[var(--ink-3)]">关键帧</p>
                      </div>
                      <div className="text-center p-3 rounded-lg bg-[var(--panel-2)]">
                        <p className="text-lg font-bold text-yellow-500">{visualStats.references}</p>
                        <p className="text-xs text-[var(--ink-3)]">参考帧</p>
                      </div>
                    </div>
                  )}

                  {/* 筛选按钮 */}
                  <div className="flex gap-2 mb-4">
                    {[
                      { key: 'all', label: '全部' },
                      { key: 'character', label: '角色' },
                      { key: 'scene', label: '场景' },
                      { key: 'keyframe', label: '关键帧' },
                    ].map(f => (
                      <button
                        key={f.key}
                        onClick={() => setVisualFilter(f.key as 'all' | 'character' | 'scene' | 'keyframe')}
                        className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                          visualFilter === f.key
                            ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
                            : 'text-[var(--ink-3)] hover:bg-[var(--panel-2)]'
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>

                  {/* 图片网格 */}
                  {visualMemory.filter((m: any) => visualFilter === 'all' || m.memory_type === visualFilter).length === 0 ? (
                    <div className="text-center py-12 text-[var(--ink-3)]">
                      <Image className="w-12 h-12 mx-auto mb-3 opacity-30" />
                      <p className="text-sm">暂无视觉记忆，生成关键帧后自动收录</p>
                      <p className="text-xs mt-1">或点击「重新索引」从现有帧构建</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 max-h-96 overflow-y-auto">
                      {visualMemory
                        .filter((m: any) => visualFilter === 'all' || m.memory_type === visualFilter)
                        .map((m: any) => (
                          <div key={m.id} className="group relative aspect-video rounded-lg overflow-hidden border border-[var(--border)] bg-[var(--panel-2)]">
                            {m.image_url ? (
                              <img src={m.image_url} alt={m.entity_name || 'frame'} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-[var(--ink-3)]">
                                <Image className="w-8 h-8 opacity-50" />
                              </div>
                            )}
                            {/* 悬浮操作层 */}
                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-between p-2">
                              <div className="flex items-start justify-between">
                                <Badge variant={m.memory_type === 'character' ? 'info' : m.memory_type === 'scene' ? 'success' : 'accent'}>
                                  {m.memory_type === 'character' ? '👤' : m.memory_type === 'scene' ? '🏞' : '🎬'} {m.entity_name || `#${m.shot_number}`}
                                </Badge>
                                {m.is_reference ? (
                                  <Badge variant="warning" className="flex-shrink-0">⭐ 参考</Badge>
                                ) : null}
                              </div>
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => handleToggleReference(m.id, !!m.is_reference)}
                                  className={`flex-1 px-2 py-1 rounded text-xs font-medium transition-colors ${m.is_reference ? 'bg-yellow-500/80 text-white' : 'bg-white/20 text-white hover:bg-white/30'}`}
                                >
                                  {m.is_reference ? '取消参考' : '设为参考'}
                                </button>
                                <button
                                  onClick={() => handleDeleteVisual(m.id)}
                                  className="px-2 py-1 rounded text-xs bg-red-500/80 text-white hover:bg-red-500 transition-colors"
                                >
                                  删除
                                </button>
                              </div>
                            </div>
                            {/* 底部信息条 */}
                            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-1">
                              <p className="text-xs text-white truncate">镜{m.shot_number} · {m.frame_type || 'keyframe'}</p>
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
                </>
              )}
            </Card>
          </Tabs.Content>

          <Tabs.Content value="project">
            <Card className="p-6">
              <h3 className="font-medium text-[var(--ink-1)] mb-1 flex items-center gap-2">
                <Lock className="w-4 h-4 text-[var(--accent)]" /> 创作锁定项
              </h3>
              <p className="text-sm text-[var(--ink-2)] mb-5">
                风格和比例在项目创建时锁定，保证全片视觉统一。如需更改请新建项目。
              </p>
              {!currentProject ? (
                <div className="text-center py-10 text-[var(--ink-3)]">
                  <FolderOpen className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">未加载项目</p>
                  <p className="text-xs mt-1">请在项目工作台左侧菜单点击「项目设置」查看当前项目的锁定配置</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center gap-4 p-4 rounded-xl bg-[var(--panel-2)]/50 border border-[var(--border)]">
                    <div className="w-9 h-9 rounded-lg bg-[var(--accent-soft)] flex items-center justify-center flex-shrink-0">
                      <FolderOpen className="w-5 h-5 text-[var(--accent)]" />
                    </div>
                    <div className="flex-1">
                      <p className="text-xs font-medium text-[var(--ink-3)] mb-0.5">项目</p>
                      <p className="text-sm font-medium text-[var(--ink-1)]">{currentProject.title}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 p-4 rounded-xl bg-[var(--panel-2)]/50 border border-[var(--border)]">
                    <div className="w-9 h-9 rounded-lg bg-[var(--accent-soft)] flex items-center justify-center flex-shrink-0">
                      <Type className="w-5 h-5 text-[var(--accent)]" />
                    </div>
                    <div className="flex-1">
                      <p className="text-xs font-medium text-[var(--ink-3)] mb-0.5">视觉风格</p>
                      <p className="text-sm font-medium text-[var(--ink-1)]">{currentProject.visual_style || '未设置'}</p>
                    </div>
                    <span className="text-[var(--ink-3)] opacity-70 flex items-center gap-1 text-xs">
                      <Lock className="w-3.5 h-3.5" /> 已锁定
                    </span>
                  </div>
                  <div className="flex items-center gap-4 p-4 rounded-xl bg-[var(--panel-2)]/50 border border-[var(--border)]">
                    <div className="w-9 h-9 rounded-lg bg-[var(--accent-soft)] flex items-center justify-center flex-shrink-0">
                      <Ratio className="w-5 h-5 text-[var(--accent)]" />
                    </div>
                    <div className="flex-1">
                      <p className="text-xs font-medium text-[var(--ink-3)] mb-0.5">画面比例</p>
                      <p className="text-sm font-medium text-[var(--ink-1)]">{currentProject.aspect_ratio || '未设置'}</p>
                    </div>
                    <span className="text-[var(--ink-3)] opacity-70 flex items-center gap-1 text-xs">
                      <Lock className="w-3.5 h-3.5" /> 已锁定
                    </span>
                  </div>
                  <div className="flex items-center gap-4 p-4 rounded-xl bg-[var(--panel-2)]/50 border border-[var(--border)]">
                    <div className="w-9 h-9 rounded-lg bg-[var(--accent-soft)] flex items-center justify-center flex-shrink-0">
                      <FileText className="w-5 h-5 text-[var(--accent)]" />
                    </div>
                    <div className="flex-1">
                      <p className="text-xs font-medium text-[var(--ink-3)] mb-0.5">输入模式</p>
                      <p className="text-sm font-medium text-[var(--ink-1)]">
                        {currentProject.input_mode === 'one_liner' ? '一句话创意'
                          : currentProject.input_mode === 'outline' ? '故事大纲'
                          : currentProject.input_mode === 'novel' ? '小说文本'
                          : '未设置'}
                      </p>
                    </div>
                  </div>
                </div>
              )}
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
