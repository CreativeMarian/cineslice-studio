import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, MapPin, Clock, Sun, Save, Edit3, Info,
  LayoutGrid, Plus, Trash2, Pencil, Lightbulb,
} from 'lucide-react';
import { Button, Card, Badge, Textarea, LoadingState, Modal, Input } from '../ui';
import { ConceptImageGenerator } from '../common';
import { useProjectStore } from '../../stores/useProjectStore';
import { useUIStore } from '../../stores/useUIStore';
import { sceneService } from '../../services/assetService';
import { useDebouncedCallback } from '../../hooks/useDebounce';
import { showApiError } from '../../utils/error';
import { TIME_OF_DAY_LABELS, generateId } from '../../utils';
import type { Scene, SpatialLayoutItem, LightingConfig, LightSource } from '../../types';

const PROMPT_STORAGE_PREFIX = 'moo:scene_prompt:';

const EMPTY_LIGHT_SOURCE: LightSource = { position: '', color: '', intensity: '' };
const DEFAULT_LIGHTING: LightingConfig = {
  key_light: { ...EMPTY_LIGHT_SOURCE },
  fill_light: { ...EMPTY_LIGHT_SOURCE },
  rim_light: { ...EMPTY_LIGHT_SOURCE },
  ambient: '',
};

/** 灯光字段定义（key 必填，fill/rim 可选） */
const LIGHT_SOURCE_FIELDS: Array<{ key: 'key_light' | 'fill_light' | 'rim_light'; label: string; required?: boolean }> = [
  { key: 'key_light', label: '主光源', required: true },
  { key: 'fill_light', label: '补光' },
  { key: 'rim_light', label: '轮廓光' },
];

