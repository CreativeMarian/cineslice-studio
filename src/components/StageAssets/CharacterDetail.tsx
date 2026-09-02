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
} from 'lucide-react';
import { Modal, Button, Input, Textarea, Badge } from '../ui';
import { ConfigPanel } from '../StageScript/ConfigPanel';
import { characterService } from '../../services/assetService';
import { useUIStore } from '../../stores/useUIStore';
import { useModelStore } from '../../stores/useModelStore';
import { parseModelKey } from '../../types/model';
import { ROLE_TYPE_LABELS, GENDER_LABELS } from '../../utils';
import type { Character } from '../../types';

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
    }
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
      const res = await characterService.update(character.id, {
        name,
        description,
        visual_description: visualDescription,
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
    </>
  );
}
