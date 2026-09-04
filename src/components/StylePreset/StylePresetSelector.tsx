import { useState, useEffect, useMemo } from 'react';
import { Check, Palette, Camera, Droplets, Film, Sparkles, ChevronDown, ChevronUp, Info } from 'lucide-react';
import { stylePresetService } from '../../services/stylePresetService';
import type { StylePreset } from '../../types';

interface StylePresetSelectorProps {
  value?: string;
  onChange: (presetId: string, preset?: StylePreset) => void;
  showDetails?: boolean;
  /** 紧凑模式：用于弹窗等空间有限的场景 */
  compact?: boolean;
}

// 风格预设对应的渐变色（用于卡片视觉）
const PRESET_GRADIENTS: Record<string, string> = {
  // 旧版预设
  sp_guxian: 'from-emerald-600 via-teal-500 to-amber-400',
  sp_dushi: 'from-slate-700 via-blue-600 to-purple-500',
  sp_cyberpunk: 'from-cyan-500 via-fuchsia-500 to-yellow-400',
  sp_xuanyi: 'from-gray-800 via-emerald-900 to-slate-700',
  sp_tianchong: 'from-pink-400 via-rose-300 to-orange-300',
  sp_rexue: 'from-red-600 via-orange-500 to-yellow-400',
  // 新版内置预设
  'builtin_cinematic-realistic': 'from-slate-700 via-blue-600 to-amber-500',
  'builtin_documentary-realistic': 'from-stone-600 via-amber-700 to-stone-800',
  'builtin_cyberpunk': 'from-cyan-500 via-fuchsia-500 to-yellow-400',
  'builtin_space-sci-fi': 'from-indigo-900 via-purple-800 to-blue-600',
  'builtin_chinese-ancient': 'from-amber-700 via-red-800 to-emerald-900',
  'builtin_wuxia-jianghu': 'from-stone-700 via-amber-800 to-red-900',
  'builtin_anime-japanese': 'from-pink-400 via-purple-400 to-cyan-400',
  'builtin_ghibli-style': 'from-emerald-400 via-sky-400 to-amber-300',
  'builtin_dark-gothic': 'from-purple-900 via-gray-800 to-red-900',
  'builtin_noir-thriller': 'from-gray-900 via-slate-800 to-blue-900',
  'builtin_post-apocalyptic': 'from-amber-800 via-stone-700 to-gray-800',
  'builtin_fresh-healing': 'from-emerald-300 via-sky-300 to-pink-300',
  'builtin_steampunk': 'from-amber-700 via-orange-800 to-stone-800',
  'builtin_youth-campus': 'from-sky-400 via-pink-300 to-amber-300',
};

const CATEGORY_LABELS: Record<string, string> = {
  fantasy: '奇幻',
  modern: '现代',
  scifi: '科幻',
  mystery: '悬疑',
  romance: '恋爱',
  action: '动作',
  custom: '自定义',
  写实: '写实',
  科幻: '科幻',
  国风: '国风',
  动漫: '动漫',
  暗黑: '暗黑',
  治愈: '治愈',
  青春: '青春',
};

/**
 * 风格预设选择器
 * 
 * 参数传递说明：
 * - value: 当前选中的预设ID
 * - onChange: 选中预设时回调，返回 presetId 和完整的 preset 对象
 * - preset 对象包含：visual_style（视觉风格）、camera_language（镜头语言）、
 *   color_palette（色调）、shot_rhythm（节奏）、video_params（视频参数）
 * 
 * 工作流程连通性：
 * 1. 用户在创建项目时选择风格预设 → 保存到 project.style_preset_id
 * 2. 全自动流水线启动时 → autoPipelineService.getProjectStylePreset() 读取预设
 * 3. 关键帧生成 → 使用 preset.visual_style 作为统一风格前缀
 * 4. 视频生成 → 使用 preset.visual_style + 镜头运动描述
 */
