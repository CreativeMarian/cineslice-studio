import { useState, useRef, useEffect, useCallback } from 'react';
import { ZoomIn, ZoomOut, Maximize2, RotateCcw, ArrowLeft, Cpu, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface MindNode {
  id: string;
  label: string;
  desc?: string;
  input?: string;
  output?: string;
  color: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Connection {
  from: string;
  to: string;
  label?: string;
}

const nodes: MindNode[] = [
  { id: 'root', label: 'CineSlice Studio', desc: '切片式影视锻造工厂', color: '#4a2c7a', x: 60, y: 380, width: 170, height: 75 },
  { id: 'prep', label: '前期准备', color: '#8b5cf6', x: 300, y: 100, width: 120, height: 45 },
  { id: 'novel', label: '小说上传', desc: '解析章节', input: '.txt/.md文件', output: '章节列表', color: '#a78bfa', x: 500, y: 20, width: 150, height: 65 },
  { id: 'episode', label: '剧集拆分', desc: 'AI改编', input: '章节内容', output: '剧集列表', color: '#a78bfa', x: 500, y: 105, width: 150, height: 65 },
  { id: 'script', label: '剧本生成', desc: '可编辑', input: '剧集梗概', output: '完整剧本', color: '#a78bfa', x: 500, y: 190, width: 150, height: 65 },
  { id: 'analysis', label: '剧本分析', desc: '核心大脑·7维度', input: '剧本内容', output: '分析结果(缓存)', color: '#ec4899', x: 500, y: 290, width: 170, height: 85 },
  { id: 'exec', label: '中期执行', color: '#6366f1', x: 300, y: 450, width: 120, height: 45 },
  { id: 'character', label: '角色提取', desc: '含概念图', input: '剧本+分析', output: '角色列表', color: '#818cf8', x: 750, y: 20, width: 150, height: 65 },
  { id: 'scene', label: '场景提取', desc: '含参考图', input: '剧本+分析', output: '场景列表', color: '#818cf8', x: 750, y: 105, width: 150, height: 65 },
  { id: 'shot', label: '分镜生成', desc: '景别/运动/时长', input: '剧本+分析', output: '分镜表', color: '#818cf8', x: 750, y: 190, width: 150, height: 65 },
  { id: 'keyframe', label: '关键帧生成', desc: '首帧参考图', input: '镜头+角色+场景', output: '关键帧图片', color: '#818cf8', x: 750, y: 290, width: 150, height: 65 },
  { id: 'audio', label: '配音生成', desc: '动态音色/语速', input: '对话+性格+情绪', output: '配音音频', color: '#818cf8', x: 750, y: 390, width: 150, height: 65 },
  { id: 'video', label: '视频生成', desc: '异步任务+轮询', input: '镜头+首帧+分析', output: '视频片段', color: '#818cf8', x: 750, y: 490, width: 150, height: 65 },
  { id: 'quality', label: '质量保障', color: '#ec4899', x: 300, y: 640, width: 120, height: 45 },
  { id: 'layer1', label: '第一层:导演级模板', desc: '7维度优化·保底', input: '镜头上下文+分析', output: '优化提示词', color: '#f472b6', x: 500, y: 580, width: 170, height: 75 },
  { id: 'layer2', label: '第二层:AI深度优化', desc: '7维度分析·核心', input: '完整剧本上下文', output: 'AI优化提示词', color: '#f472b6', x: 500, y: 680, width: 170, height: 75 },
  { id: 'consistency', label: '一致性保障', desc: '人物/场景/风格', input: '概念图+参考图', output: '统一视觉', color: '#f472b6', x: 500, y: 780, width: 170, height: 65 },
  { id: 'output', label: '输出导出', color: '#10b981', x: 300, y: 850, width: 120, height: 45 },
  { id: 'compose', label: '最终合成', desc: 'FFmpeg编码', input: '视频+配音', output: '成片MP4', color: '#34d399', x: 750, y: 600, width: 150, height: 65 },
  { id: 'export', label: '多格式导出', desc: 'MP4/PDF/FDX/Excel', input: '项目数据', output: '导出文件', color: '#34d399', x: 750, y: 690, width: 150, height: 65 },
  { id: 'pipeline', label: '全自动流水线', desc: '9阶段一键生成', input: '小说文件', output: '成片视频', color: '#34d399', x: 750, y: 780, width: 150, height: 65 },
];

const connections: Connection[] = [
  { from: 'root', to: 'prep' },
  { from: 'root', to: 'exec' },
  { from: 'root', to: 'quality' },
  { from: 'root', to: 'output' },
  { from: 'prep', to: 'novel' },
  { from: 'prep', to: 'episode' },
  { from: 'prep', to: 'script' },
  { from: 'prep', to: 'analysis' },
  { from: 'novel', to: 'episode', label: '章节' },
  { from: 'episode', to: 'script', label: '梗概' },
  { from: 'script', to: 'analysis', label: '剧本' },
  { from: 'exec', to: 'character' },
  { from: 'exec', to: 'scene' },
  { from: 'exec', to: 'shot' },
  { from: 'exec', to: 'keyframe' },
  { from: 'exec', to: 'audio' },
  { from: 'exec', to: 'video' },
  { from: 'analysis', to: 'character', label: '角色分析' },
  { from: 'analysis', to: 'scene', label: '场景分析' },
  { from: 'analysis', to: 'shot', label: '剧情/情绪' },
  { from: 'analysis', to: 'keyframe', label: '视觉风格' },
  { from: 'analysis', to: 'video', label: '全维度' },
  { from: 'character', to: 'keyframe', label: '概念图' },
  { from: 'character', to: 'audio', label: '性格' },
  { from: 'scene', to: 'keyframe', label: '参考图' },
  { from: 'shot', to: 'keyframe', label: '镜头' },
  { from: 'shot', to: 'audio', label: '对话' },
  { from: 'shot', to: 'video', label: '镜头' },
  { from: 'keyframe', to: 'video', label: '首帧' },
  { from: 'quality', to: 'layer1' },
  { from: 'quality', to: 'layer2' },
  { from: 'quality', to: 'consistency' },
  { from: 'layer1', to: 'keyframe', label: '提示词' },
  { from: 'layer1', to: 'video', label: '提示词' },
  { from: 'layer2', to: 'keyframe', label: 'AI提示词' },
  { from: 'layer2', to: 'video', label: 'AI提示词' },
  { from: 'consistency', to: 'keyframe' },
  { from: 'consistency', to: 'video' },
  { from: 'output', to: 'compose' },
  { from: 'output', to: 'export' },
  { from: 'output', to: 'pipeline' },
  { from: 'video', to: 'compose', label: '视频片段' },
  { from: 'audio', to: 'compose', label: '配音' },
];

export function MindMapPage() {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.6);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [selectedNode, setSelectedNode] = useState<MindNode | null>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

  const getNode = useCallback((id: string) => nodes.find(n => n.id === id), []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setScale(prev => Math.max(0.2, Math.min(2, prev + delta)));
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 0) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
    }
  }, [position]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDragging) {
      setPosition({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
    }
  }, [isDragging, dragStart]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const resetView = useCallback(() => {
    setScale(0.6);
    setPosition({ x: 0, y: 0 });
  }, []);

  const fitToScreen = useCallback(() => {
    if (containerRef.current) {
      const containerWidth = containerRef.current.clientWidth;
      const containerHeight = containerRef.current.clientHeight;
      const contentWidth = 1000;
      const contentHeight = 900;
      const scaleX = containerWidth / contentWidth;
      const scaleY = containerHeight / contentHeight;
      const newScale = Math.min(scaleX, scaleY, 1);
      setScale(newScale);
      setPosition({ x: (containerWidth - contentWidth * newScale) / 2, y: 20 });
    }
  }, []);

  useEffect(() => {
    fitToScreen();
  }, [fitToScreen]);

  const renderConnection = (conn: Connection) => {
    const fromNode = getNode(conn.from);
    const toNode = getNode(conn.to);
    if (!fromNode || !toNode) return null;

    const fromX = fromNode.x + fromNode.width;
    const fromY = fromNode.y + fromNode.height / 2;
    const toX = toNode.x;
    const toY = toNode.y + toNode.height / 2;

    const midX = (fromX + toX) / 2;
    const path = `M ${fromX} ${fromY} C ${midX} ${fromY}, ${midX} ${toY}, ${toX} ${toY}`;

    const isHighlighted = hoveredNode === conn.from || hoveredNode === conn.to || selectedNode?.id === conn.from || selectedNode?.id === conn.to;

    return (
      <g key={`${conn.from}-${conn.to}`}>
        <path
          d={path}
          fill="none"
          stroke={isHighlighted ? '#8b5cf6' : '#c4b5fd'}
          strokeWidth={isHighlighted ? 2.5 : 1.5}
          opacity={isHighlighted ? 1 : 0.6}
        />
        {conn.label && (
          <text
            x={midX}
            y={(fromY + toY) / 2 - 5}
            textAnchor="middle"
            fontSize="10"
            fill="#7c3aed"
            opacity={isHighlighted ? 1 : 0.7}
          >
            {conn.label}
          </text>
        )}
      </g>
    );
  };

  const renderNode = (node: MindNode) => {
    const isSelected = selectedNode?.id === node.id;
    const isHovered = hoveredNode === node.id;
    const isRoot = node.id === 'root';

    return (
      <g
        key={node.id}
        transform={`translate(${node.x}, ${node.y})`}
        onClick={(e) => { e.stopPropagation(); setSelectedNode(node); }}
        onMouseEnter={() => setHoveredNode(node.id)}
        onMouseLeave={() => setHoveredNode(null)}
        style={{ cursor: 'pointer' }}
      >
        <rect
          width={node.width}
          height={node.height}
          rx={isRoot ? 16 : 10}
          fill={node.color}
          opacity={isSelected || isHovered ? 1 : 0.9}
          stroke={isSelected ? '#fff' : 'transparent'}
          strokeWidth={isSelected ? 3 : 0}
          style={{
            filter: isSelected || isHovered ? 'drop-shadow(0 4px 12px rgba(0,0,0,0.3))' : 'drop-shadow(0 2px 6px rgba(0,0,0,0.15))',
            transition: 'all 0.2s ease',
          }}
        />
        <text
          x={node.width / 2}
          y={isRoot ? 30 : node.desc ? 22 : node.height / 2 + 4}
          textAnchor="middle"
          fill="white"
          fontSize={isRoot ? 15 : 12}
          fontWeight="bold"
        >
          {node.label}
        </text>
        {node.desc && (
          <text
            x={node.width / 2}
            y={isRoot ? 48 : 36}
            textAnchor="middle"
            fill="rgba(255,255,255,0.85)"
            fontSize={isRoot ? 10 : 9}
          >
            {node.desc}
          </text>
        )}
        {node.input && (
          <text
            x={node.width / 2}
            y={node.height - 20}
            textAnchor="middle"
            fill="rgba(255,255,255,0.75)"
            fontSize="8"
          >
            ← {node.input}
          </text>
        )}
        {node.output && (
          <text
            x={node.width / 2}
            y={node.height - 9}
            textAnchor="middle"
            fill="rgba(255,255,255,0.9)"
            fontSize="8"
            fontWeight="500"
          >
            → {node.output}
          </text>
        )}
      </g>
    );
  };

  return (
    <div className="min-h-screen bg-[var(--page)] flex flex-col">
      <header className="border-b border-[var(--border)] bg-[var(--bg)]/80 backdrop-blur-xl sticky top-0 z-40">
        <div className="max-w-full mx-auto px-6 py-3 flex items-center gap-4">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-lg hover:bg-[var(--panel-2)] text-[var(--ink-3)] hover:text-[var(--ink-1)] transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] flex items-center justify-center shadow-[0_4px_16px_rgba(249,115,22,0.3)]">
              <Cpu className="w-5 h-5 text-[var(--on-accent)]" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-[var(--ink-1)] font-[var(--font-display)]">项目思维导图</h1>
              <p className="text-xs text-[var(--ink-3)]">CineSlice Studio 全流程参数传递关系</p>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setScale(prev => Math.max(0.2, prev - 0.1))}
              className="p-2 rounded-lg hover:bg-[var(--panel-2)] text-[var(--ink-3)] hover:text-[var(--ink-1)] transition-colors"
              title="缩小"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="text-sm text-[var(--ink-2)] w-12 text-center font-mono">{Math.round(scale * 100)}%</span>
            <button
              onClick={() => setScale(prev => Math.min(2, prev + 0.1))}
              className="p-2 rounded-lg hover:bg-[var(--panel-2)] text-[var(--ink-3)] hover:text-[var(--ink-1)] transition-colors"
              title="放大"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <div className="w-px h-6 bg-[var(--border)] mx-1" />
            <button
              onClick={fitToScreen}
              className="p-2 rounded-lg hover:bg-[var(--panel-2)] text-[var(--ink-3)] hover:text-[var(--ink-1)] transition-colors"
              title="适应屏幕"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
            <button
              onClick={resetView}
              className="p-2 rounded-lg hover:bg-[var(--panel-2)] text-[var(--ink-3)] hover:text-[var(--ink-1)] transition-colors"
              title="重置视图"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <div
          ref={containerRef}
          className="flex-1 overflow-hidden relative"
          style={{
            background: 'radial-gradient(circle at 50% 50%, rgba(139, 92, 246, 0.05) 0%, transparent 50%), var(--page)',
            cursor: isDragging ? 'grabbing' : 'grab',
          }}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onClick={() => setSelectedNode(null)}
        >
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage: `linear-gradient(rgba(139, 92, 246, 0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(139, 92, 246, 0.08) 1px, transparent 1px)`,
              backgroundSize: `${40 * scale}px ${40 * scale}px`,
              backgroundPosition: `${position.x}px ${position.y}px`,
            }}
          />
          <svg width="100%" height="100%" style={{ position: 'absolute', top: 0, left: 0 }}>
            <g transform={`translate(${position.x}, ${position.y}) scale(${scale})`}>
              {connections.map(renderConnection)}
              {nodes.map(renderNode)}
            </g>
          </svg>
          <div className="absolute bottom-4 left-4 text-xs text-[var(--ink-3)] bg-[var(--bg)]/80 backdrop-blur px-3 py-2 rounded-lg border border-[var(--border)]">
            <div className="flex items-center gap-2">
              <span>拖拽移动</span>
              <span>·</span>
              <span>滚轮缩放</span>
              <span>·</span>
              <span>点击节点查看详情</span>
            </div>
          </div>
        </div>

        {selectedNode && (
          <div className="w-80 border-l border-[var(--border)] bg-[var(--bg)] overflow-y-auto">
            <div className="p-4">
              <div className="flex items-center gap-3 mb-4">
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold"
                  style={{ background: selectedNode.color }}
                >
                  {selectedNode.label.charAt(0)}
                </div>
                <div>
                  <h3 className="font-bold text-[var(--ink-1)]">{selectedNode.label}</h3>
                  {selectedNode.desc && <p className="text-xs text-[var(--ink-3)]">{selectedNode.desc}</p>}
                </div>
              </div>
              <div className="space-y-3">
                {selectedNode.input && (
                  <div className="p-3 rounded-lg bg-[var(--panel-1)] border border-[var(--border)]">
                    <div className="text-xs text-[var(--ink-3)] mb-1 flex items-center gap-1">
                      <ChevronRight className="w-3 h-3 rotate-180" /> 输入参数
                    </div>
                    <div className="text-sm text-[var(--ink-1)] font-medium">{selectedNode.input}</div>
                  </div>
                )}
                {selectedNode.output && (
                  <div className="p-3 rounded-lg bg-[var(--panel-1)] border border-[var(--border)]">
                    <div className="text-xs text-[var(--ink-3)] mb-1 flex items-center gap-1">
                      <ChevronRight className="w-3 h-3" /> 输出参数
                    </div>
                    <div className="text-sm text-[var(--ink-1)] font-medium">{selectedNode.output}</div>
                  </div>
                )}
                <div className="p-3 rounded-lg bg-[var(--panel-1)] border border-[var(--border)]">
                  <div className="text-xs text-[var(--ink-3)] mb-2">参数传递去向</div>
                  <div className="space-y-1">
                    {connections.filter(c => c.from === selectedNode.id).map(c => {
                      const toNode = getNode(c.to);
                      return (
                        <div key={c.to} className="flex items-center gap-2 text-xs">
                          <span className="text-[var(--ink-3)]">→</span>
                          <span className="text-[var(--ink-2)]">{toNode?.label}</span>
                          {c.label && <span className="text-[var(--accent)]">({c.label})</span>}
                        </div>
                      );
                    })}
                    {connections.filter(c => c.from === selectedNode.id).length === 0 && (
                      <div className="text-xs text-[var(--ink-3)]">无后续传递</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <footer className="border-t border-[var(--border)] bg-[var(--bg)]/80 backdrop-blur-xl px-6 py-3">
        <div className="flex items-center justify-center gap-6 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded" style={{ background: '#4a2c7a' }} />
            <span className="text-xs text-[var(--ink-2)]">根节点</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded" style={{ background: '#8b5cf6' }} />
            <span className="text-xs text-[var(--ink-2)]">前期准备</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded" style={{ background: '#6366f1' }} />
            <span className="text-xs text-[var(--ink-2)]">中期执行</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded" style={{ background: '#ec4899' }} />
            <span className="text-xs text-[var(--ink-2)]">质量保障</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded" style={{ background: '#10b981' }} />
            <span className="text-xs text-[var(--ink-2)]">输出导出</span>
          </div>
          <div className="w-px h-4 bg-[var(--border)]" />
          <div className="text-xs text-[var(--ink-3)]">
            共 {nodes.length} 个节点 · {connections.length} 条参数传递连接
          </div>
        </div>
      </footer>
    </div>
  );
}