/** 第 3 段 · 场景详情页：左侧设定信息 + 右侧概念图（16:9） */
export function SceneDetailPage() {
  const { id, sceneId } = useParams();
  const navigate = useNavigate();
  const { scenes, setScenes, currentEpisodeId } = useProjectStore();
  const { showToast } = useUIStore();

  const [descriptionDraft, setDescriptionDraft] = useState('');
  const [prompt, setPrompt] = useState('');
  const [isSavingDesc, setIsSavingDesc] = useState(false);
  const [isSavingPrompt, setIsSavingPrompt] = useState(false);

  // P1-2: 空间布局 + 灯光体系
  const [spatialLayout, setSpatialLayout] = useState<SpatialLayoutItem[]>([]);
  // 布局持久化中标志（仅 setter 使用，无 UI 读取；防抖自动保存期间防止重复提交）
  const [, setSavingLayout] = useState(false);
  const [layoutModalOpen, setLayoutModalOpen] = useState(false);
  const [editingLayoutIndex, setEditingLayoutIndex] = useState<number | null>(null);
  const [layoutForm, setLayoutForm] = useState({ name: '', position: '', x: 0.5, y: 0.5 });
  const [lightingDraft, setLightingDraft] = useState<LightingConfig>({
    key_light: { ...EMPTY_LIGHT_SOURCE },
    fill_light: { ...EMPTY_LIGHT_SOURCE },
    rim_light: { ...EMPTY_LIGHT_SOURCE },
    ambient: '',
  });
  const [savingLighting, setSavingLighting] = useState(false);

  const scene = useMemo(() => scenes.find((s) => s.id === sceneId) ?? null, [scenes, sceneId]);

  // 直接访问详情页时，store 可能尚未加载场景列表，自动加载当前集场景
  useEffect(() => {
    if (!scene && currentEpisodeId) {
      useProjectStore.getState().loadScenes(currentEpisodeId);
    }
  }, [scene, currentEpisodeId]);

  // 生成场景默认提示词（与美术页/StageAssets 保持一致）
  const generateSceneDefaultPrompt = useCallback((s: Scene) => {
    const timeText = s.time_of_day === 'night' ? '夜晚，月光照明，深色天空' :
      s.time_of_day === 'dawn' ? '黎明，柔和晨光，淡色天空' :
      s.time_of_day === 'dusk' ? '黄昏，金色夕阳，暖色天空' :
      '白天，自然光，明亮天空';
    return `场景概念设定图：${s.name}。${s.description || ''}。时间：${timeText}，氛围：${s.atmosphere || '自然'}。广角镜头，展现完整场景空间，透视准确。场景布局清晰，陈设细节明确，光影方向一致。电影级概念艺术，氛围浓厚，色彩统一。标准场景参考图，用于视频生成时保持场景一致性。画面中绝对不能出现任何文字、字母、数字、符号、字幕、标题、标签、logo、招牌。高质量，8K分辨率，细节丰富，光影自然，专业场景设定，纯视觉画面无文字。`;
  }, []);

  // 场景变化时同步草稿与提示词（提示词优先取本地记忆）
  useEffect(() => {
    if (scene) {
      setDescriptionDraft(scene.description || '');
      let saved = '';
      try {
        saved = localStorage.getItem(`${PROMPT_STORAGE_PREFIX}${scene.id}`) || '';
      } catch { /* ignore */ }
      setPrompt(saved || generateSceneDefaultPrompt(scene));
    }
  }, [scene, generateSceneDefaultPrompt]);

  // 场景变化时同步空间布局与灯光（JSON 字符串）
  useEffect(() => {
    if (!scene) return;
    try {
      const raw = scene.spatial_layout ? JSON.parse(scene.spatial_layout) : null;
      setSpatialLayout(Array.isArray(raw) ? (raw as SpatialLayoutItem[]) : []);
    } catch {
      setSpatialLayout([]);
    }
    try {
      const raw = scene.lighting ? JSON.parse(scene.lighting) : null;
      if (raw && typeof raw === 'object') {
        setLightingDraft({
          key_light: { ...EMPTY_LIGHT_SOURCE, ...(raw.key_light || {}) },
          fill_light: { ...EMPTY_LIGHT_SOURCE, ...(raw.fill_light || {}) },
          rim_light: { ...EMPTY_LIGHT_SOURCE, ...(raw.rim_light || {}) },
          ambient: raw.ambient || '',
        });
      } else {
        setLightingDraft(DEFAULT_LIGHTING);
      }
    } catch {
      setLightingDraft(DEFAULT_LIGHTING);
    }
  }, [scene]);

  /** 用后端返回的最新场景同步 store（供各保存分支复用，避免重复写 store 逻辑） */
  const updateStoreScene = useCallback(
    (updated: Scene) => {
      const current = useProjectStore.getState().scenes;
      setScenes(current.map((s) => (s.id === updated.id ? updated : s)));
    },
    [setScenes]
  );

  /** 空间布局持久化（silent=true 时不弹 toast，用于点选坐标的防抖自动保存） */
  const persistLayout = async (items: SpatialLayoutItem[], opts: { silent?: boolean } = {}) => {
    if (!scene) return;
    setSavingLayout(true);
    try {
      const res = await sceneService.update(scene.id, { spatial_layout: JSON.stringify(items) });
      if (res.success && res.data) {
        updateStoreScene(res.data);
        setSpatialLayout(items);
        if (!opts.silent) showToast('空间布局已保存', 'success');
      }
    } catch (err: unknown) {
      showApiError(showToast, err, '保存失败');
    } finally {
      setSavingLayout(false);
    }
  };

  /** P2-7: 点选坐标后的防抖自动保存（300-500ms），避免频繁请求 */
  const persistLayoutDebounced = useDebouncedCallback((items: SpatialLayoutItem[]) => {
    persistLayout(items, { silent: true });
  }, 400);

  const openAddLayoutItem = () => {
    setEditingLayoutIndex(null);
    setLayoutForm({ name: '', position: '', x: 0.5, y: 0.5 });
    setLayoutModalOpen(true);
  };

  const openEditLayoutItem = (index: number) => {
    const item = spatialLayout[index];
    if (!item) return;
    setEditingLayoutIndex(index);
    setLayoutForm({ name: item.name, position: item.position, x: item.x, y: item.y });
    setLayoutModalOpen(true);
  };

  /** 保存空间布局项（新增/编辑） */
  const handleSaveLayoutItem = async () => {
    if (!layoutForm.name.trim()) {
      showToast('请输入道具名称', 'error');
      return;
    }
    const next = [...spatialLayout];
    const item: SpatialLayoutItem = {
      // P3-3: 前端唯一 id——编辑保留原 id，新增生成新 id（后端 JSON 存储时忽略该字段）
      id: editingLayoutIndex !== null && next[editingLayoutIndex]
        ? next[editingLayoutIndex].id
        : generateId(),
      name: layoutForm.name.trim(),
      position: layoutForm.position.trim() || '画面中央',
      x: Math.max(0, Math.min(1, layoutForm.x)),
      y: Math.max(0, Math.min(1, layoutForm.y)),
    };
    if (editingLayoutIndex !== null && next[editingLayoutIndex]) {
      next[editingLayoutIndex] = item;
    } else {
      next.push(item);
    }
    setLayoutModalOpen(false);
    await persistLayout(next);
  };

  const handleDeleteLayoutItem = async (id: string) => {
    const index = spatialLayout.findIndex((item) => item.id === id);
    if (index < 0) return;
    if (!window.confirm(`确定删除道具「${spatialLayout[index]?.name || ''}」吗？`)) return;
    const next = spatialLayout.filter((item) => item.id !== id);
    await persistLayout(next);
  };

  /** 灯光持久化（fill/rim 全空则省略） */
  const handleSaveLighting = async () => {
    if (!scene) return;
    const src = lightingDraft.key_light || { ...EMPTY_LIGHT_SOURCE };
    const cfg: LightingConfig = { key_light: src };
    const fill = lightingDraft.fill_light;
    if (fill && (fill.position || fill.color || fill.intensity)) cfg.fill_light = fill;
    const rim = lightingDraft.rim_light;
    if (rim && (rim.position || rim.color || rim.intensity)) cfg.rim_light = rim;
    if (lightingDraft.ambient) cfg.ambient = lightingDraft.ambient;
    setSavingLighting(true);
    try {
      const res = await sceneService.update(scene.id, { lighting: JSON.stringify(cfg) });
      if (res.success && res.data) {
        updateStoreScene(res.data);
        showToast('灯光体系已保存', 'success');
      }
    } catch (err: unknown) {
      showApiError(showToast, err, '保存失败');
    } finally {
      setSavingLighting(false);
    }
  };

  const updateLightingField = (
    sourceKey: 'key_light' | 'fill_light' | 'rim_light',
    field: keyof LightSource,
    value: string
  ) => {
    setLightingDraft((prev) => ({
      ...prev,
      [sourceKey]: { ...(prev[sourceKey] || EMPTY_LIGHT_SOURCE), [field]: value },
    }));
  };

  // 保存场景描述（声明在 Ctrl+S effect 之前，避免 TDZ 与过期闭包）
  const handleSaveDescription = async () => {
    if (!scene) return;
    setIsSavingDesc(true);
    try {
      const res = await sceneService.update(scene.id, { description: descriptionDraft });
      if (res.success && res.data) {
        updateStoreScene(res.data);
        showToast('场景描述已更新', 'success');
      }
    } catch (err: unknown) {
      showApiError(showToast, err, '保存失败');
    } finally {
      setIsSavingDesc(false);
    }
  };

  // P2-9: Ctrl+S 保存场景描述（聚焦在输入框时拦截浏览器默认"保存页面"行为）
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        const t = e.target as HTMLElement | null;
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) {
          e.preventDefault();
          if (scene) void handleSaveDescription();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  // 场景未加载/不存在时展示加载态（后续 handler 依赖 scene 非空）
  if (!scene) {
    return (
      <div className="p-6 max-w-[1400px] mx-auto">
        <Button variant="ghost" size="sm" leftIcon={<ArrowLeft className="w-4 h-4" />} onClick={() => navigate(`/project/${id}/art`)}>
          返回列表
        </Button>
        <Card className="mt-4">
          <LoadingState message="场景加载中..." />
        </Card>
      </div>
    );
  }

  const handleSavePrompt = () => {
    try {
      localStorage.setItem(`${PROMPT_STORAGE_PREFIX}${scene.id}`, prompt);
    } catch { /* ignore */ }
    setIsSavingPrompt(true);
    // 短暂反馈后结束
    setTimeout(() => {
      setIsSavingPrompt(false);
      showToast('形象提示词已保存，将作为概念图默认生成提示词', 'success');
    }, 300);
  };

  const handleGenerated = (images: Array<{ url: string }>) => {
    // 新图片追加在末尾，选中最新生成的一张
    const updated = { ...scene, concept_images: images, selected_image_index: Math.max(0, images.length - 1) };
    updateStoreScene(updated);
  };

  const handleDeleted = async (index: number) => {
    try {
      const res = await sceneService.deleteImage(scene.id, index);
      if (res.success) {
        const newImages = (scene.concept_images || []).filter((_, i) => i !== index);
        const newSelectedIndex = scene.selected_image_index >= newImages.length
          ? Math.max(0, newImages.length - 1)
          : scene.selected_image_index;
        updateStoreScene({ ...scene, concept_images: newImages, selected_image_index: newSelectedIndex });
        showToast('图片已删除', 'success');
      }
    } catch (err: unknown) {
      showApiError(showToast, err, '删除图片失败');
    }
  };

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      {/* 顶部：返回 + 场景名 + 标签 */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <Button
          variant="ghost"
          size="sm"
          leftIcon={<ArrowLeft className="w-4 h-4" />}
          onClick={() => navigate(`/project/${id}/art`)}
        >
          返回列表
        </Button>
        <h2 className="text-xl font-bold text-[var(--ink-1)] font-[var(--font-display)]">{scene.name}</h2>
        <Badge variant="default" className="flex items-center gap-1">
          <MapPin className="w-3 h-3" /> {scene.location || '未设置地点'}
        </Badge>
        <Badge variant="default" className="flex items-center gap-1">
          <Clock className="w-3 h-3" /> {TIME_OF_DAY_LABELS[scene.time_of_day] || scene.time_of_day}
        </Badge>
        {scene.atmosphere && (
          <Badge variant="accent" className="flex items-center gap-1">
            <Sun className="w-3 h-3" /> {scene.atmosphere}
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* 左侧：场景设定信息 */}
        <div className="lg:col-span-3 space-y-4">
          <Card className="p-5">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-[var(--ink-2)]">场景描述</h3>
              <Button
                variant="outline"
                size="sm"
                leftIcon={<Save className="w-3.5 h-3.5" />}
                onClick={handleSaveDescription}
                isLoading={isSavingDesc}
              >
                保存
              </Button>
            </div>
            <Textarea
              value={descriptionDraft}
              onChange={(e) => setDescriptionDraft(e.target.value)}
              rows={4}
              placeholder="场景的空间布局、陈设细节、环境氛围描述..."
            />
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-[var(--ink-2)] flex items-center gap-1.5">
                <Edit3 className="w-3.5 h-3.5 text-[var(--accent)]" /> 形象提示词
              </h3>
              <Button
                variant="outline"
                size="sm"
                leftIcon={<Save className="w-3.5 h-3.5" />}
                onClick={handleSavePrompt}
                isLoading={isSavingPrompt}
              >
                保存
              </Button>
            </div>
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={6}
              className="text-xs font-mono"
              placeholder="编辑场景概念图生成提示词..."
            />
            <p className="text-xs text-[var(--ink-3)] mt-2">
              保存后作为概念图生成默认提示词（页面本地记忆），生成时仍可在弹窗中微调
            </p>
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-[var(--ink-2)] flex items-center gap-1.5">
                <LayoutGrid className="w-3.5 h-3.5 text-[var(--accent)]" /> 空间布局
              </h3>
              <Button
                variant="outline"
                size="sm"
                leftIcon={<Plus className="w-3.5 h-3.5" />}
                onClick={openAddLayoutItem}
              >
                添加道具
              </Button>
            </div>
            <p className="text-xs text-[var(--ink-3)] mb-3">
              定义家具/道具在画面中的位置，视频生成时保持空间一致
            </p>

            {/* 简单可视化：矩形框 = 画面，点选设置位置 */}
            <div
              className="relative aspect-[16/9] rounded-lg border border-dashed border-[var(--border)] bg-[var(--panel-2)]/40 overflow-hidden mb-3"
              title="点击画面可设置道具位置（打开添加弹窗后生效）"
            >
              {spatialLayout.map((item) => (
                <div
                  key={item.id}
                  className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center"
                  style={{ left: `${item.x * 100}%`, top: `${item.y * 100}%` }}
                >
                  <span className="w-2.5 h-2.5 rounded-full bg-[var(--accent)]" />
                  <span className="text-[9px] text-[var(--ink-2)] bg-[var(--bg)]/80 px-1 rounded whitespace-nowrap">{item.name}</span>
                </div>
              ))}
              {spatialLayout.length === 0 && (
                <span className="absolute inset-0 flex items-center justify-center text-xs text-[var(--ink-3)]">
                  暂无道具，点击「添加道具」开始布置
                </span>
              )}
            </div>

            {/* 道具列表 */}
            {spatialLayout.length > 0 && (
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {spatialLayout.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-2 p-2 rounded-lg bg-[var(--panel-2)]/50 border border-[var(--border)]"
                  >
                    <span className="text-sm text-[var(--ink-1)] flex-1 truncate">{item.name}</span>
                    <span className="text-[10px] text-[var(--ink-3)] font-mono">{item.position}</span>
                    <span className="text-[10px] text-[var(--ink-3)] font-mono">x{item.x.toFixed(2)} y{item.y.toFixed(2)}</span>
                    <button
                      type="button"
                      onClick={() => {
                        const idx = spatialLayout.findIndex((s) => s.id === item.id);
                        if (idx >= 0) openEditLayoutItem(idx);
                      }}
                      className="p-1 rounded text-[var(--ink-3)] hover:text-[var(--accent)] hover:bg-[var(--panel-3)] transition-colors"
                      title="编辑"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteLayoutItem(item.id)}
                      className="p-1 rounded text-[var(--ink-3)] hover:text-[var(--term-red)] hover:bg-[var(--panel-3)] transition-colors"
                      title="删除"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-[var(--ink-2)] flex items-center gap-1.5">
                <Lightbulb className="w-3.5 h-3.5 text-[var(--accent)]" /> 灯光体系
              </h3>
              <Button
                variant="outline"
                size="sm"
                leftIcon={<Save className="w-3.5 h-3.5" />}
                onClick={handleSaveLighting}
                isLoading={savingLighting}
              >
                保存灯光
              </Button>
            </div>
            <p className="text-xs text-[var(--ink-3)] mb-3">
              主光源必填，补光/轮廓光可选；统一的灯光方向保证跨镜头光影一致
            </p>

            <div className="space-y-4">
              {LIGHT_SOURCE_FIELDS.map(({ key, label, required }) => (
                <div key={key} className="p-3 rounded-lg bg-[var(--panel-2)]/40 border border-[var(--border)]">
                  <p className="text-xs font-medium text-[var(--ink-2)] mb-2">
                    {label} {required && <span className="text-[var(--term-red)]">*</span>}
                    {!required && <span className="text-[10px] text-[var(--ink-3)]">（可选）</span>}
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    <Input
                      placeholder="位置（如：左上方45度）"
                      value={lightingDraft[key]?.position || ''}
                      onChange={(e) => updateLightingField(key, 'position', e.target.value)}
                      className="h-8 text-xs"
                    />
                    <Input
                      placeholder="颜色（如：暖白色）"
                      value={lightingDraft[key]?.color || ''}
                      onChange={(e) => updateLightingField(key, 'color', e.target.value)}
                      className="h-8 text-xs"
                    />
                    <Input
                      placeholder="强度（如：柔和）"
                      value={lightingDraft[key]?.intensity || ''}
                      onChange={(e) => updateLightingField(key, 'intensity', e.target.value)}
                      className="h-8 text-xs"
                    />
                  </div>
                </div>
              ))}
              <div>
                <label className="block text-xs font-medium text-[var(--ink-2)] mb-1.5">环境光描述</label>
                <Input
                  placeholder="如：清晨薄雾透入，整体偏冷"
                  value={lightingDraft.ambient || ''}
                  onChange={(e) => setLightingDraft((prev) => ({ ...prev, ambient: e.target.value }))}
                />
              </div>
            </div>
          </Card>

          <Card className="p-5 bg-[var(--accent-soft)]/30 border-l-4 border-l-[var(--accent)]">
            <div className="flex items-start gap-3">
              <Info className="w-5 h-5 text-[var(--accent)] flex-shrink-0 mt-0.5" />
              <div className="text-sm text-[var(--ink-2)] space-y-1.5">
                <p className="font-medium text-[var(--ink-1)]">一致性锚点说明</p>
                <p>
                  场景概念图作为视频生成时的<b>场景一致性锚点</b>：镜头画面会参考该图保持空间布局、
                  光影方向与陈设细节一致，跨镜头不漂移。
                </p>
                <p className="text-xs text-[var(--ink-3)]">
                  建议保持「无文字」约束与统一光影描述，不要中途更换完全不同的风格。
                </p>
              </div>
            </div>
          </Card>
        </div>

        {/* 右侧：概念图区 */}
        <div className="lg:col-span-2">
          <Card className="p-5">
            <h3 className="text-sm font-semibold text-[var(--ink-2)] mb-4">场景概念图（16:9）</h3>
            <ConceptImageGenerator
              title="概念图"
              entityId={scene.id}
              entityType="scene"
              images={scene.concept_images || []}
              selectedIndex={scene.selected_image_index || 0}
              defaultPrompt={prompt}
              onGenerated={handleGenerated}
              onDeleted={handleDeleted}
              aspectRatio="16:9"
            />
          </Card>
        </div>
      </div>

      {/* 添加/编辑道具弹窗 */}
      <Modal
        open={layoutModalOpen}
        onOpenChange={setLayoutModalOpen}
        title={editingLayoutIndex !== null ? '编辑道具' : '添加道具'}
        description="设置道具名称、位置与画面坐标（点击下方画面可直接定位）"
        footer={
          <>
            <Button variant="secondary" onClick={() => setLayoutModalOpen(false)}>取消</Button>
            <Button onClick={handleSaveLayoutItem} leftIcon={<Save className="w-4 h-4" />}>
              保存
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3">
            <div>
              <label className="block text-sm font-medium text-[var(--ink-2)] mb-1.5">道具名称 *</label>
              <Input
                placeholder="如：书桌、落地窗、花瓶"
                value={layoutForm.name}
                onChange={(e) => setLayoutForm((prev) => ({ ...prev, name: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--ink-2)] mb-1.5">位置描述</label>
              <Input
                placeholder="如：画面左侧靠窗"
                value={layoutForm.position}
                onChange={(e) => setLayoutForm((prev) => ({ ...prev, position: e.target.value }))}
              />
            </div>
          </div>

          {/* 点选定位 */}
          <div>
            <label className="block text-sm font-medium text-[var(--ink-2)] mb-1.5">
              画面位置 <span className="text-[10px] text-[var(--ink-3)]">（点击画面定位；编辑已有道具时点选会立即自动保存）</span>
            </label>
            <div
              className="relative aspect-[16/9] rounded-lg border border-[var(--border)] bg-[var(--panel-2)]/40 overflow-hidden cursor-crosshair"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
                setLayoutForm((prev) => ({ ...prev, x, y }));
                // P2-7: 编辑已有道具时，点选后立即将更新后的 spatial_layout 保存到后端（防抖）
                if (editingLayoutIndex !== null) {
                  const next = spatialLayout.map((item, i) =>
                    i === editingLayoutIndex ? { ...item, x, y } : item
                  );
                  setSpatialLayout(next);
                  persistLayoutDebounced(next);
                }
              }}
            >
              <span
                className="absolute -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-[var(--accent)] ring-4 ring-[var(--accent-soft)]"
                style={{ left: `${layoutForm.x * 100}%`, top: `${layoutForm.y * 100}%` }}
              />
              <span className="absolute bottom-1.5 right-2 text-[10px] text-[var(--ink-3)] font-mono">
                x{layoutForm.x.toFixed(2)} · y{layoutForm.y.toFixed(2)}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-[var(--ink-2)] mb-1.5">X 坐标（0-1）</label>
              <Input
                type="number"
                min={0}
                max={1}
                step={0.05}
                value={layoutForm.x}
                onChange={(e) => setLayoutForm((prev) => ({ ...prev, x: Number(e.target.value) || 0 }))}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--ink-2)] mb-1.5">Y 坐标（0-1）</label>
              <Input
                type="number"
                min={0}
                max={1}
                step={0.05}
                value={layoutForm.y}
                onChange={(e) => setLayoutForm((prev) => ({ ...prev, y: Number(e.target.value) || 0 }))}
              />
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
