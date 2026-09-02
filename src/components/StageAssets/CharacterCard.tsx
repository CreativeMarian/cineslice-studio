import { User, Image as ImageIcon, Sparkles } from 'lucide-react';
import { Card, Badge } from '../ui';
import { ROLE_TYPE_LABELS, GENDER_LABELS } from '../../utils';
import type { Character } from '../../types';

interface CharacterCardProps {
  character: Character;
  onSelect: (character: Character) => void;
  onImageClick?: (imageUrl: string, character: Character) => void;
}

export function CharacterCard({ character, onSelect, onImageClick }: CharacterCardProps) {
  const selectedImage = character.concept_images?.[character.selected_image_index];
  const hasImage = !!selectedImage?.url;

  const roleConfig: Record<string, string> = {
    protagonist: 'bg-[rgba(249,115,22,0.12)] text-[var(--accent)]',
    supporting: 'bg-[rgba(94,140,255,0.12)] text-[var(--color-info)]',
    antagonist: 'bg-[rgba(255,107,90,0.12)] text-[var(--color-danger)]',
    extra: 'bg-[var(--panel-2)] text-[var(--ink-3)]',
  };

  return (
    <Card hover className="overflow-hidden group" onClick={() => onSelect(character)}>
      {/* 头像区 */}
      <div className="aspect-[3/4] bg-[var(--panel-2)] relative overflow-hidden">
        {hasImage ? (
          <img
            src={selectedImage.url}
            alt={character.name}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 cursor-zoom-in"
            onClick={(e) => {
              e.stopPropagation();
              onImageClick?.(selectedImage.url, character);
            }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[var(--panel-2)] to-[var(--panel-3)]">
            <User className="w-14 h-14 text-[var(--ink-3)]" />
          </div>
        )}

        {/* 渐变遮罩 */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

        {/* 图片数量 */}
        {(character.concept_images?.length ?? 0) > 0 && (
          <div className="absolute top-2.5 right-2.5 bg-black/50 backdrop-blur-sm rounded-full px-2 py-0.5 text-xs text-white flex items-center gap-1">
            <ImageIcon className="w-3 h-3" />
            {character.concept_images?.length ?? 0}
          </div>
        )}

        {/* 角色类型标签 */}
        <div className="absolute top-2.5 left-2.5">
          <Badge className={roleConfig[character.role_type] || roleConfig.extra}>
            {ROLE_TYPE_LABELS[character.role_type] || character.role_type}
          </Badge>
        </div>

        {/* 悬浮操作 */}
        <div className="absolute bottom-3 left-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="flex gap-2">
            <button
              className="flex-1 py-2 rounded-lg bg-[var(--accent)] text-[var(--on-accent)] text-xs font-medium flex items-center justify-center gap-1 hover:brightness-110 transition-all"
              onClick={(e) => { e.stopPropagation(); onSelect(character); }}
            >
              <Sparkles className="w-3 h-3" /> 查看详情
            </button>
          </div>
        </div>
      </div>

      {/* 信息区 */}
      <div className="p-3.5">
        <h4 className="font-semibold text-[var(--ink-1)] truncate mb-1 font-[var(--font-display)]">
          {character.name}
        </h4>
        <div className="flex items-center gap-2 text-xs text-[var(--ink-3)]">
          <span>{GENDER_LABELS[character.gender] || character.gender}</span>
          <span className="w-1 h-1 rounded-full bg-[var(--ink-3)]" />
          <span className="truncate">{character.description.slice(0, 15)}...</span>
        </div>
      </div>
    </Card>
  );
}
