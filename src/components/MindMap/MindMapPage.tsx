import { useState, useRef, useEffect, useCallback } from 'react';
import { ZoomIn, ZoomOut, Maximize2, RotateCcw, ArrowLeft, Network, ChevronRight } from 'lucide-react';
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

// ============================================================
// 新逻辑链（v2.0）：对齐当前真实实现
// 主线：项目准备 → 剧本工坊 → 资产铸造 → 导演执行 → 质量保障 → 输出交付
// 旁支：自由创作（文生图/图生图/文生视频/图生视频）
// ============================================================

const nodes: MindNode[] = [
  // ── 根 ──
  { id: 'root', label: 'CineSlice Studio', desc: 'AI 短剧生产流水线 · 从小说到成片', color: '#2b74f5', x: 60, y: 520, width: 190, height: 80 },

  // ── 一、剧本工坊（前期） ──
  { id: 'prep', label: '剧本工坊', desc: 'StageScript', color: '#4a7de0', x: 330, y: 130, width: 130, height: 45 },
  { id: 'novel', label: '小说上传', desc: '解析章节', input: '.txt/.md', output: '章节列表', color: '#7aa2f0', x: 530, y: 20, width: 150, height: 65 },
  { id: 'episode', label: '剧集拆分', desc: '集标记检测·分批5集·缺集补全', input: '章节内容', output: '剧集列表', color: '#7aa2f0', x: 530, y: 105, width: 170, height: 65 },
  { id: 'script', label: '剧本生成', desc: '可编辑', input: '剧集梗概', output: '完整剧本', color: '#7aa2f0', x: 530, y: 195, width: 150, height: 65 },
  { id: 'analysis', label: '剧本分析', desc: '7维分析·落库缓存·模型参数化', input: '剧本内容', output: '分析结果(缓存)', color: '#4a7de0', x: 530, y: 300, width: 180, height: 85 },

  // ── 二、资产铸造（中期） ──
  { id: 'exec', label: '资产铸造', desc: 'StageAssets', color: '#3d6fd8', x: 330, y: 480, width: 130, height: 45 },
  { id: 'character', label: '角色提取', desc: '定妆图 + 衣橱 + 音色', input: '剧本+分析', output: '角色资产', color: '#5f8ceb', x: 780, y: 20, width: 170, height: 70 },
  { id: 'scene', label: '场景提取', desc: '概念参考图', input: '剧本+分析', output: '场景清单', color: '#5f8ceb', x: 780, y: 110, width: 150, height: 65 },
  { id: 'prop', label: '道具提取', desc: '跨镜头视觉连贯', input: '剧本+分析', output: '道具清单', color: '#5f8ceb', x: 780, y: 195, width: 150, height: 65 },

  // ── 三、导演执行（中期） ──
  { id: 'dir', label: '导演执行', desc: 'StageDirector', color: '#3d6fd8', x: 330, y: 680, width: 130, height: 45 },
  { id: 'shot', label: '分镜生成', desc: '场景关联 scene_id 落库', input: '剧本+分析+角色+场景', output: '分镜表', color: '#5f8ceb', x: 1040, y: 20, width: 180, height: 70 },
  { id: 'keyframe', label: '关键帧生成', desc: '角色定妆+场景图+道具图注入', input: '镜头+角色+场景+道具', output: '关键帧图片', color: '#5f8ceb', x: 1040, y: 120, width: 180, height: 70 },
  { id: 'audio', label: '配音生成', desc: 'voice_profile 优先·动态音色', input: '对话+角色音色+情绪', output: '配音音频', color: '#5f8ceb', x: 1040, y: 230, width: 170, height: 70 },
  { id: 'video', label: '视频生成', desc: '首尾帧硬衔接·参考图≤2', input: '镜头+关键帧+分析', output: '视频片段', color: '#5f8ceb', x: 1040, y: 340, width: 180, height: 70 },

  // ── 四、质量保障 ──
  { id: 'quality', label: '质量保障', desc: '贯穿生成链路', color: '#2e5cb8', x: 330, y: 880, width: 130, height: 45 },
  { id: 'layer1', label: '导演模板', desc: '8维细节标准+合规红线', input: '镜头上下文', output: '导演级提示词', color: '#7aa2f0', x: 530, y: 800, width: 170, height: 70 },
  { id: 'layer2', label: 'AI 深度优化', desc: '剧本上下文+低温度', input: '完整剧本分析', output: 'AI 优化提示词', color: '#7aa2f0', x: 530, y: 890, width: 170, height: 70 },
  { id: 'consistency', label: '一致性保障', desc: '角色/场景/道具参考图+负面词', input: '资产库', output: '统一视觉', color: '#7aa2f0', x: 530, y: 980, width: 180, height: 70 },

  // ── 五、输出交付 ──
  { id: 'output', label: '输出交付', desc: 'StageExport', color: '#1f4f9e', x: 330, y: 1180, width: 130, height: 45 },
  { id: 'subtitle', label: '字幕生成', desc: '角色名前缀去重', input: '台词+时长', output: 'SRT 字幕', color: '#4a7de0', x: 780, y: 1080, width: 150, height: 65 },
  { id: 'compose', label: '视频合成', desc: 'FFmpeg 编码', input: '视频+配音+字幕', output: '成片 MP4', color: '#4a7de0', x: 780, y: 1170, width: 150, height: 65 },
  { id: 'export', label: '多格式导出', desc: 'MP4/PDF/FDX/Excel/ZIP', input: '项目数据', output: '导出文件', color: '#4a7de0', x: 780, y: 1260, width: 170, height: 65 },
  { id: 'pipeline', label: '全自动流水线', desc: '9阶段一键串联·断点恢复', input: '小说文件', output: '成片视频', color: '#4a7de0', x: 1040, y: 1170, width: 170, height: 65 },

  // ── 六、自由创作（旁支） ──
  { id: 'free', label: '自由创作', desc: 'CreateStudio·独立工作台', color: '#1f4f9e', x: 60, y: 1180, width: 150, height: 55 },
  { id: 't2i', label: '文生图', desc: '提示词→图片', input: '描述', output: '图片', color: '#7aa2f0', x: 280, y: 1130, width: 120, height: 60 },
  { id: 'i2i', label: '图生图', desc: '参考图编辑', input: '图片+指令', output: '新图', color: '#7aa2f0', x: 280, y: 1210, width: 120, height: 60 },
  { id: 't2v', label: '文生视频', desc: '提示词→视频', input: '描述', output: '视频', color: '#7aa2f0', x: 280, y: 1290, width: 120, height: 60 },
  { id: 'i2v', label: '图生视频', desc: '首帧→视频', input: '图片+描述', output: '视频', color: '#7aa2f0', x: 280, y: 1370, width: 120, height: 60 },
];

