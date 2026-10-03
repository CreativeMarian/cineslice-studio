// 导出投产包弹窗（合并原 StageExport 功能）：
// 投产包（必选） + 可选：视频合成 / 字幕生成 / 文档导出
// 投产包走后端 GET /projects/:pid/episodes/:eid/export（manifest.json + script.md + characters/ + scenes/ + segments/E{ep}-S{seg}/prompt.md + f{n}.png）
import { useState, useEffect, useRef } from 'react';
import {
  Package, Download, Video, Subtitles, FileText, LayoutList, Users, MapPin,
  FileArchive, AlertCircle, CheckCircle2, Play, Copy, Layers, Loader2,
} from 'lucide-react';
import { Modal, Button, Badge } from '../ui';
import { useProjectStore } from '../../stores/useProjectStore';
import { useUIStore } from '../../stores/useUIStore';
import { exportService, type ExportType, type ExportFormat } from '../../services/exportService';
import { videoComposeService, type ComposeResult } from '../../services/videoComposeService';
import { videoService } from '../../services/videoService';

interface ExportPackageModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ExportOption {
  type: ExportType;
  label: string;
  icon: React.ElementType;
  desc: string;
  formats: { format: ExportFormat; label: string }[];
  color: string;
}

const EXPORT_OPTIONS: ExportOption[] = [
  {
    type: 'script',
    label: '剧本文档',
    icon: FileText,
    desc: '导出完整剧集剧本，支持多种格式',
    formats: [
      { format: 'html', label: 'HTML（可打印PDF）' },
      { format: 'txt', label: '纯文本 TXT' },
      { format: 'json', label: 'JSON 数据' },
      { format: 'fdx', label: 'Final Draft FDX' },
    ],
    color: 'from-blue-500 to-blue-600',
  },
  {
    type: 'storyboard',
    label: '分镜表',
    icon: LayoutList,
    desc: '导出所有分镜数据，含景别/运动/动作/对话',
    formats: [
      { format: 'csv', label: 'CSV（Excel可打开）' },
      { format: 'json', label: 'JSON 数据' },
      { format: 'html', label: 'HTML 表格' },
    ],
    color: 'from-purple-500 to-purple-600',
  },
  {
    type: 'characters',
    label: '角色设定',
    icon: Users,
    desc: '导出角色设定文档，含身份/外貌/类型',
    formats: [
      { format: 'html', label: 'HTML（可打印PDF）' },
      { format: 'json', label: 'JSON 数据' },
      { format: 'txt', label: '纯文本 TXT' },
    ],
    color: 'from-amber-500 to-amber-600',
  },
  {
    type: 'scenes',
    label: '场景设定',
    icon: MapPin,
    desc: '导出场景设定文档，含地点/时段/氛围/描述',
    formats: [
      { format: 'html', label: 'HTML（可打印PDF）' },
      { format: 'json', label: 'JSON 数据' },
      { format: 'txt', label: '纯文本 TXT' },
    ],
    color: 'from-emerald-500 to-emerald-600',
  },
];

/** 附加选项开关行 */
function OptionToggle({
  checked,
  onChange,
  icon,
  title,
  desc,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <label className="flex items-start gap-3 p-3 rounded-lg border border-[var(--border)] bg-[var(--panel-2)]/50 cursor-pointer hover:border-[var(--accent)] transition-colors">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 w-4 h-4 accent-[var(--accent)] flex-shrink-0"
      />
      <span className="flex items-start gap-2.5 min-w-0">
        <span className="w-8 h-8 rounded-lg bg-[var(--accent-soft)] flex items-center justify-center flex-shrink-0 text-[var(--accent)]">
          {icon}
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-medium text-[var(--ink-1)]">{title}</span>
          <span className="block text-xs text-[var(--ink-3)] mt-0.5">{desc}</span>
        </span>
      </span>
    </label>
  );
}

