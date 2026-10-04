import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, User, Save, Mic2, ImageIcon, LayoutGrid,
  Lock, Shirt, Plus, Pencil, Trash2, Star,
} from 'lucide-react';
import { Button, Card, Badge, Textarea, EmptyState, Modal, Input, Select } from '../ui';
import { ConceptImageGenerator } from '../common';
import { useProjectStore } from '../../stores/useProjectStore';
import { useUIStore } from '../../stores/useUIStore';
import { characterService } from '../../services/assetService';
import { showApiError, getResponseErrorMessage, getApiErrorStatus } from '../../utils/error';
import { ROLE_TYPE_LABELS, GENDER_LABELS, generateId } from '../../utils';
import type { Character, IdentityLock, WardrobeItem } from '../../types';

/** 身份锁定字段定义（全片锁定，不可随意修改） */
const IDENTITY_LOCK_FIELDS: Array<{ key: keyof IdentityLock; label: string; placeholder: string }> = [
  { key: 'age', label: '年龄', placeholder: '如：25岁' },
  { key: 'face_shape', label: '脸型', placeholder: '如：鹅蛋脸' },
  { key: 'hairstyle', label: '发型', placeholder: '如：黑色短发，刘海偏左' },
  { key: 'hair_color', label: '发色', placeholder: '如：黑色' },
  { key: 'body_type', label: '体型', placeholder: '如：中等身材，偏瘦' },
  { key: 'distinctive_features', label: '标志性特征', placeholder: '如：右眼下有泪痣' },
  { key: 'prohibitions', label: '禁忌', placeholder: '如：不得改变发色、不得佩戴耳环' },
];

const DEFAULT_IDENTITY_LOCK: IdentityLock = {
  age: '',
  face_shape: '',
  hairstyle: '',
  hair_color: '',
  body_type: '',
  distinctive_features: '',
  prohibitions: '',
};

/**
 * 第 2 段 · 角色详情页
 * 核心区域（5个）：返回列表 · 编辑形象提示词 · 编辑音色提示词 · 概念图生成/删除 · 四视图生成/删除
 */
