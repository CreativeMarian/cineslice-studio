import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Clapperboard,
  Sparkles,
  Image as ImageIcon,
  Edit3,
  Trash2,
  Camera,
  MessageSquare,
  Clock,
  Film,
  ChevronDown,
  ChevronUp,
  Video,
  User,
  Sun,
  Zap,
  ArrowRight,
  Save,
  X,
  Info,
  MapPin,
} from 'lucide-react';
import { Button, Card, EmptyState, Badge, Modal, Textarea, Input, Select } from '../ui';
import { ConfigPanel } from './ConfigPanel';
import { useProjectStore } from '../../stores/useProjectStore';
import { useUIStore } from '../../stores/useUIStore';
import { shotService } from '../../services/shotService';
import { SHOT_SIZE_LABELS, CAMERA_MOVEMENT_LABELS, TRANSITION_LABELS, PACE_LABELS } from '../../utils';
import { parseModelKey } from '../../types/model';
import type { Shot, ShotSize, CameraMovement } from '../../types';

const SHOT_SIZE_OPTIONS: ShotSize[] = ['extreme_wide', 'long', 'full', 'medium', 'medium_closeup', 'closeup', 'extreme_closeup'];
const CAMERA_MOVEMENT_OPTIONS: CameraMovement[] = ['static', 'push_in', 'pull_out', 'pan', 'truck', 'crane', 'handheld', 'steadicam', 'dolly', 'zoom', 'tilt'];
const TRANSITION_OPTIONS = ['cut', 'fade', 'dissolve', 'wipe', 'match_cut'];