const connections: Connection[] = [
  // 根 → 主线
  { from: 'root', to: 'prep', label: '项目' },
  { from: 'root', to: 'exec', label: '资产' },
  { from: 'root', to: 'dir', label: '导演' },
  { from: 'root', to: 'quality', label: '质量' },
  { from: 'root', to: 'output', label: '交付' },
  { from: 'root', to: 'free', label: '自由创作' },

  // 剧本工坊
  { from: 'prep', to: 'novel' },
  { from: 'prep', to: 'episode' },
  { from: 'prep', to: 'script' },
  { from: 'prep', to: 'analysis' },
  { from: 'novel', to: 'episode', label: '章节' },
  { from: 'episode', to: 'script', label: '梗概' },
  { from: 'script', to: 'analysis', label: '剧本' },

  // 资产铸造
  { from: 'exec', to: 'character' },
  { from: 'exec', to: 'scene' },
  { from: 'exec', to: 'prop' },
  { from: 'analysis', to: 'character', label: '角色分析' },
  { from: 'analysis', to: 'scene', label: '场景分析' },
  { from: 'analysis', to: 'prop', label: '线索道具' },

  // 导演执行
  { from: 'dir', to: 'shot' },
  { from: 'dir', to: 'keyframe' },
  { from: 'dir', to: 'audio' },
  { from: 'dir', to: 'video' },
  { from: 'character', to: 'shot', label: '定妆注入' },
  { from: 'scene', to: 'shot', label: '场景约束' },
  { from: 'analysis', to: 'shot', label: '剧情/情绪' },
  { from: 'shot', to: 'keyframe', label: '镜头' },
  { from: 'character', to: 'keyframe', label: '定妆图' },
  { from: 'scene', to: 'keyframe', label: '概念图' },
  { from: 'prop', to: 'keyframe', label: '道具图' },
  { from: 'shot', to: 'audio', label: '对话' },
  { from: 'character', to: 'audio', label: '音色' },
  { from: 'shot', to: 'video', label: '镜头' },
  { from: 'keyframe', to: 'video', label: '首帧/尾帧' },
  { from: 'analysis', to: 'video', label: '全维度' },

  // 质量保障
  { from: 'quality', to: 'layer1' },
  { from: 'quality', to: 'layer2' },
  { from: 'quality', to: 'consistency' },
  { from: 'layer1', to: 'keyframe', label: '提示词' },
  { from: 'layer1', to: 'video', label: '提示词' },
  { from: 'layer2', to: 'keyframe', label: 'AI提示词' },
  { from: 'layer2', to: 'video', label: 'AI提示词' },
  { from: 'consistency', to: 'keyframe' },
  { from: 'consistency', to: 'video' },

  // 输出交付
  { from: 'output', to: 'subtitle' },
  { from: 'output', to: 'compose' },
  { from: 'output', to: 'export' },
  { from: 'output', to: 'pipeline' },
  { from: 'shot', to: 'subtitle', label: '台词' },
  { from: 'video', to: 'compose', label: '片段' },
  { from: 'audio', to: 'compose', label: '配音' },
  { from: 'subtitle', to: 'compose', label: '字幕' },
  { from: 'export', to: 'pipeline', label: '闭环' },

  // 自由创作
  { from: 'free', to: 't2i' },
  { from: 'free', to: 'i2i' },
  { from: 'free', to: 't2v' },
  { from: 'free', to: 'i2v' },
];

