import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  ZoomIn, ZoomOut, Maximize2, RotateCcw, ArrowLeft, Network,
  Search, ChevronRight, ChevronDown, X, Focus, Layers
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

// ============================================================
// 数据定义
// ============================================================
interface MindNodeData {
  id: string;
  label: string;
  desc?: string;
  input?: string;
  output?: string;
  color: string;
  group: string;
}

interface Connection {
  from: string;
  to: string;
  label?: string;
  type?: 'main' | 'cross';
}

const NODES: MindNodeData[] = [
  { id: 'root', label: 'CineSlice Studio', desc: 'AI 短剧生产流水线', color: '#2b74f5', group: 'root' },
  // 剧本工坊
  { id: 'prep', label: '剧本工坊', desc: 'StageScript', color: '#4a7de0', group: 'prep' },
  { id: 'novel', label: '小说上传', desc: '解析章节', input: '.txt/.md', output: '章节列表', color: '#7aa2f0', group: 'prep' },
  { id: 'episode', label: '剧集拆分', desc: '集标记检测·分批5集', input: '章节内容', output: '剧集列表', color: '#7aa2f0', group: 'prep' },
  { id: 'script', label: '剧本生成', desc: '可编辑', input: '剧集梗概', output: '完整剧本', color: '#7aa2f0', group: 'prep' },
  { id: 'analysis', label: '剧本分析', desc: '7维分析·落库缓存', input: '剧本内容', output: '分析结果', color: '#4a7de0', group: 'prep' },
  // 资产铸造
  { id: 'exec', label: '资产铸造', desc: 'StageAssets', color: '#3d6fd8', group: 'exec' },
  { id: 'character', label: '角色提取', desc: '定妆图+衣橱+音色', input: '剧本+分析', output: '角色资产', color: '#5f8ceb', group: 'exec' },
  { id: 'scene', label: '场景提取', desc: '概念参考图', input: '剧本+分析', output: '场景清单', color: '#5f8ceb', group: 'exec' },
  { id: 'prop', label: '道具提取', desc: '跨镜头视觉连贯', input: '剧本+分析', output: '道具清单', color: '#5f8ceb', group: 'exec' },
  // 导演执行
  { id: 'dir', label: '导演执行', desc: 'StageDirector', color: '#3d6fd8', group: 'dir' },
  { id: 'shot', label: '分镜生成', desc: 'scene_id 落库', input: '剧本+角色+场景', output: '分镜表', color: '#5f8ceb', group: 'dir' },
  { id: 'keyframe', label: '关键帧生成', desc: '定妆+场景+道具注入', input: '镜头+资产', output: '关键帧图片', color: '#5f8ceb', group: 'dir' },
  { id: 'audio', label: '配音生成', desc: 'voice_profile 优先', input: '对话+音色+情绪', output: '配音音频', color: '#5f8ceb', group: 'dir' },
  { id: 'video', label: '视频生成', desc: '首尾帧硬衔接', input: '镜头+关键帧', output: '视频片段', color: '#5f8ceb', group: 'dir' },
  // 质量保障
  { id: 'quality', label: '质量保障', desc: '贯穿生成链路', color: '#2e5cb8', group: 'quality' },
  { id: 'layer1', label: '导演模板', desc: '8维细节+合规红线', input: '镜头上下文', output: '导演级提示词', color: '#7aa2f0', group: 'quality' },
  { id: 'layer2', label: 'AI 深度优化', desc: '剧本上下文+低温度', input: '完整剧本分析', output: 'AI 优化提示词', color: '#7aa2f0', group: 'quality' },
  { id: 'consistency', label: '一致性保障', desc: '参考图+负面词', input: '资产库', output: '统一视觉', color: '#7aa2f0', group: 'quality' },
  // 输出交付
  { id: 'output', label: '输出交付', desc: 'StageExport', color: '#1f4f9e', group: 'output' },
  { id: 'subtitle', label: '字幕生成', desc: '角色名前缀去重', input: '台词+时长', output: 'SRT 字幕', color: '#4a7de0', group: 'output' },
  { id: 'compose', label: '视频合成', desc: 'FFmpeg 编码', input: '视频+配音+字幕', output: '成片 MP4', color: '#4a7de0', group: 'output' },
  { id: 'export', label: '多格式导出', desc: 'MP4/PDF/FDX/ZIP', input: '项目数据', output: '导出文件', color: '#4a7de0', group: 'output' },
  { id: 'pipeline', label: '全自动流水线', desc: '9阶段一键串联', input: '小说文件', output: '成片视频', color: '#4a7de0', group: 'output' },
  // 自由创作
  { id: 'free', label: '自由创作', desc: 'CreateStudio', color: '#1f4f9e', group: 'free' },
  { id: 't2i', label: '文生图', desc: '提示词→图片', input: '描述', output: '图片', color: '#7aa2f0', group: 'free' },
  { id: 'i2i', label: '图生图', desc: '参考图编辑', input: '图片+指令', output: '新图', color: '#7aa2f0', group: 'free' },
  { id: 't2v', label: '文生视频', desc: '提示词→视频', input: '描述', output: '视频', color: '#7aa2f0', group: 'free' },
  { id: 'i2v', label: '图生视频', desc: '首帧→视频', input: '图片+描述', output: '视频', color: '#7aa2f0', group: 'free' },
];

