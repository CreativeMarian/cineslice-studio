import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Film, Cpu, BookOpen, Sparkles, ArrowRight, Check } from 'lucide-react';
import { Button } from '../ui';
import { preferenceService } from '../../services/preferenceService';

const steps = [
  {
    icon: Film,
    title: '欢迎使用 CineSlice Studio',
    description: 'AI 驱动的全流程影视创作工具，从小说到成片，一站式完成。',
  },
  {
    icon: Cpu,
    title: '配置 AI 模型',
    description: '连接你偏好的 AI 服务商，支持 30 家文本、图像、视频、音频模型。',
  },
  {
    icon: BookOpen,
    title: '上传小说开始创作',
    description: '上传小说文件，AI 将自动解析章节、生成剧本、提取角色和分镜。',
  },
  {
    icon: Sparkles,
    title: '开始你的创作之旅',
    description: '一切准备就绪，创建你的第一个项目吧！',
  },
];

export function Onboarding() {
  const [step, setStep] = useState(0);
  const navigate = useNavigate();

  const handleNext = () => {
    if (step < steps.length - 1) {
      setStep(step + 1);
    } else {
      preferenceService.update({ onboarding_completed: 1 }).catch(() => {});
      navigate('/');
    }
  };

  const handleSkip = () => {
    preferenceService.update({ onboarding_completed: 1 }).catch(() => {});
    navigate('/');
  };

  const currentStep = steps[step];

  return (
    <div className="min-h-screen bg-[var(--page)] flex items-center justify-center px-4">
      <div className="w-full max-w-lg">
        {/* 进度指示器 */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {steps.map((_, index) => (
            <div
              key={index}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                index <= step ? 'w-8 bg-[var(--accent)]' : 'w-4 bg-[var(--border)]'
              }`}
            />
          ))}
        </div>

        {/* 内容卡片 */}
        <div className="bg-[var(--bg)] rounded-2xl border border-[var(--border)] p-8 text-center shadow-[var(--shadow-float)]">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] flex items-center justify-center mx-auto mb-6 shadow-[0_8px_24px_rgba(43, 116, 245, 0.25)]">
            <currentStep.icon className="w-10 h-10 text-[var(--on-accent)]" />
          </div>

          <h1 className="text-2xl font-bold text-[var(--ink-1)] mb-3 font-[var(--font-display)]">
            {currentStep.title}
          </h1>
          <p className="text-[var(--ink-2)] mb-8 leading-relaxed">
            {currentStep.description}
          </p>

          <div className="flex items-center justify-center gap-3">
            <Button variant="ghost" onClick={handleSkip}>
              跳过
            </Button>
            <Button onClick={handleNext} rightIcon={<ArrowRight className="w-4 h-4" />}>
              {step === steps.length - 1 ? '开始使用' : '下一步'}
            </Button>
          </div>
        </div>

        {/* 步骤列表 */}
        <div className="mt-6 space-y-2">
          {steps.map((s, index) => (
            <div
              key={index}
              className={`flex items-center gap-3 px-4 py-2 rounded-lg transition-all ${
                index === step
                  ? 'bg-[var(--accent-soft)] border border-[var(--accent)]/30'
                  : index < step
                    ? 'opacity-60'
                    : 'opacity-40'
              }`}
            >
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                  index < step
                    ? 'bg-[var(--color-success)] text-white'
                    : index === step
                      ? 'bg-[var(--accent)] text-[var(--on-accent)]'
                      : 'bg-[var(--panel-2)] text-[var(--ink-3)]'
                }`}
              >
                {index < step ? <Check className="w-3 h-3" /> : index + 1}
              </div>
              <span className="text-sm text-[var(--ink-2)]">{s.title}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
