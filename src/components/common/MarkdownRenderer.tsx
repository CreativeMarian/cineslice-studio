// Markdown 渲染组件：剧本/分镜/角色/场景等富文本的统一展示出口
// - react-markdown 默认不渲染原始 HTML，安全
// - remark-gfm 支持表格、删除线、任务列表等 GFM 扩展
// - 图片加载失败时替换为占位符，绝不显示原始 `![Image](` 源码文本
import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export interface MarkdownRendererProps {
  /** Markdown 源文本 */
  content: string;
  /** 附加到 .markdown-body 容器的样式类（用于覆盖布局，如 flex-1 / line-clamp 外层） */
  className?: string;
}

export function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  // 记录加载失败的图片 src，命中后渲染占位符
  const [brokenImages, setBrokenImages] = useState<Set<string>>(new Set());

  const handleImageError = (src: string) => {
    setBrokenImages((prev) => {
      if (prev.has(src)) return prev;
      const next = new Set(prev);
      next.add(src);
      return next;
    });
  };

  return (
    <div className={['markdown-body', className].filter(Boolean).join(' ')}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          img: ({ src, alt }) => {
            if (!src) return null;
            if (brokenImages.has(src)) {
              return (
                <span className="markdown-image-broken" title={alt ? `图片加载失败：${alt}` : '图片加载失败'}>
                  图片加载失败
                </span>
              );
            }
            return (
              <img
                src={src}
                alt={alt || ''}
                loading="lazy"
                onError={() => handleImageError(src)}
              />
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