export function ExportPackageModal({ open, onOpenChange }: ExportPackageModalProps) {
  const { currentProject, currentEpisodeId, episodes } = useProjectStore();
  const { showToast } = useUIStore();

  // 投产包导出状态
  const [isExportingPack, setIsExportingPack] = useState(false);

  // 附加选项开关
  const [showCompose, setShowCompose] = useState(false);
  const [showSubtitles, setShowSubtitles] = useState(false);
  const [showDocs, setShowDocs] = useState(false);

  // 视频合成状态
  const [composeResult, setComposeResult] = useState<ComposeResult | null>(null);
  const [isComposing, setIsComposing] = useState(false);
  const [composeMode, setComposeMode] = useState<'byphase' | 'direct'>('byphase');
  const [ffmpegAvailable, setFfmpegAvailable] = useState<boolean | null>(null);
  const [hasVideoClips, setHasVideoClips] = useState<boolean | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 字幕状态
  const [subtitles, setSubtitles] = useState<Array<{ index: number; start: string; end: string; text: string; speaker?: string }>>([]);
  const [srtContent, setSrtContent] = useState('');
  const [isGeneratingSubtitles, setIsGeneratingSubtitles] = useState(false);

  // 文档导出状态
  const [exportingType, setExportingType] = useState<string | null>(null);
  const [isExportingZip, setIsExportingZip] = useState(false);

  const currentEpisode = episodes.find(e => e.id === currentEpisodeId);

  // 打开弹窗时：检查 ffmpeg、恢复最近一次合成结果、查询已完成视频片段数
  useEffect(() => {
    if (!open) return;
    setComposeResult(null);
    if (!currentEpisodeId) return;
    let cancelled = false;
    videoComposeService.checkFfmpeg()
      .then(res => { if (!cancelled) setFfmpegAvailable(res.data?.available ?? false); })
      .catch(() => { if (!cancelled) setFfmpegAvailable(false); });
    videoComposeService.getLatest(currentEpisodeId)
      .then(res => { if (!cancelled && res.success && res.data && res.data.status === 'completed') setComposeResult(res.data); })
      .catch(() => {});
    videoService.getEpisodeVideoCount(currentEpisodeId)
      .then(res => { if (!cancelled && res.success && res.data) setHasVideoClips(res.data.count > 0); })
      .catch(() => { if (!cancelled) setHasVideoClips(null); });
    return () => {
      cancelled = true;
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [open, currentEpisodeId]);

  // ───────── 投产包（必选） ─────────
  const handleExportPack = () => {
    if (!currentProject?.id || !currentEpisodeId) {
      showToast('请先选择项目与剧集', 'warning');
      return;
    }
    setIsExportingPack(true);
    try {
      const BASE_URL = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '');
      const exportUrl = `${BASE_URL}/projects/${currentProject.id}/episodes/${currentEpisodeId}/export`;
      window.open(exportUrl, '_blank');
      showToast('正在生成投产包，浏览器将自动下载', 'success');
    } catch {
      showToast('导出失败', 'error');
    } finally {
      setTimeout(() => setIsExportingPack(false), 2000);
    }
  };

  // ───────── 视频合成（可选） ─────────
  const handleCompose = async () => {
    if (!currentEpisodeId) {
      showToast('请先选择一集', 'error');
      return;
    }
    setIsComposing(true);
    setComposeResult(null);
    try {
      const res = await videoComposeService.compose(currentEpisodeId, {
        transition: 'none',
        outputResolution: '1920x1080',
        fps: 24,
        byPhase: composeMode === 'byphase',
        skipMissingClips: true,
      });
      if (res.success && res.data) {
        setComposeResult(res.data);
        if (res.data.status === 'processing') {
          // 轮询至终态；连续 5 次失败或状态未知也停止，避免按钮永久禁用
          let failures = 0;
          const stopPolling = () => {
            clearInterval(timer);
            pollTimerRef.current = null;
          };
          const timer = setInterval(async () => {
            try {
              const statusRes = await videoComposeService.getStatus(res.data.taskId);
              failures = 0;
              if (statusRes.success && statusRes.data) {
                setComposeResult(statusRes.data);
                if (statusRes.data.status === 'completed') {
                  stopPolling();
                  showToast('视频合成完成！', 'success');
                } else if (statusRes.data.status === 'failed') {
                  stopPolling();
                  showToast(`合成失败：${statusRes.data.error || '未知错误'}`, 'error');
                } else if (statusRes.data.status !== 'processing') {
                  stopPolling();
                  showToast('合成任务已结束（状态未知），请重新发起', 'warning');
                }
              }
            } catch {
              failures += 1;
              if (failures >= 5) {
                stopPolling();
                showToast('无法获取合成进度，请稍后在任务中心查看', 'warning');
              }
            }
          }, 2000);
          pollTimerRef.current = timer;
        } else if (res.data.status === 'completed') {
          showToast('视频合成完成！', 'success');
        } else if (res.data.status === 'failed') {
          showToast(`合成失败：${res.data.error || '未知错误'}`, 'error');
        }
      }
    } catch {
      showToast('视频合成启动失败', 'error');
    } finally {
      setIsComposing(false);
    }
  };

  // ───────── 字幕生成（可选） ─────────
  const handleGenerateSubtitles = async () => {
    if (!currentEpisodeId) {
      showToast('请先选择一集', 'error');
      return;
    }
    setIsGeneratingSubtitles(true);
    try {
      const res = await videoService.getSubtitles(currentEpisodeId);
      if (res.success && res.data) {
        setSubtitles(res.data.subtitles);
        setSrtContent(res.data.srtContent);
        showToast(`生成 ${res.data.count} 条字幕`, 'success');
      }
    } catch {
      showToast('字幕生成失败', 'error');
    } finally {
      setIsGeneratingSubtitles(false);
    }
  };

  const handleDownloadSrt = () => {
    if (!srtContent) return;
    const blob = new Blob([srtContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `episode_${currentEpisode?.episode_number || 1}_subtitles.srt`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('SRT字幕已下载', 'success');
  };

  const handleCopySrt = () => {
    if (!srtContent) return;
    navigator.clipboard.writeText(srtContent);
    showToast('字幕内容已复制', 'success');
  };

  // ───────── 文档导出（可选） ─────────
  const handleExportDoc = async (type: ExportType, format: ExportFormat) => {
    if (!currentProject) return;
    const key = `${type}-${format}`;
    setExportingType(key);
    try {
      await exportService.export(currentProject.id, {
        type,
        format,
        episodeId: currentEpisodeId || undefined,
      });
      showToast(`${type === 'script' ? '剧本' : type === 'storyboard' ? '分镜表' : type === 'characters' ? '角色设定' : '场景设定'}导出成功`, 'success');
    } catch {
      showToast('导出失败，请重试', 'error');
    } finally {
      setExportingType(null);
    }
  };

  const handleExportProjectZip = async () => {
    if (!currentProject) return;
    setIsExportingZip(true);
    try {
      await exportService.exportProject(currentProject.id);
      showToast('项目 ZIP 导出成功', 'success');
    } catch {
      showToast('导出失败，请重试', 'error');
    } finally {
      setIsExportingZip(false);
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="导出投产包"
      description="一键导出段→分镜投产包（prompt.md + 首帧图）；可附加视频合成、字幕与文档导出"
      size="xl"
    >
      <div className="space-y-5">
        {/* ── 投产包（必选） ── */}
        <div className="p-4 rounded-xl border border-[var(--accent)]/30 bg-[var(--accent-soft)]/20">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] flex items-center justify-center flex-shrink-0">
                <Package className="w-5 h-5 text-[var(--on-accent)]" />
              </div>
              <div className="min-w-0">
                <h4 className="font-medium text-[var(--ink-1)]">投产包（必选）</h4>
                <p className="text-xs text-[var(--ink-3)] mt-0.5">
                  按段打包：manifest.json + script.md + characters/ + scenes/ + segments/E{String(currentEpisode?.episode_number ?? 0).padStart(2, '0')}-S01/prompt.md + f1..fN.png（每镜一张首帧图）
                </p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  <Badge variant="default">prompt.md</Badge>
                  <Badge variant="default">f1..fN.png 首帧图</Badge>
                  <Badge variant="default">角色/场景概念图</Badge>
                  <Badge variant="default">分镜元数据 manifest</Badge>
                </div>
              </div>
            </div>
            <Button
              onClick={handleExportPack}
              isLoading={isExportingPack}
              leftIcon={<Download className="w-4 h-4" />}
              disabled={!currentProject || !currentEpisodeId}
            >
              导出投产包 ZIP
            </Button>
          </div>
        </div>

        {/* ── 附加选项开关 ── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <OptionToggle
            checked={showCompose}
            onChange={setShowCompose}
            icon={<Video className="w-4 h-4" />}
            title="视频合成"
            desc="将分镜视频合成为成片 MP4"
          />
          <OptionToggle
            checked={showSubtitles}
            onChange={setShowSubtitles}
            icon={<Subtitles className="w-4 h-4" />}
            title="字幕生成"
            desc="从台词生成 SRT 字幕"
          />
          <OptionToggle
            checked={showDocs}
            onChange={setShowDocs}
            icon={<FileArchive className="w-4 h-4" />}
            title="文档导出"
            desc="剧本/分镜/角色/场景文档"
          />
        </div>

        {/* ── 视频合成面板 ── */}
        {showCompose && (
          <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--panel-2)]/40">
            <div className="flex items-center gap-2 mb-3">
              <Video className="w-4 h-4 text-[var(--accent)]" />
              <h4 className="text-sm font-medium text-[var(--ink-1)]">视频合成</h4>
              <span className="text-xs text-[var(--ink-3)]">
                {composeMode === 'byphase'
                  ? '两级合成：先将本集各阶段各合成为一段视频，再拼接为完整剧集（MP4）'
                  : '将当前集所有分镜的视频片段直接合成为完整剧集视频（MP4）'}
              </span>
            </div>

            {/* 合成模式切换 */}
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs text-[var(--ink-3)] mr-1">合成模式:</span>
              <button
                onClick={() => setComposeMode('byphase')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${composeMode === 'byphase'
                  ? 'bg-[var(--accent)] text-[var(--on-accent)] shadow-sm'
                  : 'bg-[var(--panel-2)] text-[var(--ink-2)] hover:bg-[var(--panel-3)]'}`}
              >
                按段合成（推荐）
              </button>
              <button
                onClick={() => setComposeMode('direct')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${composeMode === 'direct'
                  ? 'bg-[var(--accent)] text-[var(--on-accent)] shadow-sm'
                  : 'bg-[var(--panel-2)] text-[var(--ink-2)] hover:bg-[var(--panel-3)]'}`}
              >
                直接整集合成
              </button>
              {composeMode === 'byphase' && (
                <span className="text-[11px] text-[var(--ink-3)] flex items-center gap-1 ml-1">
                  <Layers className="w-3.5 h-3.5" />
                  各段独立视频 → 拼接完整一集
                </span>
              )}
            </div>

            {ffmpegAvailable === false && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 mb-3">
                <AlertCircle className="w-4 h-4 text-yellow-500 flex-shrink-0" />
                <p className="text-xs text-yellow-600 dark:text-yellow-400">
                  ffmpeg 未检测到，视频合成功能需要 ffmpeg。请安装 ffmpeg 后重试。
                </p>
              </div>
            )}

            {composeResult?.status === 'processing' && (
              <div className="mb-3 p-3 rounded-lg bg-[var(--panel-2)]">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-[var(--ink-2)] flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    合成中... {composeResult.completedClips}/{composeResult.totalClips} 个片段
                  </span>
                  <span className="text-sm font-medium text-[var(--accent)]">{composeResult.progress || 0}%</span>
                </div>
                <div className="w-full h-2 bg-[var(--panel-3)] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-[var(--accent)] to-[var(--accent-2)] transition-all duration-500"
                    style={{ width: `${composeResult.progress || 0}%` }}
                  />
                </div>
              </div>
            )}

            {composeResult?.status === 'completed' && composeResult.outputUrl && (
              <div className="mb-3 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">合成完成！</span>
                </div>
                <video src={composeResult.outputUrl} controls className="w-full max-w-md rounded-lg" />
                {composeResult.phaseVideos && composeResult.phaseVideos.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs font-medium text-[var(--ink-2)] mb-1.5">段视频</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {composeResult.phaseVideos.map((pv) => (
                        <div key={pv.phase} className="rounded-lg border border-[var(--border)] bg-[var(--panel-2)]/60 p-2">
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-xs font-semibold text-[var(--ink-1)] flex items-center gap-1.5">
                              <span className="w-4 h-4 rounded-md bg-[var(--accent-soft)] text-[var(--accent)] flex items-center justify-center text-[10px] font-bold">
                                S{pv.phase}
                              </span>
                              {pv.phaseName || `段${pv.phase}`}
                            </span>
                            <a href={pv.url} download className="text-[var(--accent)] hover:brightness-110">
                              <Download className="w-3.5 h-3.5" />
                            </a>
                          </div>
                          <video src={pv.url} controls className="w-full rounded-md" />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <a
                  href={composeResult.outputUrl}
                  download
                  className="inline-flex items-center gap-2 mt-3 px-4 py-2 bg-[var(--accent)] text-[var(--on-accent)] rounded-lg text-sm font-medium hover:brightness-110 transition-all"
                >
                  <Download className="w-4 h-4" /> 下载 MP4
                </a>
              </div>
            )}

            <div className="flex gap-3">
              <Button
                onClick={handleCompose}
                isLoading={isComposing}
                leftIcon={<Play className="w-4 h-4" />}
                disabled={ffmpegAvailable === false || composeResult?.status === 'processing'}
              >
                {composeResult?.status === 'processing' ? '合成中...' : '开始合成视频'}
              </Button>
              {hasVideoClips === false && (
                <span className="text-xs text-[var(--ink-3)] self-center">提示：本集暂无已完成的分镜视频，请先批量生成视频</span>
              )}
            </div>
          </div>
        )}

        {/* ── 字幕生成面板 ── */}
        {showSubtitles && (
          <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--panel-2)]/40">
            <div className="flex items-center gap-2 mb-3">
              <Subtitles className="w-4 h-4 text-[var(--accent)]" />
              <h4 className="text-sm font-medium text-[var(--ink-1)]">字幕生成</h4>
              <span className="text-xs text-[var(--ink-3)]">从分镜台词自动生成 SRT 格式字幕文件，可用于剪映/PR 等剪辑软件导入</span>
            </div>

            {subtitles.length > 0 && (
              <div className="mb-3 p-3 rounded-lg bg-[var(--panel-2)] border border-[var(--border)] max-h-40 overflow-y-auto">
                <p className="text-xs font-medium text-[var(--ink-2)] mb-2">字幕预览（共{subtitles.length}条）</p>
                {subtitles.slice(0, 5).map(s => (
                  <div key={s.index} className="text-xs text-[var(--ink-3)] mb-1">
                    <span className="text-[var(--ink-2)] font-mono">{s.start} {'-->'} {s.end}</span>
                    {s.speaker && <span className="text-[var(--accent)] ml-2">{s.speaker}:</span>}
                    <span className="ml-1">{s.text}</span>
                  </div>
                ))}
                {subtitles.length > 5 && <p className="text-xs text-[var(--ink-3)] mt-1">...还有 {subtitles.length - 5} 条</p>}
              </div>
            )}

            <div className="flex gap-2">
              <Button
                onClick={handleGenerateSubtitles}
                isLoading={isGeneratingSubtitles}
                leftIcon={<Subtitles className="w-4 h-4" />}
                variant="outline"
              >
                {subtitles.length > 0 ? '重新生成字幕' : '生成SRT字幕'}
              </Button>
              {subtitles.length > 0 && (
                <>
                  <Button onClick={handleDownloadSrt} leftIcon={<Download className="w-4 h-4" />}>
                    下载SRT
                  </Button>
                  <Button onClick={handleCopySrt} leftIcon={<Copy className="w-4 h-4" />} variant="outline">
                    复制内容
                  </Button>
                </>
              )}
            </div>
          </div>
        )}

        {/* ── 文档导出面板 ── */}
        {showDocs && (
          <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--panel-2)]/40">
            <div className="flex items-center gap-2 mb-3">
              <FileArchive className="w-4 h-4 text-[var(--accent)]" />
              <h4 className="text-sm font-medium text-[var(--ink-1)]">文档导出</h4>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {EXPORT_OPTIONS.map((option) => {
                const Icon = option.icon;
                return (
                  <div key={option.type} className="p-3 rounded-lg border border-[var(--border)] bg-[var(--panel)]">
                    <div className="flex items-start gap-2.5 mb-2.5">
                      <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${option.color} flex items-center justify-center flex-shrink-0`}>
                        <Icon className="w-4 h-4 text-white" />
                      </div>
                      <div className="min-w-0">
                        <h5 className="text-sm font-medium text-[var(--ink-1)]">{option.label}</h5>
                        <p className="text-xs text-[var(--ink-3)] mt-0.5">{option.desc}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {option.formats.map((f) => (
                        <button
                          key={f.format}
                          onClick={() => handleExportDoc(option.type, f.format)}
                          disabled={exportingType === `${option.type}-${f.format}`}
                          className="px-2.5 py-1 text-xs rounded-lg border border-[var(--border)] text-[var(--ink-2)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-all disabled:opacity-50 flex items-center gap-1.5"
                        >
                          {exportingType === `${option.type}-${f.format}` ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Download className="w-3 h-3" />
                          )}
                          {f.label}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 p-3 rounded-lg border border-[var(--border)] bg-[var(--panel)]">
              <div className="flex items-start gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-slate-500 to-slate-600 flex items-center justify-center flex-shrink-0">
                  <FileArchive className="w-4 h-4 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <h5 className="text-sm font-medium text-[var(--ink-1)]">完整项目包</h5>
                  <p className="text-xs text-[var(--ink-3)] mt-0.5">
                    导出所有数据（剧本+分镜+角色+场景+关键帧+视频）为 ZIP，可随时重新导入恢复
                  </p>
                </div>
                <Button
                  onClick={handleExportProjectZip}
                  isLoading={isExportingZip}
                  leftIcon={<Download className="w-4 h-4" />}
                  variant="outline"
                  size="sm"
                >
                  导出完整项目 ZIP
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