export function MindMapPage() {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.55);
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
    setScale(0.55);
    setPosition({ x: 0, y: 0 });
  }, []);

  const fitToScreen = useCallback(() => {
    if (containerRef.current) {
      const containerWidth = containerRef.current.clientWidth;
      const containerHeight = containerRef.current.clientHeight;
      const contentWidth = 1300;
      const contentHeight = 1500;
      const scaleX = containerWidth / contentWidth;
      const scaleY = containerHeight / contentHeight;
      const newScale = Math.min(scaleX, scaleY, 0.9);
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
          stroke={isHighlighted ? '#2b74f5' : '#b9c6e8'}
          strokeWidth={isHighlighted ? 2.5 : 1.5}
          opacity={isHighlighted ? 1 : 0.6}
        />
        {conn.label && (
          <text
            x={midX}
            y={(fromY + toY) / 2 - 5}
            textAnchor="middle"
            fontSize="10"
            fill="#4a7de0"
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
          opacity={isSelected || isHovered ? 1 : 0.92}
          stroke={isSelected ? '#fff' : 'transparent'}
          strokeWidth={isSelected ? 3 : 0}
          style={{
            filter: isSelected || isHovered ? 'drop-shadow(0 4px 12px rgba(43,116,245,0.30))' : 'drop-shadow(0 2px 6px rgba(120,140,180,0.25))',
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
            fill="rgba(255,255,255,0.88)"
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
            fill="rgba(255,255,255,0.78)"
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
            fill="rgba(255,255,255,0.92)"
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
      <header className="border-b border-[var(--border)] bg-[var(--card-bg)] sticky top-0 z-40">
        <div className="max-w-full mx-auto px-6 py-3 flex items-center gap-4">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-lg hover:bg-[var(--panel-2)] text-[var(--ink-3)] hover:text-[var(--ink-1)] transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[var(--accent)] flex items-center justify-center shadow-[0_4px_16px_rgba(43,116,245,0.25)]">
              <Network className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-[var(--ink-1)] font-[var(--font-display)]">项目思维导图</h1>
              <p className="text-xs text-[var(--ink-3)]">CineSlice Studio v2.0 全流程参数传递关系</p>
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
            background: 'radial-gradient(circle at 50% 50%, rgba(43, 116, 245, 0.04) 0%, transparent 50%), var(--page)',
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
              backgroundImage: `linear-gradient(rgba(120, 140, 180, 0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(120, 140, 180, 0.06) 1px, transparent 1px)`,
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
          <div className="absolute bottom-4 left-4 text-xs text-[var(--ink-3)] bg-[var(--card-bg)] px-3 py-2 rounded-lg border border-[var(--border)]">
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
          <div className="w-80 border-l border-[var(--border)] bg-[var(--card-bg)] overflow-y-auto">
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
                  <div className="p-3 rounded-lg bg-[var(--panel-2)] border border-[var(--border)]">
                    <div className="text-xs text-[var(--ink-3)] mb-1 flex items-center gap-1">
                      <ChevronRight className="w-3 h-3 rotate-180" /> 输入参数
                    </div>
                    <div className="text-sm text-[var(--ink-1)] font-medium">{selectedNode.input}</div>
                  </div>
                )}
                {selectedNode.output && (
                  <div className="p-3 rounded-lg bg-[var(--panel-2)] border border-[var(--border)]">
                    <div className="text-xs text-[var(--ink-3)] mb-1 flex items-center gap-1">
                      <ChevronRight className="w-3 h-3" /> 输出参数
                    </div>
                    <div className="text-sm text-[var(--ink-1)] font-medium">{selectedNode.output}</div>
                  </div>
                )}
                <div className="p-3 rounded-lg bg-[var(--panel-2)] border border-[var(--border)]">
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

      <footer className="border-t border-[var(--border)] bg-[var(--card-bg)] px-6 py-3">
        <div className="flex items-center justify-center gap-6 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded" style={{ background: '#2b74f5' }} />
            <span className="text-xs text-[var(--ink-2)]">根节点</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded" style={{ background: '#4a7de0' }} />
            <span className="text-xs text-[var(--ink-2)]">剧本工坊</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded" style={{ background: '#3d6fd8' }} />
            <span className="text-xs text-[var(--ink-2)]">资产/导演</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded" style={{ background: '#2e5cb8' }} />
            <span className="text-xs text-[var(--ink-2)]">质量保障</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded" style={{ background: '#1f4f9e' }} />
            <span className="text-xs text-[var(--ink-2)]">输出/自由创作</span>
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
