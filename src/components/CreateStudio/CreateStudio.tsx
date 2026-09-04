// 自由创作工作台（CreateStudio）
// 四大能力：文生图 / 图生图 / 文生视频 / 图生视频
// 与小说→剧集流水线完全独立：直接选模型、写提示词、传参考图即出结果
import { useState, useCallback, useRef } from 'react';
import { Image as ImageIcon, Layers, Clapperboard, ImagePlay, Sparkles, X, Download } from 'lucide-react';
import { Tabs, ImageModal } from '../ui';
import { ImageGenTab } from './ImageGenTab';
import { ImageEditTab } from './ImageEditTab';
import { VideoGenTab } from './VideoGenTab';
import { VideoFromImageTab } from './VideoFromImageTab';
import { VideoResultCard } from './VideoResultCard';
import type { VideoGenResult } from '../../services/createService';

export interface GalleryImage {
  url: string;
  prompt: string;
}

interface VideoHistoryItem {
  task: VideoGenResult;
  provider: string;
  modelName: string;
}

export default function CreateStudio() {
  const [gallery, setGallery] = useState<GalleryImage[]>([]);
  const [videoHistory, setVideoHistory] = useState<VideoHistoryItem[]>([]);
  const [preview, setPreview] = useState<GalleryImage | null>(null);
  const galleryRef = useRef<HTMLDivElement>(null);

  const handleImagesGenerated = useCallback((images: GalleryImage[]) => {
    setGallery((prev) => [...images, ...prev]);
    // 自动滚动到画廊
    requestAnimationFrame(() => {
      galleryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  }, []);

  const handleVideoGenerated = useCallback((task: VideoGenResult, provider: string, modelName: string) => {
    setVideoHistory((prev) => [{ task, provider, modelName }, ...prev].slice(0, 20));
  }, []);

  const updateVideoTask = useCallback((index: number, task: VideoGenResult) => {
    setVideoHistory((prev) => prev.map((item, i) => (i === index ? { ...item, task } : item)));
  }, []);

  const removeImage = (url: string) => setGallery((prev) => prev.filter((img) => img.url !== url));
  const clearGallery = () => setGallery([]);

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <div className="max-w-[1400px] mx-auto px-6 py-8 space-y-8">
        {/* 头部 */}
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] flex items-center justify-center shadow-[0_4px_12px_rgba(43, 116, 245, 0.25)]">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-[var(--ink-1)] font-[var(--font-display)]">自由创作工作台</h1>
              <p className="text-xs text-[var(--ink-3)]">不依赖小说项目，直接文生图 / 图生图 / 文生视频 / 图生视频</p>
            </div>
          </div>
        </div>

        {/* 四个能力 Tab */}
        <Tabs defaultValue="image">
          <Tabs.List className="w-full flex-wrap">
            <Tabs.Trigger value="image">
              <ImageIcon className="w-4 h-4 mr-1.5" /> 文生图
            </Tabs.Trigger>
            <Tabs.Trigger value="image-edit">
              <Layers className="w-4 h-4 mr-1.5" /> 图生图
            </Tabs.Trigger>
            <Tabs.Trigger value="video">
              <Clapperboard className="w-4 h-4 mr-1.5" /> 文生视频
            </Tabs.Trigger>
            <Tabs.Trigger value="video-image">
              <ImagePlay className="w-4 h-4 mr-1.5" /> 图生视频
            </Tabs.Trigger>
          </Tabs.List>

          <Tabs.Content value="image">
            <ImageGenTab onGenerated={handleImagesGenerated} />
          </Tabs.Content>
          <Tabs.Content value="image-edit">
            <ImageEditTab onGenerated={handleImagesGenerated} gallery={gallery} />
          </Tabs.Content>
          <Tabs.Content value="video">
            <VideoGenTab onVideoGenerated={handleVideoGenerated} />
          </Tabs.Content>
          <Tabs.Content value="video-image">
            <VideoFromImageTab onVideoGenerated={handleVideoGenerated} gallery={gallery} />
          </Tabs.Content>
        </Tabs>

        {/* 生成结果画廊 */}
        {(gallery.length > 0 || videoHistory.length > 0) && (
          <div ref={galleryRef} className="space-y-4">
            {gallery.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold text-[var(--ink-1)] flex items-center gap-2">
                    <ImageIcon className="w-4 h-4 text-[var(--accent)]" /> 图片生成结果
                    <span className="text-[10px] text-[var(--ink-3)] font-normal">{gallery.length} 张 · 点击放大 · 可作为参考图</span>
                  </h2>
                  <button onClick={clearGallery} className="text-[10px] text-[var(--ink-3)] hover:text-red-500 transition-colors">
                    清空
                  </button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                  {gallery.map((img) => (
                    <div key={img.url} className="group relative aspect-square rounded-xl overflow-hidden border border-[var(--border)] bg-[var(--panel-2)]">
                      <img
                        src={img.url}
                        alt={img.prompt.slice(0, 40)}
                        className="w-full h-full object-cover cursor-zoom-in group-hover:scale-105 transition-transform duration-300"
                        onClick={() => setPreview(img)}
                      />
                      <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/70 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-between">
                        <span className="text-[9px] text-white/90 truncate max-w-[70%]">{img.prompt.slice(0, 30)}</span>
                        <div className="flex gap-1">
                          <a href={img.url} download onClick={(e) => e.stopPropagation()} className="p-1 rounded bg-white/20 hover:bg-white/40 text-white" title="下载">
                            <Download className="w-3 h-3" />
                          </a>
                          <button onClick={() => removeImage(img.url)} className="p-1 rounded bg-white/20 hover:bg-red-500 text-white" title="移除">
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {videoHistory.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-[var(--ink-1)] flex items-center gap-2 mb-3">
                  <Clapperboard className="w-4 h-4 text-[var(--accent)]" /> 视频生成记录
                  <span className="text-[10px] text-[var(--ink-3)] font-normal">{videoHistory.length} 条 · 生成中自动刷新</span>
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {videoHistory.map((item, i) => (
                    <div key={item.task.taskId}>
                      <VideoHistoryItemView
                        item={item}
                        onStatusChange={(task) => updateVideoTask(i, task)}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {preview && <ImageModal open onClose={() => setPreview(null)} imageUrl={preview.url} />}
    </div>
  );
}

// 历史视频项（复用 VideoResultCard 逻辑，避免重复轮询组件）
function VideoHistoryItemView({
  item,
  onStatusChange,
}: {
  item: VideoHistoryItem;
  onStatusChange: (task: VideoGenResult) => void;
}) {
  return (
    <VideoResultCard
      task={item.task}
      provider={item.provider}
      modelName={item.modelName}
      onStatusChange={onStatusChange}
    />
  );
}