export function CharacterDetailPage() {
  const { id, characterId } = useParams();
  const navigate = useNavigate();
  const { characters, setCharacters, currentEpisodeId, loadCharacters } = useProjectStore();
  const { showToast } = useUIStore();

  const character = characters.find((c) => c.id === characterId) || null;
  const isLocal = !!character?.id.startsWith('local_');

  // 形象提示词（对应外貌描述，用于概念图/四视图生成）
  const [visualPrompt, setVisualPrompt] = useState('');
  // 音色提示词（描述角色声音，用于 TTS）
  const [voicePrompt, setVoicePrompt] = useState('');
  const [savingVisual, setSavingVisual] = useState(false);
  const [savingVoice, setSavingVoice] = useState(false);

  // ── P0-1: 身份锁 + 服装 ──
  const { scenes, loadScenes } = useProjectStore();
  const [identityLock, setIdentityLock] = useState<IdentityLock>({ ...DEFAULT_IDENTITY_LOCK });
  const [savingIdentity, setSavingIdentity] = useState(false);
  const [wardrobe, setWardrobe] = useState<WardrobeItem[]>([]);
  const [, setSavingWardrobe] = useState(false);
  // 服装编辑弹窗
  const [wardrobeModalOpen, setWardrobeModalOpen] = useState(false);
  const [editingWardrobeIndex, setEditingWardrobeIndex] = useState<number | null>(null);
  const [wardrobeForm, setWardrobeForm] = useState({ name: '', description: '', color: '', scene_id: '' });

  // 页面挂载时确保角色数据已加载（支持直接访问详情 URL）；
  // 若 store 中已存在该角色（含本地暂存角色），则跳过，避免本地角色被后端数据覆盖
  useEffect(() => {
    if (currentEpisodeId && !characters.find((c) => c.id === characterId)) {
      loadCharacters(currentEpisodeId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentEpisodeId, characterId, characters.length]);

  // 角色数据就绪时同步本地编辑态
  useEffect(() => {
    if (character) {
      setVisualPrompt(character.visual_description || '');
      let initialVoice = '';
      if (character.voice_profile) {
        try {
          const p = JSON.parse(character.voice_profile);
          if (p && typeof p === 'object') {
            initialVoice = p.prompt || '';
          } else {
            initialVoice = character.voice_profile;
          }
        } catch {
          initialVoice = character.voice_profile;
        }
      }
      setVoicePrompt(initialVoice);
      // P0-1: 身份锁（JSON 字符串）
      try {
        const il = character.identity_lock ? JSON.parse(character.identity_lock) : null;
        if (il && typeof il === 'object') {
          setIdentityLock({ ...DEFAULT_IDENTITY_LOCK, ...il });
        } else {
          setIdentityLock({ ...DEFAULT_IDENTITY_LOCK });
        }
      } catch {
        setIdentityLock({ ...DEFAULT_IDENTITY_LOCK });
      }
      // P0-1: 服装列表（JSON 字符串）
      try {
        const w = character.wardrobe ? JSON.parse(character.wardrobe) : null;
        setWardrobe(Array.isArray(w) ? w : []);
      } catch {
        setWardrobe([]);
      }
    }
    // 仅在角色切换时同步，避免覆盖用户正在编辑的内容
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [character?.id]);

  // 服装关联场景下拉需要该集场景列表，切换剧集时无条件加载（避免跨集残留旧集场景）
  useEffect(() => {
    if (currentEpisodeId) {
      loadScenes(currentEpisodeId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentEpisodeId]);

  /** 默认概念图提示词（正位站立全身像，角色一致性锚点图） */
  const defaultImagePrompt = useCallback(() => {
    if (!character) return '';
    const genderText = character.gender === 'male' ? '男性' : character.gender === 'female' ? '女性' : '人物';
    return `角色概念设定图，${character.name}，${genderText}，${visualPrompt || '详细的面部特征和服装设计'}，正面全身站立姿势，双臂自然下垂，双脚并拢，正视镜头，中性表情，纯白色背景，角色居中，完整全身像，从头到脚完整显示，高质量，细节丰富，电影级光影，8K分辨率，角色一致性参考图`;
  }, [character, visualPrompt]);

  /** 默认四视图提示词（大头照 + 正面/侧面/背面三视图） */
  const defaultFourViewPrompt = useCallback(() => {
    if (!character) return '';
    const genderText = character.gender === 'male' ? '男性' : character.gender === 'female' ? '女性' : '人物';
    return `角色四视图设定表，${character.name}，${genderText}，${visualPrompt || '详细的面部特征和服装设计'}，从左到右依次为：面部特写、正面全身、侧面全身、背面全身，每个视图都完整显示，纯白色背景，角色一致性，服装设计细节清晰，高质量，细节丰富，电影级光影，8K分辨率，角色设定参考图`;
  }, [character, visualPrompt]);

  /** 更新 store 中的角色（用 getState 避免闭包过期） */
  const updateCharacterInStore = (updated: Character) => {
    const current = useProjectStore.getState().characters;
    setCharacters(current.map((c) => (c.id === updated.id ? updated : c)));
  };

  /** 本地局部更新（手动添加角色等本地暂存场景） */
  const patchCharacter = (patch: Partial<Character>) => {
    if (!character) return;
    updateCharacterInStore({ ...character, ...patch, updated_at: new Date().toISOString() });
  };

  /** 核心区域 1：编辑形象提示词 */
  const handleSaveVisualPrompt = async () => {
    if (!character) return;
    if (isLocal) {
      patchCharacter({ visual_description: visualPrompt });
      showToast('形象提示词已保存（本地）', 'success');
      return;
    }
    setSavingVisual(true);
    try {
      const res = await characterService.update(character.id, { visual_description: visualPrompt });
      if (res.success && res.data) {
        updateCharacterInStore(res.data);
        showToast('形象提示词已保存', 'success');
      } else {
        showToast(getResponseErrorMessage(res, '保存失败'), 'error');
      }
    } catch (err: unknown) {
      showApiError(showToast, err, '保存失败');
    } finally {
      setSavingVisual(false);
    }
  };

  /** 核心区域 2：编辑音色提示词（保留已有 voice/speed，提示词存入 prompt 字段） */
  const handleSaveVoicePrompt = async () => {
    if (!character) return;
    let existing: Record<string, unknown> = {};
    if (character.voice_profile) {
      try {
        const p = JSON.parse(character.voice_profile);
        if (p && typeof p === 'object') existing = p;
      } catch {
        // 非 JSON 视为旧文本，直接覆盖
      }
    }
    const voiceProfile = JSON.stringify({ ...existing, prompt: voicePrompt });
    if (isLocal) {
      patchCharacter({ voice_profile: voiceProfile });
      showToast('音色提示词已保存（本地）', 'success');
      return;
    }
    setSavingVoice(true);
    try {
      const res = await characterService.update(character.id, { voice_profile: voiceProfile });
      if (res.success && res.data) {
        updateCharacterInStore(res.data);
        showToast('音色提示词已保存', 'success');
      } else {
        showToast(getResponseErrorMessage(res, '保存失败'), 'error');
      }
    } catch (err: unknown) {
      showApiError(showToast, err, '保存失败');
    } finally {
      setSavingVoice(false);
    }
  };

  /** 核心区域 2.5：保存身份锁定（全片锁定，JSON 字符串） */
  const handleSaveIdentityLock = async () => {
    if (!character) return;
    const payload = JSON.stringify(identityLock);
    if (isLocal) {
      patchCharacter({ identity_lock: payload });
      showToast('身份锁定已保存（本地）', 'success');
      return;
    }
    setSavingIdentity(true);
    try {
      const res = await characterService.update(character.id, { identity_lock: payload });
      if (res.success && res.data) {
        updateCharacterInStore(res.data);
        showToast('身份锁定已保存，全片角色形象保持一致', 'success');
      } else {
        showToast(getResponseErrorMessage(res, '保存失败'), 'error');
      }
    } catch (err: unknown) {
      showApiError(showToast, err, '保存失败');
    } finally {
      setSavingIdentity(false);
    }
  };

  /** 服装持久化：本地角色直接 patch，服务端角色调用 update */
  const persistWardrobe = async (items: WardrobeItem[]) => {
    if (!character) return;
    const payload = JSON.stringify(items);
    if (isLocal) {
      patchCharacter({ wardrobe: payload });
      setWardrobe(items);
      showToast('服装列表已保存（本地）', 'success');
      return;
    }
    setSavingWardrobe(true);
    try {
      const res = await characterService.update(character.id, { wardrobe: payload });
      if (res.success && res.data) {
        updateCharacterInStore(res.data);
        setWardrobe(items);
        showToast('服装列表已保存', 'success');
      } else {
        showToast(getResponseErrorMessage(res, '保存失败'), 'error');
      }
    } catch (err: unknown) {
      showApiError(showToast, err, '保存失败');
    } finally {
      setSavingWardrobe(false);
    }
  };

  /** Ctrl+S 快捷保存：顺序保存四个编辑区域（形象 → 音色 → 身份锁 → 服装） */
  const handleSaveAll = async () => {
    if (!character) return;
    if (isLocal) {
      patchCharacter({
        visual_description: visualPrompt,
        voice_profile: voicePrompt ? JSON.stringify({ prompt: voicePrompt }) : character.voice_profile,
        identity_lock: JSON.stringify(identityLock),
        wardrobe: JSON.stringify(wardrobe),
      });
      showToast('角色资料已保存（本地）', 'success');
      return;
    }
    // 顺序执行，避免并发写同一资源
    await handleSaveVisualPrompt();
    await handleSaveVoicePrompt();
    await handleSaveIdentityLock();
    await persistWardrobe(wardrobe);
  };

  // P2-9: Ctrl+S 保存当前角色资料（聚焦在输入框时拦截浏览器默认"保存页面"行为）
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        const t = e.target as HTMLElement | null;
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) {
          e.preventDefault();
          void handleSaveAll();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  const openAddWardrobe = () => {
    setEditingWardrobeIndex(null);
    setWardrobeForm({ name: '', description: '', color: '', scene_id: '' });
    setWardrobeModalOpen(true);
  };

  const openEditWardrobe = (index: number) => {
    const item = wardrobe[index];
    if (!item) return;
    setEditingWardrobeIndex(index);
    setWardrobeForm({
      name: item.name || '',
      description: item.description || '',
      color: item.color || '',
      scene_id: item.scene_id || '',
    });
    setWardrobeModalOpen(true);
  };

  /** 新增/编辑服装 */
  const handleSaveWardrobeItem = async () => {
    if (!wardrobeForm.name.trim()) {
      showToast('请输入服装名称', 'error');
      return;
    }
    const next = [...wardrobe];
    const item: WardrobeItem = {
      id: editingWardrobeIndex !== null && next[editingWardrobeIndex]
        ? next[editingWardrobeIndex].id
        : generateId(),
      name: wardrobeForm.name.trim(),
      description: wardrobeForm.description.trim(),
      color: wardrobeForm.color.trim(),
      scene_id: wardrobeForm.scene_id || null,
      is_default: editingWardrobeIndex !== null && next[editingWardrobeIndex]
        ? next[editingWardrobeIndex].is_default
        : 0,
    };
    if (editingWardrobeIndex !== null && next[editingWardrobeIndex]) {
      next[editingWardrobeIndex] = item;
    } else {
      next.push(item);
    }
    setWardrobeModalOpen(false);
    await persistWardrobe(next);
  };

  /** 设为默认服装（唯一默认） */
  const handleSetDefaultWardrobe = async (index: number) => {
    const next = wardrobe.map((w, i) => ({ ...w, is_default: i === index ? 1 : 0 }));
    await persistWardrobe(next);
  };

  /** 删除服装 */
  const handleDeleteWardrobe = async (index: number) => {
    if (!window.confirm(`确定删除服装「${wardrobe[index]?.name || ''}」吗？`)) return;
    const next = wardrobe.filter((_, i) => i !== index);
    await persistWardrobe(next);
  };

  /** 核心区域 3：概念图生成回调 */
  const handleConceptGenerated = async (images: Array<{ url: string }>) => {
    if (!character) return;
    // 新图片追加在末尾，选中最新生成的一张（而非永远显示第一张旧图）
    const nextIndex = Math.max(0, images.length - 1);
    patchCharacter({ concept_images: images, selected_image_index: nextIndex });
    // P2-12: 将选中索引同步保存到后端，刷新页面后仍保持选中最新图（本地角色跳过）
    if (!isLocal) {
      try {
        await characterService.update(character.id, { selected_image_index: nextIndex });
      } catch { /* 静默：store 已更新，后端同步失败不影响本次展示 */ }
    }
  };

  /** 核心区域 3：删除概念图 */
  const handleConceptDeleted = async (index: number) => {
    if (!character) return;
    const nextImages = character.concept_images.filter((_, i) => i !== index);
    const nextIndex = Math.max(0, Math.min(character.selected_image_index, Math.max(0, nextImages.length - 1)));
    if (isLocal) {
      patchCharacter({ concept_images: nextImages, selected_image_index: nextIndex });
      showToast('图片已删除（本地）', 'success');
      return;
    }
    try {
      const res = await characterService.deleteImage(character.id, index);
      if (res.success) {
        patchCharacter({ concept_images: nextImages, selected_image_index: nextIndex });
        showToast('图片已删除', 'success');
      }
    } catch (err: unknown) {
      showApiError(showToast, err, '删除图片失败');
    }
  };

  /** 核心区域 4：四视图生成回调 */
  const handleFourViewGenerated = (images: Array<{ url: string }>) => {
    if (!character) return;
    patchCharacter({ four_view_images: images });
  };

  /** 核心区域 4：删除四视图 */
  const handleFourViewDeleted = async () => {
    if (!character) return;
    if (isLocal) {
      patchCharacter({ four_view_images: [] });
      showToast('四视图已删除（本地）', 'success');
      return;
    }
    try {
      const res = await characterService.deleteFourView(character.id);
      if (res.success) {
        patchCharacter({ four_view_images: [] });
        showToast('四视图已删除', 'success');
      }
    } catch (err: unknown) {
      const status = getApiErrorStatus(err);
      if (status === 404 || status === 501) {
        showToast('四视图删除功能开发中', 'info');
      } else {
        showApiError(showToast, err, '删除四视图失败');
      }
    }
  };

  /** 核心区域 5：返回角色列表 */
  const handleBack = () => {
    if (!id) return;
    navigate(`/project/${id}/characters`);
  };

  if (!character) {
    return (
      <div className="p-6 max-w-[1400px] mx-auto">
        <Button variant="ghost" size="sm" leftIcon={<ArrowLeft className="w-4 h-4" />} onClick={handleBack} className="mb-4">
          返回角色列表
        </Button>
        <Card>
          <EmptyState
            icon={<User className="w-8 h-8" />}
            title="未找到该角色"
            description="角色可能已被删除，或当前剧集不包含此角色"
            action={
              <Button leftIcon={<ArrowLeft className="w-4 h-4" />} onClick={handleBack}>
                返回角色列表
              </Button>
            }
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      {/* 顶部：返回 + 角色名 + 类型标签 */}
      <div className="flex items-center justify-between mb-6">
        <Button variant="ghost" size="sm" leftIcon={<ArrowLeft className="w-4 h-4" />} onClick={handleBack}>
          返回角色列表
        </Button>
        <div className="flex items-center gap-3 min-w-0">
          <h2 className="text-xl font-bold text-[var(--ink-1)] font-[var(--font-display)] truncate">{character.name}</h2>
          <Badge variant="accent">{ROLE_TYPE_LABELS[character.role_type] || character.role_type}</Badge>
          <Badge variant="default">{GENDER_LABELS[character.gender] || character.gender}</Badge>
        </div>
        <div className="w-28" />
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* 左侧栏（约 1/3）：人物画像 + 提示词编辑 */}
        <div className="col-span-1 space-y-5">
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-[var(--accent-soft)] flex items-center justify-center">
                <User className="w-4 h-4 text-[var(--accent)]" />
              </div>
              <h3 className="font-semibold text-[var(--ink-1)] font-[var(--font-display)]">人物画像</h3>
            </div>
            <div className="space-y-3">
              <div>
                <p className="text-xs font-medium text-[var(--ink-3)] mb-1">角色描述</p>
                <p className="text-sm text-[var(--ink-2)] leading-relaxed whitespace-pre-wrap">
                  {character.description || '暂无描述'}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-[var(--ink-3)] mb-1">角色信息</p>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="default">{GENDER_LABELS[character.gender] || character.gender}</Badge>
                  <Badge variant="accent">{ROLE_TYPE_LABELS[character.role_type] || character.role_type}</Badge>
                </div>
              </div>
            </div>
          </Card>

          {/* 形象提示词 */}
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-[var(--accent-soft)] flex items-center justify-center">
                <ImageIcon className="w-4 h-4 text-[var(--accent)]" />
              </div>
              <h3 className="font-semibold text-[var(--ink-1)] font-[var(--font-display)]">形象提示词</h3>
            </div>
            <Textarea
              value={visualPrompt}
              onChange={(e) => setVisualPrompt(e.target.value)}
              rows={5}
              className="text-xs font-mono"
              placeholder="描述角色的外貌、服装、气质，用于概念图与四视图生成..."
            />
            <div className="flex justify-end mt-3">
              <Button size="sm" onClick={handleSaveVisualPrompt} isLoading={savingVisual} leftIcon={<Save className="w-3.5 h-3.5" />}>
                保存形象提示词
              </Button>
            </div>
          </Card>

          {/* 音色提示词 */}
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-[var(--accent-soft)] flex items-center justify-center">
                <Mic2 className="w-4 h-4 text-[var(--accent)]" />
              </div>
              <h3 className="font-semibold text-[var(--ink-1)] font-[var(--font-display)]">音色提示词</h3>
            </div>
            <Textarea
              value={voicePrompt}
              onChange={(e) => setVoicePrompt(e.target.value)}
              rows={4}
              className="text-xs font-mono"
              placeholder="描述角色声音，如：清亮柔和的少女音，语速偏快，带一丝俏皮..."
            />
            <div className="flex justify-end mt-3">
              <Button size="sm" onClick={handleSaveVoicePrompt} isLoading={savingVoice} leftIcon={<Save className="w-3.5 h-3.5" />}>
                保存音色提示词
              </Button>
            </div>
          </Card>
        </div>

        {/* 右侧主区域（约 2/3）：概念图 + 四视图 */}
        <div className="col-span-2 space-y-6">
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-[var(--accent-soft)] flex items-center justify-center">
                <ImageIcon className="w-4 h-4 text-[var(--accent)]" />
              </div>
              <h3 className="font-semibold text-[var(--ink-1)] font-[var(--font-display)]">概念图</h3>
              <span className="text-xs text-[var(--ink-3)]">正面全身锚点图 · 使用身份锁定（不含服装），保证换装时面部一致</span>
            </div>
            <ConceptImageGenerator
              title="概念图"
              entityId={character.id}
              entityType="character"
              images={character.concept_images ?? []}
              selectedIndex={character.selected_image_index ?? 0}
              defaultPrompt={defaultImagePrompt()}
              onGenerated={handleConceptGenerated}
              onDeleted={handleConceptDeleted}
              aspectRatio="3:4"
            />
          </Card>

          <Card className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-[var(--accent-soft)] flex items-center justify-center">
                <LayoutGrid className="w-4 h-4 text-[var(--accent)]" />
              </div>
              <h3 className="font-semibold text-[var(--ink-1)] font-[var(--font-display)]">四视图</h3>
              <span className="text-xs text-[var(--ink-3)]">大头照 + 正面 + 侧面 + 背面（参考概念图生成）</span>
            </div>
            <ConceptImageGenerator
              title="四视图"
              entityId={character.id}
              entityType="character"
              images={character.four_view_images ?? []}
              defaultPrompt={defaultFourViewPrompt()}
              onGenerated={handleFourViewGenerated}
              onDeleted={handleFourViewDeleted}
              aspectRatio="16:9"
              variant="fourView"
            />
          </Card>
        </div>
      </div>

      {/* P0-1: 身份锁定 + 服装管理（全片一致性） */}
      <div className="grid grid-cols-3 gap-6 mt-6">
        {/* 身份锁定 */}
        <Card className="p-5 col-span-1">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-lg bg-[var(--accent-soft)] flex items-center justify-center">
              <Lock className="w-4 h-4 text-[var(--accent)]" />
            </div>
            <h3 className="font-semibold text-[var(--ink-1)] font-[var(--font-display)]">身份锁定</h3>
            <Badge variant="warning" className="ml-1">全片锁定</Badge>
          </div>
          <p className="text-xs text-[var(--ink-3)] mb-4">
            身份特征全片不可随意修改，保证角色跨镜头、跨集面部一致；服装可随场景更换。
          </p>
          <div className="space-y-3">
            {IDENTITY_LOCK_FIELDS.map((f) => (
              <div key={f.key}>
                <label className="block text-xs font-medium text-[var(--ink-2)] mb-1">
                  {f.label}
                  {f.key === 'prohibitions' && <span className="text-[var(--term-red)]">（禁忌）</span>}
                </label>
                <Input
                  value={identityLock[f.key]}
                  onChange={(e) => setIdentityLock((prev) => ({ ...prev, [f.key]: e.target.value }))}
                  placeholder={f.placeholder}
                />
              </div>
            ))}
          </div>
          <div className="flex justify-end mt-4">
            <Button
              size="sm"
              onClick={handleSaveIdentityLock}
              isLoading={savingIdentity}
              leftIcon={<Save className="w-3.5 h-3.5" />}
            >
              保存身份锁定
            </Button>
          </div>
        </Card>

        {/* 服装管理 */}
        <Card className="p-5 col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-[var(--accent-soft)] flex items-center justify-center">
                <Shirt className="w-4 h-4 text-[var(--accent)]" />
              </div>
              <div>
                <h3 className="font-semibold text-[var(--ink-1)] font-[var(--font-display)]">服装管理</h3>
                <p className="text-xs text-[var(--ink-3)]">多套造型，每场戏可换装，默认服装用于概念图生成</p>
              </div>
            </div>
            <Button size="sm" leftIcon={<Plus className="w-4 h-4" />} onClick={openAddWardrobe}>
              添加服装
            </Button>
          </div>

          {wardrobe.length === 0 ? (
            <EmptyState
              icon={<Shirt className="w-8 h-8" />}
              title="暂无服装"
              description="点击「添加服装」为角色创建第一套造型"
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {wardrobe.map((w, i) => {
                const sceneName = w.scene_id ? scenes.find((s) => s.id === w.scene_id)?.name || '未知场景' : '通用';
                return (
                  <div
                    key={w.id || i}
                    className={`p-3 rounded-lg border bg-[var(--panel-2)]/40 ${
                      w.is_default === 1 ? 'border-[var(--accent)]/50 ring-1 ring-[var(--accent)]/20' : 'border-[var(--border)]'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      {w.is_default === 1 && (
                        <Badge variant="accent" className="flex-shrink-0">
                          <Star className="w-3 h-3" /> 默认
                        </Badge>
                      )}
                      <span className="text-sm font-medium text-[var(--ink-1)] truncate">{w.name}</span>
                      {w.color && (
                        <span
                          className="w-3 h-3 rounded-full border border-[var(--border)] flex-shrink-0"
                          style={{ backgroundColor: w.color }}
                          title={`主色：${w.color}`}
                        />
                      )}
                    </div>
                    <p className="text-xs text-[var(--ink-3)] line-clamp-2 mb-1.5">{w.description || '暂无描述'}</p>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-[var(--ink-3)] font-mono">场景：{sceneName}{w.color ? ` · ${w.color}` : ''}</span>
                      <div className="flex items-center gap-1">
                        {w.is_default !== 1 && (
                          <button
                            type="button"
                            onClick={() => handleSetDefaultWardrobe(i)}
                            className="px-2 py-1 rounded text-[10px] text-[var(--ink-2)] hover:bg-[var(--panel-3)] transition-colors"
                            title="设为默认服装"
                          >
                            设为默认
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => openEditWardrobe(i)}
                          className="p-1 rounded text-[var(--ink-3)] hover:text-[var(--accent)] hover:bg-[var(--panel-3)] transition-colors"
                          title="编辑"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteWardrobe(i)}
                          className="p-1 rounded text-[var(--ink-3)] hover:text-[var(--term-red)] hover:bg-[var(--panel-3)] transition-colors"
                          title="删除"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      {/* 服装编辑弹窗 */}
      <Modal
        open={wardrobeModalOpen}
        onOpenChange={setWardrobeModalOpen}
        title={editingWardrobeIndex !== null ? '编辑服装' : '添加服装'}
        description="服装与身份锁定分离：换装不影响角色面部一致性"
        footer={
          <>
            <Button variant="secondary" onClick={() => setWardrobeModalOpen(false)}>取消</Button>
            <Button onClick={handleSaveWardrobeItem} leftIcon={<Save className="w-4 h-4" />}>
              保存
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[var(--ink-2)] mb-1.5">服装名称 *</label>
            <Input
              placeholder="如：日常便装"
              value={wardrobeForm.name}
              onChange={(e) => setWardrobeForm((prev) => ({ ...prev, name: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--ink-2)] mb-1.5">服装描述</label>
            <Textarea
              placeholder="描述服装款式、材质、细节..."
              rows={3}
              value={wardrobeForm.description}
              onChange={(e) => setWardrobeForm((prev) => ({ ...prev, description: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-[var(--ink-2)] mb-1.5">主色调</label>
              <Input
                placeholder="如：米白色"
                value={wardrobeForm.color}
                onChange={(e) => setWardrobeForm((prev) => ({ ...prev, color: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--ink-2)] mb-1.5">关联场景</label>
              <Select
                value={wardrobeForm.scene_id || 'generic'}
                onValueChange={(v) => setWardrobeForm((prev) => ({ ...prev, scene_id: v === 'generic' ? '' : v }))}
              >
                <Select.Item value="generic">通用（所有场景）</Select.Item>
                {scenes.map((s) => (
                  <Select.Item key={s.id} value={s.id}>{s.name}</Select.Item>
                ))}
              </Select>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
