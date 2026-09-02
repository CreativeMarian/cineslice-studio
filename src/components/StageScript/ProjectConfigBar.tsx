import { useState } from 'react';
import { Settings, Check } from 'lucide-react';
import { Button, Card, Select } from '../ui';
import { useProjectStore } from '../../stores/useProjectStore';
import { useUIStore } from '../../stores/useUIStore';
import { projectService } from '../../services/projectService';

const GENRES = [
  { value: 'urban', label: '都市' },
  { value: 'ancient', label: '古装' },
  { value: 'scifi', label: '科幻' },
  { value: 'suspense', label: '悬疑' },
  { value: 'romance', label: '言情' },
  { value: 'fantasy', label: '奇幻' },
  { value: 'comedy', label: '喜剧' },
  { value: 'action', label: '动作' },
  { value: 'horror', label: '恐怖' },
  { value: 'other', label: '其他' },
];

const DURATIONS = [
  { value: '1min', label: '1 分钟/集' },
  { value: '3min', label: '3 分钟/集' },
  { value: '5min', label: '5 分钟/集' },
  { value: '10min', label: '10 分钟/集' },
];

const LANGUAGES = [
  { value: 'zh', label: '中文' },
  { value: 'en', label: '英文' },
  { value: 'ja', label: '日文' },
];

export function ProjectConfigBar() {
  const { currentProject, setCurrentProject } = useProjectStore();
  const { showToast } = useUIStore();
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(currentProject?.title || '');
  const [genre, setGenre] = useState(currentProject?.genre || '');
  const [duration, setDuration] = useState(currentProject?.target_duration || '3min');
  const [language, setLanguage] = useState(currentProject?.language || 'zh');
  const [isSaving, setIsSaving] = useState(false);

  if (!currentProject) return null;

  const handleSave = async () => {
    if (!currentProject) return;
    setIsSaving(true);
    try {
      const res = await projectService.update(currentProject.id, {
        title: title.trim() || currentProject.title,
        genre,
        target_duration: duration,
        language,
      });
      if (res.success && res.data) {
        setCurrentProject(res.data);
        showToast('项目配置已保存', 'success');
        setIsEditing(false);
      }
    } catch {
      showToast('保存失败，请重试', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const genreLabel = GENRES.find(g => g.value === currentProject?.genre)?.label || '未设定';
  const durationLabel = DURATIONS.find(d => d.value === currentProject?.target_duration)?.label || '3 分钟/集';
  const langLabel = LANGUAGES.find(l => l.value === currentProject?.language)?.label || '中文';

  if (!isEditing) {
    return (
      <Card className="p-4 mb-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold text-[var(--ink-1)] font-[var(--font-display)]">
                {currentProject.title}
              </span>
            </div>
            <div className="flex items-center gap-4 text-sm">
              <span className="flex items-center gap-1.5 text-[var(--ink-2)]">
                <span className="text-[var(--ink-3)]">体裁</span>
                <span className="font-medium text-[var(--ink-1)]">{genreLabel}</span>
              </span>
              <span className="w-px h-4 bg-[var(--border)]" />
              <span className="flex items-center gap-1.5 text-[var(--ink-2)]">
                <span className="text-[var(--ink-3)]">时长</span>
                <span className="font-medium text-[var(--ink-1)]">{durationLabel}</span>
              </span>
              <span className="w-px h-4 bg-[var(--border)]" />
              <span className="flex items-center gap-1.5 text-[var(--ink-2)]">
                <span className="text-[var(--ink-3)]">语言</span>
                <span className="font-medium text-[var(--ink-1)]">{langLabel}</span>
              </span>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={() => {
            setTitle(currentProject.title);
            setGenre(currentProject.genre || '');
            setDuration(currentProject.target_duration || '3min');
            setLanguage(currentProject.language || 'zh');
            setIsEditing(true);
          }}>
            <Settings className="w-4 h-4 mr-1.5" />
            配置
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-4 mb-5 border-[var(--accent)]/30">
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-[var(--ink-3)] mb-1.5">项目名称</label>
          <input
            className="w-full px-3 py-2 bg-[var(--bg)] border border-[var(--border)] rounded-[var(--radius-control)] text-sm text-[var(--ink-1)] focus:outline-none focus:border-[var(--accent)]"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-[var(--ink-3)] mb-1.5">体裁</label>
            <Select value={genre} onValueChange={setGenre} placeholder="选择题材">
              {GENRES.map(g => (
                <Select.Item key={g.value} value={g.value}>{g.label}</Select.Item>
              ))}
            </Select>
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--ink-3)] mb-1.5">单集时长</label>
            <Select value={duration} onValueChange={setDuration} placeholder="选择时长">
              {DURATIONS.map(d => (
                <Select.Item key={d.value} value={d.value}>{d.label}</Select.Item>
              ))}
            </Select>
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--ink-3)] mb-1.5">语言</label>
            <Select value={language} onValueChange={setLanguage} placeholder="选择语言">
              {LANGUAGES.map(l => (
                <Select.Item key={l.value} value={l.value}>{l.label}</Select.Item>
              ))}
            </Select>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setIsEditing(false)}>取消</Button>
          <Button size="sm" onClick={handleSave} isLoading={isSaving} leftIcon={<Check className="w-4 h-4" />}>
            保存配置
          </Button>
        </div>
      </div>
    </Card>
  );
}
