import { useEffect, useRef } from 'react';

/**
 * 鼠标手电筒：跟随鼠标的聚光光晕（全局，不影响交互）
 * 深色主题下光晕明显，浅色主题自动弱化（CSS 变量控制）
 */
export function MouseGlow() {
  const glowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = glowRef.current;
    if (!el) return;
    const isFine = window.matchMedia('(pointer: fine)').matches;
    if (!isFine) return; // 触屏设备无鼠标，不启用

    let raf = 0;
    let tx = window.innerWidth / 2;
    let ty = window.innerHeight / 3;
    let cx = tx;
    let cy = ty;
    let visible = false;

    const apply = () => {
      if (!el) return;
      el.style.opacity = visible ? '1' : '0';
      el.style.transform = `translate(${cx - 260}px, ${cy - 260}px)`;
    };

    const loop = () => {
      cx += (tx - cx) * 0.14;
      cy += (ty - cy) * 0.14;
      apply();
      raf = requestAnimationFrame(loop);
    };

    const onMove = (e: MouseEvent) => {
      tx = e.clientX;
      ty = e.clientY;
      if (!visible) {
        visible = true;
        cx = tx;
        cy = ty;
        apply();
      }
      if (!raf) raf = requestAnimationFrame(loop);
    };

    const onLeave = () => {
      visible = false;
      apply();
    };

    window.addEventListener('mousemove', onMove, { passive: true });
    document.documentElement.addEventListener('mouseleave', onLeave);
    loop();

    return () => {
      window.removeEventListener('mousemove', onMove);
      document.documentElement.removeEventListener('mouseleave', onLeave);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="pointer-events-none fixed inset-0 z-[60] overflow-hidden hidden md:block" aria-hidden="true">
      <div
        ref={glowRef}
        className="absolute left-0 top-0 w-[520px] h-[520px] rounded-full opacity-0 transition-opacity duration-300"
        style={{
          background:
            'radial-gradient(circle, rgba(56,189,248,0.20) 0%, rgba(18,196,143,0.13) 30%, rgba(56,189,248,0.05) 55%, transparent 72%)',
          filter: 'blur(6px)',
          mixBlendMode: 'screen',
        }}
      />
    </div>
  );
}
