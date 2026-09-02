// 成本统计页：总览卡片 + 每日趋势 SVG 柱状图 + 模型/类型分布
// v1.0

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Coins, Ticket, Activity, CalendarDays, RefreshCw, Receipt } from 'lucide-react';
import { Card, Button, Badge, Spinner, EmptyState } from '../ui';
import { costService } from '../../services/costService';
import { useUIStore } from '../../stores/useUIStore';
import type { CostSummary, CostRecord } from '../../types';
import { cn } from '../../utils';

const RANGES = [
  { days: 7, label: '近 7 天' },
  { days: 30, label: '近 30 天' },
  { days: 90, label: '近 90 天' },
  { days: 0, label: '全部' },
];

const TYPE_LABELS: Record<string, string> = {
  text: '文本',
  image: '图像',
  video: '视频',
  audio: '音频',
};

const TYPE_COLORS: Record<string, string> = {
  text: '#3b82f6',
  image: '#a855f7',
  video: '#f97316',
  audio: '#22c55e',
};

function formatCost(n: number): string {
  if (n === 0) return '0';
  if (n < 0.01) return n.toExponential(1);
  if (n < 1) return n.toFixed(4);
  if (n < 1000) return n.toFixed(2);
  return n.toLocaleString('zh-CN', { maximumFractionDigits: 2 });
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatDateTime(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** 每日成本趋势柱状图（纯 SVG，无第三方依赖） */
function DailyChart({ daily }: { daily: CostSummary['daily'] }) {
  if (daily.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-sm text-[var(--ink-3)]">
        所选时间范围内暂无调用记录
      </div>
    );
  }

  const W = 640;
  const H = 180;
  const PAD = { top: 12, bottom: 22, left: 8, right: 8 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const maxCost = Math.max(...daily.map((d) => d.cost), 0.000001);
  const barW = Math.max(3, Math.min(28, innerW / daily.length - 6));
  const gap = daily.length > 1 ? (innerW - barW * daily.length) / (daily.length - 1) : 0;

  // 数据点多时只稀疏标注日期
  const labelStep = Math.ceil(daily.length / 8);

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[480px]" role="img" aria-label="每日成本趋势">
        {daily.map((d, i) => {
          const h = Math.max(2, (d.cost / maxCost) * innerH);
          const x = PAD.left + i * (barW + gap);
          const y = PAD.top + innerH - h;
          const isPeak = d.cost === maxCost;
          return (
            <g key={d.date}>
              <rect
                x={x}
                y={y}
                width={barW}
                height={h}
                rx={3}
                fill="var(--accent)"
                opacity={isPeak ? 1 : 0.55 + 0.45 * (d.cost / maxCost)}
              >
                <title>{`${d.date}：$${formatCost(d.cost)} / ${formatTokens(d.tokens)} tokens`}</title>
              </rect>
              {i % labelStep === 0 && (
                <text x={x + barW / 2} y={H - 6} textAnchor="middle" fontSize="9" fill="var(--ink-4)">
                  {d.date.slice(5)}
                </text>
              )}
            </g>
          );
        })}
        <line x1={PAD.left} y1={PAD.top + innerH} x2={W - PAD.right} y2={PAD.top + innerH} stroke="var(--border)" />
      </svg>
    </div>
  );
}

export function CostAnalyticsPage() {
  const navigate = useNavigate();
  const { showToast } = useUIStore();
  const [summary, setSummary] = useState<CostSummary | null>(null);
  const [records, setRecords] = useState<CostRecord[]>([]);
  const [days, setDays] = useState(30);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const load = async (rangeDays = days, silent = false) => {
    if (silent) setIsRefreshing(true);
    else setIsLoading(true);
    try {
      const res = await costService.summary(rangeDays || undefined);
      if (res.success && res.data) setSummary(res.data);
      const recRes = await costService.records(10);
      if (recRes.success && recRes.data) setRecords(recRes.data);
    } catch {
      showToast('加载成本统计失败', 'error');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dailyAvg = summary && summary.daily.length > 0
    ? summary.total_cost / summary.daily.length
    : 0;

  const maxModelCost = summary && summary.by_model.length > 0
    ? Math.max(...summary.by_model.map((m) => m.cost), 0.000001)
    : 1;

  const totalTypeCost = summary
    ? summary.by_type.reduce((sum, t) => sum + t.cost, 0)
    : 0;

  return (
    <div className="min-h-screen bg-[var(--page)]">
      {/* 顶部栏 */}
      <header className="border-b border-[var(--border)] bg-[var(--bg)]/80 backdrop-blur-xl sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')} title="返回">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-[0_4px_12px_rgba(249,115,22,0.3)]">
              <Coins className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold text-[var(--ink-1)] font-[var(--font-display)]">成本统计</h1>
              <p className="text-xs text-[var(--ink-3)]">AI 调用的 Token 消耗与费用追踪</p>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => load(days, true)} title="刷新">
              <RefreshCw className={cn('w-4 h-4', isRefreshing && 'animate-spin')} />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-6">
        {/* 时间范围切换 */}
        <div className="flex items-center gap-1 mb-5">
          {RANGES.map((r) => (
            <button
              key={r.days}
              type="button"
              onClick={() => { setDays(r.days); load(r.days); }}
              className={cn(
                'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                days === r.days
                  ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
                  : 'text-[var(--ink-3)] hover:text-[var(--ink-1)]'
              )}
            >
              {r.label}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-32">
            <Spinner size="lg" />
          </div>
        ) : !summary || summary.call_count === 0 ? (
          <Card>
            <EmptyState
              icon={<Receipt className="w-10 h-10" />}
              title="暂无成本记录"
              description="使用 AI 模型生成内容后，调用消耗会自动记录在这里"
            />
          </Card>
        ) : (
          <div className="space-y-5">
            {/* 总览卡片 */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="p-5">
                <div className="flex items-center gap-2 text-xs text-[var(--ink-3)] mb-2">
                  <Coins className="w-3.5 h-3.5" /> 总成本
                </div>
                <div className="text-2xl font-bold text-[var(--accent)]">${formatCost(summary.total_cost)}</div>
              </Card>
              <Card className="p-5">
                <div className="flex items-center gap-2 text-xs text-[var(--ink-3)] mb-2">
                  <Ticket className="w-3.5 h-3.5" /> Token 消耗
                </div>
                <div className="text-2xl font-bold text-blue-400">{formatTokens(summary.total_tokens)}</div>
              </Card>
              <Card className="p-5">
                <div className="flex items-center gap-2 text-xs text-[var(--ink-3)] mb-2">
                  <Activity className="w-3.5 h-3.5" /> 调用次数
                </div>
                <div className="text-2xl font-bold text-purple-400">{summary.call_count.toLocaleString()}</div>
              </Card>
              <Card className="p-5">
                <div className="flex items-center gap-2 text-xs text-[var(--ink-3)] mb-2">
                  <CalendarDays className="w-3.5 h-3.5" /> 日均成本
                </div>
                <div className="text-2xl font-bold text-green-400">${formatCost(dailyAvg)}</div>
              </Card>
            </div>

            {/* 每日趋势 */}
            <Card className="p-5">
              <h3 className="text-sm font-semibold text-[var(--ink-1)] mb-3">每日成本趋势</h3>
              <DailyChart daily={summary.daily} />
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* 模型分布 */}
              <Card className="p-5">
                <h3 className="text-sm font-semibold text-[var(--ink-1)] mb-3">模型消耗排行</h3>
                <div className="space-y-3">
                  {summary.by_model.slice(0, 10).map((m) => (
                    <div key={`${m.provider}-${m.model_name}`}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-[var(--ink-1)] font-medium truncate">
                          {m.provider} / {m.model_name}
                        </span>
                        <span className="text-[var(--ink-3)] flex-shrink-0 ml-2">
                          ${formatCost(m.cost)} · {m.count} 次
                        </span>
                      </div>
                      <div className="h-1.5 bg-[var(--panel-2)] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-[var(--accent)] to-[var(--accent-2)] rounded-full"
                          style={{ width: `${Math.max(2, (m.cost / maxModelCost) * 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              {/* 类型分布 */}
              <Card className="p-5">
                <h3 className="text-sm font-semibold text-[var(--ink-1)] mb-3">模态分布</h3>
                <div className="space-y-3">
                  {summary.by_type.map((t) => {
                    const pct = totalTypeCost > 0 ? Math.round((t.cost / totalTypeCost) * 100) : 0;
                    return (
                      <div key={t.model_type}>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="flex items-center gap-2 text-[var(--ink-1)] font-medium">
                            <span
                              className="w-2.5 h-2.5 rounded-sm"
                              style={{ background: TYPE_COLORS[t.model_type] || 'var(--accent)' }}
                            />
                            {TYPE_LABELS[t.model_type] || t.model_type}
                          </span>
                          <span className="text-[var(--ink-3)]">
                            ${formatCost(t.cost)} · {pct}%
                          </span>
                        </div>
                        <div className="h-1.5 bg-[var(--panel-2)] rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${pct}%`,
                              background: TYPE_COLORS[t.model_type] || 'var(--accent)',
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-4 pt-4 border-t border-[var(--border)] flex items-center gap-2 text-xs text-[var(--ink-3)]">
                  <Badge variant="default">提示</Badge>
                  成本按各模型平台单价估算，实际账单以平台为准
                </div>
              </Card>
            </div>

            {/* 最近调用记录 */}
            {records.length > 0 && (
              <Card className="p-5">
                <h3 className="text-sm font-semibold text-[var(--ink-1)] mb-3">最近调用记录</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-[var(--ink-4)] border-b border-[var(--border)]">
                        <th className="pb-2 font-medium">时间</th>
                        <th className="pb-2 font-medium">模型</th>
                        <th className="pb-2 font-medium">类型</th>
                        <th className="pb-2 font-medium text-right">Token</th>
                        <th className="pb-2 font-medium text-right">成本</th>
                      </tr>
                    </thead>
                    <tbody>
                      {records.map((r) => (
                        <tr key={r.id} className="border-b border-[var(--border)]/50 last:border-0">
                          <td className="py-2 text-[var(--ink-3)] whitespace-nowrap">{formatDateTime(r.created_at)}</td>
                          <td className="py-2 text-[var(--ink-1)] truncate max-w-[220px]">{r.provider} / {r.model_name}</td>
                          <td className="py-2">
                            <Badge variant="default">{TYPE_LABELS[r.model_type] || r.model_type}</Badge>
                          </td>
                          <td className="py-2 text-right text-[var(--ink-2)]">{formatTokens(r.tokens)}</td>
                          <td className="py-2 text-right text-[var(--accent)] font-medium">${formatCost(r.cost)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
