import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Users, Sparkles, Plus, Wand2, Film } from 'lucide-react';
import { Button, Card, EmptyState, Modal, Input, Textarea, GenerationProgress } from '../ui';
import { SectionHeader, EpisodeSelector, PromptEditor, PromptToggleButton, ScriptStaleBanner } from '../common';
import { CharacterCard } from '../StageAssets/CharacterCard';
import { useProjectStore } from '../../stores/useProjectStore';
import { useUIStore } from '../../stores/useUIStore';
import { characterService } from '../../services/assetService';
import { promptService } from '../../services/promptService';
import { usePromptEditor } from '../../hooks/usePromptEditor';
import { useDefaultModels } from '../../hooks/useDefaultModels';
import { showApiError, getResponseErrorMessage } from '../../utils/error';
import { parseModelKey } from '../../types/model';
import { generateId } from '../../utils';
import { countScriptStale } from '../../utils/scriptVersion';
import type { Character } from '../../types';

/**
 * 第 2 段 · 角色列表页
 * 核心按钮（2个）：重新提取角色（AI） · 手动添加角色
 */
export function StageCharacters() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { characters, setCharacters, currentEpisodeId, currentProject, episodes, loadCharacters } = useProjectStore();
  const { showToast } = useUIStore();
  const { getDefaultModel } = useDefaultModels();

  const [isExtracting, setIsExtracting] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState('');
  const [addDescription, setAddDescription] = useState('');

  // PromptEditor：角色提取提示词（自动填入，可查看/编辑/重置）
  const charsPe = usePromptEditor(() =>
    currentEpisodeId
      ? promptService.previewCharacterPrompt(currentEpisodeId)
      : Promise.resolve({ prompt: '', contextSummary: '' })
  );

  const currentEpisode = episodes.find((e) => e.id === currentEpisodeId);
  /** 剧本已修改 → 角色可能过期（字段缺失时容错为未过期） */
  const staleCharacterCount = countScriptStale(currentEpisode, characters);

  // 当前剧集变化时加载角色
  useEffect(() => {
    if (currentEpisodeId) {
      loadCharacters(currentEpisodeId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentEpisodeId]);

  /** 核心按钮 1：重新提取角色（AI，直接调用默认文本模型，不弹配置面板） */
  const handleExtract = async () => {
    if (!currentEpisodeId) {
      showToast('请先选择剧集', 'error');
      return;
    }
    const modelKey = getDefaultModel('text');
    if (!modelKey) {
      showToast('请先在设置中配置默认文本模型', 'error');
      return;
    }
    setIsExtracting(true);
    try {
      const { provider, modelName } = parseModelKey(modelKey);
      const res = await characterService.extract(currentEpisodeId, {
        provider,
        modelName,
        custom_prompt: charsPe.customPrompt ?? undefined,
      });
      if (res.success && res.data) {
        setCharacters(res.data);
        showToast(`成功提取 ${res.data.length} 个角色，点击卡片查看详情并生成概念图`, 'success');
      } else {
        showToast(getResponseErrorMessage(res, '提取失败，请重试'), 'error');
      }
    } catch (err: unknown) {
      showApiError(showToast, err, '提取角色失败，请检查模型配置');
    } finally {
      setIsExtracting(false);
    }
  };

  /** 核心按钮 2：手动添加角色（本地创建，简单弹窗：名称 + 描述） */
  const handleAdd = () => {
    if (!currentEpisodeId) return;
    const name = addName.trim();
    if (!name) {
      showToast('请输入角色名称', 'error');
      return;
    }
    const now = new Date().toISOString();
    const localCharacter: Character = {
      id: `local_${generateId()}`,
      user_id: currentProject?.user_id || '',
      episode_id: currentEpisodeId,
      name,
      gender: 'other',
      role_type: 'extra',
      description: addDescription.trim() || '手动添加的角色',
      visual_description: addDescription.trim() || '',
      concept_images: [],
      selected_image_index: 0,
      created_at: now,
      updated_at: now,
    };
    setCharacters([...characters, localCharacter]);
    showToast(`角色「${name}」已添加（本地暂存，建议重新提取以持久化）`, 'success');
    setAddOpen(false);
    setAddName('');
    setAddDescription('');
  };

  const handleSelect = (character: Character) => {
    if (!id) return;
    navigate(`/project/${id}/character/${character.id}`);
  };

  /** P2-17: 删除角色成功后刷新角色列表 */
  const handleDeleteCharacter = async (character: Character) => {
    if (!window.confirm(`确定删除角色「${character.name}」吗？此操作不可恢复。`)) return;
    if (character.id.startsWith('local_')) {
      setCharacters(characters.filter((c) => c.id !== character.id));
      showToast(`角色「${character.name}」已删除（本地）`, 'success');
      return;
    }
    try {
      const res = await characterService.delete(character.id);
      if (res.success) {
        showToast(`角色「${character.name}」已删除`, 'success');
        if (currentEpisodeId) loadCharacters(currentEpisodeId);
      } else {
        showToast(getResponseErrorMessage(res, '删除角色失败'), 'error');
      }
    } catch (err: unknown) {
      showApiError(showToast, err, '删除角色失败');
    }
  };

  if (!currentEpisodeId) {
    return (
      <div className="p-6 max-w-[1400px] mx-auto">
        <SectionHeader
          icon={<Users className="w-5 h-5 text-[var(--accent)]" />}
          title="角色设定"
          description="AI从剧本提取角色，生成概念图和四视图"
          actions={<EpisodeSelector />}
        />
        <Card>
          <EmptyState
            icon={<Film className="w-8 h-8" />}
            title="请先选择一集"
            description="点击上方剧集选择器，选择剧集后可提取和管理角色"
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-5">
      {/* 顶部：标题 + 操作按钮 + 集数选择器 */}
      <SectionHeader
        icon={<Users className="w-5 h-5 text-[var(--accent)]" />}
        title="角色设定"
        description="AI从剧本提取角色，生成概念图和四视图"
        actions={
          <>
            <EpisodeSelector />
            <Button
              variant="secondary"
              size="md"
              leftIcon={<Plus className="w-4 h-4" />}
              onClick={() => setAddOpen(true)}
              disabled={isExtracting}
            >
              手动添加
            </Button>
            <Button
              size="md"
              leftIcon={<Sparkles className="w-4 h-4" />}
              onClick={handleExtract}
              isLoading={isExtracting}
            >
              {isExtracting ? '提取中...' : '重新提取角色'}
            </Button>
            <PromptToggleButton active={charsPe.open} onClick={charsPe.toggle} />
          </>
        }
      />

      {/* 剧本已修改：角色可能过期警告 */}
      {staleCharacterCount > 0 && (
        <ScriptStaleBanner
          message={`剧本已修改，${staleCharacterCount} 个角色可能已过期，建议重新提取`}
          actionLabel="重新提取"
          onAction={handleExtract}
        />
      )}

      {/* 提示词编辑器：展开后自动填入完整提示词 */}
      {charsPe.open && (
        <PromptEditor
          title="角色提取提示词"
          prompt={charsPe.prompt}
          contextSummary={charsPe.contextSummary}
          isLoading={charsPe.loading}
          expanded={charsPe.open}
          onExpandedChange={charsPe.setOpen}
          onSave={charsPe.save}
          onReset={charsPe.reset}
        />
      )}

      {isExtracting && (
        <GenerationProgress
          isGenerating={isExtracting}
          stage="AI 正在分析剧本并提取角色信息..."
          compact
        />
      )}

      {/* 角色卡片网格 */}
      {characters.length === 0 && !isExtracting ? (
        <Card>
          <EmptyState
            icon={<Wand2 className="w-8 h-8" />}
            title="点击提取角色开始"
            description="AI 将从剧本中自动提取角色信息，包括名称、性别、角色类型和外貌描述，并生成概念图"
            action={
              <Button leftIcon={<Sparkles className="w-4 h-4" />} onClick={handleExtract}>
                提取角色
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {characters.map((character) => (
            <CharacterCard
              key={character.id}
              character={character}
              onSelect={handleSelect}
              onDelete={handleDeleteCharacter}
            />
          ))}
        </div>
      )}

      {/* 手动添加角色弹窗 */}
      <Modal
        open={addOpen}
        onOpenChange={setAddOpen}
        title="手动添加角色"
        description="填写角色名称与描述，将添加到当前剧集"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setAddOpen(false)}>
              取消
            </Button>
            <Button onClick={handleAdd} leftIcon={<Plus className="w-4 h-4" />}>
              添加角色
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input
            label="角色名称"
            value={addName}
            onChange={(e) => setAddName(e.target.value)}
            placeholder="如：林晚"
            autoFocus
          />
          <Textarea
            label="角色描述"
            value={addDescription}
            onChange={(e) => setAddDescription(e.target.value)}
            rows={4}
            placeholder="角色身份、性格、外貌等描述（将作为形象提示词）"
          />
          <p className="text-xs text-[var(--ink-3)]">
            提示：手动添加的角色暂存于本地，建议使用「重新提取角色」让 AI 从剧本完整提取
          </p>
        </div>
      </Modal>
    </div>
  );
}