export function SceneBreakdown() {
  const { shots, setShots, currentEpisodeId, updateShot, characters, scenes } = useProjectStore();
  const { showToast } = useUIStore();
  const [configOpen, setConfigOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedShotId, setSelectedShotId] = useState<string | null>(null);
  const [expandedShotId, setExpandedShotId] = useState<string | null>(null);
  const [editingShot, setEditingShot] = useState<Shot | null>(null);
  const [editForm, setEditForm] = useState<Partial<Shot>>({});
  const [assetWarningOpen, setAssetWarningOpen] = useState(false);
  const [lastShotModel, setLastShotModel] = useState(() => {
    try { return localStorage.getItem('moo:last_shot_model') || ''; } catch { return ''; }
  });
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (currentEpisodeId) {
      useProjectStore.getState().loadShots(currentEpisodeId);
    }
  }, [currentEpisodeId]);

  const handleGenerate = async (params: { modelKey: string }) => {
    if (!currentEpisodeId) return;
    setIsGenerating(true);
    // 记忆上次选择的模型
    setLastShotModel(params.modelKey);
    try { localStorage.setItem('moo:last_shot_model', params.modelKey); } catch { /* ignore */ }
    try {
      const { provider, modelName } = parseModelKey(params.modelKey);
      const res = await shotService.generate(currentEpisodeId, {
        textProvider: provider,
        textModel: modelName,
        shotDensity: 'normal',
        includeDialogue: true,
      });
      if (res.success && res.data) {
        setShots(res.data);
        showToast(`成功生成 ${res.data.length} 个镜头。下一步：进入「资产」阶段为角色定妆`, 'success');
      }
    } catch {
      showToast('生成分镜失败', 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  // 点击生成分镜时检查资产是否已提取
  const handleGenerateClick = () => {
    const hasNoAssets = characters.length === 0 && scenes.length === 0;
    if (hasNoAssets) {
      setAssetWarningOpen(true);
    } else {
      setConfigOpen(true);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await shotService.delete(id);
      setShots(shots.filter((s) => s.id !== id));
      if (selectedShotId === id) setSelectedShotId(null);
      if (expandedShotId === id) setExpandedShotId(null);
      showToast('镜头已删除', 'success');
    } catch {
      showToast('删除失败', 'error');
    }
  };

  const handleShotClick = useCallback((shot: Shot) => {
    setSelectedShotId(shot.id);
    setExpandedShotId(prev => prev === shot.id ? null : shot.id);
  }, []);

  // 键盘上下键切换选中
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (shots.length === 0) return;
      const currentIndex = shots.findIndex(s => s.id === selectedShotId);
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const nextIndex = currentIndex < 0 ? 0 : Math.min(currentIndex + 1, shots.length - 1);
        const next = shots[nextIndex];
        if (next) {
          setSelectedShotId(next.id);
          setExpandedShotId(next.id);
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prevIndex = currentIndex < 0 ? 0 : Math.max(currentIndex - 1, 0);
        const prev = shots[prevIndex];
        if (prev) {
          setSelectedShotId(prev.id);
          setExpandedShotId(prev.id);
        }
      } else if (e.key === 'Enter' && selectedShotId) {
        e.preventDefault();
        setExpandedShotId(prev => prev === selectedShotId ? null : selectedShotId);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [shots, selectedShotId]);

  const openEdit = (shot: Shot) => {
    setEditingShot(shot);
    setEditForm({
      action_description: shot.action_description,
      dialogue: shot.dialogue || '',
      duration_seconds: shot.duration_seconds,
      shot_size: shot.shot_size,
      camera_movement: shot.camera_movement,
      subject: shot.subject || '',
      lighting: shot.lighting || '',
      mood: shot.mood || '',
      transition: shot.transition || 'cut',
    });
  };

  const handleEditSave = async () => {
    if (!editingShot) return;
    try {
      const res = await shotService.update(editingShot.id, editForm as any);
      if (res.success && res.data) {
        updateShot(editingShot.id, editForm as any);
        showToast('镜头已更新', 'success');
      }
    } catch {
      showToast('更新失败', 'error');
    }
    setEditingShot(null);
  };

  const shotSizeConfig: Record<string, string> = {
    closeup: 'bg-[rgba(255,107,90,0.12)] text-[var(--color-danger)]',
    extreme_closeup: 'bg-[rgba(255,107,90,0.18)] text-[var(--color-danger)]',
    medium: 'bg-[rgba(94,140,255,0.12)] text-[var(--color-info)]',
    medium_closeup: 'bg-[rgba(94,140,255,0.18)] text-[var(--color-info)]',
    wide: 'bg-[rgba(63,203,134,0.12)] text-[var(--color-success)]',
    extreme_wide: 'bg-[rgba(249,115,22,0.12)] text-[var(--accent)]',
    long: 'bg-[rgba(63,203,134,0.18)] text-[var(--color-success)]',
    full: 'bg-[rgba(63,203,134,0.15)] text-[var(--color-success)]',
  };

  if (!currentEpisodeId) {
    return (
      <Card>
        <EmptyState
          icon={<Clapperboard className="w-8 h-8" />}
          title="请先选择一集"
          description="选择剧集后可生成和查看分镜表"
        />
      </Card>
    );
  }

  const totalDuration = shots.reduce((sum, s) => sum + s.duration_seconds, 0);

  return (
    <div className="space-y-5">
      {/* 标题栏 */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[var(--accent-soft)] flex items-center justify-center">
            <Clapperboard className="w-5 h-5 text-[var(--accent)]" />
          </div>
          <div>
            <h3 className="font-semibold text-[var(--ink-1)] font-[var(--font-display)]">分镜表</h3>
            <p className="text-xs text-[var(--ink-3)]">剧本分镜（Storyboard）— 指导 AI 视频生成的设计规划</p>
          </div>
          <div className="flex items-center gap-2 ml-2">
            <Badge variant="accent">{shots.length} 镜</Badge>
            <Badge variant="default">
              <Clock className="w-3 h-3 mr-1" />
              {totalDuration}s
            </Badge>
          </div>
        </div>
        <Button
          size="md"
          leftIcon={<Sparkles className="w-4 h-4" />}
          onClick={handleGenerateClick}
        >
          生成分镜
        </Button>
      </div>

      {/* 分镜定义说明 */}
      <Card className="p-4 bg-[var(--accent-soft)]/30 border-l-4 border-l-[var(--accent)]">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-[var(--accent)] flex-shrink-0 mt-0.5" />
          <div className="text-sm text-[var(--ink-2)] space-y-1.5">
            <p className="font-medium text-[var(--ink-1)]">关于分镜类型</p>
            <p>
              <span className="font-semibold text-[var(--accent)]">剧本分镜（Storyboard）</span>
              ：本页面展示的是<strong>设计阶段</strong>的分镜规划，用于指导 AI 视频模型生成每个镜头的画面。
              包含景别、镜头运动、画面描述、对话、时长、镜头主体、光影氛围、转场方式等参数。
            </p>
            <p>
              <span className="font-semibold text-[var(--color-info)]">视频分镜</span>
              ：视频实际生成后记录的元数据（分辨率、帧率、实际时长、生成模型等），在「导演工作台」中查看。
            </p>
            <p className="text-xs text-[var(--ink-3)]">
              💡 点击分镜项可展开详情；使用 ↑↓ 键切换选中镜头；Enter 键展开/收起。
            </p>
          </div>
        </div>
      </Card>

      {shots.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Film className="w-8 h-8" />}
            title="还没有分镜"
            description="AI 将根据剧本内容自动生成剧本分镜表，包含镜头编号、景别、镜头运动、画面描述、对话、时长、镜头主体、光影氛围和转场方式"
            action={
              <Button leftIcon={<Sparkles className="w-4 h-4" />} onClick={handleGenerateClick}>
                开始生成
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="space-y-3" ref={listRef}>
          {shots.map((shot: Shot) => {
            const isSelected = selectedShotId === shot.id;
            const isExpanded = expandedShotId === shot.id;
            const sceneName = shot.scene_id ? scenes.find(s => s.id === shot.scene_id)?.name : undefined;
            const shotChars = Array.isArray(shot.characters_in_shot)
              ? shot.characters_in_shot.map((c: unknown) => String(c)).filter(Boolean)
              : [];
            return (
              <Card
                key={shot.id}
                className={`p-4 cursor-pointer transition-all duration-200 ${
                  isSelected
                    ? 'ring-2 ring-[var(--accent)] border-[var(--accent)] shadow-[var(--shadow-float)]'
                    : 'hover:shadow-[var(--shadow-float)] hover:border-[var(--accent)]/40'
                }`}
                onClick={() => handleShotClick(shot)}
              >
                <div className="flex items-start gap-4">
                  {/* 镜头编号 */}
                  <div className="flex flex-col items-center gap-2 flex-shrink-0">
                    <div className={`w-12 h-12 rounded-xl border flex items-center justify-center ${
                      isSelected
                        ? 'bg-[var(--accent)] border-[var(--accent)]'
                        : 'bg-gradient-to-br from-[var(--panel-2)] to-[var(--panel-3)] border-[var(--border)]'
                    }`}>
                      <span className={`text-lg font-bold font-[var(--font-display)] ${
                        isSelected ? 'text-white' : 'text-[var(--accent)]'
                      }`}>
                        {String(shot.shot_number).padStart(2, '0')}
                      </span>
                    </div>
                    <Badge className={shotSizeConfig[shot.shot_size] || 'bg-[var(--panel-2)] text-[var(--ink-2)]'}>
                      {SHOT_SIZE_LABELS[shot.shot_size] || shot.shot_size}
                    </Badge>
                  </div>

                  {/* 内容摘要 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      {sceneName && (
                        <Badge variant="accent" className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {sceneName}
                        </Badge>
                      )}
                      {shotChars.map((name: string, i: number) => (
                        <Badge key={`${name}-${i}`} variant="info" className="flex items-center gap-1">
                          <User className="w-3 h-3" />
                          {name}
                        </Badge>
                      ))}
                      <Badge variant="default" className="flex items-center gap-1">
                        <Camera className="w-3 h-3" />
                        {CAMERA_MOVEMENT_LABELS[shot.camera_movement] || shot.camera_movement}
                      </Badge>
                      <Badge variant="default" className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {shot.duration_seconds}s
                      </Badge>
                      {shot.subject && (
                        <Badge variant="default" className="flex items-center gap-1">
                          <User className="w-3 h-3" />
                          {shot.subject}
                        </Badge>
                      )}
                      {shot.transition && shot.transition !== 'cut' && (
                        <Badge variant="default" className="flex items-center gap-1">
                          <ArrowRight className="w-3 h-3" />
                          {TRANSITION_LABELS[shot.transition] || shot.transition}
                        </Badge>
                      )}
                    </div>

                    <p className="text-sm text-[var(--ink-1)] mb-2 leading-relaxed line-clamp-2">
                      {shot.action_description}
                    </p>

                    {shot.dialogue && (
                      <div className="flex items-start gap-2 text-sm text-[var(--ink-2)] bg-[var(--panel-2)] rounded-[var(--radius-control)] px-3 py-2 border-l-2 border-[var(--accent)]">
                        <MessageSquare className="w-4 h-4 flex-shrink-0 mt-0.5 text-[var(--accent)]" />
                        <p className="italic line-clamp-1">{shot.dialogue}</p>
                      </div>
                    )}
                  </div>

                  {/* 操作区 */}
                  <div className="flex flex-col gap-2 flex-shrink-0 items-end">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={(e) => { e.stopPropagation(); openEdit(shot); }}
                        className="p-1.5 rounded-lg hover:bg-[var(--panel-2)] text-[var(--ink-3)] hover:text-[var(--ink-1)] transition-colors"
                        title="编辑镜头"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(shot.id); }}
                        className="p-1.5 rounded-lg hover:bg-[var(--panel-2)] text-[var(--ink-3)] hover:text-[var(--color-danger)] transition-colors"
                        title="删除镜头"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-[var(--ink-3)]" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-[var(--ink-3)]" />
                      )}
                    </div>
                  </div>
                </div>

                {/* 展开详情面板 */}
                {isExpanded && (
                  <div className="mt-4 pt-4 border-t border-[var(--border)] space-y-4" onClick={(e) => e.stopPropagation()}>
                    {/* 画面描述区 */}
                    <div>
                      <h4 className="text-xs font-semibold text-[var(--ink-3)] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <Film className="w-3.5 h-3.5" /> 画面描述
                      </h4>
                      <p className="text-sm text-[var(--ink-1)] leading-relaxed bg-[var(--panel-2)]/50 rounded-lg p-3">
                        {shot.action_description}
                      </p>
                    </div>

                    {/* 对话区 */}
                    {shot.dialogue && (
                      <div>
                        <h4 className="text-xs font-semibold text-[var(--ink-3)] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                          <MessageSquare className="w-3.5 h-3.5" /> 对话 / 旁白
                        </h4>
                        <p className="text-sm text-[var(--ink-1)] italic leading-relaxed bg-[var(--panel-2)]/50 rounded-lg p-3 border-l-2 border-[var(--accent)]">
                          "{shot.dialogue}"
                        </p>
                      </div>
                    )}

                    {/* 技术参数区 */}
                    <div>
                      <h4 className="text-xs font-semibold text-[var(--ink-3)] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <Zap className="w-3.5 h-3.5" /> 技术参数
                      </h4>
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                        <ParamBadge icon={<Camera className="w-3 h-3" />} label="景别" value={SHOT_SIZE_LABELS[shot.shot_size] || shot.shot_size} />
                        <ParamBadge icon={<Camera className="w-3 h-3" />} label="镜头运动" value={CAMERA_MOVEMENT_LABELS[shot.camera_movement] || shot.camera_movement} />
                        <ParamBadge icon={<Clock className="w-3 h-3" />} label="时长" value={`${shot.duration_seconds}s`} />
                        <ParamBadge icon={<User className="w-3 h-3" />} label="镜头主体" value={shot.subject || '—'} />
                        <ParamBadge icon={<Sun className="w-3 h-3" />} label="光影" value={shot.lighting || '—'} />
                        <ParamBadge icon={<Sparkles className="w-3 h-3" />} label="氛围" value={shot.mood || '—'} />
                        <ParamBadge icon={<ArrowRight className="w-3 h-3" />} label="转场" value={TRANSITION_LABELS[shot.transition || 'cut'] || '硬切'} />
                        <ParamBadge icon={<Zap className="w-3 h-3" />} label="节奏" value={PACE_LABELS[shot.pace || 'normal'] || '中速'} />
                      </div>
                    </div>

                    {/* 生成按钮区 */}
                    <div className="flex items-center gap-3 pt-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        leftIcon={<ImageIcon className="w-4 h-4" />}
                        onClick={() => showToast('请在导演工作台中生成关键帧', 'info')}
                      >
                        🖼️ 生成关键帧
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        leftIcon={<Video className="w-4 h-4" />}
                        onClick={() => showToast('请在导演工作台中生成视频', 'info')}
                      >
                        🎬 生成视频
                      </Button>
                      <span className="text-xs text-[var(--ink-3)] ml-auto">跳转至导演工作台进行生成</span>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <ConfigPanel
        open={configOpen}
        onOpenChange={setConfigOpen}
        title="生成剧本分镜"
        description="AI 将根据剧本内容生成剧本分镜表（Storyboard），用于指导后续视频生成。包含镜头编号、景别、镜头运动、画面描述、对话、时长、镜头主体、光影氛围和转场方式。"
        modelType="text"
        onGenerate={handleGenerate}
        isLoading={isGenerating}
        defaultModelKey={lastShotModel}
      />

      {/* 资产未提取警告 */}
      <Modal
        open={assetWarningOpen}
        onOpenChange={setAssetWarningOpen}
        title="建议先提取角色和场景"
        description="分镜生成会参考角色和场景信息，以获得更精准的镜头主体和画面描述。当前尚未提取任何资产。"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setAssetWarningOpen(false)}>
              仍要生成分镜
            </Button>
            <Button
              onClick={() => {
                setAssetWarningOpen(false);
                setConfigOpen(true);
              }}
              leftIcon={<Sparkles className="w-4 h-4" />}
            >
              继续生成分镜
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-sm text-[var(--ink-2)]">
          <div className="flex items-start gap-2">
            <span className="text-lg">👤</span>
            <div>
              <p className="font-medium text-[var(--ink-1)]">角色提取</p>
              <p className="text-xs text-[var(--ink-3)]">AI 自动识别剧本中的角色，生成角色设定和概念图</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-lg">🏞️</span>
            <div>
              <p className="font-medium text-[var(--ink-1)]">场景提取</p>
              <p className="text-xs text-[var(--ink-3)]">AI 自动识别剧本中的场景，生成场景设定和概念图</p>
            </div>
          </div>
          <p className="text-xs text-[var(--ink-4)] pt-2 border-t border-[var(--border)]">
            💡 你可以在「资产」阶段先提取角色和场景，再回来生成分镜。也可以直接生成分镜，后续再补充资产。
          </p>
        </div>
      </Modal>

      {/* 编辑弹窗 */}
      <Modal
        open={!!editingShot}
        onOpenChange={(open) => !open && setEditingShot(null)}
        title={`编辑镜头 #${editingShot?.shot_number}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditingShot(null)} leftIcon={<X className="w-4 h-4" />}>
              取消
            </Button>
            <Button onClick={handleEditSave} leftIcon={<Save className="w-4 h-4" />}>
              保存
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[var(--ink-2)] mb-1.5">画面描述</label>
            <Textarea
              value={editForm.action_description || ''}
              onChange={(e) => setEditForm(prev => ({ ...prev, action_description: e.target.value }))}
              rows={4}
              placeholder="描述镜头中的动作和场景..."
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--ink-2)] mb-1.5">对话 / 旁白</label>
            <Textarea
              value={editForm.dialogue || ''}
              onChange={(e) => setEditForm(prev => ({ ...prev, dialogue: e.target.value }))}
              rows={2}
              placeholder="该镜头中的对话（没有则留空）"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-[var(--ink-2)] mb-1.5">时长（秒）</label>
              <Input
                type="number"
                value={String(editForm.duration_seconds ?? 5)}
                onChange={(e) => setEditForm(prev => ({ ...prev, duration_seconds: Number(e.target.value) }))}
                min={1}
                max={60}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--ink-2)] mb-1.5">镜头主体</label>
              <Input
                value={editForm.subject || ''}
                onChange={(e) => setEditForm(prev => ({ ...prev, subject: e.target.value }))}
                placeholder="角色名"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--ink-2)] mb-1.5">景别</label>
              <Select
                value={editForm.shot_size || 'medium'}
                onValueChange={(v) => setEditForm(prev => ({ ...prev, shot_size: v as ShotSize }))}
              >
                {SHOT_SIZE_OPTIONS.map(s => (
                  <Select.Item key={s} value={s}>{SHOT_SIZE_LABELS[s] || s}</Select.Item>
                ))}
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--ink-2)] mb-1.5">镜头运动</label>
              <Select
                value={editForm.camera_movement || 'static'}
                onValueChange={(v) => setEditForm(prev => ({ ...prev, camera_movement: v as CameraMovement }))}
              >
                {CAMERA_MOVEMENT_OPTIONS.map(m => (
                  <Select.Item key={m} value={m}>{CAMERA_MOVEMENT_LABELS[m] || m}</Select.Item>
                ))}
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--ink-2)] mb-1.5">转场方式</label>
              <Select
                value={editForm.transition || 'cut'}
                onValueChange={(v) => setEditForm(prev => ({ ...prev, transition: v }))}
              >
                {TRANSITION_OPTIONS.map(t => (
                  <Select.Item key={t} value={t}>{TRANSITION_LABELS[t] || t}</Select.Item>
                ))}
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--ink-2)] mb-1.5">光影</label>
              <Input
                value={editForm.lighting || ''}
                onChange={(e) => setEditForm(prev => ({ ...prev, lighting: e.target.value }))}
                placeholder="侧光/逆光/柔光..."
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--ink-2)] mb-1.5">氛围 / 情绪</label>
            <Input
              value={editForm.mood || ''}
              onChange={(e) => setEditForm(prev => ({ ...prev, mood: e.target.value }))}
              placeholder="紧张/温馨/悬疑/悲伤..."
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}

function ParamBadge({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="bg-[var(--panel-2)]/50 rounded-lg px-3 py-2 border border-[var(--border)]">
      <div className="flex items-center gap-1 text-[10px] text-[var(--ink-3)] uppercase tracking-wider mb-0.5">
        {icon}
        {label}
      </div>
      <div className="text-sm text-[var(--ink-1)] font-medium truncate">{value}</div>
    </div>
  );
}
