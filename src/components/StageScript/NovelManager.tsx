import { useState, useRef } from 'react';
import { FileText, BookOpen, Check, Sparkles, FileUp, Wand2, ChevronRight } from 'lucide-react';
import { Button, Card, EmptyState, Badge } from '../ui';
import { ProjectConfigBar } from './ProjectConfigBar';
import { useProjectStore } from '../../stores/useProjectStore';
import { useUIStore } from '../../stores/useUIStore';
import { projectService } from '../../services/projectService';
import { formatWordCount } from '../../services/novelParser';
import type { NovelChapter } from '../../types';

export function NovelManager() {
  const { currentProject, chapters, setChapters, selectedChapterIds, setSelectedChapterIds, toggleChapterId, updatePipelineStep } = useProjectStore();
  const { showToast } = useUIStore();
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    if (!currentProject) return;
    const validTypes = ['.txt', '.md'];
    const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    if (!validTypes.includes(ext)) {
      showToast('仅支持 .txt 和 .md 格式', 'error');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      showToast('文件大小不能超过 10MB', 'error');
      return;
    }

    setIsUploading(true);
    try {
      const res = await projectService.uploadNovel(currentProject.id, file);
      if (res.success && res.data) {
        setChapters(res.data.chapters);
        // 上传成功后自动全选章节
        setSelectedChapterIds(res.data.chapters.map((c: NovelChapter) => c.id));
        showToast(`成功解析 ${res.data.total_chapters} 个章节，已自动全选`, 'success');
        // 自动切换到剧集管理标签
        setTimeout(() => updatePipelineStep('episodes'), 800);
      } else {
        const errMsg = (res as any)?.error?.message || '上传失败，请重试';
        showToast(errMsg, 'error');
      }
    } catch (err: any) {
      const errMsg = err?.response?.data?.error?.message || err?.message || '上传失败，请重试';
      showToast(errMsg, 'error');
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const toggleAll = () => {
    if (selectedChapterIds.length === chapters.length) {
      setSelectedChapterIds([]);
    } else {
      setSelectedChapterIds(chapters.map((c) => c.id));
    }
  };

  const handleGoToEpisodes = () => {
    if (selectedChapterIds.length === 0) {
      showToast('请至少选择一个章节', 'error');
      return;
    }
    updatePipelineStep('episodes');
  };

  const totalWords = chapters.reduce((sum, c) => sum + c.word_count, 0);

  return (
    <div className="space-y-5">
      {/* 项目配置栏 */}
      <ProjectConfigBar />

      {/* 上传区域 */}
      <Card className="p-6">
        <div
          className={`border-2 border-dashed rounded-[var(--radius-shell)] p-10 text-center transition-all duration-300 cursor-pointer ${
            isDragging
              ? 'border-[var(--accent)] bg-[var(--accent-soft)] scale-[1.01]'
              : 'border-[var(--border)] hover:border-[var(--accent)]/50 hover:bg-[var(--panel-2)]/30'
          }`}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.md"
            className="hidden"
            onChange={handleFileSelect}
          />
          <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 transition-all ${
            isUploading ? 'animate-pulse' : ''
          }`}
          style={{ background: 'linear-gradient(135deg, var(--accent-soft), rgba(251,146,60,0.1))' }}
          >
            {isUploading ? (
              <div className="w-7 h-7 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
            ) : (
              <FileUp className="w-8 h-8 text-[var(--accent)]" />
            )}
          </div>
          <p className="text-base font-semibold text-[var(--ink-1)] mb-1 font-[var(--font-display)]">
            {isUploading ? '正在解析小说...' : '拖拽文件到此处，或点击上传'}
          </p>
          <p className="text-sm text-[var(--ink-3)]">支持 .txt / .md 格式，最大 10MB</p>
          <div className="flex items-center justify-center gap-4 mt-4 text-xs text-[var(--ink-3)]">
            <span className="flex items-center gap-1"><Sparkles className="w-3 h-3" /> 自动章节识别</span>
            <span className="flex items-center gap-1"><FileText className="w-3 h-3" /> 保留原文格式</span>
          </div>
        </div>
      </Card>

      {/* 章节列表 */}
      {chapters.length > 0 && (
        <>
          <Card className="overflow-hidden">
            <div className="px-5 py-4 border-b border-[var(--border)] flex items-center justify-between bg-[var(--panel-2)]/30">
              <div className="flex items-center gap-3">
                <BookOpen className="w-5 h-5 text-[var(--accent)]" />
                <span className="font-semibold text-[var(--ink-1)] font-[var(--font-display)]">章节列表</span>
                <Badge variant="accent">{chapters.length} 章</Badge>
                <Badge variant="default">{formatWordCount(totalWords)}</Badge>
                {selectedChapterIds.length > 0 && (
                  <Badge variant="success">已选 {selectedChapterIds.length}</Badge>
                )}
              </div>
              <Button variant="ghost" size="sm" onClick={toggleAll}>
                {selectedChapterIds.length === chapters.length ? '取消全选' : '全选'}
              </Button>
            </div>
            <div className="max-h-[420px] overflow-y-auto">
              {chapters.map((chapter: NovelChapter, index) => (
                <div
                  key={chapter.id}
                  className={`flex items-center gap-4 px-5 py-3.5 border-b border-[var(--border-light)] cursor-pointer transition-colors last:border-0 ${
                    selectedChapterIds.includes(chapter.id)
                      ? 'bg-[var(--accent-soft)]'
                      : 'hover:bg-[var(--panel-2)]/50'
                  }`}
                  onClick={() => toggleChapterId(chapter.id)}
                >
                  <div
                    className={`w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0 transition-all ${
                      selectedChapterIds.includes(chapter.id)
                        ? 'bg-[var(--accent)] border-[var(--accent)]'
                        : 'border-[var(--border)] hover:border-[var(--ink-3)]'
                    }`}
                  >
                    {selectedChapterIds.includes(chapter.id) && <Check className="w-3 h-3 text-white" />}
                  </div>
                  <div className="w-9 h-9 rounded-lg bg-[var(--panel-2)] flex items-center justify-center flex-shrink-0 text-xs font-mono text-[var(--ink-3)]">
                    {String(chapter.chapter_number).padStart(2, '0')}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[var(--ink-1)] truncate">
                      {chapter.title}
                    </p>
                    <p className="text-xs text-[var(--ink-3)]">{formatWordCount(chapter.word_count)}</p>
                  </div>
                  {index < chapters.length - 1 && (
                    <div className="w-px h-8 bg-[var(--border)]" />
                  )}
                </div>
              ))}
            </div>
          </Card>

          {/* 底部操作栏 - 生成剧集 */}
          <div className="sticky bottom-4 z-10">
            <Card className="p-4 flex items-center justify-between shadow-lg border-[var(--accent)]/30">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[var(--accent-soft)] flex items-center justify-center">
                  <Wand2 className="w-5 h-5 text-[var(--accent)]" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[var(--ink-1)]">
                    已选择 {selectedChapterIds.length} 个章节
                  </p>
                  <p className="text-xs text-[var(--ink-3)]">点击右侧按钮，AI 将改编为剧集剧本</p>
                </div>
              </div>
              <Button onClick={handleGoToEpisodes} disabled={selectedChapterIds.length === 0}>
                生成剧集剧本
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </Card>
          </div>
        </>
      )}

      {chapters.length === 0 && !isUploading && (
        <Card>
          <EmptyState
            icon={<BookOpen className="w-8 h-8" />}
            title="还没有小说内容"
            description="上传小说文件后，系统将自动识别章节标题并拆分，支持手动调整"
          />
        </Card>
      )}
    </div>
  );
}
