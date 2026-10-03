import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Palette,
  MapPin,
  Package,
  Sparkles,
  Plus,
  Image as ImageIcon,
  RefreshCw,
  Wand2,
} from 'lucide-react';
import { Tabs, Button, Card, EmptyState, Badge, Modal, Input, Select, Textarea } from '../ui';
import { SectionHeader, EpisodeSelector } from '../common';
import { useProjectStore } from '../../stores/useProjectStore';
import { useUIStore } from '../../stores/useUIStore';
import { sceneService, propService } from '../../services/assetService';
import { useDefaultModels } from '../../hooks/useDefaultModels';
import { parseModelKey } from '../../types/model';
import { TIME_OF_DAY_LABELS } from '../../utils';
import type { Scene, Prop, PropCategory } from '../../types';

const PROP_CATEGORY_LABELS: Record<string, string> = {
  weapon: '武器',
  clothing: '服装',
  tool: '工具',
  electronic: '电子',
  food: '食物',
  document: '文书',
  decoration: '装饰',
  furniture: '家具',
  vehicle: '载具',
  other: '其他',
};

const PROP_CATEGORY_OPTIONS: Array<{ value: PropCategory; label: string }> = [
  { value: 'weapon', label: '武器' },
  { value: 'furniture', label: '家具' },
  { value: 'vehicle', label: '载具' },
  { value: 'other', label: '其他' },
];

