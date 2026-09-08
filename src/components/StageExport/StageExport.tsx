import { useState, useEffect, useRef } from 'react';
import {
  Download, FileArchive, Upload, Film, CheckCircle, FileText,
  LayoutList, Users, MapPin, Video, Loader2, AlertCircle, Play,
  Subtitles, Copy, Layers,
} from 'lucide-react';
import { Card, Button, Badge } from '../ui';
import { useProjectStore } from '../../stores/useProjectStore';
import { exportService, type ExportType, type ExportFormat } from '../../services/exportService';
import { videoComposeService, type ComposeResult } from '../../services/videoComposeService';
import { videoService } from '../../services/videoService';
import { useUIStore } from '../../stores/useUIStore';

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

export function StageExport() {
  const { currentProject, episodes, currentEpisodeId, shots } = useProjectStore();
  const { showToast } = useUIStore();
  const [exportingType, setExportingType] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isExportingZip, setIsExportingZip] = useState(false);

  // 视频合成状态
  const [composeResult, setComposeResult] = useState<ComposeResult | null>(null);
  const [isComposing, setIsComposing] = useState(false);
  const [composeMode, setComposeMode] = useState<'byphase' | 'direct'>('byphase');
  const [ffmpegAvailable, setFfmpegAvailable] = useState<boolean | null>(null);
  // 用 ref 保存轮询定时器：state 会让 useEffect 清理函数捕获过期值，导致卸载时无法清除定时器
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 字幕状态
  const [subtitles, setSubtitles] = useState<Array<{ index: number; start: string; end: string; text: string; speaker?: string }>>([]);
  const [srtContent, setSrtContent] = useState('');
  const [isGeneratingSubtitles, setIsGeneratingSubtitles] = useState(false);

  useEffect(() => {
    videoComposeService.checkFfmpeg().then((res) => {
      setFfmpegAvailable(res.data?.available ?? false);
    }).catch(() => setFfmpegAvailable(false));
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, []);

  const handleExport = async (type: ExportType, format: ExportFormat) => {
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

  const handleExportZip = async () => {
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

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsImporting(true);
    try {
      await exportService.importProject(file);
      showToast('项目导入成功', 'success');
      window.location.reload();
    } catch {
      showToast('导入失败，请检查文件格式', 'error');
    } finally {
      setIsImporting(false);
      e.target.value = '';
    }
  };

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
          // 开始轮询：任意非 processing 终态、连续 5 次请求失败、或任务丢失都停止，
          // 否则按钮会因 status==='processing' 永久禁用，用户只能整页刷新
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
                  showToast('视频合成完成！下一步：导出剧本/分镜等文档备份项目', 'success');
                } else if (statusRes.data.status === 'failed') {
                  stopPolling();
                  showToast(`合成失败：${statusRes.data.error || '未知错误'}`, 'error');
                } else if (statusRes.data.status !== 'processing') {
                  // 未知状态（如服务器重启后任务丢失）也停止，避免无限轮询
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
          showToast('视频合成完成！下一步：导出剧本/分镜等文档备份项目', 'success');
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

  const currentEpisode = episodes.find(e => e.id === currentEpisodeId);
  const [hasVideoClips, setHasVideoClips] = useState<boolean | null>(null);

  // 真实数据：当前集已完成视频片段数（不模拟，合成前提示用）
  useEffect(() => {
    if (!currentEpisodeId) { setHasVideoClips(null); return; }
    let cancelled = false;
    videoService.getEpisodeVideoCount(currentEpisodeId)
      .then(res => { if (!cancelled && res.success && res.data) setHasVideoClips(res.data.count > 0); })
      .catch(() => setHasVideoClips(null));
    return () => { cancelled = true; };
  }, [currentEpisodeId]);

  // 生成字幕（从分镜台词生成SRT）
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

  return (
    <div className="p-6 max-w-[1200px] mx-auto">
      {/* 页头 */}
      <div className="flex items-center gap-3 mb-6">
        <Download className="w-6 h-6 text-[var(--ink-3)]" />
        <div>
          <h2 className="text-xl font-bold text-[var(--ink-1)] font-[var(--font-display)]">成片导出</h2>
          <p className="text-xs text-[var(--ink-3)]">导出剧本、分镜、角色、场景及完整项目，合成最终视频</p>
        </div>
        <Badge variant="default">v2.0</Badge>
      </div>

      {/* 视频合成区域 */}
      <Card className="p-6 mb-6 border-l-4 border-l-[var(--accent)]">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] flex items-center justify-center flex-shrink-0">
            <Video className="w-6 h-6 text-[var(--on-accent)]" />
          </div>
          <div className="flex-1">
            <h3 className="font-medium text-[var(--ink-1)] mb-1">视频合成</h3>
            <p className="text-sm text-[var(--ink-3)] mb-4">
              {composeMode === 'byphase'
                ? '两级合成：先将本集 4 个剧情阶段各合成为一段视频，再将阶段视频拼接为完整剧集（MP4）'
                : '将当前集所有分镜的视频片段直接合成为完整剧集视频（MP4）'}
              {currentEpisode && <span className="ml-1">— 当前：第{currentEpisode.episode_number}集 {currentEpisode.title}</span>}
            </p>

            {/* 合成模式切换 */}
            <div className="flex items-center gap-2 mb-4">
              <span className="text-xs text-[var(--ink-3)] mr-1">合成模式:</span>
              <button
                onClick={() => setComposeMode('byphase')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${composeMode === 'byphase'
                  ? 'bg-[var(--accent)] text-[var(--on-accent)] shadow-sm'
                  : 'bg-[var(--panel-2)] text-[var(--ink-2)] hover:bg-[var(--panel-3)]'}`}
              >
                按阶段合成（推荐）
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
                  4 阶段 → 每段独立视频 → 拼接完整一集
                </span>
              )}
            </div>

            {ffmpegAvailable === false && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 mb-4">
                <AlertCircle className="w-4 h-4 text-yellow-500 flex-shrink-0" />
                <p className="text-xs text-yellow-600 dark:text-yellow-400">
                  ffmpeg 未检测到，视频合成功能需要 ffmpeg。请安装 ffmpeg 后重试。
                </p>
              </div>
            )}

            {composeResult && composeResult.status === 'processing' && (
              <div className="mb-4 p-3 rounded-lg bg-[var(--panel-2)]">
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
              <div className="mb-4 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle className="w-4 h-4 text-emerald-500" />
                  <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">合成完成！</span>
                </div>
                <video src={composeResult.outputUrl} controls className="w-full max-w-md rounded-lg" />
                {composeResult.phaseVideos && composeResult.phaseVideos.length > 0 && (
                  <div className="mt-4">
                    <p className="text-xs font-medium text-[var(--ink-2)] mb-2">阶段视频（4 段拼接为完整一集）</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {composeResult.phaseVideos.map((pv) => (
                        <div key={pv.phase} className="rounded-lg border border-[var(--border)] bg-[var(--panel-2)]/60 p-2.5">
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-xs font-semibold text-[var(--ink-1)] flex items-center gap-1.5">
                              <span className={`w-4 h-4 rounded-md ${['bg-indigo-500/20 text-indigo-500','bg-blue-500/20 text-blue-500','bg-violet-500/20 text-violet-500','bg-fuchsia-500/20 text-fuchsia-500'][pv.phase - 1] || 'bg-[var(--accent-soft)] text-[var(--accent)]'} flex items-center justify-center text-[10px] font-bold`}>
                                P{pv.phase}
                              </span>
                              {pv.phaseName || `阶段${pv.phase}`}
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
                <span className="text-xs text-[var(--ink-3)] self-center">提示：本集暂无已完成的分镜视频，请先在导演工作台生成</span>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* 字幕生成区域 */}
      <Card className="p-6 mb-6 border-l-4 border-l-purple-500">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center flex-shrink-0">
            <Subtitles className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1">
            <h3 className="font-medium text-[var(--ink-1)] mb-1">字幕生成</h3>
            <p className="text-sm text-[var(--ink-3)] mb-4">
              从分镜台词自动生成 SRT 格式字幕文件，可用于剪映/PR等剪辑软件导入
              {currentEpisode && <span className="ml-1">— 当前：第{currentEpisode.episode_number}集</span>}
            </p>

            {subtitles.length > 0 && (
              <div className="mb-4 p-3 rounded-lg bg-[var(--panel-2)] border border-[var(--border)] max-h-48 overflow-y-auto">
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

            <div className="flex gap-3">
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
                  <Button
                    onClick={handleDownloadSrt}
                    leftIcon={<Download className="w-4 h-4" />}
                  >
                    下载SRT
                  </Button>
                  <Button
                    onClick={handleCopySrt}
                    leftIcon={<Copy className="w-4 h-4" />}
                    variant="outline"
                  >
                    复制内容
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* 导出选项网格 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {EXPORT_OPTIONS.map((option) => {
          const Icon = option.icon;
          return (
            <Card key={option.type} className="p-5 hover:shadow-lg transition-shadow">
              <div className="flex items-start gap-3 mb-4">
                <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${option.color} flex items-center justify-center flex-shrink-0`}>
                  <Icon className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h4 className="font-medium text-[var(--ink-1)]">{option.label}</h4>
                  <p className="text-xs text-[var(--ink-3)] mt-0.5">{option.desc}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {option.formats.map((f) => (
                  <button
                    key={f.format}
                    onClick={() => handleExport(option.type, f.format)}
                    disabled={exportingType === `${option.type}-${f.format}`}
                    className="px-3 py-1.5 text-xs rounded-lg border border-[var(--border)] text-[var(--ink-2)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-all disabled:opacity-50 flex items-center gap-1.5"
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
            </Card>
          );
        })}
      </div>

      {/* 完整项目导出 + 导入 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-5">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-slate-500 to-slate-600 flex items-center justify-center flex-shrink-0">
              <FileArchive className="w-5 h-5 text-white" />
            </div>
            <div>
              <h4 className="font-medium text-[var(--ink-1)]">完整项目包</h4>
              <p className="text-xs text-[var(--ink-3)] mt-0.5">
                导出所有数据（剧本+分镜+角色+场景+关键帧+视频）为 ZIP，可随时重新导入恢复
              </p>
            </div>
          </div>
          <Button
            onClick={handleExportZip}
            isLoading={isExportingZip}
            leftIcon={<Download className="w-4 h-4" />}
            variant="outline"
            className="w-full"
          >
            导出完整项目 ZIP
          </Button>
        </Card>

        <Card className="p-5">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-500 to-cyan-600 flex items-center justify-center flex-shrink-0">
              <Upload className="w-5 h-5 text-white" />
            </div>
            <div>
              <h4 className="font-medium text-[var(--ink-1)]">导入项目</h4>
              <p className="text-xs text-[var(--ink-3)] mt-0.5">
                从之前导出的 ZIP 文件恢复完整项目数据
              </p>
            </div>
          </div>
          <label className="cursor-pointer block">
            <input type="file" accept=".zip" onChange={handleImport} className="hidden" />
            <div
              className={`inline-flex items-center justify-center font-medium transition-all duration-200 h-10 px-4 text-sm gap-2 rounded-[var(--radius-control)] border border-[var(--border)] text-[var(--ink-1)] hover:bg-[var(--panel-2)] hover:border-[var(--border-hover)] bg-transparent w-full ${isImporting ? 'opacity-40 cursor-not-allowed' : ''}`}
            >
              {isImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              选择 ZIP 文件导入
            </div>
          </label>
        </Card>
      </div>

      {/* 导出内容说明 */}
      <Card className="p-5 mt-6">
        <h4 className="font-medium text-[var(--ink-1)] mb-3 flex items-center gap-2">
          <Film className="w-4 h-4 text-[var(--ink-3)]" /> 导出内容说明
        </h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          {[
            { label: '剧本文档', items: ['Markdown', '分集内容', '字数统计'] },
            { label: '角色/场景', items: ['概念图', '设定描述', '类型标签'] },
            { label: '分镜表', items: ['景别运动', '动作对话', '时长预估'] },
            { label: '关键帧/视频', items: ['首帧尾帧', '视频片段', '合成MP4'] },
          ].map((group) => (
            <div key={group.label}>
              <p className="font-medium text-[var(--ink-2)] mb-1.5">{group.label}</p>
              <ul className="space-y-1">
                {group.items.map((item) => (
                  <li key={item} className="flex items-center gap-1.5 text-xs text-[var(--ink-3)]">
                    <CheckCircle className="w-3 h-3 text-[var(--accent)]" /> {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
