import { useState, useEffect, useCallback } from 'react';
import {
  User,
  Sparkles,
  Upload,
  Image as ImageIcon,
  Download,
  LayoutGrid,
  Edit3,
  Trash2,
  Plus,
  Shirt,
  Mic2,
  Star,
} from 'lucide-react';
import { Modal, Button, Input, Textarea, Badge } from '../ui';
import { ConfigPanel } from '../StageScript/ConfigPanel';
import { characterService } from '../../services/assetService';
import apiClient from '../../services/apiClient';
import { useUIStore } from '../../stores/useUIStore';
import { useModelStore } from '../../stores/useModelStore';
import { parseModelKey } from '../../types/model';
import { ROLE_TYPE_LABELS, GENDER_LABELS } from '../../utils';
import type { Character, CharacterOutfit } from '../../types';

// 豆包 TTS 8 音色（与后端 VOICE_LIBRARY 对齐，NovelReel 式角色声音档案）
const VOICE_OPTIONS = [
  { value: 'zh_female_qingxin', label: '清新女声 · 年轻女主角' },
  { value: 'zh_female_wener', label: '温柔女声 · 温柔/成熟女性' },
  { value: 'zh_female_tianmei', label: '甜美女声 · 可爱/少女角色' },
  { value: 'zh_female_shenhou', label: '深厚女声 · 成熟/威严女性' },
  { value: 'zh_male_qianhou', label: '浑厚男声 · 成熟男主角' },
  { value: 'zh_male_xiaoshen', label: '小生男声 · 年轻/阴险角色' },
  { value: 'zh_male_yangguang', label: '阳光男声 · 开朗/正义角色' },
  { value: 'zh_male_chenwen', label: '沉稳男声 · 中年/权威角色' },
];

const SPEED_OPTIONS = [
  { value: 0.8, label: '0.8x 慢' },
  { value: 0.9, label: '0.9x 稍慢' },
  { value: 1.0, label: '1.0x 正常' },
  { value: 1.1, label: '1.1x 稍快' },
  { value: 1.2, label: '1.2x 快' },
];

interface CharacterDetailProps {
  character: Character | null;
  onClose: () => void;
  onUpdate: (character: Character) => void;
}