/** 第 3 段 · 美术设定页（场景 + 道具） */
export function StageArt() {
  const { id } = useParams();
  const navigate = useNavigate();
  const {
    scenes,
    setScenes,
    currentEpisodeId,
    episodes,
    setCurrentEpisode,
  } = useProjectStore();
  const { showToast } = useUIStore();
  const { getDefaultModel } = useDefaultModels();

  const [tab, setTab] = useState<'scenes' | 'props'>('scenes');
  const [props, setProps] = useState<Prop[]>([]);
  const [isExtracting, setIsExtracting] = useState(false);
  const [generatingSceneImages, setGeneratingSceneImages] = useState<Set<string>>(new Set());

  // 手动添加道具弹窗
  const [addPropOpen, setAddPropOpen] = useState(false);
  const [addPropForm, setAddPropForm] = useState<{ name: string; category: PropCategory; description: string }>({
    name: '',
    category: 'other',
    description: '',
  });
  const [isAddingProp, setIsAddingProp] = useState(false);

  const loadProps = useCallback(async (episodeId: string) => {
    try {
      const res = await propService.list(episodeId);
      if (res.success && res.data) setProps(res.data);
    } catch {
      setProps([]);
    }
  }, []);

  useEffect(() => {
    if (currentEpisodeId) {
      useProjectStore.getState().loadScenes(currentEpisodeId);
      loadProps(currentEpisodeId);
    }
  }, [currentEpisodeId, loadProps]);

  const currentEpisode = episodes.find((e) => e.id === currentEpisodeId);

  // 生成场景默认提示词（与 StageAssets 中保持一致）
  const generateSceneDefaultPrompt = (scene: Scene) => {
    const timeText = scene.time_of_day === 'night' ? '夜晚，月光照明，深色天空' :
      scene.time_of_day === 'dawn' ? '黎明，柔和晨光，淡色天空' :
      scene.time_of_day === 'dusk' ? '黄昏，金色夕阳，暖色天空' :
      '白天，自然光，明亮天空';
    return `场景概念设定图：${scene.name}。${scene.description || ''}。时间：${timeText}，氛围：${scene.atmosphere || '自然'}。广角镜头，展现完整场景空间，透视准确。场景布局清晰，陈设细节明确，光影方向一致。电影级概念艺术，氛围浓厚，色彩统一。标准场景参考图，用于视频生成时保持场景一致性。画面中绝对不能出现任何文字、字母、数字、符号、字幕、标题、标签、logo、招牌。高质量，8K分辨率，细节丰富，光影自然，专业场景设定，纯视觉画面无文字。`;
  };

  // AI 提取（按当前 Tab）：直接用默认文本模型，不弹配置面板
  const handleExtract = async () => {
    if (!currentEpisodeId) return;
    const modelKey = getDefaultModel('text');
    if (!modelKey) {
      showToast('请先在设置中配置默认文本模型', 'error');
      return;
    }
    setIsExtracting(true);
    try {
      const { provider, modelName } = parseModelKey(modelKey);
      if (tab === 'scenes') {
        const res = await sceneService.extract(currentEpisodeId, { provider, modelName });
        if (res.success && res.data) {
          setScenes(res.data);
          showToast(`成功提取 ${res.data.length} 个场景。下一步：点击场景卡片生成场景概念图`, 'success');
        }
      } else {
        const res = await propService.extract(currentEpisodeId, { provider, modelName });
        if (res.success && res.data) {
          setProps(res.data);
          showToast(`成功提取 ${res.data.length} 个道具。下一步：进入道具详情标记线索道具`, 'success');
        }
      }
    } catch (err: any) {
      const errorMsg = err?.response?.data?.message || err?.message || '提取失败，请检查模型配置';
      showToast(errorMsg, 'error');
    } finally {
      setIsExtracting(false);
    }
  };

  // 手动添加：道具走 propService.create；场景后端暂无创建接口，提示使用 AI 提取
  const handleAddClick = () => {
    if (tab === 'props') {
      setAddPropForm({ name: '', category: 'other', description: '' });
      setAddPropOpen(true);
    } else {
      showToast('手动添加场景暂未开放（后端未提供创建接口），请使用 AI 提取', 'info');
    }
  };

  const handleAddProp = async () => {
    if (!currentEpisodeId) return;
    if (!addPropForm.name.trim()) {
      showToast('请输入道具名称', 'error');
      return;
    }
    setIsAddingProp(true);
    try {
      const res = await propService.create(currentEpisodeId, {
        name: addPropForm.name.trim(),
        category: addPropForm.category,
        description: addPropForm.description.trim(),
      });
      if (res.success && res.data) {
        setProps((prev) => [...prev, res.data as Prop]);
        setAddPropOpen(false);
        showToast(`道具「${res.data.name}」已添加`, 'success');
      }
    } catch (err: any) {
      const errorMsg = err?.response?.data?.message || err?.message || '添加失败';
      showToast(errorMsg, 'error');
    } finally {
      setIsAddingProp(false);
    }
  };

  // 无概念图时：直接用默认图像模型 + 默认提示词生成（不弹配置面板）
  const handleGenerateSceneImage = async (scene: Scene) => {
    const modelKey = getDefaultModel('image');
    if (!modelKey) {
      showToast('请先在设置中配置默认图像模型', 'error');
      return;
    }
    setGeneratingSceneImages((prev) => new Set(prev).add(scene.id));
    try {
      const { provider, modelName } = parseModelKey(modelKey);
      const res = await sceneService.generateImage(scene.id, {
        provider,
        modelName,
        count: 1,
        prompt: generateSceneDefaultPrompt(scene),
      });
      if (res.success && res.data) {
        const updated = res.data as unknown as Scene;
        const current = useProjectStore.getState().scenes;
        setScenes(current.map((s) => (s.id === updated.id ? updated : s)));
        showToast('场景概念图生成成功', 'success');
      }
    } catch (err: any) {
      const errorMsg = err?.response?.data?.message || err?.message || '场景概念图生成失败';
      showToast(errorMsg, 'error');
    } finally {
      setGeneratingSceneImages((prev) => {
        const next = new Set(prev);
        next.delete(scene.id);
        return next;
      });
    }
  };

  if (!currentEpisodeId) {
    return (
      <div className="p-6 max-w-[1400px] mx-auto">
        <SectionHeader
          icon={<Palette className="w-5 h-5 text-[var(--accent)]" />}
          title="美术设定"
          description="场景和叙事道具的概念设定与一致性锚点"
          actions={<EpisodeSelector />}
        />
        <Card>
          <EmptyState
            icon={<Palette className="w-8 h-8" />}
            title="请先选择一集"
            description="点击上方下拉框选择剧集后，可提取和管理场景与道具资产"
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <SectionHeader
        icon={<Palette className="w-5 h-5 text-[var(--accent)]" />}
        title="美术设定"
        description="场景和叙事道具的概念设定与一致性锚点"
        actions={
          <>
            <Button
              size="md"
              variant="outline"
              leftIcon={<Plus className="w-4 h-4" />}
              onClick={handleAddClick}
            >
              手动添加
            </Button>
            <Button
              size="md"
              leftIcon={<Sparkles className="w-4 h-4" />}
              onClick={handleExtract}
              disabled={isExtracting}
            >
              {isExtracting
                ? '提取中...'
                : tab === 'scenes'
                ? '重新提取场景'
                : '重新提取道具'}
            </Button>
          </>
        }
      />

      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <EpisodeSelector />
        <span className="text-xs text-[var(--ink-3)]">
          当前：第{currentEpisode?.episode_number ?? '-'}集 · {currentEpisode?.title ?? '-'}
        </span>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as 'scenes' | 'props')} defaultValue="scenes">
        <Tabs.List>
          <Tabs.Trigger value="scenes">
            <MapPin className="w-4 h-4 mr-2" /> 场景
            <span className="ml-2 text-xs text-[var(--ink-3)] bg-[var(--panel-2)] px-1.5 py-0.5 rounded-full">
              {scenes.length}
            </span>
          </Tabs.Trigger>
          <Tabs.Trigger value="props">
            <Package className="w-4 h-4 mr-2" /> 道具
            <span className="ml-2 text-xs text-[var(--ink-3)] bg-[var(--panel-2)] px-1.5 py-0.5 rounded-full">
              {props.length}
            </span>
          </Tabs.Trigger>
        </Tabs.List>

        {/* 场景 Tab */}
        <Tabs.Content value="scenes">
          {isExtracting && tab === 'scenes' ? (
            <Card className="p-8 flex flex-col items-center justify-center">
              <div className="w-12 h-12 border-3 border-[var(--accent)] border-t-transparent rounded-full animate-spin mb-3" />
              <p className="text-sm font-medium text-[var(--ink-1)]">AI 正在提取场景信息...</p>
              <p className="text-xs text-[var(--ink-3)] mt-1">请稍候，这可能需要 10-30 秒</p>
            </Card>
          ) : scenes.length === 0 ? (
            <Card>
              <EmptyState
                icon={<Wand2 className="w-8 h-8" />}
                title="还没有场景"
                description="AI 将从剧本中自动提取场景信息，包括地点、时段和氛围描述，并生成概念图"
                action={
                  <Button leftIcon={<Sparkles className="w-4 h-4" />} onClick={handleExtract}>
                    开始提取
                  </Button>
                }
              />
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {scenes.map((scene: Scene) => {
                const selectedImg = (scene.concept_images ?? [])[scene.selected_image_index];
                const hasImage = !!selectedImg?.url;
                const isGenerating = generatingSceneImages.has(scene.id);
                return (
                  <Card
                    key={scene.id}
                    hover
                    className="overflow-hidden"
                    onClick={() => navigate(`/project/${id}/art/scene/${scene.id}`)}
                  >
                    <div className="aspect-video bg-[var(--panel-2)] relative overflow-hidden">
                      {hasImage ? (
                        <img
                          src={selectedImg.url}
                          alt={scene.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[var(--panel-2)] to-[var(--panel-3)]">
                          <MapPin className="w-10 h-10 text-[var(--ink-3)]" />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />
                      <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between gap-2">
                        <h4 className="font-semibold text-white font-[var(--font-display)] truncate">
                          {scene.name}
                        </h4>
                        {!hasImage && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleGenerateSceneImage(scene);
                            }}
                            disabled={isGenerating}
                            className="flex-shrink-0 px-2.5 py-1.5 rounded-lg bg-[var(--accent)] text-[var(--on-accent)] text-xs font-medium flex items-center gap-1 hover:brightness-110 transition-all disabled:opacity-50"
                          >
                            {isGenerating ? (
                              <RefreshCw className="w-3 h-3 animate-spin" />
                            ) : (
                              <ImageIcon className="w-3 h-3" />
                            )}
                            {isGenerating ? '生成中' : '生成图'}
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="p-3.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="default">{scene.location || '未设置地点'}</Badge>
                        <Badge variant="default">{TIME_OF_DAY_LABELS[scene.time_of_day] || scene.time_of_day}</Badge>
                        {scene.atmosphere && <Badge variant="accent">{scene.atmosphere}</Badge>}
                      </div>
                      {scene.description && (
                        <p className="text-xs text-[var(--ink-3)] mt-2 line-clamp-2">{scene.description}</p>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </Tabs.Content>

        {/* 道具 Tab */}
        <Tabs.Content value="props">
          {isExtracting && tab === 'props' ? (
            <Card className="p-8 flex flex-col items-center justify-center">
              <div className="w-12 h-12 border-3 border-[var(--accent)] border-t-transparent rounded-full animate-spin mb-3" />
              <p className="text-sm font-medium text-[var(--ink-1)]">AI 正在提取道具信息...</p>
              <p className="text-xs text-[var(--ink-3)] mt-1">请稍候，这可能需要 10-30 秒</p>
            </Card>
          ) : props.length === 0 ? (
            <Card>
              <EmptyState
                icon={<Package className="w-8 h-8" />}
                title="还没有道具"
                description="AI 将从剧本中自动提取关键道具，包括名称、类别和描述，可手动添加或标记线索道具"
                action={
                  <Button leftIcon={<Sparkles className="w-4 h-4" />} onClick={handleExtract}>
                    开始提取
                  </Button>
                }
              />
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {props.map((prop: Prop) => {
                const thumb = (prop.concept_images ?? [])[0]?.url;
                return (
                  <Card
                    key={prop.id}
                    hover
                    className="p-4"
                    onClick={() => navigate(`/project/${id}/art/prop/${prop.id}`)}
                  >
                    <div className="flex items-start gap-3">
                      {thumb ? (
                        <div className="w-12 h-12 rounded-lg overflow-hidden border border-[var(--border)] flex-shrink-0">
                          <img src={thumb} alt={prop.name} className="w-full h-full object-cover" />
                        </div>
                      ) : (
                        <div className="w-12 h-12 rounded-lg bg-[var(--panel-2)] flex items-center justify-center flex-shrink-0">
                          <Package className="w-5 h-5 text-[var(--ink-3)]" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="font-medium text-[var(--ink-1)] truncate">{prop.name}</h4>
                          {prop.is_clue ? (
                            <span className="text-xs text-red-500 flex-shrink-0">🔑线索道具</span>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          <Badge variant="default">
                            {PROP_CATEGORY_LABELS[prop.category] || prop.category || '其他'}
                          </Badge>
                          {prop.is_clue && <Badge variant="danger">线索</Badge>}
                        </div>
                        {prop.description && (
                          <p className="text-xs text-[var(--ink-3)] mt-2 line-clamp-2">{prop.description}</p>
                        )}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </Tabs.Content>
      </Tabs>

      {/* 手动添加道具 */}
      <Modal
        open={addPropOpen}
        onOpenChange={setAddPropOpen}
        title="手动添加道具"
        description="填写道具信息，保存后出现在道具列表中，可进入详情页生成概念图"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setAddPropOpen(false)} disabled={isAddingProp}>
              取消
            </Button>
            <Button onClick={handleAddProp} isLoading={isAddingProp} leftIcon={<Plus className="w-4 h-4" />}>
              添加
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[var(--ink-2)] mb-1.5">道具名称 *</label>
            <Input
              value={addPropForm.name}
              onChange={(e) => setAddPropForm((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="如：传国玉佩"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--ink-2)] mb-1.5">类别</label>
            <Select
              value={addPropForm.category}
              onValueChange={(v) => setAddPropForm((prev) => ({ ...prev, category: v as PropCategory }))}
            >
              {PROP_CATEGORY_OPTIONS.map((opt) => (
                <Select.Item key={opt.value} value={opt.value}>
                  {opt.label}
                </Select.Item>
              ))}
            </Select>
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--ink-2)] mb-1.5">描述</label>
            <Textarea
              value={addPropForm.description}
              onChange={(e) => setAddPropForm((prev) => ({ ...prev, description: e.target.value }))}
              rows={3}
              placeholder="道具外观、材质、功能描述（用于后续生成概念图）"
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