// 主要树形连接（用于布局）
const TREE_CHILDREN: Record<string, string[]> = {
  root: ['prep', 'exec', 'dir', 'quality', 'output', 'free'],
  prep: ['novel', 'episode', 'script', 'analysis'],
  exec: ['character', 'scene', 'prop'],
  dir: ['shot', 'keyframe', 'audio', 'video'],
  quality: ['layer1', 'layer2', 'consistency'],
  output: ['subtitle', 'compose', 'export', 'pipeline'],
  free: ['t2i', 'i2i', 't2v', 'i2v'],
};

// 所有连接（含交叉连接）
const CONNECTIONS: Connection[] = [
  // 树形主连接
  { from: 'root', to: 'prep', type: 'main' },
  { from: 'root', to: 'exec', type: 'main' },
  { from: 'root', to: 'dir', type: 'main' },
  { from: 'root', to: 'quality', type: 'main' },
  { from: 'root', to: 'output', type: 'main' },
  { from: 'root', to: 'free', type: 'main' },
  { from: 'prep', to: 'novel', type: 'main' },
  { from: 'prep', to: 'episode', type: 'main' },
  { from: 'prep', to: 'script', type: 'main' },
  { from: 'prep', to: 'analysis', type: 'main' },
  { from: 'exec', to: 'character', type: 'main' },
  { from: 'exec', to: 'scene', type: 'main' },
  { from: 'exec', to: 'prop', type: 'main' },
  { from: 'dir', to: 'shot', type: 'main' },
  { from: 'dir', to: 'keyframe', type: 'main' },
  { from: 'dir', to: 'audio', type: 'main' },
  { from: 'dir', to: 'video', type: 'main' },
  { from: 'quality', to: 'layer1', type: 'main' },
  { from: 'quality', to: 'layer2', type: 'main' },
  { from: 'quality', to: 'consistency', type: 'main' },
  { from: 'output', to: 'subtitle', type: 'main' },
  { from: 'output', to: 'compose', type: 'main' },
  { from: 'output', to: 'export', type: 'main' },
  { from: 'output', to: 'pipeline', type: 'main' },
  { from: 'free', to: 't2i', type: 'main' },
  { from: 'free', to: 'i2i', type: 'main' },
  { from: 'free', to: 't2v', type: 'main' },
  { from: 'free', to: 'i2v', type: 'main' },
  // 交叉连接（参数传递）
  { from: 'novel', to: 'episode', label: '章节', type: 'cross' },
  { from: 'episode', to: 'script', label: '梗概', type: 'cross' },
  { from: 'script', to: 'analysis', label: '剧本', type: 'cross' },
  { from: 'analysis', to: 'character', label: '角色分析', type: 'cross' },
  { from: 'analysis', to: 'scene', label: '场景分析', type: 'cross' },
  { from: 'analysis', to: 'prop', label: '线索道具', type: 'cross' },
  { from: 'analysis', to: 'shot', label: '剧情/情绪', type: 'cross' },
  { from: 'analysis', to: 'video', label: '全维度', type: 'cross' },
  { from: 'character', to: 'shot', label: '定妆注入', type: 'cross' },
  { from: 'character', to: 'keyframe', label: '定妆图', type: 'cross' },
  { from: 'character', to: 'audio', label: '音色', type: 'cross' },
  { from: 'scene', to: 'shot', label: '场景约束', type: 'cross' },
  { from: 'scene', to: 'keyframe', label: '概念图', type: 'cross' },
  { from: 'prop', to: 'keyframe', label: '道具图', type: 'cross' },
  { from: 'shot', to: 'keyframe', label: '镜头', type: 'cross' },
  { from: 'shot', to: 'audio', label: '对话', type: 'cross' },
  { from: 'shot', to: 'video', label: '镜头', type: 'cross' },
  { from: 'shot', to: 'subtitle', label: '台词', type: 'cross' },
  { from: 'keyframe', to: 'video', label: '首帧/尾帧', type: 'cross' },
  { from: 'layer1', to: 'keyframe', label: '提示词', type: 'cross' },
  { from: 'layer1', to: 'video', label: '提示词', type: 'cross' },
  { from: 'layer2', to: 'keyframe', label: 'AI提示词', type: 'cross' },
  { from: 'layer2', to: 'video', label: 'AI提示词', type: 'cross' },
  { from: 'consistency', to: 'keyframe', type: 'cross' },
  { from: 'consistency', to: 'video', type: 'cross' },
  { from: 'video', to: 'compose', label: '片段', type: 'cross' },
  { from: 'audio', to: 'compose', label: '配音', type: 'cross' },
  { from: 'subtitle', to: 'compose', label: '字幕', type: 'cross' },
  { from: 'export', to: 'pipeline', label: '闭环', type: 'cross' },
];

