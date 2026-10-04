import { useState } from 'react';
import { Image as ImageIcon, RefreshCw, Trash2, Sparkles, ZoomIn } from 'lucide-react';
import { Button, Modal, Textarea, ImageModal } from '../ui';
import { characterService, sceneService, propService } from '../../services/assetService';
import { useDefaultModels } from '../../hooks/useDefaultModels';
import { useUIStore } from '../../stores/useUIStore';
import { showApiError } from '../../utils/error';
import { parseModelKey } from '../../types/model';
import { cn } from '../../utils';

export interface ConceptImageGeneratorProps {
  /** 标题，如 "概念图" 或 "四视图" */
  title: string;
  entityId: string;
  entityType: 'character' | 'scene' | 'prop';
  /** 已有图片列表 */
  images: Array<{ url: string }>;
  /** 当前选中图片索引 */
  selectedIndex?: number;
  /** 默认生成提示词 */
  defaultPrompt: string;
  /** 生成成功回调（返回新的图片列表） */
  onGenerated: (images: Array<{ url: string }>) => void;
  /** 删除图片回调 */
  onDeleted?: (index: number) => void;
  /** 图片宽高比，默认 3:4 */
  aspectRatio?: '1:1' | '3:4' | '16:9';
  /** 生成模式：concept=常规概念图；fourView=角色四视图（调用四视图专用接口，参考概念图锚点生成） */
  variant?: 'concept' | 'fourView';
}

const ASPECT_CLASS: Record<NonNullable<ConceptImageGeneratorProps['aspectRatio']>, string> = {
  '1:1': 'aspect-square',
  '3:4': 'aspect-[3/4]',
  '16:9': 'aspect-video',
};

/**
 * 概念图生成器：通用角色/场景/道具概念图生成组件。
 * 无图时显示占位 + 生成按钮；有图时悬停显示「重新生成」和「删除」。
 * 生成前弹出提示词编辑 Modal，确认后调用对应 service 的 generateImage。
 */