export function StylePresetSelector({ value, onChange, showDetails = true, compact = false }: StylePresetSelectorProps) {
  const [presets, setPresets] = useState<StylePreset[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    stylePresetService.list()
      .then(res => {
        if (res.success && res.data) setPresets(res.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // 获取所有分类
  const categories = useMemo(() => {
    const cats = new Set(presets.map(p => p.category).filter(Boolean));
    return ['all', ...Array.from(cats)];
  }, [presets]);

  // 按分类筛选
  const filteredPresets = useMemo(() => {
    if (activeCategory === 'all') return presets;
    return presets.filter(p => p.category === activeCategory);
  }, [presets, activeCategory]);

  // 当前选中的预设
  const selectedPreset = useMemo(() => {
    return presets.find(p => p.id === value);
  }, [presets, value]);

  if (loading) {
    return <div className="text-sm text-[var(--ink-3)]">加载风格预设中...</div>;
  }

  if (presets.length === 0) {
    return <div className="text-sm text-[var(--ink-3)]">暂无可用风格预设</div>;
  }

  const handleSelect = (preset: StylePreset) => {
    onChange(preset.id, preset);
  };

  const toggleExpand = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedId(expandedId === id ? null : id);
  };

  return (
    <div className="space-y-3">
      {/* 标题 + 当前选中提示 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-[var(--ink-2)]">
          <Palette className="w-4 h-4 text-[var(--accent)]" />
          选择风格预设
        </div>
        {selectedPreset && (
          <div className="flex items-center gap-1.5 text-xs text-[var(--accent)] bg-[var(--accent)]/10 px-2 py-1 rounded">
            <Check className="w-3 h-3" />
            已选：{selectedPreset.name}
          </div>
        )}
      </div>

      {/* 参数传递说明（仅非紧凑模式显示） */}
      {!compact && (
        <div className="flex items-start gap-2 text-xs text-[var(--ink-3)] bg-[var(--panel-2)]/50 p-2 rounded-lg">
          <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <span>风格预设将自动应用到关键帧和视频生成：视觉风格、镜头语言、色调、节奏全程统一</span>
        </div>
      )}

      {/* 分类筛选 */}
      {categories.length > 2 && (
        <div className="flex flex-wrap gap-1.5">
          {categories.map(cat => (
            <button
              key={cat}
              type="button"
              onClick={() => setActiveCategory(cat)}
              className={`px-2.5 py-1 text-xs rounded-full transition-colors ${
                activeCategory === cat
                  ? 'bg-[var(--accent)] text-white'
                  : 'bg-[var(--panel-2)] text-[var(--ink-3)] hover:bg-[var(--panel-3)]'
              }`}
            >
              {cat === 'all' ? '全部' : (CATEGORY_LABELS[cat] || cat)}
            </button>
          ))}
        </div>
      )}

      {/* 预设卡片网格 */}
      <div className={`grid gap-3 ${compact ? 'grid-cols-2' : 'grid-cols-2 md:grid-cols-3'}`}>
        {filteredPresets.map(preset => {
          const isSelected = value === preset.id;
          const isExpanded = expandedId === preset.id;
          const gradient = PRESET_GRADIENTS[preset.id] || 'from-gray-600 to-gray-800';
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => handleSelect(preset)}
              className={`relative text-left rounded-xl overflow-hidden border-2 transition-all hover:scale-[1.02] ${
                isSelected
                  ? 'border-[var(--accent)] ring-2 ring-[var(--accent)]/30'
                  : 'border-[var(--border)] hover:border-[var(--accent)]/50'
              }`}
            >
              {/* 顶部渐变条 */}
              <div className={`h-14 bg-gradient-to-br ${gradient} relative`}>
                {preset.is_builtin && (
                  <span className="absolute top-1.5 right-1.5 text-[10px] bg-black/40 text-white px-1.5 py-0.5 rounded">
                    内置
                  </span>
                )}
                {isSelected && (
                  <div className="absolute top-1.5 left-1.5 w-5 h-5 bg-[var(--accent)] rounded-full flex items-center justify-center">
                    <Check className="w-3 h-3 text-white" />
                  </div>
                )}
              </div>

              {/* 内容 */}
              <div className="p-3 bg-[var(--card-bg)]">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-semibold text-[var(--ink-1)] truncate">{preset.name}</span>
                  <span className="text-[10px] text-[var(--ink-3)] bg-[var(--panel-2)] px-1.5 py-0.5 rounded flex-shrink-0 ml-1">
                    {CATEGORY_LABELS[preset.category] || preset.category}
                  </span>
                </div>
                {preset.description && (
                  <p className="text-xs text-[var(--ink-3)] line-clamp-2 mb-2">{preset.description}</p>
                )}

                {/* 简要参数标签 */}
                {showDetails && !compact && (
                  <div className="flex flex-wrap gap-1 mb-2">
                    {preset.visual_style && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] text-[var(--ink-3)] bg-[var(--panel-2)] px-1.5 py-0.5 rounded">
                        <Sparkles className="w-2.5 h-2.5" />
                        视觉
                      </span>
                    )}
                    {preset.camera_language && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] text-[var(--ink-3)] bg-[var(--panel-2)] px-1.5 py-0.5 rounded">
                        <Camera className="w-2.5 h-2.5" />
                        镜头
                      </span>
                    )}
                    {preset.color_palette && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] text-[var(--ink-3)] bg-[var(--panel-2)] px-1.5 py-0.5 rounded">
                        <Droplets className="w-2.5 h-2.5" />
                        色调
                      </span>
                    )}
                    {preset.shot_rhythm && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] text-[var(--ink-3)] bg-[var(--panel-2)] px-1.5 py-0.5 rounded">
                        <Film className="w-2.5 h-2.5" />
                        节奏
                      </span>
                    )}
                  </div>
                )}

                {/* 展开/收起详细参数 */}
                {showDetails && !compact && (
                  <div
                    onClick={(e) => toggleExpand(preset.id, e)}
                    className="flex items-center justify-center gap-1 text-[10px] text-[var(--ink-3)] hover:text-[var(--ink-2)] cursor-pointer py-1 border-t border-[var(--border)]"
                  >
                    {isExpanded ? (
                      <>收起参数 <ChevronUp className="w-3 h-3" /></>
                    ) : (
                      <>查看参数 <ChevronDown className="w-3 h-3" /></>
                    )}
                  </div>
                )}

                {/* 详细参数展开内容 */}
                {isExpanded && showDetails && !compact && (
                  <div className="space-y-2 pt-2 border-t border-[var(--border)]">
                    {preset.visual_style && (
                      <div>
                        <div className="flex items-center gap-1 text-[10px] text-[var(--accent)] font-medium mb-0.5">
                          <Sparkles className="w-3 h-3" /> 视觉风格
                        </div>
                        <p className="text-[10px] text-[var(--ink-3)] leading-relaxed">{preset.visual_style}</p>
                      </div>
                    )}
                    {preset.camera_language && (
                      <div>
                        <div className="flex items-center gap-1 text-[10px] text-[var(--accent)] font-medium mb-0.5">
                          <Camera className="w-3 h-3" /> 镜头语言
                        </div>
                        <p className="text-[10px] text-[var(--ink-3)] leading-relaxed">{preset.camera_language}</p>
                      </div>
                    )}
                    {preset.color_palette && (
                      <div>
                        <div className="flex items-center gap-1 text-[10px] text-[var(--accent)] font-medium mb-0.5">
                          <Droplets className="w-3 h-3" /> 色调调色
                        </div>
                        <p className="text-[10px] text-[var(--ink-3)] leading-relaxed">{preset.color_palette}</p>
                      </div>
                    )}
                    {preset.shot_rhythm && (
                      <div>
                        <div className="flex items-center gap-1 text-[10px] text-[var(--accent)] font-medium mb-0.5">
                          <Film className="w-3 h-3" /> 剪辑节奏
                        </div>
                        <p className="text-[10px] text-[var(--ink-3)] leading-relaxed">{preset.shot_rhythm}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* 底部说明 */}
      {!compact && (
        <div className="text-xs text-[var(--ink-3)] text-center pt-1">
          共 {presets.length} 个风格预设 · 选中后将自动应用到全片生成
        </div>
      )}
    </div>
  );
}
