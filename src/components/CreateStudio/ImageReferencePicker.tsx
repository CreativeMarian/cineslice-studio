// 参考图选择器（自由创作共享组件）
// 支持：本地上传、从生成画廊选择；多选模式用于图生视频参考图，单选用于首帧/尾帧/图生图
import { useRef, useState, useCallback } from 'react';
import { ImagePlus, Trash2, Upload } from 'lucide-react';
import { createService } from '../../services/createService';
import type { GalleryImage } from './CreateStudio';

interface ImageReferencePickerProps {
  label: string;
  value: string[];
  onChange: (urls: string[]) => void;
  max?: number;
  gallery?: GalleryImage[];
  hint?: string;
  /** 是否允许从画廊选图 */
  allowGallery?: boolean;
}

export function ImageReferencePicker({
  label,
  value,
  onChange,
  max = 4,
  gallery = [],
  hint,
  allowGallery = true,
}: ImageReferencePickerProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);

  const handleUpload = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        if (value.length >= max) break;
        const res = await createService.uploadReference(file);
        const url = res.data?.url;
        if (url && !value.includes(url)) {
          onChange([...value, url]);
        }
      }
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }, [value, max, onChange]);

  const remove = (url: string) => onChange(value.filter((v) => v !== url));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="block text-[10px] text-[var(--ink-3)] flex items-center gap-1">
          <ImagePlus className="w-3 h-3" /> {label}
          {hint && <span className="text-[var(--ink-3)]/70 font-normal">（{hint}）</span>}
        </label>
        <span className="text-[10px] text-[var(--ink-3)]">{value.length}/{max}</span>
      </div>

      <div className="flex flex-wrap gap-2">
        {value.map((url) => (
          <div key={url} className="relative group">
            <img src={url} alt="参考图" className="w-16 h-16 object-cover rounded-lg border border-[var(--border)]" />
            <button
              type="button"
              onClick={() => remove(url)}
              className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              title="移除"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        ))}

        {value.length < max && (
          <>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="w-16 h-16 rounded-lg border-2 border-dashed border-[var(--border)] hover:border-[var(--accent)] hover:bg-[var(--panel-2)] flex flex-col items-center justify-center gap-1 text-[var(--ink-3)] hover:text-[var(--accent)] transition-colors disabled:opacity-50"
            >
              {uploading ? (
                <div className="w-4 h-4 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
              ) : (
                <Upload className="w-4 h-4" />
              )}
              <span className="text-[9px]">上传</span>
            </button>
            {allowGallery && gallery.length > 0 && (
              <button
                type="button"
                onClick={() => setGalleryOpen((v) => !v)}
                className="w-16 h-16 rounded-lg border-2 border-dashed border-[var(--border)] hover:border-[var(--accent)] hover:bg-[var(--panel-2)] flex flex-col items-center justify-center gap-1 text-[var(--ink-3)] hover:text-[var(--accent)] transition-colors"
              >
                <ImagePlus className="w-4 h-4" />
                <span className="text-[9px]">画廊</span>
              </button>
            )}
          </>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => handleUpload(e.target.files)}
      />

      {galleryOpen && (
        <div className="mt-2 p-2 bg-[var(--panel-2)] rounded-lg border border-[var(--border)] max-h-44 overflow-y-auto">
          <p className="text-[10px] text-[var(--ink-3)] mb-2">从生成结果选择（点选加入参考图）</p>
          <div className="flex flex-wrap gap-2">
            {gallery.map((img) => (
              <button
                key={img.url}
                type="button"
                onClick={() => {
                  if (!value.includes(img.url) && value.length < max) onChange([...value, img.url]);
                }}
                className={`w-14 h-14 overflow-hidden rounded-lg border-2 transition-all ${
                  value.includes(img.url) ? 'border-[var(--accent)] opacity-60' : 'border-transparent hover:border-[var(--accent)]'
                }`}
              >
                <img src={img.url} alt="画廊选图" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