export function ConceptImageGenerator({
  title,
  entityId,
  entityType,
  images,
  selectedIndex = 0,
  defaultPrompt,
  onGenerated,
  onDeleted,
  aspectRatio = '3:4',
  variant = 'concept',
}: ConceptImageGeneratorProps) {
  const { showToast } = useUIStore();
  const { getDefaultModel } = useDefaultModels();
  const [modalOpen, setModalOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [prompt, setPrompt] = useState(defaultPrompt);
  const [isGenerating, setIsGenerating] = useState(false);

  const safeIndex = Math.min(Math.max(selectedIndex, 0), Math.max(images.length - 1, 0));
  const currentImage = images[safeIndex]?.url;

  const openModal = () => {
    setPrompt(defaultPrompt);
    setModalOpen(true);
  };

  const handleGenerate = async () => {
    const modelKey = getDefaultModel('image');
    if (!modelKey) {
      showToast('请先在设置中配置默认图像模型', 'error');
      return;
    }
    setIsGenerating(true);
    try {
      const { provider, modelName } = parseModelKey(modelKey);
      if (entityType === 'character') {
        if (variant === 'fourView') {
          // 四视图：参考概念图（锚点图）生成，调用四视图专用接口
          const res = await characterService.generateFourView(entityId, {
            provider,
            modelName,
            referenceImageUrl: images[0]?.url,
            prompt,
          });
          if (res.success && res.data) {
            onGenerated(res.data.four_view_images ?? []);
            showToast('四视图生成成功', 'success');
            setModalOpen(false);
          }
        } else {
          const res = await characterService.generateImage(entityId, { provider, modelName, count: 1, prompt });
          if (res.success && res.data) {
            onGenerated(res.data.concept_images ?? []);
            showToast('概念图生成成功', 'success');
            setModalOpen(false);
          }
        }
      } else if (entityType === 'scene') {
        const res = await sceneService.generateImage(entityId, { provider, modelName, count: 1, prompt });
        if (res.success && res.data) {
          onGenerated(res.data.concept_images ?? []);
          showToast('场景概念图生成成功', 'success');
          setModalOpen(false);
        }
      } else {
        const res = await propService.generateImage(entityId, { provider, modelName, count: 1, prompt });
        if (res.success && res.data) {
          onGenerated(res.data.map((d) => ({ url: d.url })));
          showToast('道具概念图生成成功', 'success');
          setModalOpen(false);
        }
      }
    } catch (err: unknown) {
      showApiError(showToast, err, '概念图生成失败');
      console.error('[ConceptImageGenerator] 生成失败:', err);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div>
      {/* 图片预览区 */}
      <div className="relative overflow-hidden rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--panel-2)] group">
        <div className={cn('w-full', ASPECT_CLASS[aspectRatio])}>
          {currentImage ? (
            // P2-6: 点击图片放大预览（ImageModal，支持 Esc 关闭）
            <button
              type="button"
              onClick={() => setPreviewOpen(true)}
              className="block w-full h-full group/img relative"
              title="点击放大预览"
            >
              <img
                src={currentImage}
                alt={title}
                className="w-full h-full object-cover"
              />
              <span className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 group-hover/img:opacity-100 transition-opacity">
                <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-black/50 backdrop-blur-sm text-white text-xs">
                  <ZoomIn className="w-3.5 h-3.5" /> 点击放大
                </span>
              </span>
            </button>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center gap-3 bg-gradient-to-br from-[var(--panel-2)] to-[var(--panel-3)]">
              <ImageIcon className="w-10 h-10 text-[var(--ink-3)]" />
              <span className="text-xs text-[var(--ink-3)]">暂无图片</span>
              <Button size="sm" leftIcon={<Sparkles className="w-3.5 h-3.5" />} onClick={openModal} disabled={isGenerating}>
                生成{title}
              </Button>
            </div>
          )}

          {/* 有图时悬停操作：重新生成 / 删除 */}
          {currentImage && (
            <div className="absolute top-3 right-3 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={openModal}
                className="w-7 h-7 rounded-lg bg-black/50 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/70 transition-colors"
                title="重新生成（可编辑提示词）"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => {
                  // 删除为不可逆操作，先确认再执行（与角色/场景/分镜删除保持一致）
                  if (!window.confirm(`确定删除当前${title}吗？删除后可通过生成重新创建。`)) return;
                  onDeleted?.(safeIndex);
                }}
                className="w-7 h-7 rounded-lg bg-red-500/70 backdrop-blur-sm flex items-center justify-center text-white hover:bg-red-500 transition-colors"
                title="删除当前图片"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* 生成中遮罩 */}
          {isGenerating && (
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center">
              <div className="flex items-center gap-2 text-white text-sm font-medium">
                <RefreshCw className="w-4 h-4 animate-spin" />
                生成中...
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 图片数量提示 */}
      {images.length > 0 && (
        <p className="mt-2 text-[10px] text-[var(--ink-3)]">
          {images.length} 张{title} · 当前第 {safeIndex + 1} 张
        </p>
      )}

      {/* 生成配置弹窗：编辑提示词后确认生成 */}
      <Modal
        open={modalOpen}
        onOpenChange={setModalOpen}
        title={`生成${title}`}
        description={variant === 'fourView' ? '参考概念图（锚点图）生成四视图：大头照 + 正面 + 侧面 + 背面' : '可编辑提示词后生成概念图'}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={isGenerating}>
              取消
            </Button>
            <Button onClick={handleGenerate} isLoading={isGenerating} leftIcon={<Sparkles className="w-4 h-4" />}>
              开始生成
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <label className="block text-sm font-medium text-[var(--ink-2)]">
            生成提示词（可编辑）
          </label>
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={6}
            className="text-xs font-mono"
            placeholder="编辑概念图生成提示词..."
          />
          <p className="text-xs text-[var(--ink-3)]">
            使用默认图像模型生成，可在「模型配置」中调整默认模型
          </p>
        </div>
      </Modal>

      {/* 点击放大预览 */}
      {currentImage && (
        <ImageModal
          open={previewOpen}
          onClose={() => setPreviewOpen(false)}
          imageUrl={currentImage}
          title={`${title} · 第 ${safeIndex + 1} 张`}
        />
      )}
    </div>
  );
}
