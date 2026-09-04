// 文生图 Tab：从文字直接生成图片
import { useState, useCallback } from 'react';
import { Image, Wand2 } from 'lucide-react';
import { ModelSelector } from '../ModelConfig/ModelSelector';
import { Button, Select } from '../ui';
import { createService, type ImageSize } from '../../services/createService';
import { parseModelKey } from '../../types/model';
import type { GalleryImage } from './CreateStudio';

interface ImageGenTabProps {
  onGenerated: (images: GalleryImage[]) => void;
}

const SIZES: { value: ImageSize; label: string; scene: string }[] = [
  { value: '1024x1024', label: '方形 1024', scene: '通用' },
  { value: '1024x1792', label: '竖版 1024x1792', scene: '小红书/海报' },
  { value: '1792x1024', label: '横版 1792x1024', scene: '宽幅' },
  { value: '2048x2048', label: '方形 2048', scene: '高清' },
  { value: '2048x1152', label: '横版 2048x1152', scene: '16:9 高清' },
  { value: '1440x2560', label: '竖版 1440x2560', scene: '9:16 高清' },
  { value: '512x512', label: '方形 512', scene: '快速试稿' },
  { value: '2560x1440', label: '横版 2560x1440', scene: '超清横幅' },
];

export function ImageGenTab({ onGenerated }: ImageGenTabProps) {
  const [modelKey, setModelKey] = useState('');
  const [prompt, setPrompt] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [size, setSize] = useState<ImageSize>('1024x1024');
  const [count, setCount] = useState(1);
  const [generating, setGenerating] = useState(false);

  const handleGenerate = useCallback(async () => {
    if (!modelKey || !prompt.trim()) return;
    const { provider, modelName } = parseModelKey(modelKey);
    setGenerating(true);
    try {
      const res = await createService.generateImage({
        provider,
        modelName,
        prompt: prompt.trim(),
        negativePrompt: negativePrompt.trim() || undefined,
        size,
        count,
      });
      if (res.data?.images) {
        onGenerated(res.data.images.map((img) => ({ url: img.url, prompt: img.prompt })));
      }
    } finally {
      setGenerating(false);
    }
  }, [modelKey, prompt, negativePrompt, size, count, onGenerated]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,420px)_1fr] gap-6">
      {/* 左侧：参数 */}
      <div className="space-y-4">
        <div>
          <label className="block text-[10px] text-[var(--ink-3)] mb-1 flex items-center gap-1">
            <Image className="w-3 h-3" /> 图片生成模型
          </label>
          <ModelSelector modelType="image" value={modelKey} onChange={setModelKey} />
        </div>

        <div>
          <label className="block text-[10px] text-[var(--ink-3)] mb-1">画面描述（Prompt）</label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={5}
            placeholder="描述你想生成的画面：主体、环境、光线、风格…（支持中文）"
            className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--ink-1)] focus:outline-none focus:border-[var(--accent)] resize-y"
          />
        </div>

        <div>
          <label className="block text-[10px] text-[var(--ink-3)] mb-1">负面提示（可选）</label>
          <textarea
            value={negativePrompt}
            onChange={(e) => setNegativePrompt(e.target.value)}
            rows={2}
            placeholder="不希望出现的内容，如：模糊、变形、多余手指"
            className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--ink-1)] focus:outline-none focus:border-[var(--accent)] resize-y"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[10px] text-[var(--ink-3)] mb-1">尺寸</label>
            <select
              value={size}
              onChange={(e) => setSize(e.target.value as ImageSize)}
              className="w-full px-2 py-2 text-xs rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--ink-1)] focus:outline-none focus:border-[var(--accent)]"
            >
              {SIZES.map((s) => (
                <option key={s.value} value={s.value}>{s.label} · {s.scene}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] text-[var(--ink-3)] mb-1">数量</label>
            <select
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              className="w-full px-2 py-2 text-xs rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--ink-1)] focus:outline-none focus:border-[var(--accent)]"
            >
              {[1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>{n} 张</option>
              ))}
            </select>
          </div>
        </div>

        <Button
          onClick={handleGenerate}
          disabled={generating || !modelKey || !prompt.trim()}
          className="w-full"
        >
          {generating ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
              生成中…
            </>
          ) : (
            <>
              <Wand2 className="w-4 h-4 mr-2" /> 开始生成
            </>
          )}
        </Button>
      </div>

      {/* 右侧：提示技巧 */}
      <div className="hidden lg:block">
        <div className="p-5 rounded-xl bg-[var(--panel-2)] border border-[var(--border)] space-y-3">
          <p className="text-sm font-semibold text-[var(--ink-1)]">文生图提示词技巧</p>
          <ul className="text-xs text-[var(--ink-2)] space-y-2 leading-relaxed">
            <li>· <b>主体 + 环境 + 光线 + 风格</b> 四要素齐全，效果最稳</li>
            <li>· 示例：「古装青年男子，立于雨夜长街，青石路积水映灯，电影级冷色调，浅景深」</li>
            <li>· 想要画面统一：固定人物描述（外貌/服饰/年龄）在每个 Prompt 中保持一致</li>
            <li>· 负面提示写「模糊、畸变、多余肢体、低质量」可明显提升出图干净度</li>
            <li>· 生成结果可直接「用作参考图」进入图生图 / 图生视频，实现风格延续</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
