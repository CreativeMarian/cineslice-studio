import { Tabs } from '../ui';
import { NovelManager } from './NovelManager';
import { EpisodeManager } from './EpisodeManager';
import { ScriptEditor } from './ScriptEditor';
import { SceneBreakdown } from './SceneBreakdown';
import { BookOpen, Film, FileText, Clapperboard, ChevronRight, Check, Circle } from 'lucide-react';
import { useProjectStore } from '../../stores/useProjectStore';

const steps = [
  { value: 'novel', label: '小说管理', icon: BookOpen, desc: '上传与解析' },
  { value: 'episodes', label: '剧集管理', icon: Film, desc: '生成剧集' },
  { value: 'script', label: '剧本编辑', icon: FileText, desc: '编辑与润色' },
  { value: 'shots', label: '分镜表', icon: Clapperboard, desc: '镜头与关键帧' },
] as const;

type StepValue = typeof steps[number]['value'];

export function StageScript() {
  const { pipelineStep, updatePipelineStep, chapters, episodes, shots } = useProjectStore();

  // 计算每个步骤的完成状态
  const getStepStatus = (step: StepValue): 'completed' | 'current' | 'pending' => {
    const currentIndex = steps.findIndex(s => s.value === pipelineStep);
    const stepIndex = steps.findIndex(s => s.value === step);
    if (stepIndex < currentIndex) return 'completed';
    if (stepIndex === currentIndex) return 'current';
    return 'pending';
  };

  // 额外的完成判断：有数据就算完成
  const isStepCompleted = (step: StepValue): boolean => {
    switch (step) {
      case 'novel': return chapters.length > 0;
      case 'episodes': return episodes.length > 0;
      case 'script': return episodes.some(e => e.status === 'generated' || e.status === 'edited');
      case 'shots': return shots.length > 0;
      default: return false;
    }
  };

  const handleTabChange = (value: string) => {
    updatePipelineStep(value as StepValue);
  };

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      {/* 步骤指示器 */}
      <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-2">
        {steps.map((step, index) => {
          const status = getStepStatus(step.value);
          const completed = isStepCompleted(step.value);
          return (
            <div key={step.value} className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={() => handleTabChange(step.value)}
                className={`flex items-center gap-2.5 px-4 py-2.5 rounded-[var(--radius-control)] border transition-all ${
                  status === 'current'
                    ? 'bg-[var(--accent-soft)] border-[var(--accent)] shadow-[var(--shadow-glow)]'
                    : completed
                    ? 'bg-[var(--bg)] border-[var(--border)] hover:border-[var(--accent)]/50'
                    : 'bg-[var(--bg)] border-[var(--border)] opacity-60 hover:opacity-100'
                }`}
              >
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                  status === 'current'
                    ? 'bg-[var(--accent)] text-white'
                    : completed
                    ? 'bg-green-500/20 text-green-500'
                    : 'bg-[var(--panel-2)] text-[var(--ink-3)]'
                }`}>
                  {completed ? (
                    <Check className="w-4 h-4" />
                  ) : status === 'current' ? (
                    <step.icon className="w-4 h-4" />
                  ) : (
                    <Circle className="w-4 h-4" />
                  )}
                </div>
                <div className="text-left">
                  <p className={`text-xs font-semibold leading-tight ${
                    status === 'current' ? 'text-[var(--accent)]' : 'text-[var(--ink-1)]'
                  }`}>{step.label}</p>
                  <p className="text-[10px] text-[var(--ink-3)] leading-tight">{step.desc}</p>
                </div>
                <span className="text-[10px] font-mono text-[var(--ink-3)] ml-1">0{index + 1}</span>
              </button>
              {index < steps.length - 1 && (
                <ChevronRight className="w-4 h-4 text-[var(--ink-3)] flex-shrink-0" />
              )}
            </div>
          );
        })}
      </div>

      <Tabs value={pipelineStep} defaultValue="novel" onValueChange={handleTabChange}>
        <Tabs.List>
          {steps.map((step) => (
            <Tabs.Trigger key={step.value} value={step.value}>
              <step.icon className="w-4 h-4 mr-2" />
              {step.label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        <Tabs.Content value="novel">
          <NovelManager />
        </Tabs.Content>
        <Tabs.Content value="episodes">
          <EpisodeManager />
        </Tabs.Content>
        <Tabs.Content value="script">
          <ScriptEditor />
        </Tabs.Content>
        <Tabs.Content value="shots">
          <SceneBreakdown />
        </Tabs.Content>
      </Tabs>
    </div>
  );
}
