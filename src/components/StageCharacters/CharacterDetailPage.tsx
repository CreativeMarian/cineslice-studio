import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, User, Save, Mic2, ImageIcon, LayoutGrid } from 'lucide-react';
import { Button, Card, Badge, Textarea, EmptyState } from '../ui';
import { ConceptImageGenerator } from '../common';
import { useProjectStore } from '../../stores/useProjectStore';
import { useUIStore } from '../../stores/useUIStore';
import { characterService } from '../../services/assetService';
import { ROLE_TYPE_LABELS, GENDER_LABELS } from '../../utils';
import type { Character } from '../../types';

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
    }
    // 仅在角色切换时同步，避免覆盖用户正在编辑的内容
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [character?.id]);

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
        showToast((res as any)?.error?.message || '保存失败', 'error');
      }
    } catch (err: any) {
      showToast(err?.response?.data?.message || '保存失败', 'error');
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
        showToast((res as any)?.error?.message || '保存失败', 'error');
      }
    } catch (err: any) {
      showToast(err?.response?.data?.message || '保存失败', 'error');
    } finally {
      setSavingVoice(false);
    }
  };

  /** 核心区域 3：概念图生成回调 */
  const handleConceptGenerated = (images: Array<{ url: string }>) => {
    if (!character) return;
    patchCharacter({ concept_images: images, selected_image_index: 0 });
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
    } catch (err: any) {
      showToast(err?.response?.data?.message || '删除图片失败', 'error');
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
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 404 || status === 501) {
        showToast('四视图删除功能开发中', 'info');
      } else {
        showToast(err?.response?.data?.message || '删除四视图失败', 'error');
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
              <span className="text-xs text-[var(--ink-3)]">正面全身锚点图，用于角色一致性</span>
            </div>
            <ConceptImageGenerator
              title="概念图"
              entityId={character.id}
              entityType="character"
              images={character.concept_images ?? []}
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
    </div>
  );
}