export function CharacterDetail({ character, onClose, onUpdate }: CharacterDetailProps) {
  const { showToast } = useUIStore();
  const { getDefaultModel } = useModelStore();
  const [name, setName] = useState(character?.name || '');
  const [description, setDescription] = useState(character?.description || '');
  const [visualDescription, setVisualDescription] = useState(character?.visual_description || '');
  const [imageConfigOpen, setImageConfigOpen] = useState(false);
  const [fourViewConfigOpen, setFourViewConfigOpen] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [isGeneratingFourView, setIsGeneratingFourView] = useState(false);
  const [selectedImageIndex, setSelectedImageIndex] = useState(character?.selected_image_index || 0);
  const [editingPrompt, setEditingPrompt] = useState(false);
  const [imagePrompt, setImagePrompt] = useState('');
  const [fourViewPrompt, setFourViewPrompt] = useState('');

  // 音色档案（NovelReel 式：跨镜头/跨集声音一致）
  const [voice, setVoice] = useState<string>('');
  const [speed, setSpeed] = useState<number>(1.0);

  // 衣橱（BigBanana Base Look 方案）
  const [outfits, setOutfits] = useState<CharacterOutfit[]>([]);
  const [outfitModalOpen, setOutfitModalOpen] = useState(false);
  const [newOutfitName, setNewOutfitName] = useState('');
  const [newOutfitDesc, setNewOutfitDesc] = useState('');
  const [outfitGenTarget, setOutfitGenTarget] = useState<CharacterOutfit | null>(null);
  const [isGeneratingOutfitImage, setIsGeneratingOutfitImage] = useState(false);

  const loadOutfits = async (characterId: string) => {
    try {
      const res = await apiClient.get<unknown, { success?: boolean; data?: CharacterOutfit[] }>(`/characters/${characterId}/outfits`);
      if (res.success && res.data) setOutfits(res.data);
    } catch {
      setOutfits([]);
    }
  };
  // 生成默认概念图提示词（正位站立，严谨描述，可用于视频生成）
  const generateDefaultImagePrompt = useCallback(() => {
    const genderText = character?.gender === 'male' ? '男性' : character?.gender === 'female' ? '女性' : '人物';
    return `角色概念设定图，${character?.name || ''}，${genderText}，${visualDescription || '详细的面部特征和服装设计'}，正面全身站立姿势，双臂自然下垂，双脚并拢，正视镜头，中性表情，纯白色背景，角色居中，完整全身像，从头到脚完整显示，高质量，细节丰富，电影级光影，8K分辨率，角色一致性参考图`;
  }, [character?.gender, character?.name, visualDescription]);

  // 生成默认四视图提示词
  const generateDefaultFourViewPrompt = useCallback(() => {
    const genderText = character?.gender === 'male' ? '男性' : character?.gender === 'female' ? '女性' : '人物';
    return `角色四视图设定表，${character?.name || ''}，${genderText}，${visualDescription || '详细的面部特征和服装设计'}，从左到右依次为：面部特写、正面全身、侧面全身、背面全身，每个视图都完整显示，纯白色背景，角色一致性，服装设计细节清晰，高质量，细节丰富，电影级光影，8K分辨率，角色设定参考图`;
  }, [character?.gender, character?.name, visualDescription]);

  // 同步 character 变化
  useEffect(() => {
    if (character) {
      setName(character.name);
      setDescription(character.description);
      setVisualDescription(character.visual_description);
      setSelectedImageIndex(character.selected_image_index);
      setImagePrompt(generateDefaultImagePrompt());
      setFourViewPrompt(generateDefaultFourViewPrompt());
      // 解析音色档案
      try {
        const p = character.voice_profile ? JSON.parse(character.voice_profile) : null;
        setVoice(p?.voice || '');
        setSpeed(typeof p?.speed === 'number' ? p.speed : 1.0);
      } catch {
        setVoice('');
        setSpeed(1.0);
      }
    }
    if (character) loadOutfits(character.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [character, generateDefaultImagePrompt, generateDefaultFourViewPrompt]);

  // 外貌描述变化时更新提示词
  useEffect(() => {
    if (!editingPrompt) {
      setImagePrompt(generateDefaultImagePrompt());
      setFourViewPrompt(generateDefaultFourViewPrompt());
    }
    // editingPrompt 刻意不加入依赖：编辑结束后（true→false）不能把用户手写的提示词重置回默认值
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visualDescription, name]);

  // 获取默认图像模型 key
  const defaultImageModelKey = (() => {
    const model = getDefaultModel('image');
    if (model) return `${model.provider}/${model.model_name}`;
    return '';
  })();


  if (!character) return null;

  const handleSave = async () => {
    try {
      const voiceProfile = voice ? JSON.stringify({ voice, speed }) : undefined;
      const res = await characterService.update(character.id, {
        name,
        description,
        visual_description: visualDescription,
        voice_profile: voiceProfile,
      });
      if (res.success && res.data) {
        onUpdate(res.data);
        showToast('角色信息已更新', 'success');
      }
    } catch {
      showToast('更新失败', 'error');
    }
  };

  const handleGenerateImage = async (params: { modelKey: string }) => {
    setIsGeneratingImage(true);
    try {
      const { provider, modelName } = parseModelKey(params.modelKey);
      const res = await characterService.generateImage(character.id, {
        provider,
        modelName,
        count: 2,
        prompt: imagePrompt, // 使用用户编辑的提示词
      });
      if (res.success && res.data) {
        onUpdate(res.data);
        showToast('概念图生成成功', 'success');
      }
    } catch {
      showToast('生成概念图失败', 'error');
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const handleSelectImage = (index: number) => {
    setSelectedImageIndex(index);
  };

  // 删除角色概念图
  const handleDeleteImage = async (index: number) => {
    try {
      const res = await characterService.deleteImage(character.id, index);
      if (res.success) {
        // 刷新角色数据
        const updated = await characterService.list(character.episode_id);
        if (updated.success && updated.data) {
          const fresh = updated.data.find(c => c.id === character.id);
          if (fresh) {
            onUpdate(fresh);
            setSelectedImageIndex(fresh.selected_image_index || 0);
          }
        }
        showToast('图片已删除', 'success');
      }
    } catch {
      showToast('删除图片失败', 'error');
    }
  };

  const handleGenerateFourView = async (params: { modelKey: string }) => {
    setIsGeneratingFourView(true);
    try {
      const { provider, modelName } = parseModelKey(params.modelKey);
      const res = await characterService.generateFourView(character.id, {
        provider,
        modelName,
        prompt: fourViewPrompt, // 使用用户编辑的提示词
      });
      if (res.success && res.data) {
        // 直接使用返回的完整角色数据更新状态
        onUpdate(res.data);
        showToast('四视图生成成功', 'success');
      }
    } catch (err: any) {
      const errorMsg = err?.response?.data?.message || err?.message || '四视图生成失败';
      showToast(errorMsg, 'error');
      console.error('[FourView] 生成失败:', err);
    } finally {
      setIsGeneratingFourView(false);
    }
  };

  // ============ 衣橱操作 ============

  const handleAddOutfit = async () => {
    if (!newOutfitName.trim()) {
      showToast('请输入造型名称', 'error');
      return;
    }
    try {
      const res = await apiClient.post<unknown, { success?: boolean; data?: CharacterOutfit; message?: string }>(`/characters/${character.id}/outfits`, {
        name: newOutfitName.trim(),
        description: newOutfitDesc.trim(),
      });
      if (res.success && res.data) {
        setOutfits(prev => [...prev, res.data!]);
        setNewOutfitName('');
        setNewOutfitDesc('');
        setOutfitModalOpen(false);
        showToast('造型已添加', 'success');
      } else {
        showToast(res.message || '添加失败', 'error');
      }
    } catch (err: any) {
      showToast(err?.response?.data?.message || '添加失败', 'error');
    }
  };

  const handleSetDefaultOutfit = async (outfit: CharacterOutfit) => {
    try {
      const res = await apiClient.put<unknown, { success?: boolean; data?: CharacterOutfit }>(`/outfits/${outfit.id}/default`);
      if (res.success && res.data) {
        setOutfits(prev => prev.map(o => ({ ...o, is_default: o.id === outfit.id ? 1 : 0 })));
        showToast(`已将「${outfit.name}」设为默认造型，将作为角色参考图注入镜头`, 'success');
      }
    } catch {
      showToast('设置默认造型失败', 'error');
    }
  };

  const handleDeleteOutfit = async (outfit: CharacterOutfit) => {
    try {
      await apiClient.delete(`/outfits/${outfit.id}`);
      setOutfits(prev => prev.filter(o => o.id !== outfit.id));
      showToast('造型已删除', 'success');
    } catch {
      showToast('删除失败', 'error');
    }
  };

  const handleGenerateOutfitImage = async (params: { modelKey: string }) => {
    if (!outfitGenTarget) return;
    setIsGeneratingOutfitImage(true);
    try {
      const { provider, modelName } = parseModelKey(params.modelKey);
      const res = await apiClient.post<unknown, { success?: boolean; data?: CharacterOutfit; message?: string }>(`/outfits/${outfitGenTarget.id}/generate-image`, {
        provider,
        modelName,
      });
      if (res.success && res.data) {
        setOutfits(prev => prev.map(o => o.id === res.data!.id ? res.data! : o));
        showToast('造型图生成成功（保持面容一致，仅换装）', 'success');
      } else {
        showToast(res.message || '造型图生成失败', 'error');
      }
    } catch (err: any) {
      showToast(err?.response?.data?.message || '造型图生成失败', 'error');
    } finally {
      setIsGeneratingOutfitImage(false);
      setOutfitGenTarget(null);
    }
  };

  return (
    <>
      <Modal
        open={!!character}
        onOpenChange={(open) => !open && onClose()}
        title="角色详情"
        size="xl"
        footer={
          <>
            <Button variant="secondary" onClick={onClose}>
              关闭
            </Button>
            <Button onClick={handleSave}>保存修改</Button>
          </>
        }
      >
        <div className="grid grid-cols-5 gap-6">
          {/* 左侧：概念图 */}
          <div className="col-span-2">
            <div className="aspect-[3/4] rounded-[var(--radius-card)] bg-[var(--panel-2)] overflow-hidden border border-[var(--border)] relative group">
              {(character.concept_images ?? [])[selectedImageIndex]?.url ? (
                <img
                  src={(character.concept_images ?? [])[selectedImageIndex].url}
                  alt={character.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[var(--panel-2)] to-[var(--panel-3)]">
                  <User className="w-20 h-20 text-[var(--ink-3)]" />
                </div>
              )}
              {(character.concept_images ?? [])[selectedImageIndex]?.url && (
                <div className="absolute top-3 right-3 flex gap-2">
                  <button className="w-8 h-8 rounded-lg bg-black/50 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/70 transition-colors">
                    <Download className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            {/* 缩略图列表 */}
            {(character.concept_images ?? []).length > 0 && (
              <div className="grid grid-cols-4 gap-2 mt-3">
                {(character.concept_images ?? []).map((img, index) => (
                  <div
                    key={index}
                    className="relative aspect-square rounded-lg overflow-hidden border-2 transition-all group"
                  >
                    <button
                      onClick={() => handleSelectImage(index)}
                      className={`w-full h-full ${
                        selectedImageIndex === index
                          ? 'border-[var(--accent)] ring-2 ring-[var(--accent)]/30'
                          : 'border-transparent hover:border-[var(--border)]'
                      }`}
                    >
                      <img src={img.url} alt="" className="w-full h-full object-cover" />
                    </button>
                    <button
                      onClick={() => handleDeleteImage(index)}
                      className="absolute top-1 right-1 w-5 h-5 rounded bg-red-500/80 backdrop-blur-sm flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500"
                      title="删除此图片"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2 mt-3">
              <Button
                variant="primary"
                size="sm"
                className="flex-1"
                leftIcon={<Sparkles className="w-4 h-4" />}
                onClick={() => setImageConfigOpen(true)}
                isLoading={isGeneratingImage}
              >
                生成概念图
              </Button>
              <Button variant="outline" size="sm" leftIcon={<Upload className="w-4 h-4" />}>
                上传
              </Button>
            </div>

            {/* 四视图区域 */}
            <div className="mt-4 pt-4 border-t border-[var(--border)]">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-[var(--ink-2)] flex items-center gap-1">
                  <LayoutGrid className="w-3 h-3" /> 角色四视图（面部特写+三视图）
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  leftIcon={<Sparkles className="w-3 h-3" />}
                  onClick={() => setFourViewConfigOpen(true)}
                  isLoading={isGeneratingFourView}
                >
                  生成四视图
                </Button>
              </div>
              {(character.four_view_images ?? []).length > 0 ? (
                <div className="aspect-video rounded-lg overflow-hidden border border-[var(--border)] bg-[var(--panel-2)]">
                  <img
                    src={character.four_view_images![character.four_view_images!.length - 1].url}
                    alt={`${character.name} 四视图`}
                    className="w-full h-full object-contain"
                  />
                </div>
              ) : (
                <div className="aspect-video rounded-lg border border-dashed border-[var(--border)] bg-[var(--panel-2)]/50 flex items-center justify-center">
                  <p className="text-xs text-[var(--ink-3)]">点击「生成四视图」生成面部特写+正面/侧面/背面三视图</p>
                </div>
              )}
            </div>
          </div>

          {/* 右侧：信息编辑 */}
          <div className="col-span-3 space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="accent">{ROLE_TYPE_LABELS[character.role_type]}</Badge>
              <Badge variant="default">{GENDER_LABELS[character.gender]}</Badge>
              {(character.concept_images ?? []).length > 0 && (
                <Badge variant="success" className="flex items-center gap-1">
                  <ImageIcon className="w-3 h-3" />
                  {(character.concept_images ?? []).length} 张概念图
                </Badge>
              )}
            </div>

            <Input
              label="角色名称"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />

            <Textarea
              label="角色描述"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="角色身份、性格、背景故事等"
            />

            <Textarea
              label="外貌描述"
              value={visualDescription}
              onChange={(e) => setVisualDescription(e.target.value)}
              rows={4}
              placeholder="详细的外貌特征描述，用于 AI 图像生成"
            />

            {/* 音色档案（NovelReel 式） */}
            <div className="p-3 rounded-[var(--radius-control)] bg-[var(--panel-2)] border border-[var(--border)]">
              <p className="text-xs font-medium text-[var(--ink-2)] mb-2 flex items-center gap-1">
                <Mic2 className="w-3 h-3" /> 角色声音档案
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] text-[var(--ink-3)] mb-1">音色（跨镜头/跨集固定）</label>
                  <select
                    value={voice}
                    onChange={(e) => setVoice(e.target.value)}
                    className="w-full px-2 py-1.5 text-xs rounded-md border border-[var(--border)] bg-[var(--bg)] text-[var(--ink-1)] focus:outline-none focus:border-[var(--accent)]"
                  >
                    <option value="">自动分配（按性别/性格）</option>
                    {VOICE_OPTIONS.map(v => (
                      <option key={v.value} value={v.value}>{v.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] text-[var(--ink-3)] mb-1">语速</label>
                  <select
                    value={speed}
                    onChange={(e) => setSpeed(Number(e.target.value))}
                    className="w-full px-2 py-1.5 text-xs rounded-md border border-[var(--border)] bg-[var(--bg)] text-[var(--ink-1)] focus:outline-none focus:border-[var(--accent)]"
                  >
                    {SPEED_OPTIONS.map(s => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <p className="text-[10px] text-[var(--ink-3)] mt-1.5">保存后该角色台词将始终使用此音色，配音不再漂移</p>
            </div>

            {/* 衣橱 / 多套造型（BigBanana Base Look） */}
            <div className="p-3 rounded-[var(--radius-control)] bg-[var(--panel-2)] border border-[var(--border)]">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-[var(--ink-2)] flex items-center gap-1">
                  <Shirt className="w-3 h-3" /> 衣橱 / 多套造型
                </p>
                <Button variant="outline" size="sm" leftIcon={<Plus className="w-3 h-3" />} onClick={() => setOutfitModalOpen(true)}>
                  新增造型
                </Button>
              </div>
              <p className="text-[10px] text-[var(--ink-3)] mb-2">默认造型图会作为角色参考图注入镜头生成，保证跨镜服装一致</p>
              {outfits.length === 0 ? (
                <div className="rounded-lg border border-dashed border-[var(--border)] py-4 text-center">
                  <p className="text-xs text-[var(--ink-3)]">还没有造型。新增造型后可生成换装图（保持面容一致，仅更换服装）</p>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {outfits.map(o => (
                    <div key={o.id} className={`rounded-lg overflow-hidden border ${o.is_default ? 'border-[var(--accent)] ring-1 ring-[var(--accent)]/30' : 'border-[var(--border)]'}`}>
                      <div className="aspect-[3/4] bg-[var(--panel-3)] relative group">
                        {o.image_url ? (
                          <img src={o.image_url} alt={o.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Shirt className="w-6 h-6 text-[var(--ink-3)] opacity-50" />
                          </div>
                        )}
                        {o.is_default === 1 && (
                          <span className="absolute top-1 left-1 flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-[var(--accent)] text-white text-[9px]">
                            <Star className="w-2.5 h-2.5" /> 默认
                          </span>
                        )}
                      </div>
                      <div className="p-1.5">
                        <p className="text-[10px] text-[var(--ink-1)] truncate">{o.name}</p>
                        {o.image_url ? (
                          <button
                            onClick={() => setOutfitGenTarget(o)}
                            className="mt-1 w-full px-1 py-0.5 rounded text-[9px] text-[var(--accent)] border border-[var(--accent)]/30 hover:bg-[var(--accent)]/10 transition-colors"
                          >
                            <Sparkles className="w-2.5 h-2.5 inline mr-0.5" />
                            重新生成换装图
                          </button>
                        ) : (
                          <button
                            onClick={() => setOutfitGenTarget(o)}
                            className="mt-1 w-full px-1 py-0.5 rounded text-[9px] text-[var(--accent)] border border-[var(--accent)]/30 hover:bg-[var(--accent)]/10 transition-colors"
                          >
                            <Sparkles className="w-2.5 h-2.5 inline mr-0.5" />
                            生成造型图
                          </button>
                        )}
                        <div className="mt-1 flex gap-1">
                          {o.is_default !== 1 && (
                            <button
                              onClick={() => handleSetDefaultOutfit(o)}
                              className="flex-1 px-1 py-0.5 rounded text-[9px] text-[var(--ink-2)] border border-[var(--border)] hover:bg-[var(--panel-3)] transition-colors"
                            >
                              设为默认
                            </button>
                          )}
                          <button
                            onClick={() => handleDeleteOutfit(o)}
                            className="flex-1 px-1 py-0.5 rounded text-[9px] text-red-500 border border-red-500/30 hover:bg-red-500/10 transition-colors"
                          >
                            删除
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 概念图提示词编辑 */}
            <div className="p-3 rounded-[var(--radius-control)] bg-[var(--panel-2)] border border-[var(--border)]">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-[var(--ink-3)] font-medium">概念图生成提示词</p>
                <button
                  onClick={() => setEditingPrompt(!editingPrompt)}
                  className="text-xs text-[var(--accent)] hover:underline flex items-center gap-1"
                >
                  <Edit3 className="w-3 h-3" />
                  {editingPrompt ? '锁定自动生成' : '编辑提示词'}
                </button>
              </div>
              {editingPrompt ? (
                <Textarea
                  value={imagePrompt}
                  onChange={(e) => setImagePrompt(e.target.value)}
                  rows={5}
                  className="text-xs font-mono"
                  placeholder="编辑概念图生成提示词..."
                />
              ) : (
                <p className="text-xs text-[var(--ink-2)] font-mono leading-relaxed">
                  {imagePrompt}
                </p>
              )}
            </div>

            {/* 四视图提示词编辑 */}
            <div className="p-3 rounded-[var(--radius-control)] bg-[var(--panel-2)] border border-[var(--border)]">
              <p className="text-xs text-[var(--ink-3)] mb-2 font-medium">四视图生成提示词</p>
              {editingPrompt ? (
                <Textarea
                  value={fourViewPrompt}
                  onChange={(e) => setFourViewPrompt(e.target.value)}
                  rows={4}
                  className="text-xs font-mono"
                  placeholder="编辑四视图生成提示词..."
                />
              ) : (
                <p className="text-xs text-[var(--ink-2)] font-mono leading-relaxed">
                  {fourViewPrompt}
                </p>
              )}
            </div>
          </div>
        </div>
      </Modal>

      <ConfigPanel
        open={imageConfigOpen}
        onOpenChange={setImageConfigOpen}
        title="生成角色概念图"
        description={`为「${character.name}」生成概念图，将根据外貌描述生成`}
        modelType="image"
        onGenerate={handleGenerateImage}
        isLoading={isGeneratingImage}
        defaultModelKey={defaultImageModelKey}
      />

      <ConfigPanel
        open={fourViewConfigOpen}
        onOpenChange={setFourViewConfigOpen}
        title="生成角色四视图"
        description={`为「${character.name}」生成面部特写+正面/侧面/背面三视图（16:9宽幅），用于视频生成时保持角色一致性`}
        modelType="image"
        onGenerate={handleGenerateFourView}
        isLoading={isGeneratingFourView}
        defaultModelKey={defaultImageModelKey}
      />

      {/* 新增造型弹窗 */}
      <Modal
        open={outfitModalOpen}
        onOpenChange={setOutfitModalOpen}
        title="新增造型"
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOutfitModalOpen(false)}>
              取消
            </Button>
            <Button onClick={handleAddOutfit}>添加造型</Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input
            label="造型名称"
            value={newOutfitName}
            onChange={(e) => setNewOutfitName(e.target.value)}
            placeholder="如：便装 / 晚礼服 / 古装 / 战斗服"
          />
          <Textarea
            label="造型描述（用于生成换装图）"
            value={newOutfitDesc}
            onChange={(e) => setNewOutfitDesc(e.target.value)}
            rows={3}
            placeholder="如：黑色西装的正式着装，深蓝色领带，皮鞋；或 浅蓝色汉服长裙，发髻..."
          />
          <p className="text-[10px] text-[var(--ink-3)]">添加后点击「生成造型图」，将保持角色面容一致、仅更换服装</p>
        </div>
      </Modal>

      {/* 生成造型图（用角色定妆照作参考换装） */}
      <ConfigPanel
        open={!!outfitGenTarget}
        onOpenChange={(open) => !open && setOutfitGenTarget(null)}
        title={`生成造型图：${outfitGenTarget?.name || ''}`}
        description={`保持「${character.name}」面部、体型、发型一致，仅更换为：${outfitGenTarget?.description || outfitGenTarget?.name || ''}`}
        modelType="image"
        onGenerate={handleGenerateOutfitImage}
        isLoading={isGeneratingOutfitImage}
        defaultModelKey={defaultImageModelKey}
      />
    </>
  );
}
