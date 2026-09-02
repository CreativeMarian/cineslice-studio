import { useCallback } from 'react';

interface ClickParticleOptions {
  count?: number;
  color?: string;
  duration?: number;
  spread?: number;
}

/**
 * 点击粒子爆发 Hook
 * 在点击位置创建粒子爆发效果
 */
export function useClickParticles(options: ClickParticleOptions = {}) {
  const {
    count = 12,
    color = '#F97316',
    duration = 600,
    spread = 80,
  } = options;

  const createParticles = useCallback((x: number, y: number) => {
    for (let i = 0; i < count; i++) {
      const particle = document.createElement('div');
      particle.className = 'click-particle';

      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
      const distance = spread * (0.5 + Math.random() * 0.5);
      const tx = Math.cos(angle) * distance;
      const ty = Math.sin(angle) * distance;

      particle.style.left = `${x}px`;
      particle.style.top = `${y}px`;
      particle.style.setProperty('--tx', `${tx}px`);
      particle.style.setProperty('--ty', `${ty}px`);
      particle.style.background = color;
      particle.style.boxShadow = `0 0 8px ${color}`;
      particle.style.animationDuration = `${duration}ms`;

      document.body.appendChild(particle);

      setTimeout(() => {
        particle.remove();
      }, duration);
    }
  }, [count, color, duration, spread]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    createParticles(e.clientX, e.clientY);
  }, [createParticles]);

  return { handleClick, createParticles };
}

/**
 * 全局点击粒子效果 Hook
 * 为所有按钮自动添加点击粒子效果
 */
export function useGlobalClickParticles(options: ClickParticleOptions = {}) {
  const {
    count = 8,
    color = '#F97316',
    duration = 500,
    spread = 60,
  } = options;

  const init = useCallback(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // 只在按钮、可点击元素上触发
      if (
        target.closest('button') ||
        target.closest('[role="button"]') ||
        target.closest('.clickable') ||
        target.tagName === 'BUTTON' ||
        target.tagName === 'A'
      ) {
        for (let i = 0; i < count; i++) {
          const particle = document.createElement('div');
          particle.className = 'click-particle';

          const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
          const distance = spread * (0.5 + Math.random() * 0.5);
          const tx = Math.cos(angle) * distance;
          const ty = Math.sin(angle) * distance;

          particle.style.left = `${e.clientX}px`;
          particle.style.top = `${e.clientY}px`;
          particle.style.setProperty('--tx', `${tx}px`);
          particle.style.setProperty('--ty', `${ty}px`);
          particle.style.background = color;
          particle.style.boxShadow = `0 0 8px ${color}`;
          particle.style.animationDuration = `${duration}ms`;

          document.body.appendChild(particle);

          setTimeout(() => {
            particle.remove();
          }, duration);
        }
      }
    };

    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [count, color, duration, spread]);

  return { init };
}
