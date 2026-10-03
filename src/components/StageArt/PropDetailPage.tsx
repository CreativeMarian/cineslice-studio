import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Package, Key, Save, Edit3, Link2 } from 'lucide-react';
import { Button, Card, Badge, Textarea, LoadingState } from '../ui';
import { ConceptImageGenerator } from '../common';
import { useProjectStore } from '../../stores/useProjectStore';
import { useUIStore } from '../../stores/useUIStore';
import { propService } from '../../services/assetService';
import apiClient from '../../services/apiClient';
import type { Prop } from '../../types';

const PROMPT_STORAGE_PREFIX = 'moo:prop_prompt:';

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

/** 第 3 段 · 道具详情页：左侧设定信息 + 右侧概念图（1:1 白底方图） */
export function PropDetailPage() {
  const { id, propId } = useParams();
  const navigate = useNavigate();
  const { currentEpisodeId } = useProjectStore();
  const { showToast } = useUIStore();

  const [prop, setProp] = useState<Prop | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [descriptionDraft, setDescriptionDraft] = useState('');
  const [prompt, setPrompt] = useState('');
  const [isSavingDesc, setIsSavingDesc] = useState(false);
  const [isSavingPrompt, setIsSavingPrompt] = useState(false);
  const [isTogglingClue, setIsTogglingClue] = useState(false);

  // 道具不在 store 中，页面内通过 propService.list 加载
  const loadProps = useCallback(async () => {
    if (!currentEpisodeId || !propId) return;
    setIsLoading(true);
    try {
      const res = await propService.list(currentEpisodeId);
      const found = (res.data || []).find((p) => p.id === propId) || null;
      setProp(found);
      if (found) {
        setDescriptionDraft(found.description || '');
        let saved = '';
        try {
          saved = localStorage.getItem(`${PROMPT_STORAGE_PREFIX}${found.id}`) || '';
        } catch { /* ignore */ }
        setPrompt(saved || generatePropDefaultPrompt(found));
      }
    } catch {
      setProp(null);
    } finally {
      setIsLoading(false);
    }
  }, [currentEpisodeId, propId]);

  useEffect(() => {
    loadProps();
  }, [loadProps]);

  // 纯白底单一物品提示词（1:1 道具方图）
  const generatePropDefaultPrompt = (p: Prop) => {
    return `道具概念设定图：${p.name}。${p.description || ''}。纯白色背景，单一物品居中展示，完整呈现道具外观，材质细节清晰，颜色准确，比例真实。产品级白底图，光影均匀柔和，无阴影杂乱，电影级质感，8K分辨率，高清细节。画面中绝对不能出现任何文字、字母、数字、符号、水印、标签、logo、手部或人物。专业道具设定参考图，用于视频生成时保持道具一致性。`;
  };

  if (isLoading) {
    return (
      <div className="p-6 max-w-[1400px] mx-auto">
        <Button variant="ghost" size="sm" leftIcon={<ArrowLeft className="w-4 h-4" />} onClick={() => navigate(`/project/${id}/art`)}>
          返回列表
        </Button>
        <Card className="mt-4">
          <LoadingState message="道具加载中..." />
        </Card>
      </div>
    );
  }

  if (!prop) {
    return (
      <div className="p-6 max-w-[1400px] mx-auto">
        <Button variant="ghost" size="sm" leftIcon={<ArrowLeft className="w-4 h-4" />} onClick={() => navigate(`/project/${id}/art`)}>
          返回列表
        </Button>
        <Card className="mt-4">
          <div className="py-16 text-center">
            <Package className="w-10 h-10 text-[var(--ink-3)] mx-auto mb-3" />
            <p className="text-sm text-[var(--ink-2)]">道具不存在或已删除</p>
          </div>
        </Card>
      </div>
    );
  }

  const handleSaveDescription = async () => {
    setIsSavingDesc(true);
    try {
      const res = await propService.update(prop.id, { description: descriptionDraft });
      if (res.success && res.data) {
        setProp(res.data);
        showToast('道具描述已更新', 'success');
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
      localStorage.setItem(`${PROMPT_STORAGE_PREFIX}${prop.id}`, prompt);
    } catch { /* ignore */ }
    setIsSavingPrompt(true);
    setTimeout(() => {
      setIsSavingPrompt(false);
      showToast('形象提示词已保存，将作为概念图默认生成提示词', 'success');
    }, 300);
  };

  // 线索道具标记切换：线索道具将作为参考图注入对应镜头，保证关键物件跨镜一致
  const handleToggleClue = async () => {
    setIsTogglingClue(true);
    try {
      await apiClient.put(`/props/${prop.id}`, { is_clue: prop.is_clue ? 0 : 1 });
      setProp((prev) => (prev ? { ...prev, is_clue: prev.is_clue ? 0 : 1 } : prev));
      showToast(
        prop.is_clue
          ? '已取消线索标记'
          : '已标记为线索道具：该道具将注入相关镜头参考图',
        'success'
      );
    } catch (err: any) {
      const errorMsg = err?.response?.data?.message || err?.message || '线索标记保存失败';
      showToast(errorMsg, 'error');
    } finally {
      setIsTogglingClue(false);
    }
  };

  // 道具概念图接口只返回新生成的图片，需追加到已有列表
  const handleGenerated = (images: Array<{ url: string }>) => {
    setProp((prev) =>
      prev ? { ...prev, concept_images: [...(prev.concept_images || []), ...images] } : prev
    );
  };

  const handleDeleted = async (index: number) => {
    try {
      const res = await propService.deleteImage(prop.id, index);
      if (res.success) {
        setProp((prev) =>
          prev
            ? { ...prev, concept_images: (prev.concept_images || []).filter((_, i) => i !== index) }
            : prev
        );
        showToast('图片已删除', 'success');
      }
    } catch (err: any) {
      const errorMsg = err?.response?.data?.message || err?.message || '删除图片失败';
      showToast(errorMsg, 'error');
    }
  };

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      {/* 顶部：返回 + 道具名 + 类别标签 + 线索标记切换 */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <Button
          variant="ghost"
          size="sm"
          leftIcon={<ArrowLeft className="w-4 h-4" />}
          onClick={() => navigate(`/project/${id}/art`)}
        >
          返回列表
        </Button>
        <h2 className="text-xl font-bold text-[var(--ink-1)] font-[var(--font-display)]">{prop.name}</h2>
        <Badge variant="default">
          {PROP_CATEGORY_LABELS[prop.category] || prop.category || '其他'}
        </Badge>
        <Button
          variant={prop.is_clue ? 'outline' : 'outline'}
          size="sm"
          className={prop.is_clue ? 'text-red-600 border-red-500/40 bg-red-500/5 hover:bg-red-500/10' : ''}
          leftIcon={<Key className="w-3.5 h-3.5" />}
          onClick={handleToggleClue}
          disabled={isTogglingClue}
        >
          {prop.is_clue ? '🔑 线索道具（点击取消）' : '标记为线索道具'}
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* 左侧：道具设定信息 */}
        <div className="lg:col-span-3 space-y-4">
          <Card className="p-5">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-[var(--ink-2)]">道具描述</h3>
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
              placeholder="道具外观、材质、颜色、尺寸、特殊功能描述..."
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
              placeholder="编辑道具概念图生成提示词..."
            />
            <p className="text-xs text-[var(--ink-3)] mt-2">
              保存后作为概念图默认生成提示词（页面本地记忆），生成时仍可在弹窗中微调
            </p>
          </Card>

          {prop.is_clue ? (
            <Card className="p-5 bg-[rgba(255,107,90,0.05)] border-l-4 border-l-red-500">
              <div className="flex items-start gap-3">
                <Link2 className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-[var(--ink-2)]">
                  <p className="font-medium text-[var(--ink-1)]">线索道具</p>
                  <p className="mt-1">该道具将注入相关镜头参考图，保证关键物件跨镜一致。</p>
                </div>
              </div>
            </Card>
          ) : (
            <Card className="p-5 bg-[var(--panel-2)]/50">
              <p className="text-xs text-[var(--ink-3)]">
                点击右上角「标记为线索道具」：线索道具会作为参考图注入相关镜头，保证关键物件跨镜一致（如关键信件、玉佩、凶器等）。
              </p>
            </Card>
          )}
        </div>

        {/* 右侧：概念图区 */}
        <div className="lg:col-span-2">
          <Card className="p-5">
            <h3 className="text-sm font-semibold text-[var(--ink-2)] mb-4">道具概念图（1:1 白底方图）</h3>
            <ConceptImageGenerator
              title="概念图"
              entityId={prop.id}
              entityType="prop"
              images={prop.concept_images || []}
              defaultPrompt={prompt}
              onGenerated={handleGenerated}
              onDeleted={handleDeleted}
              aspectRatio="1:1"
            />
          </Card>
        </div>
      </div>
    </div>
  );
}
