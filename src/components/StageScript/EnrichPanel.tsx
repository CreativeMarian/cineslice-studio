import { useState, useEffect } from 'react';
import { Sparkles, CheckCircle2, AlertTriangle, RefreshCw, ThumbsUp, ThumbsDown, Copy, ChevronDown, ChevronUp, Loader2, FileCheck2, ShieldCheck, GitCompareArrows, MessageSquareWarning, X } from 'lucide-react';
import { Button, Card, Badge } from '../ui';
import { useUIStore } from '../../stores/useUIStore';
import { projectService } from '../../services/projectService';
import type { EnrichResult } from '../../types';

interface EnrichPanelProps {
  episodeId: string;
  status?: 'none' | 'pending' | 'approved' | 'rejected' | 'manual';
  onStatusChange: (status: 'none' | 'pending' | 'approved' | 'rejected' | 'manual') => void;
}

/**
 * 加料重构面板：选择第 x 集后触发。
 * 规范前置（官方视频模型提示词 skill）+ 只加血肉不动骨架 + 五层护栏：
 * 硬约束 / JSON 产出+出处 / 三表对账 / 预览高亮+通过打回 / 熔断（重试上限）
 */
export function EnrichPanel({ episodeId, status, onStatusChange }: EnrichPanelProps) {
  const { showToast } = useUIStore();
  const [isEnriching, setIsEnriching] = useState(false);
  const [enrichStage, setEnrichStage] = useState('');
  const [result, setResult] = useState<EnrichResult | null>(null);
  const [expandedScript, setExpandedScript] = useState(false);
  const [expandedPrompt, setExpandedPrompt] = useState(true);
  const [copied, setCopied] = useState(false);
  // 打回反馈相关状态
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectFeedback, setRejectFeedback] = useState('');
  const [lastFeedback, setLastFeedback] = useState<string | null>(null);
  const [rejectCount, setRejectCount] = useState(0);
  const [isRejecting, setIsRejecting] = useState(false);

  const currentStatus = status || 'none';

  // 加载已落库的加料结果时，同时获取打回反馈
  useEffect(() => {
    if (episodeId) {
      projectService.getEnrichment(episodeId).then(res => {
        if (res.success && res.data) {
          setLastFeedback(res.data.feedback || null);
          setRejectCount(res.data.rejectCount || 0);
        }
      }).catch(() => {});
    }
  }, [episodeId, status]);

  const runEnrich = async () => {
    setIsEnriching(true);
    setEnrichStage('正在加载视频模型官方提示词规范...');
    setResult(null);
    try {
      const res = await projectService.enrichEpisode(episodeId);
      if (res.success && res.data) {
        setResult(res.data);
        onStatusChange(res.data.alignment.differences.length === 0 ? 'pending' : 'manual');
        setEnrichStage('');
        if (res.data.alignment.differences.length > 0) {
          showToast('加料完成，但三表对账有差异，请人工检查', 'warning');
        } else {
          showToast('加料重构完成，请预览后确认', 'success');
        }
      }
    } catch (err: any) {
      const errorMsg = err?.response?.data?.message || err?.message || '加料重构失败';
      showToast(`加料重构失败: ${errorMsg}`, 'error');
      setEnrichStage('');
    } finally {
      setIsEnriching(false);
    }
  };

  const handleApprove = async () => {
    try {
      await projectService.approveEnrichment(episodeId);
      onStatusChange('approved');
      showToast('已通过：后续分镜/视频将使用加料后剧本', 'success');
    } catch (err: any) {
      showToast(`操作失败: ${err?.response?.data?.message || err?.message || '未知错误'}`, 'error');
    }
  };

  const handleReject = () => {
    // 预填上次的反馈（方便用户修改）
    setRejectFeedback(lastFeedback || '');
    setShowRejectDialog(true);
  };

  const confirmReject = async () => {
    setIsRejecting(true);
    try {
      await projectService.rejectEnrichment(episodeId, rejectFeedback.trim() || undefined);
      onStatusChange('rejected');
      setLastFeedback(rejectFeedback.trim() || null);
      setRejectCount(prev => prev + 1);
      setShowRejectDialog(false);
      setRejectFeedback('');
      showToast('已打回：重新加料时将携带反馈针对性改进', 'info');
    } catch (err: any) {
      showToast(`操作失败: ${err?.response?.data?.message || err?.message || '未知错误'}`, 'error');
    } finally {
      setIsRejecting(false);
    }
  };

  const copyPrompt = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.storyboard.h3Prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      showToast('复制失败，请手动选择复制', 'error');
    }
  };

  const statusBadge = (() => {
    switch (currentStatus) {
      case 'approved': return <Badge variant="success">已通过</Badge>;
      case 'pending': return <Badge variant="accent">待确认</Badge>;
      case 'manual': return <Badge variant="warning">需人工介入</Badge>;
      case 'rejected': return <Badge variant="warning">已打回</Badge>;
      default: return <Badge variant="default">未加料</Badge>;
    }
  })();

  const alignTable = (label: string, table: { status: string; missing: string[]; added: string[] }) => {
    const ok = table.status === 'ok' && table.missing.length === 0 && table.added.length === 0;
    return (
      <div className="flex items-start gap-2 text-sm">
        {ok ? (
          <CheckCircle2 className="w-4 h-4 text-[var(--color-success)] mt-0.5 flex-shrink-0" />
        ) : (
          <AlertTriangle className="w-4 h-4 text-[var(--color-warning)] mt-0.5 flex-shrink-0" />
        )}
        <div className="min-w-0">
          <span className="font-medium text-[var(--ink-1)]">{label}</span>
          {ok ? (
            <span className="text-[var(--ink-3)]"> · 一致</span>
          ) : (
            <div className="text-xs text-[var(--ink-3)] mt-0.5 space-y-0.5">
              {table.missing.length > 0 && <p className="text-[var(--color-warning)]">缺失：{table.missing.slice(0, 4).join(' / ')}</p>}
              {table.added.length > 0 && <p>新增：{table.added.slice(0, 4).join(' / ')}</p>}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-3">
      {/* 入口与状态 */}
      <Card className="p-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[var(--accent-soft)] flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-[var(--accent)]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-semibold text-[var(--ink-1)] font-[var(--font-display)]">加料重构</h4>
                {statusBadge}
              </div>
              <p className="text-xs text-[var(--ink-3)] mt-0.5">
                注入当前视频模型的官方提示词规范，对剧本「只加血肉不动骨架」，产出可直接生成视频的分镜 + 段级提示词
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {result && currentStatus !== 'approved' && (
              <>
                <Button size="sm" variant="primary" leftIcon={<ThumbsUp className="w-4 h-4" />} onClick={handleApprove}>
                  通过
                </Button>
                <Button size="sm" variant="outline" leftIcon={<ThumbsDown className="w-4 h-4" />} onClick={handleReject}>
                  打回
                </Button>
              </>
            )}
            <Button size="sm" leftIcon={<RefreshCw className="w-4 h-4" />} onClick={runEnrich} isLoading={isEnriching}>
              {result ? '重新加料' : '开始加料重构'}
            </Button>
          </div>
        </div>

        {isEnriching && (
          <div className="mt-4">
            <div className="flex items-center gap-2 mb-2">
              <Loader2 className="w-4 h-4 text-[var(--accent)] animate-spin" />
              <span className="text-sm text-[var(--ink-2)]">{enrichStage || '加料重构中（AI 正在按官方规范展开剧本，通常 30-120 秒）...'}</span>
            </div>
            {/* 真实进行中状态（无模拟百分比）：流动条 */}
            <div className="w-full h-2 bg-[var(--panel-2)] rounded-full overflow-hidden relative">
              <div className="absolute inset-y-0 w-1/3 bg-[var(--accent)]/70 rounded-full animate-[shimmer_1.2s_ease-in-out_infinite]" />
            </div>
          </div>
        )}

        {/* 上次打回反馈提示（重新加料时 AI 会携带此反馈针对性改进） */}
        {lastFeedback && currentStatus === 'rejected' && (
          <div className="mt-4 p-3 rounded-lg bg-[var(--color-warning)]/10 border border-[var(--color-warning)]/30">
            <div className="flex items-start gap-2">
              <MessageSquareWarning className="w-4 h-4 text-[var(--color-warning)] mt-0.5 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-[var(--color-warning)] mb-1">
                  上次打回反馈（第{rejectCount}次打回）· 点击「重新加料」AI 将针对性改进
                </p>
                <p className="text-xs text-[var(--ink-2)] leading-relaxed">{lastFeedback}</p>
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* 结果区 */}
      {result && (
        <>
          {/* 元信息 + 对账 */}
          <Card className="p-4 space-y-3">
            <div className="flex items-center gap-2 flex-wrap text-xs text-[var(--ink-3)]">
              <span className="flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-[var(--color-success)]" />
                规范：{result.meta.skillName}
              </span>
              <span>文本模型：{result.meta.textModel}</span>
              {result.meta.videoModelUsed && <span>视频模型：{result.meta.videoModelUsed}</span>}
              <span>{result.storyboard.shots.length} 镜 / {result.storyboard.seconds}s</span>
              <span>重试 {result.meta.retries} 次</span>
            </div>

            <div className="border-t border-[var(--border)] pt-3">
              <div className="flex items-center gap-2 mb-2">
                <GitCompareArrows className="w-4 h-4 text-[var(--accent)]" />
                <span className="text-sm font-medium text-[var(--ink-1)]">三表对账（护栏③：事件/角色/台词逐项比对）</span>
                {result.alignment.differences.length === 0 ? (
                  <Badge variant="success">全部一致</Badge>
                ) : (
                  <Badge variant="warning">{result.alignment.differences.length} 项差异</Badge>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {alignTable('事件要点', result.alignment.events)}
                {alignTable('角色', result.alignment.characters)}
                {alignTable('台词', result.alignment.dialogues)}
              </div>
              {result.alignment.differences.length > 0 && (
                <div className="mt-2 p-2.5 rounded-lg bg-[var(--color-warning)]/10 border border-[var(--color-warning)]/30 text-xs text-[var(--ink-2)]">
                  <span className="font-medium text-[var(--color-warning)]">差异详情：</span>
                  {result.alignment.differences.join('；')}
                </div>
              )}
            </div>
          </Card>

          {/* 分镜表 */}
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <FileCheck2 className="w-4 h-4 text-[var(--accent)]" />
                <h4 className="text-sm font-semibold text-[var(--ink-1)]">加料后分镜（5 秒/镜，话没说完下镜继续说）</h4>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-[var(--ink-3)] border-b border-[var(--border)]">
                    <th className="py-2 pr-3 font-medium">镜</th>
                    <th className="py-2 pr-3 font-medium">景别</th>
                    <th className="py-2 pr-3 font-medium">运镜</th>
                    <th className="py-2 pr-3 font-medium">画面</th>
                    <th className="py-2 pr-3 font-medium">动作</th>
                    <th className="py-2 font-medium">台词</th>
                  </tr>
                </thead>
                <tbody>
                  {result.storyboard.shots.map((s) => (
                    <tr key={s.shot} className="border-b border-[var(--border)]/50 align-top">
                      <td className="py-2 pr-3 text-[var(--accent)] font-medium">{String(s.shot).padStart(2, '0')}</td>
                      <td className="py-2 pr-3 text-[var(--ink-2)]">{s.size}</td>
                      <td className="py-2 pr-3 text-[var(--ink-2)]">{s.camera}</td>
                      <td className="py-2 pr-3 text-[var(--ink-2)] max-w-[240px]">{s.frame}</td>
                      <td className="py-2 pr-3 text-[var(--ink-2)] max-w-[240px]">{s.action}</td>
                      <td className="py-2 text-[var(--accent)]">{s.line || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* 段级 h3Prompt */}
          <Card className="p-4">
            <div className="flex items-center justify-between mb-2">
              <button className="flex items-center gap-2 flex-1 text-left" onClick={() => setExpandedPrompt(!expandedPrompt)}>
                <Sparkles className="w-4 h-4 text-[var(--accent)]" />
                <h4 className="text-sm font-semibold text-[var(--ink-1)]">段级视频提示词（官方格式，可直接提交视频模型）</h4>
                {expandedPrompt ? <ChevronUp className="w-4 h-4 text-[var(--ink-3)]" /> : <ChevronDown className="w-4 h-4 text-[var(--ink-3)]" />}
              </button>
              <Button size="sm" variant="ghost" leftIcon={<Copy className="w-3.5 h-3.5" />} onClick={copyPrompt}>
                {copied ? '已复制' : '复制'}
              </Button>
            </div>
            {expandedPrompt && (
              <pre className="whitespace-pre-wrap text-xs leading-relaxed text-[var(--ink-2)] bg-[var(--panel-2)] p-3 rounded-lg max-h-[320px] overflow-y-auto">
                {result.storyboard.h3Prompt}
              </pre>
            )}
          </Card>

          {/* 新增细节（护栏②：出处标注，护栏④：高亮预览） */}
          {result.addedDetails.length > 0 && (
            <Card className="p-4">
              <h4 className="text-sm font-semibold text-[var(--ink-1)] mb-2">新增细节（高亮预览，均标注出处）</h4>
              <div className="space-y-1.5">
                {result.addedDetails.map((d, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm">
                    <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${d.source === 'quoted' ? 'bg-[var(--color-success)]' : 'bg-[var(--accent)]'}`} />
                    <div className="min-w-0">
                      <p className="text-[var(--ink-1)]">{d.detail}</p>
                      <p className="text-xs text-[var(--ink-3)]">
                        类型：{d.type} · 出处：
                        {d.source === 'quoted' ? (
                          <span className="text-[var(--color-success)]">原文依据{d.quote ? `「${d.quote}」` : ''}</span>
                        ) : (
                          <span className="text-[var(--accent)]">合理推断（未改变事实）</span>
                        )}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* 加料后剧本全文 */}
          <Card className="p-4">
            <button className="flex items-center gap-2 w-full text-left" onClick={() => setExpandedScript(!expandedScript)}>
              <FileCheck2 className="w-4 h-4 text-[var(--accent)]" />
              <h4 className="text-sm font-semibold text-[var(--ink-1)] flex-1">加料后剧本全文（已保留原文全部剧情节点与台词）</h4>
              {expandedScript ? <ChevronUp className="w-4 h-4 text-[var(--ink-3)]" /> : <ChevronDown className="w-4 h-4 text-[var(--ink-3)]" />}
            </button>
            {expandedScript && (
              <pre className="whitespace-pre-wrap text-xs leading-relaxed text-[var(--ink-2)] bg-[var(--panel-2)] p-3 rounded-lg mt-2 max-h-[360px] overflow-y-auto">
                {result.enrichedScript}
              </pre>
            )}
          </Card>
        </>
      )}

      {/* 打回反馈对话框 */}
      {showRejectDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => !isRejecting && setShowRejectDialog(false)}>
          <div
            className="w-full max-w-lg rounded-2xl bg-[var(--bg)] border border-[var(--border)] shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-5 border-b border-[var(--border)]">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-[var(--color-warning)]/15 flex items-center justify-center">
                  <ThumbsDown className="w-5 h-5 text-[var(--color-warning)]" />
                </div>
                <div>
                  <h3 className="font-semibold text-[var(--ink-1)]">打回加料结果</h3>
                  <p className="text-xs text-[var(--ink-3)] mt-0.5">描述不满意的原因，重新加料时 AI 将针对性改进</p>
                </div>
              </div>
              <button
                className="p-1.5 rounded-lg hover:bg-[var(--panel-2)] transition-colors disabled:opacity-50"
                onClick={() => !isRejecting && setShowRejectDialog(false)}
                disabled={isRejecting}
              >
                <X className="w-4 h-4 text-[var(--ink-3)]" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-[var(--ink-1)] mb-2">
                  不满意的原因 <span className="text-[var(--ink-3)] font-normal">（可选，但填写后效果更好）</span>
                </label>
                <textarea
                  className="w-full h-32 px-3 py-2 rounded-lg bg-[var(--panel-2)] border border-[var(--border)] text-sm text-[var(--ink-1)] placeholder-[var(--ink-3)] focus:outline-none focus:border-[var(--accent)] resize-none"
                  placeholder="例如：&#10;1. 第3镜的角色动作描述不够具体，没有体现角色的情绪变化&#10;2. 分镜数量太少，剧情节奏太快&#10;3. 场景描述缺少环境细节，画面感不强&#10;4. 台词分配不合理，有些角色台词太少"
                  value={rejectFeedback}
                  onChange={e => setRejectFeedback(e.target.value)}
                  disabled={isRejecting}
                />
              </div>
              <div className="p-3 rounded-lg bg-[var(--accent-soft)]/50 border border-[var(--accent)]/20">
                <p className="text-xs text-[var(--ink-2)] leading-relaxed">
                  <span className="font-medium text-[var(--accent)]">提示：</span>
                  打回后点击「重新加料」，AI 会携带本次反馈重新生成，针对性解决你指出的问题。
                  原文剧情骨架不会改变，只调整加料细节和分镜描述。
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 p-5 border-t border-[var(--border)]">
              <Button
                size="sm"
                variant="outline"
                onClick={() => !isRejecting && setShowRejectDialog(false)}
                disabled={isRejecting}
              >
                取消
              </Button>
              <Button
                size="sm"
                variant="primary"
                leftIcon={isRejecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ThumbsDown className="w-4 h-4" />}
                onClick={confirmReject}
                isLoading={isRejecting}
              >
                确认打回
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