// ============================================================
// 布局常量
// ============================================================
const NODE_W = 170;
const NODE_H = 64;
const H_GAP = 80;
const V_GAP = 18;

interface LaidOutNode extends MindNodeData {
  x: number;
  y: number;
  depth: number;
  hasChildren: boolean;
}

// 树布局算法：叶子节点按顺序分配 y，父节点取子节点 y 均值
function layoutTree(collapsed: Set<string>): { nodes: LaidOutNode[]; width: number; height: number } {
  const nodeMap = new Map(NODES.map(n => [n.id, n]));
  const result = new Map<string, LaidOutNode>();
  let leafIndex = 0;

  function walk(id: string, depth: number): number {
    const data = nodeMap.get(id)!;
    const children = TREE_CHILDREN[id] || [];
    const visibleChildren = collapsed.has(id) ? [] : children;
    const hasChildren = children.length > 0;

    let y: number;
    if (visibleChildren.length === 0) {
      y = leafIndex * (NODE_H + V_GAP);
      leafIndex++;
    } else {
      const childYs = visibleChildren.map(cid => walk(cid, depth + 1));
      y = (childYs[0] + childYs[childYs.length - 1]) / 2;
    }

    result.set(id, {
      ...data,
      x: depth * (NODE_W + H_GAP),
      y,
      depth,
      hasChildren,
    });
    return y;
  }

  walk('root', 0);

  const nodes = Array.from(result.values());
  const maxX = Math.max(...nodes.map(n => n.x)) + NODE_W;
  const maxY = Math.max(...nodes.map(n => n.y)) + NODE_H;

  return { nodes, width: maxX, height: maxY };
}

