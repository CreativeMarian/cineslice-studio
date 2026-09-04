import { X, Download, ZoomIn } from 'lucide-react';
import { useEffect } from 'react';

interface ImageModalProps {
  open: boolean;
  onClose: () => void;
  imageUrl: string;
  title?: string;
  description?: string;
}

export function ImageModal({ open, onClose, imageUrl, title, description }: ImageModalProps) {
  useEffect(() => {
    if (!open) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handleEsc);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="relative max-w-5xl w-full max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 关闭按钮 */}
        <button
          onClick={onClose}
          className="absolute -top-3 -right-3 z-10 w-9 h-9 rounded-full bg-[var(--bg)] border border-[var(--border)] flex items-center justify-center text-[var(--ink-2)] hover:text-[var(--ink-1)] hover:bg-[var(--panel-2)] transition-all shadow-lg"
        >
          <X className="w-5 h-5" />
        </button>

        {/* 图片容器 */}
        <div className="flex-1 flex items-center justify-center bg-black/50 rounded-xl overflow-hidden min-h-[300px]">
          <img
            src={imageUrl}
            alt={title || '预览'}
            className="max-w-full max-h-[75vh] object-contain"
          />
        </div>

        {/* 信息栏 */}
        {(title || description) && (
          <div className="mt-3 px-4 py-3 bg-[var(--card-bg)] rounded-xl border border-[var(--border)]">
            {title && (
              <h4 className="font-medium text-[var(--ink-1)] flex items-center gap-2">
                <ZoomIn className="w-4 h-4 text-[var(--accent)]" />
                {title}
              </h4>
            )}
            {description && (
              <p className="text-sm text-[var(--ink-3)] mt-1">{description}</p>
            )}
          </div>
        )}

        {/* 下载按钮 */}
        <a
          href={imageUrl}
          download
          target="_blank"
          rel="noopener noreferrer"
          className="absolute bottom-4 right-4 px-3 py-2 bg-[var(--accent)] text-[var(--on-accent)] rounded-lg text-sm font-medium flex items-center gap-2 hover:brightness-110 transition-all shadow-lg"
        >
          <Download className="w-4 h-4" /> 下载原图
        </a>
      </div>
    </div>
  );
}
