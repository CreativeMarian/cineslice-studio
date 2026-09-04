// 图生图 Tab：参考图 + 提示词 → 变体 / 重绘 / 风格迁移
import { useState, useCallback } from 'react';
import { Layers, Wand2 } from 'lucide-react';
import { ModelSelector } from '../ModelConfig/ModelSelector';
import { Button } from '../ui';
import { createService, type ImageSize } from '../../services/createService';
import { parseModelKey } from '../../types/model';
import { ImageReferencePicker } from './ImageReferencePicker';
import type { GalleryImage } from './CreateStudio';

interface ImageEditTabProps {
  onGenerated: (images: GalleryImage[]) => void;
  gallery: GalleryImage[];
}

export function ImageEditTab({ onGenerated, gallery }: ImageEditTabProps) {
  const [modelKey, setModelKey] = useState('');
  const [prompt, setPrompt] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [size, setSize] = useState<ImageSize>('1024x1024');
  const [referenceImages, setReferenceImages] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);

  const handleGenerate = useCallback(async () => {
    if (!modelKey || !prompt.trim() || referenceImages.length === 0) return;
    const { provider, modelName } = parseModelKey(modelKey);
    setGenerating(true);
    try {
      const res = await createService.editImage({
        provider,
        modelName,
        prompt: prompt.trim(),
        negativePrompt: negativePrompt.trim() || undefined,
        size,
        referenceImages,
      });
      if (res.data?.images) {
        onGenerated(res.data.images.map((img) => ({ url: img.url, prompt: img.prompt })));
      }
    } finally {
      setGenerating(false);
    }
  }, [modelKey, prompt, negativePrompt, size, referenceImages, onGenerated]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,420px)_1fr] gap-6">
      <div className="space-y-4">
        <div>
          <label className="block text-[10px] text-[var(--ink-3)] mb-1 flex items-center gap-1">
            <Layers className="w-3 h-3" /> 图片生成模型
          </label>
          <ModelSelector modelType="image" value={modelKey} onChange={setModelKey} />
        </div>

        <ImageReferencePicker
          label="参考图（至少 1 张）"
          value={referenceImages}
          onChange={setReferenceImages}
          max={4}
          gallery={gallery}
          hint="上传或从画廊选择，将以此为基础生成"
        />

        <div>
          <label className="block text-[10px] text-[var(--ink-3)] mb-1">编辑指令（Prompt）</label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={4}
            placeholder="告诉 AI 要怎么改：换风格、改服装、换背景、添加元素…"
            className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--ink-1)] focus:outline-none focus:border-[var(--accent)] resize-y"
          />
        </div>

        <div>
          <label className="block text-[10px] text-[var(--ink-3)] mb-1">负面提示（可选）</label>
          <textarea
            value={negativePrompt}
            onChange={(e) => setNegativePrompt(e.target.value)}
            rows={2}
            placeholder="不希望出现的内容"
            className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--ink-1)] focus:outline-none focus:border-[var(--accent)] resize-y"
          />
        </div>

        <div>
          <label className="block text-[10px] text-[var(--ink-3)] mb-1">尺寸</label>
          <select
            value={size}
            onChange={(e) => setSize(e.target.value as ImageSize)}
            className="w-full px-2 py-2 text-xs rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--ink-1)] focus:outline-none focus:border-[var(--accent)]"
          >
            {['1024x1024', '1024x1792', '1792x1024', '2048x2048', '2048x1152', '1440x2560'].map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        <Button
          onClick={handleGenerate}
          disabled={generating || !modelKey || !prompt.trim() || referenceImages.length === 0}
          className="w-full"
        >
          {generating ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
              重绘中…
            </>
          ) : (
            <>
              <Wand2 className="w-4 h-4 mr-2" /> 生成变体
            </>
          )}
        </Button>
      </div>

      <div className="hidden lg:block">
        <div className="p-5 rounded-xl bg-[var(--panel-2)] border border-[var(--border)] space-y-3">
          <p className="text-sm font-semibold text-[var(--ink-1)]">图生图适用场景</p>
          <ul className="text-xs text-[var(--ink-2)] space-y-2 leading-relaxed">
            <li>· <b>角色换装</b>：角色图 + 「换成现代西装」 → 生成同人新造型</li>
            <li>· <b>风格迁移</b>：照片 + 「转为吉卜力动画风格」</li>
            <li>· <b>背景替换</b>：主体图 + 「背景改为雪夜森林」</li>
            <li>· <b>质量修复</b>：草图 + 「补全细节、高清化」</li>
            <li>· 多张参考图叠加可同时约束主体与场景</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
