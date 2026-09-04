import { useState, useEffect } from 'react';
import { Users, MapPin, Package, Sparkles, MapPin as MapPinIcon, Wand2, Image as ImageIcon, RefreshCw, Trash2 } from 'lucide-react';
import { Tabs, Button, Card, EmptyState, Badge, ImageModal, GenerationProgress, Textarea } from '../ui';
import { CharacterCard } from './CharacterCard';
import { CharacterDetail } from './CharacterDetail';
import { ConfigPanel } from '../StageScript/ConfigPanel';
import { useProjectStore } from '../../stores/useProjectStore';
import { useUIStore } from '../../stores/useUIStore';
import { characterService, sceneService, propService } from '../../services/assetService';
import apiClient from '../../services/apiClient';
import { parseModelKey } from '../../types/model';
import { useDefaultModels } from '../../hooks/useDefaultModels';
import type { Character, Scene, Prop } from '../../types';

const PROP_CATEGORY_LABELS: Record<string, string> = {
  weapon: '武器',
  clothing: '服装',
  tool: '工具',
  electronic: '电子',
  food: '食物',
  document: '文书',
  decoration: '装饰',
  other: '其他',
};

export function StageAssets() {
  const { characters, scenes, setCharacters, setScenes, currentEpisodeId } = useProjectStore();
  const { showToast } = useUIStore();
  const { getDefaultModel } = useDefaultModels();
  const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(null);
  const [charConfigOpen, setCharConfigOpen] = useState(false);
  const [sceneConfigOpen, setSceneConfigOpen] = useState(false);
  const [propConfigOpen, setPropConfigOpen] = useState(false);
  const [isExtractingChars, setIsExtractingChars] = useState(false);
  const [isExtractingScenes, setIsExtractingScenes] = useState(false);
  const [isExtractingProps, setIsExtractingProps] = useState(false);
  const [lastAssetModel, setLastAssetModel] = useState(() => {
    try { return localStorage.getItem('moo:last_asset_model') || ''; } catch { return ''; }
  });

  // 道具状态
  const [props, setProps] = useState<Prop[]>([]);

  // 图片预览弹窗
  const [previewImage, setPreviewImage] = useState<{ url: string; title: string; desc: string } | null>(null);

  // 场景图片生成中
  const [generatingSceneImages] = useState<Set<string>>(new Set());

  // 场景图片生成配置
  const [sceneImageConfigOpen, setSceneImageConfigOpen] = useState(false);
  const [selectedSceneForImage, setSelectedSceneForImage] = useState<Scene | null>(null);
  const [sceneImagePrompt, setSceneImagePrompt] = useState('');
  const [isGeneratingSceneImage, setIsGeneratingSceneImage] = useState(false);

  async function loadProps(episodeId: string) {
    try {
      const res = await propService.list(episodeId);
      if (res.success && res.data) setProps(res.data);
    } catch {
      setProps([]);
    }
  }

  useEffect(() => {
    if (currentEpisodeId) {
      useProjectStore.getState().loadCharacters(currentEpisodeId);
      useProjectStore.getState().loadScenes(currentEpisodeId);
      loadProps(currentEpisodeId);
    }
  }, [currentEpisodeId]);

  // 标记/取消线索道具（线索道具会作为参考图注入对应镜头，保证关键物件跨镜一致）
  const togglePropClue = async (prop: Prop) => {
    try {
      await apiClient.put(`/props/${prop.id}`, { is_clue: prop.is_clue ? 0 : 1 });
      setProps(prev => prev.map(p => p.id === prop.id ? { ...p, is_clue: p.is_clue ? 0 : 1 } : p));
      showToast(prop.is_clue ? '已取消线索标记' : '已标记为线索道具：该道具将注入相关镜头参考图', 'success');
    } catch {
      showToast('线索标记保存失败', 'error');
    }
  };

  const handleExtractCharacters = async (params: { modelKey: string }) => {
    if (!currentEpisodeId) return;
    setIsExtractingChars(true);
    if (params.modelKey) {
      setLastAssetModel(params.modelKey);
      try { localStorage.setItem('moo:last_asset_model', params.modelKey); } catch { /* ignore */ }
    }
    try {
      const modelKey = params.modelKey || getDefaultModel('text');
      if (!modelKey) {
        showToast('请先在设置中配置默认文本模型', 'error');
        return;
      }
      const { provider, modelName } = parseModelKey(modelKey);
      const res = await characterService.extract(currentEpisodeId, { provider, modelName });
      if (res.success && res.data) {
        setCharacters(res.data);
        showToast(`成功提取 ${res.data.length} 个角色。下一步：点击角色卡片生成定妆照`, 'success');
      }
    } catch {
      showToast('提取角色失败，请检查模型配置', 'error');
    } finally {
      setIsExtractingChars(false);
    }
  };

  const handleExtractScenes = async (params: { modelKey: string }) => {
    if (!currentEpisodeId) return;
    setIsExtractingScenes(true);
    if (params.modelKey) {
      setLastAssetModel(params.modelKey);
      try { localStorage.setItem('moo:last_asset_model', params.modelKey); } catch { /* ignore */ }
    }
    try {
      const modelKey = params.modelKey || getDefaultModel('text');
      if (!modelKey) {
        showToast('请先在设置中配置默认文本模型', 'error');
        return;
      }
      const { provider, modelName } = parseModelKey(modelKey);
      const res = await sceneService.extract(currentEpisodeId, { provider, modelName });
      if (res.success && res.data) {
        setScenes(res.data);
        showToast(`成功提取 ${res.data.length} 个场景。下一步：点击场景卡片生成场景概念图`, 'success');
      }
    } catch {
      showToast('提取场景失败，请检查模型配置', 'error');
    } finally {
      setIsExtractingScenes(false);
    }
  };

  const handleExtractProps = async (params: { modelKey: string }) => {
    if (!currentEpisodeId) return;
    setIsExtractingProps(true);
    if (params.modelKey) {
      setLastAssetModel(params.modelKey);
      try { localStorage.setItem('moo:last_asset_model', params.modelKey); } catch { /* ignore */ }
    }
    try {
      const modelKey = params.modelKey || getDefaultModel('text');
      if (!modelKey) {
        showToast('请先在设置中配置默认文本模型', 'error');
        return;
      }
      const { provider, modelName } = parseModelKey(modelKey);
      const res = await propService.extract(currentEpisodeId, { provider, modelName });
      if (res.success && res.data) {
        setProps(res.data);
        showToast(`成功提取 ${res.data.length} 个道具。下一步：标记线索道具以注入镜头参考图`, 'success');
      }
    } catch {
      showToast('提取道具失败，请检查模型配置', 'error');
    } finally {
      setIsExtractingProps(false);
    }
  };

  // 生成场景默认提示词
  const generateSceneDefaultPrompt = (scene: Scene) => {
    const timeText = scene.time_of_day === 'night' ? '夜晚，月光照明，深色天空' :
      scene.time_of_day === 'dawn' ? '黎明，柔和晨光，淡色天空' :
      scene.time_of_day === 'dusk' ? '黄昏，金色夕阳，暖色天空' :
      '白天，自然光，明亮天空';
    return `场景概念设定图：${scene.name}。${scene.description || ''}。时间：${timeText}，氛围：${scene.atmosphere || '自然'}。广角镜头，展现完整场景空间，透视准确。场景布局清晰，陈设细节明确，光影方向一致。电影级概念艺术，氛围浓厚，色彩统一。标准场景参考图，用于视频生成时保持场景一致性。画面中绝对不能出现任何文字、字母、数字、符号、字幕、标题、标签、logo、招牌。高质量，8K分辨率，细节丰富，光影自然，专业场景设定，纯视觉画面无文字。`;
  };

  // 打开场景图片生成配置
  const handleOpenSceneImageConfig = (scene: Scene) => {
    setSelectedSceneForImage(scene);
    setSceneImagePrompt(generateSceneDefaultPrompt(scene));
    setSceneImageConfigOpen(true);
  };

  // 实际生成场景图片
  const handleGenerateSceneImage = async (params: { modelKey: string }) => {
    if (!selectedSceneForImage) return;
    setIsGeneratingSceneImage(true);
    try {
      const { provider, modelName } = parseModelKey(params.modelKey);
      const res = await sceneService.generateImage(selectedSceneForImage.id, {
        provider,
        modelName,
        count: 1,
        prompt: sceneImagePrompt, // 使用用户编辑的提示词
      });
      if (res.success && res.data) {
        // 直接更新场景列表中的对应场景（使用 getState 获取最新状态避免闭包问题）
        const updatedScene = res.data as unknown as Scene;
        const currentScenes = useProjectStore.getState().scenes;
        setScenes(currentScenes.map(s => s.id === updatedScene.id ? updatedScene : s));
        showToast('场景概念图生成成功', 'success');
        setSceneImageConfigOpen(false);
      }
    } catch (err: any) {
      const errorMsg = err?.response?.data?.message || err?.message || '场景概念图生成失败';
      showToast(errorMsg, 'error');
      console.error('[SceneImage] 生成失败:', err);
    } finally {
      setIsGeneratingSceneImage(false);
    }
  };

  // 删除场景图片
  const handleDeleteSceneImage = async (scene: Scene, index: number) => {
    try {
      const res = await sceneService.deleteImage(scene.id, index);
      if (res.success) {
        // 直接更新场景列表中的对应场景，移除删除的图片
        const currentScenes = useProjectStore.getState().scenes;
        setScenes(currentScenes.map(s => {
          if (s.id !== scene.id) return s;
          const newImages = (s.concept_images || []).filter((_: any, i: number) => i !== index);
          const newSelectedIndex = s.selected_image_index >= newImages.length
            ? Math.max(0, newImages.length - 1)
            : s.selected_image_index;
          return { ...s, concept_images: newImages, selected_image_index: newSelectedIndex };
        }));
        showToast('图片已删除', 'success');
      }
    } catch (err: any) {
      const errorMsg = err?.response?.data?.message || err?.message || '删除图片失败';
      showToast(errorMsg, 'error');
    }
  };

  const handleCharacterUpdate = (updated: Character) => {
    const currentChars = useProjectStore.getState().characters;
    setCharacters(currentChars.map((c) => (c.id === updated.id ? updated : c)));
    setSelectedCharacter(updated);
  };

  if (!currentEpisodeId) {
    return (
      <div className="p-6">
        <Card>
          <EmptyState
            icon={<Users className="w-8 h-8" />}
            title="请先选择一集"
            description="选择剧集后可提取和管理角色、场景、道具资产"
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <Tabs defaultValue="characters">
        <Tabs.List>
          <Tabs.Trigger value="characters">
            <Users className="w-4 h-4 mr-2" /> 角色
            <span className="ml-2 text-xs text-[var(--ink-3)] bg-[var(--panel-2)] px-1.5 py-0.5 rounded-full">
              {characters.length}
            </span>
          </Tabs.Trigger>
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

        {/* 角色 Tab */}
        <Tabs.Content value="characters">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[var(--accent-soft)] flex items-center justify-center">
                <Users className="w-5 h-5 text-[var(--accent)]" />
              </div>
              <div>
                <h3 className="font-semibold text-[var(--ink-1)] font-[var(--font-display)]">角色资产</h3>
                <p className="text-xs text-[var(--ink-3)]">AI 从剧本提取角色信息并生成概念图（目标 5-10 个）</p>
              </div>
            </div>
            <Button size="md" leftIcon={<Sparkles className="w-4 h-4" />} onClick={() => setCharConfigOpen(true)} disabled={isExtractingChars}>
              {isExtractingChars ? '提取中...' : '提取角色'}
            </Button>
          </div>

          {isExtractingChars && (
            <div className="mb-4">
              <GenerationProgress
                isGenerating={isExtractingChars}
                stage="AI 正在分析剧本并提取角色信息..."
                modelName={lastAssetModel ? parseModelKey(lastAssetModel).modelName : ''}
                compact
              />
            </div>
          )}

          {characters.length === 0 && !isExtractingChars ? (
            <Card>
              <EmptyState
                icon={<Wand2 className="w-8 h-8" />}
                title="还没有角色"
                description="AI 将从剧本中自动提取角色信息，包括名称、性别、角色类型和外貌描述，并生成概念图"
                action={
                  <Button leftIcon={<Sparkles className="w-4 h-4" />} onClick={() => setCharConfigOpen(true)}>
                    开始提取
                  </Button>
                }
              />
            </Card>
          ) : characters.length === 0 && isExtractingChars ? (
            <Card className="p-8 flex flex-col items-center justify-center">
              <div className="w-12 h-12 border-3 border-[var(--accent)] border-t-transparent rounded-full animate-spin mb-3" />
              <p className="text-sm font-medium text-[var(--ink-1)]">AI 正在提取角色信息...</p>
              <p className="text-xs text-[var(--ink-3)] mt-1">请稍候，这可能需要 10-30 秒</p>
              {/* 进度条 */}
              <div className="w-full max-w-xs mt-4 h-1.5 bg-[var(--panel-3)] rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-[var(--accent)] to-[var(--accent-2)] rounded-full animate-pulse" style={{ width: '60%' }} />
              </div>
            </Card>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {characters.map((character) => (
                <CharacterCard
                  key={character.id}
                  character={character}
                  onSelect={setSelectedCharacter}
                  onImageClick={(url, char) =>
                    setPreviewImage({ url, title: char.name, desc: char.visual_description || char.description })
                  }
                />
              ))}
            </div>
          )}
        </Tabs.Content>

        {/* 场景 Tab */}
        <Tabs.Content value="scenes">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[var(--accent-soft)] flex items-center justify-center">
                <MapPinIcon className="w-5 h-5 text-[var(--accent)]" />
              </div>
              <div>
                <h3 className="font-semibold text-[var(--ink-1)] font-[var(--font-display)]">场景资产</h3>
                <p className="text-xs text-[var(--ink-3)]">AI 从剧本提取场景信息并生成概念图（目标 3-5 个）</p>
              </div>
            </div>
            <Button size="md" leftIcon={<Sparkles className="w-4 h-4" />} onClick={() => setSceneConfigOpen(true)} disabled={isExtractingScenes}>
              {isExtractingScenes ? '提取中...' : '提取场景'}
            </Button>
          </div>

          {isExtractingScenes && (
            <div className="mb-4">
              <GenerationProgress
                isGenerating={isExtractingScenes}
                stage="AI 正在分析剧本并提取场景信息..."
                modelName={lastAssetModel ? parseModelKey(lastAssetModel).modelName : ''}
                compact
              />
            </div>
          )}

          {scenes.length === 0 && !isExtractingScenes ? (
            <Card>
              <EmptyState
                icon={<MapPinIcon className="w-8 h-8" />}
                title="还没有场景"
                description="AI 将从剧本中自动提取场景信息，包括地点、时段和氛围描述，并生成概念图"
                action={
                  <Button leftIcon={<Sparkles className="w-4 h-4" />} onClick={() => setSceneConfigOpen(true)}>
                    开始提取
                  </Button>
                }
              />
            </Card>
          ) : scenes.length === 0 && isExtractingScenes ? (
            <Card className="p-8 flex flex-col items-center justify-center">
              <div className="w-12 h-12 border-3 border-[var(--accent)] border-t-transparent rounded-full animate-spin mb-3" />
              <p className="text-sm font-medium text-[var(--ink-1)]">AI 正在提取场景信息...</p>
              <p className="text-xs text-[var(--ink-3)] mt-1">请稍候，这可能需要 10-30 秒</p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {scenes.map((scene: Scene) => {
                const selectedImg = (scene.concept_images ?? [])[scene.selected_image_index];
                const hasImage = !!selectedImg?.url;
                const isGenerating = generatingSceneImages.has(scene.id);
                return (
                  <Card key={scene.id} hover className="overflow-hidden group">
                    <div className="aspect-video bg-[var(--panel-2)] relative overflow-hidden">
                      {hasImage ? (
                        <img
                          src={selectedImg.url}
                          alt={scene.name}
                          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 cursor-zoom-in"
                          onClick={() =>
                            setPreviewImage({ url: selectedImg.url, title: scene.name, desc: scene.description })
                          }
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[var(--panel-2)] to-[var(--panel-3)]">
                          <MapPinIcon className="w-10 h-10 text-[var(--ink-3)]" />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                      <div className="absolute bottom-3 left-3 right-3">
                        <h4 className="font-semibold text-white font-[var(--font-display)]">{scene.name}</h4>
                      </div>
                      {/* 生成图片按钮 - 无图片时显示 */}
                      {!hasImage && (
                        <button
                          onClick={() => handleOpenSceneImageConfig(scene)}
                          disabled={isGenerating}
                          className="absolute top-3 right-3 px-2.5 py-1.5 rounded-lg bg-[var(--accent)] text-[var(--on-accent)] text-xs font-medium flex items-center gap-1 hover:brightness-110 transition-all disabled:opacity-50"
                        >
                          {isGenerating ? (
                            <RefreshCw className="w-3 h-3 animate-spin" />
                          ) : (
                            <ImageIcon className="w-3 h-3" />
                          )}
                          {isGenerating ? '生成中' : '生成图'}
                        </button>
                      )}

                      {/* 图片操作按钮 - 有图片时鼠标悬停显示 */}
                      {hasImage && (
                        <div className="absolute top-3 right-3 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => handleOpenSceneImageConfig(scene)}
                            className="w-7 h-7 rounded-lg bg-black/50 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/70 transition-colors"
                            title="重新生成（可编辑提示词）"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteSceneImage(scene, scene.selected_image_index)}
                            className="w-7 h-7 rounded-lg bg-red-500/70 backdrop-blur-sm flex items-center justify-center text-white hover:bg-red-500 transition-colors"
                            title="删除当前图片"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                      {(scene.concept_images?.length ?? 0) > 0 && (
                        <div className="absolute top-3 left-3 bg-black/50 backdrop-blur-sm rounded-full px-2 py-0.5 text-xs text-white flex items-center gap-1">
                          <ImageIcon className="w-3 h-3" />
                          {scene.concept_images?.length}
                        </div>
                      )}
                    </div>
                    <div className="p-3.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="default">{scene.location || '未设置地点'}</Badge>
                        <Badge variant="default">{scene.time_of_day}</Badge>
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
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[var(--accent-soft)] flex items-center justify-center">
                <Package className="w-5 h-5 text-[var(--accent)]" />
              </div>
              <div>
                <h3 className="font-semibold text-[var(--ink-1)] font-[var(--font-display)]">道具资产</h3>
                <p className="text-xs text-[var(--ink-3)]">AI 从剧本提取关键道具（目标 3-8 个）</p>
              </div>
            </div>
            <Button size="md" leftIcon={<Sparkles className="w-4 h-4" />} onClick={() => setPropConfigOpen(true)} disabled={isExtractingProps}>
              {isExtractingProps ? '提取中...' : '提取道具'}
            </Button>
          </div>

          {isExtractingProps && (
            <div className="mb-4">
              <GenerationProgress
                isGenerating={isExtractingProps}
                stage="AI 正在分析剧本并提取道具信息..."
                modelName={lastAssetModel ? parseModelKey(lastAssetModel).modelName : ''}
                compact
              />
            </div>
          )}

          {props.length === 0 && !isExtractingProps ? (
            <Card>
              <EmptyState
                icon={<Package className="w-8 h-8" />}
                title="还没有道具"
                description="AI 将从剧本中自动提取关键道具，包括名称、类别和描述"
                action={
                  <Button leftIcon={<Sparkles className="w-4 h-4" />} onClick={() => setPropConfigOpen(true)}>
                    开始提取
                  </Button>
                }
              />
            </Card>
          ) : props.length === 0 && isExtractingProps ? (
            <Card className="p-8 flex flex-col items-center justify-center">
              <div className="w-12 h-12 border-3 border-[var(--accent)] border-t-transparent rounded-full animate-spin mb-3" />
              <p className="text-sm font-medium text-[var(--ink-1)]">AI 正在提取道具信息...</p>
              <p className="text-xs text-[var(--ink-3)] mt-1">请稍候，这可能需要 10-30 秒</p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {props.map((prop: Prop) => (
                <Card key={prop.id} className="p-4 hover:shadow-lg transition-shadow">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-[var(--panel-2)] flex items-center justify-center flex-shrink-0">
                      <Package className="w-5 h-5 text-[var(--ink-3)]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-[var(--ink-1)] truncate">{prop.name}</h4>
                      <Badge variant="default" className="mt-1">
                        {PROP_CATEGORY_LABELS[prop.category || 'other'] || prop.category || '其他'}
                      </Badge>
                      <button
                        type="button"
                        onClick={() => togglePropClue(prop)}
                        className={`px-2 py-0.5 mt-1.5 rounded text-[10px] border transition-colors ${prop.is_clue ? 'bg-red-500/10 text-red-600 border-red-500/30' : 'text-[var(--ink-3)] border-[var(--border)] hover:bg-[var(--panel-2)]'}`}
                      >
                        {prop.is_clue ? '🔑 线索道具' : '标记为线索'}
                      </button>
                      {prop.description && (
                        <p className="text-xs text-[var(--ink-3)] mt-2 line-clamp-2">{prop.description}</p>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </Tabs.Content>
      </Tabs>

      <CharacterDetail
        character={selectedCharacter}
        onClose={() => setSelectedCharacter(null)}
        onUpdate={handleCharacterUpdate}
      />

      <ConfigPanel
        open={charConfigOpen}
        onOpenChange={setCharConfigOpen}
        title="提取角色"
        description="AI 将从剧本中提取所有角色信息，包括名称、性别、角色类型和外貌描述（目标 5-10 个）"
        modelType="text"
        onGenerate={handleExtractCharacters}
        isLoading={isExtractingChars}
        defaultModelKey={lastAssetModel}
      />

      <ConfigPanel
        open={sceneConfigOpen}
        onOpenChange={setSceneConfigOpen}
        title="提取场景"
        description="AI 将从剧本中提取所有重要场景，包括地点、时段和氛围描述（目标 3-5 个）"
        modelType="text"
        onGenerate={handleExtractScenes}
        isLoading={isExtractingScenes}
        defaultModelKey={lastAssetModel}
      />

      <ConfigPanel
        open={propConfigOpen}
        onOpenChange={setPropConfigOpen}
        title="提取道具"
        description="AI 将从剧本中提取关键道具，包括名称、类别和描述（目标 3-8 个）"
        modelType="text"
        onGenerate={handleExtractProps}
        isLoading={isExtractingProps}
        defaultModelKey={lastAssetModel}
      />

      {/* 场景图片生成配置 */}
      <ConfigPanel
        open={sceneImageConfigOpen}
        onOpenChange={setSceneImageConfigOpen}
        title="生成场景概念图"
        description={selectedSceneForImage ? `为「${selectedSceneForImage.name}」生成场景概念图` : ''}
        modelType="image"
        onGenerate={handleGenerateSceneImage}
        isLoading={isGeneratingSceneImage}
        defaultModelKey={lastAssetModel}
        extraFields={
          <div>
            <label className="block text-sm font-medium text-[var(--ink-2)] mb-1.5">
              生成提示词（可编辑）
            </label>
            <Textarea
              value={sceneImagePrompt}
              onChange={(e) => setSceneImagePrompt(e.target.value)}
              rows={6}
              className="text-xs font-mono"
              placeholder="编辑场景概念图生成提示词..."
            />
            <p className="text-xs text-[var(--ink-3)] mt-1.5">
              提示：提示词中已包含"无文字"约束，生成的图片不会出现英文或中文文字
            </p>
          </div>
        }
      />

      {/* 图片预览弹窗 */}
      <ImageModal
        open={!!previewImage}
        onClose={() => setPreviewImage(null)}
        imageUrl={previewImage?.url || ''}
        title={previewImage?.title}
        description={previewImage?.desc}
      />
    </div>
  );
}
