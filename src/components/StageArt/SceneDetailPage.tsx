import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, MapPin, Clock, Sun, Save, Edit3, Info } from 'lucide-react';
import { Button, Card, Badge, Textarea, LoadingState } from '../ui';
import { ConceptImageGenerator } from '../common';
import { useProjectStore } from '../../stores/useProjectStore';
import { useUIStore } from '../../stores/useUIStore';
import { sceneService } from '../../services/assetService';
import { TIME_OF_DAY_LABELS } from '../../utils';
import type { Scene } from '../../types';

const PROMPT_STORAGE_PREFIX = 'moo:scene_prompt:';

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

  const updateStoreScene = useCallback(
    (updated: Scene) => {
      const current = useProjectStore.getState().scenes;
      setScenes(current.map((s) => (s.id === updated.id ? updated : s)));
    },
    [setScenes]
  );

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

  const handleSaveDescription = async () => {
    setIsSavingDesc(true);
    try {
      const res = await sceneService.update(scene.id, { description: descriptionDraft });
      if (res.success && res.data) {
        updateStoreScene(res.data);
        showToast('场景描述已更新', 'success');
      }
    } catch (err: any) {
      const errorMsg = err?.response?.data?.message || err?.message || '保存失败';
      showToast(errorMsg, 'error');
    } finally {
      setIsSavingDesc(false);
    }
  };

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
    } catch (err: any) {
      const errorMsg = err?.response?.data?.message || err?.message || '删除图片失败';
      showToast(errorMsg, 'error');
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
    </div>
  );
}