// ============================================================
// 组件
// ============================================================
export function MindMapPage() {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);

  const [scale, setScale] = useState(0.7);
  const [position, setPosition] = useState({ x: 40, y: 40 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set(['prep', 'exec', 'dir', 'quality', 'output', 'free']));
  const [searchQuery, setSearchQuery] = useState('');
  const [showMinimap, setShowMinimap] = useState(true);

  const { nodes: laidOutNodes, width, height } = useMemo(() => layoutTree(collapsed), [collapsed]);
  const nodeMap = useMemo(() => new Map(laidOutNodes.map(n => [n.id, n])), [laidOutNodes]);

  // 搜索匹配的节点
  const matchedIds = useMemo(() => {
    if (!searchQuery.trim()) return new Set<string>();
    const q = searchQuery.toLowerCase();
    return new Set(
      NODES.filter(n =>
        n.label.toLowerCase().includes(q) ||
        n.desc?.toLowerCase().includes(q) ||
        n.input?.toLowerCase().includes(q) ||
        n.output?.toLowerCase().includes(q)
      ).map(n => n.id)
    );
  }, [searchQuery]);

  // 关联节点（选中/悬停时高亮）
  const relatedIds = useMemo(() => {
    const active = hoveredNode || selectedNode;
    if (!active) return new Set<string>();
    const related = new Set<string>([active]);
    CONNECTIONS.forEach(c => {
      if (c.from === active) related.add(c.to);
      if (c.to === active) related.add(c.from);
    });
    return related;
  }, [hoveredNode, selectedNode]);

  const activeNode = selectedNode ? nodeMap.get(selectedNode) : null;

  // 适应屏幕
  const fitToScreen = useCallback(() => {
    if (!containerRef.current) return;
    const cw = containerRef.current.clientWidth - 80;
    const ch = containerRef.current.clientHeight - 80;
    const s = Math.min(cw / width, ch / height, 1);
    setScale(s);
    setPosition({
      x: (containerRef.current.clientWidth - width * s) / 2,
      y: (containerRef.current.clientHeight - height * s) / 2,
    });
  }, [width, height]);

  useEffect(() => { fitToScreen(); }, [fitToScreen]);

  // 聚焦到节点
  const focusNode = useCallback((id: string) => {
    const node = nodeMap.get(id);
    if (!node || !containerRef.current) return;
    const cw = containerRef.current.clientWidth;
    const ch = containerRef.current.clientHeight;
    setPosition({
      x: cw / 2 - (node.x + NODE_W / 2) * scale,
      y: ch / 2 - (node.y + NODE_H / 2) * scale,
    });
  }, [nodeMap, scale]);

  // 切换折叠
  const toggleCollapse = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // 全部展开/折叠
  const expandAll = useCallback(() => setCollapsed(new Set()), []);
  const collapseAll = useCallback(() => {
    setCollapsed(new Set(['prep', 'exec', 'dir', 'quality', 'output', 'free']));
  }, []);

  // 鼠标事件
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    dragStart.current = { x: e.clientX - position.x, y: e.clientY - position.y };
  };
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPosition({ x: e.clientX - dragStart.current.x, y: e.clientY - dragStart.current.y });
  };
  const handleMouseUp = () => setIsDragging(false);
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.08 : 0.08;
    setScale(prev => Math.max(0.2, Math.min(2.5, prev + delta)));
  };

  // 渲染连线
  const renderConnections = () => {
    return CONNECTIONS.map(conn => {
      const from = nodeMap.get(conn.from);
      const to = nodeMap.get(conn.to);
      if (!from || !to) return null;

      const fromX = from.x + NODE_W;
      const fromY = from.y + NODE_H / 2;
      const toX = to.x;
      const toY = to.y + NODE_H / 2;
      const midX = (fromX + toX) / 2;
      const path = `M ${fromX} ${fromY} C ${midX} ${fromY}, ${midX} ${toY}, ${toX} ${toY}`;

      const isActive = relatedIds.has(conn.from) && relatedIds.has(conn.to);
      const isCross = conn.type === 'cross';
      const dimmed = (hoveredNode || selectedNode) && !isActive;

      return (
        <g key={`${conn.from}-${conn.to}`} style={{ transition: 'opacity 0.2s' }}>
          <path
            d={path}
            fill="none"
            stroke={isActive ? 'var(--accent)' : isCross ? 'var(--ink-3)' : 'var(--border)'}
            strokeWidth={isActive ? 2.5 : isCross ? 1 : 1.5}
            strokeDasharray={isCross ? '4 3' : undefined}
            opacity={dimmed ? 0.15 : isActive ? 0.9 : isCross ? 0.35 : 0.5}
          />
          {conn.label && isActive && (
            <text
              x={midX}
              y={(fromY + toY) / 2 - 6}
              textAnchor="middle"
              fontSize="10"
              fill="var(--accent)"
              fontWeight="500"
            >
              {conn.label}
            </text>
          )}
        </g>
      );
    });
  };

  // 渲染节点
  const renderNodes = () => {
    return laidOutNodes.map(node => {
      const isSelected = selectedNode === node.id;
      const isHovered = hoveredNode === node.id;
      const isMatched = matchedIds.size > 0 && matchedIds.has(node.id);
      const isDimmed = matchedIds.size > 0 && !isMatched;
      const isRelated = relatedIds.has(node.id);
      const isCollapsed = collapsed.has(node.id);

      return (
        <div
          key={node.id}
          className="absolute select-none"
          style={{
            left: node.x,
            top: node.y,
            width: NODE_W,
            height: NODE_H,
            transform: 'translateZ(0)',
          }}
          onClick={(e) => { e.stopPropagation(); setSelectedNode(node.id); }}
          onMouseEnter={() => setHoveredNode(node.id)}
          onMouseLeave={() => setHoveredNode(null)}
          onDoubleClick={(e) => { e.stopPropagation(); focusNode(node.id); }}
        >
          <div
            className="w-full h-full rounded-xl flex flex-col justify-center px-3 relative cursor-pointer transition-all duration-200"
            style={{
              background: `linear-gradient(135deg, ${node.color}, ${node.color}dd)`,
              boxShadow: isSelected
                ? `0 0 0 2px var(--accent), 0 8px 24px ${node.color}55`
                : isHovered
                ? `0 4px 16px ${node.color}44, 0 0 0 1.5px ${node.color}`
                : `0 2px 8px rgba(0,0,0,0.12)`,
              opacity: isDimmed ? 0.3 : 1,
              transform: isHovered || isSelected ? 'scale(1.04)' : 'scale(1)',
              zIndex: isSelected ? 10 : isHovered ? 5 : 1,
            }}
          >
            {/* 折叠按钮 */}
            {node.hasChildren && (
              <button
                onClick={(e) => toggleCollapse(node.id, e)}
                className="absolute -right-2.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-white shadow-md flex items-center justify-center text-[10px] font-bold hover:scale-110 transition-transform z-20"
                style={{ color: node.color }}
                title={isCollapsed ? '展开' : '折叠'}
              >
                {isCollapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
            )}

            <div className="text-white font-semibold text-[13px] leading-tight truncate">
              {node.label}
            </div>
            {node.desc && (
              <div className="text-white/75 text-[10px] leading-tight mt-0.5 truncate">
                {node.desc}
              </div>
            )}
            {node.output && (
              <div className="text-white/60 text-[9px] mt-0.5 truncate">
                → {node.output}
              </div>
            )}
          </div>
        </div>
      );
    });
  };

  return (
    <div className="h-screen flex flex-col bg-[var(--page)] overflow-hidden">
      {/* 顶栏 */}
      <header className="border-b border-[var(--border)] bg-[var(--card-bg)]/80 backdrop-blur-sm shrink-0 z-40">
        <div className="px-4 py-2.5 flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-lg hover:bg-[var(--panel-2)] text-[var(--ink-3)] hover:text-[var(--ink-1)] transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="w-8 h-8 rounded-lg bg-[var(--accent)] flex items-center justify-center">
            <Network className="w-4 h-4 text-white" />
          </div>
          <div className="shrink-0">
            <h1 className="text-sm font-bold text-[var(--ink-1)]">项目思维导图</h1>
            <p className="text-[10px] text-[var(--ink-3)]">全流程参数传递关系 · 互动式</p>
          </div>

          {/* 搜索 */}
          <div className="ml-4 relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--ink-3)]" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索节点..."
              className="pl-8 pr-7 py-1.5 text-xs rounded-lg bg-[var(--panel-2)] border border-[var(--border)] text-[var(--ink-1)] placeholder-[var(--ink-3)] focus:outline-none focus:border-[var(--accent)] w-44"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--ink-3)] hover:text-[var(--ink-1)]"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={collapseAll}
              className="px-2.5 py-1.5 text-xs rounded-lg hover:bg-[var(--panel-2)] text-[var(--ink-3)] hover:text-[var(--ink-1)] transition-colors flex items-center gap-1"
              title="全部折叠"
            >
              <Layers className="w-3.5 h-3.5" /> 折叠
            </button>
            <button
              onClick={expandAll}
              className="px-2.5 py-1.5 text-xs rounded-lg hover:bg-[var(--panel-2)] text-[var(--ink-3)] hover:text-[var(--ink-1)] transition-colors flex items-center gap-1"
              title="全部展开"
            >
              <ChevronDown className="w-3.5 h-3.5" /> 展开
            </button>
            <div className="w-px h-5 bg-[var(--border)] mx-1" />
            <button
              onClick={() => setScale(p => Math.max(0.2, p - 0.1))}
              className="p-1.5 rounded-lg hover:bg-[var(--panel-2)] text-[var(--ink-3)] hover:text-[var(--ink-1)]"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="text-xs text-[var(--ink-2)] w-10 text-center font-mono">{Math.round(scale * 100)}%</span>
            <button
              onClick={() => setScale(p => Math.min(2.5, p + 0.1))}
              className="p-1.5 rounded-lg hover:bg-[var(--panel-2)] text-[var(--ink-3)] hover:text-[var(--ink-1)]"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              onClick={fitToScreen}
              className="p-1.5 rounded-lg hover:bg-[var(--panel-2)] text-[var(--ink-3)] hover:text-[var(--ink-1)]"
              title="适应屏幕"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
            <button
              onClick={() => { setScale(0.7); setPosition({ x: 40, y: 40 }); }}
              className="p-1.5 rounded-lg hover:bg-[var(--panel-2)] text-[var(--ink-3)] hover:text-[var(--ink-1)]"
              title="重置视图"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
            <button
              onClick={() => setShowMinimap(v => !v)}
              className={`p-1.5 rounded-lg transition-colors ${showMinimap ? 'bg-[var(--accent-soft)] text-[var(--accent)]' : 'text-[var(--ink-3)] hover:text-[var(--ink-1)] hover:bg-[var(--panel-2)]'}`}
              title="小地图"
            >
              <Focus className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* 主区域 */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* 画布 */}
        <div
          ref={containerRef}
          className="flex-1 overflow-hidden relative"
          style={{
            cursor: isDragging ? 'grabbing' : 'grab',
            background: `
              radial-gradient(circle at 30% 20%, rgba(43,116,245,0.04) 0%, transparent 50%),
              var(--page)
            `,
          }}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onClick={() => setSelectedNode(null)}
        >
          {/* 网格背景 */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage: `
                linear-gradient(rgba(120,140,180,0.05) 1px, transparent 1px),
                linear-gradient(90deg, rgba(120,140,180,0.05) 1px, transparent 1px)
              `,
              backgroundSize: `${30 * scale}px ${30 * scale}px`,
              backgroundPosition: `${position.x}px ${position.y}px`,
            }}
          />

          {/* 变换容器 */}
          <div
            className="absolute top-0 left-0"
            style={{
              transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
              transformOrigin: '0 0',
              width,
              height,
            }}
          >
            {/* SVG 连线层 */}
            <svg
              width={width}
              height={height}
              className="absolute top-0 left-0 pointer-events-none"
              style={{ overflow: 'visible' }}
            >
              {renderConnections()}
            </svg>
            {/* HTML 节点层 */}
            {renderNodes()}
          </div>

          {/* 操作提示 */}
          <div className="absolute bottom-3 left-3 text-[10px] text-[var(--ink-3)] bg-[var(--card-bg)]/80 backdrop-blur-sm px-3 py-1.5 rounded-lg border border-[var(--border)] flex items-center gap-3">
            <span>拖拽平移</span>
            <span>·</span>
            <span>滚轮缩放</span>
            <span>·</span>
            <span>点击选中</span>
            <span>·</span>
            <span>双击聚焦</span>
            <span>·</span>
            <span>○ 折叠子树</span>
          </div>

          {/* Minimap */}
          {showMinimap && (
            <div className="absolute bottom-3 right-3 w-44 h-32 bg-[var(--card-bg)]/90 backdrop-blur-sm rounded-lg border border-[var(--border)] overflow-hidden shadow-lg">
              <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet">
                {laidOutNodes.map(n => (
                  <rect
                    key={n.id}
                    x={n.x}
                    y={n.y}
                    width={NODE_W}
                    height={NODE_H}
                    rx={6}
                    fill={n.color}
                    opacity={selectedNode === n.id ? 1 : 0.6}
                  />
                ))}
                {/* 视口指示 */}
                <rect
                  x={-position.x / scale}
                  y={-position.y / scale}
                  width={containerRef.current ? containerRef.current.clientWidth / scale : 800}
                  height={containerRef.current ? containerRef.current.clientHeight / scale : 600}
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth={3 / scale}
                  strokeDasharray={`${8 / scale} ${6 / scale}`}
                />
              </svg>
              <div className="absolute top-1 left-2 text-[9px] text-[var(--ink-3)]">导航</div>
            </div>
          )}
        </div>

        {/* 右侧详情面板 */}
        {activeNode && (
          <div className="w-72 border-l border-[var(--border)] bg-[var(--card-bg)] overflow-y-auto shrink-0">
            <div className="p-4">
              <div className="flex items-start gap-3 mb-4">
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center text-white font-bold text-lg shrink-0"
                  style={{ background: `linear-gradient(135deg, ${activeNode.color}, ${activeNode.color}cc)` }}
                >
                  {activeNode.label.charAt(0)}
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-[var(--ink-1)] text-sm">{activeNode.label}</h3>
                  {activeNode.desc && <p className="text-[11px] text-[var(--ink-3)] mt-0.5">{activeNode.desc}</p>}
                </div>
                <button
                  onClick={() => setSelectedNode(null)}
                  className="ml-auto p-1 rounded hover:bg-[var(--panel-2)] text-[var(--ink-3)]"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="space-y-2.5">
                {activeNode.input && (
                  <div className="p-2.5 rounded-lg bg-[var(--panel-2)]/60 border border-[var(--border)]">
                    <div className="text-[10px] text-[var(--ink-3)] mb-1 flex items-center gap-1">
                      <ChevronRight className="w-3 h-3 rotate-180" /> 输入
                    </div>
                    <div className="text-xs text-[var(--ink-1)] font-medium">{activeNode.input}</div>
                  </div>
                )}
                {activeNode.output && (
                  <div className="p-2.5 rounded-lg bg-[var(--panel-2)]/60 border border-[var(--border)]">
                    <div className="text-[10px] text-[var(--ink-3)] mb-1 flex items-center gap-1">
                      <ChevronRight className="w-3 h-3" /> 输出
                    </div>
                    <div className="text-xs text-[var(--ink-1)] font-medium">{activeNode.output}</div>
                  </div>
                )}

                {/* 传出连接 */}
                <div className="p-2.5 rounded-lg bg-[var(--panel-2)]/60 border border-[var(--border)]">
                  <div className="text-[10px] text-[var(--ink-3)] mb-2">参数传递去向</div>
                  <div className="space-y-1.5">
                    {CONNECTIONS.filter(c => c.from === activeNode.id).map(c => {
                      const toNode = nodeMap.get(c.to);
                      return (
                        <div
                          key={c.to}
                          className="flex items-center gap-2 text-[11px] cursor-pointer hover:bg-[var(--panel-2)] rounded px-1.5 py-1 -mx-1.5"
                          onClick={() => { setSelectedNode(c.to); focusNode(c.to); }}
                        >
                          <span className="text-[var(--ink-3)]">→</span>
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ background: toNode?.color }}
                          />
                          <span className="text-[var(--ink-2)] truncate">{toNode?.label}</span>
                          {c.label && <span className="text-[var(--accent)] text-[10px] ml-auto shrink-0">{c.label}</span>}
                        </div>
                      );
                    })}
                    {CONNECTIONS.filter(c => c.from === activeNode.id).length === 0 && (
                      <div className="text-[11px] text-[var(--ink-3)]">无后续传递</div>
                    )}
                  </div>
                </div>

                {/* 传入连接 */}
                <div className="p-2.5 rounded-lg bg-[var(--panel-2)]/60 border border-[var(--border)]">
                  <div className="text-[10px] text-[var(--ink-3)] mb-2">数据来源</div>
                  <div className="space-y-1.5">
                    {CONNECTIONS.filter(c => c.to === activeNode.id).map(c => {
                      const fromNode = nodeMap.get(c.from);
                      return (
                        <div
                          key={c.from}
                          className="flex items-center gap-2 text-[11px] cursor-pointer hover:bg-[var(--panel-2)] rounded px-1.5 py-1 -mx-1.5"
                          onClick={() => { setSelectedNode(c.from); focusNode(c.from); }}
                        >
                          <span className="text-[var(--ink-3)]">←</span>
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ background: fromNode?.color }}
                          />
                          <span className="text-[var(--ink-2)] truncate">{fromNode?.label}</span>
                          {c.label && <span className="text-[var(--accent)] text-[10px] ml-auto shrink-0">{c.label}</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 底栏图例 */}
      <footer className="border-t border-[var(--border)] bg-[var(--card-bg)]/80 backdrop-blur-sm px-4 py-2 shrink-0">
        <div className="flex items-center justify-center gap-5 flex-wrap">
          {[
            { color: '#2b74f5', label: '根节点' },
            { color: '#4a7de0', label: '阶段入口' },
            { color: '#5f8ceb', label: '执行节点' },
            { color: '#7aa2f0', label: '细节节点' },
            { color: '#1f4f9e', label: '交付/自由创作' },
          ].map(item => (
            <div key={item.label} className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded" style={{ background: item.color }} />
              <span className="text-[10px] text-[var(--ink-2)]">{item.label}</span>
            </div>
          ))}
          <div className="w-px h-3.5 bg-[var(--border)]" />
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-0 border-t border-dashed border-[var(--ink-3)]" />
            <span className="text-[10px] text-[var(--ink-2)]">交叉参数传递</span>
          </div>
          <div className="w-px h-3.5 bg-[var(--border)]" />
          <span className="text-[10px] text-[var(--ink-3)]">
            {laidOutNodes.length} 节点 · {CONNECTIONS.length} 连接
          </span>
        </div>
      </footer>
    </div>
  );
}
