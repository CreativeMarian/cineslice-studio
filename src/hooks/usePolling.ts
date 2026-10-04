import { useEffect, useRef } from 'react';

/**
 * 通用轮询 Hook（带断网退避）。
 * 统一 ShotCard / StageDirectorPage 中重复的轮询实现：
 * 连续失败 ≥ backoffAfterFailures 次 → 降频到 backoffMs；
 * 连续失败 ≥ pauseAfterFailures 次 → 暂停并回调 onPaused（UI 显示"连接中断"）。
 *
 * @param options.enabled   是否启动轮询；false 时停止并重置失败计数（组件卸载同理）
 * @param options.pollFn    单次轮询函数（应自行 catch 网络错误并抛错，或直接抛出）
 * @param options.onPaused  暂停回调（如设置"连接中断"UI 状态）
 * @param options.retryTick 重试令牌：变化时重置失败计数并立即重启（用于"点击重试"）
 * @param options.intervalMs 正常轮询间隔，默认 5000ms
 * @param options.backoffMs  降频后的轮询间隔，默认 30000ms
 * @param options.backoffAfterFailures 连续失败降频阈值，默认 3
 * @param options.pauseAfterFailures  连续失败暂停阈值，默认 6
 */
export function usePolling({
  enabled,
  pollFn,
  onPaused,
  retryTick,
  intervalMs = 5000,
  backoffMs = 30000,
  backoffAfterFailures = 3,
  pauseAfterFailures = 6,
}: {
  enabled: boolean;
  pollFn: () => Promise<void>;
  onPaused?: () => void;
  retryTick?: number;
  intervalMs?: number;
  backoffMs?: number;
  backoffAfterFailures?: number;
  pauseAfterFailures?: number;
}): void {
  // 最新 pollFn/onPaused 放入 ref：回调闭包更新时同步，但不重启轮询计时器。
  // 放在 effect 中同步（不能在 render 期间写 ref.current）
  const pollFnRef = useRef(pollFn);
  const onPausedRef = useRef(onPaused);

  useEffect(() => {
    pollFnRef.current = pollFn;
    onPausedRef.current = onPaused;
  });

  const failuresRef = useRef(0);

  useEffect(() => {
    if (!enabled) {
      failuresRef.current = 0;
      return;
    }
    // 新一轮轮询（enabled 变化 / 重试令牌变化）开始时重置失败计数
    failuresRef.current = 0;
    let cancelled = false;
    let timer: number | undefined;
    const stop = () => {
      if (timer) window.clearTimeout(timer);
    };
    const poll = async () => {
      try {
        await pollFnRef.current();
        // 请求成功：重置失败计数
        failuresRef.current = 0;
      } catch {
        // 网络/业务失败：计数退避；达到暂停阈值则停止，交由 UI 提示重试
        if (cancelled) return;
        failuresRef.current += 1;
        if (failuresRef.current >= pauseAfterFailures) {
          onPausedRef.current?.();
          stop();
          return;
        }
      }
      if (cancelled) return;
      timer = window.setTimeout(poll, failuresRef.current >= backoffAfterFailures ? backoffMs : intervalMs);
    };
    poll();
    return () => {
      cancelled = true;
      stop();
    };
    // retryTick 变化时重置失败计数并重启轮询；enabled 变化时启动/停止
  }, [enabled, retryTick, intervalMs, backoffMs, backoffAfterFailures, pauseAfterFailures]);
}
