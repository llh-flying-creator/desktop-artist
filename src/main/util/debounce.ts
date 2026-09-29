/**
 * 防抖：滑块拖动等高频操作会快速产生大量请求，
 * 在主进程侧合并可以显著降低原生调用与 IPC 压力。
 */
export function debounce<A extends unknown[]>(fn: (...args: A) => void, wait: number) {
  let timer: NodeJS.Timeout | null = null;
  const wrapped = (...args: A): void => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, wait);
  };
  wrapped.flush = (...args: A): void => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    fn(...args);
  };
  wrapped.cancel = (): void => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  return wrapped;
}

/** 节流：保证固定间隔内最多执行一次（用于定时刷新窗口特效） */
export function throttle<A extends unknown[]>(fn: (...args: A) => void, wait: number) {
  let last = 0;
  let timer: NodeJS.Timeout | null = null;
  return (...args: A): void => {
    const now = Date.now();
    const remain = wait - (now - last);
    if (remain <= 0) {
      last = now;
      fn(...args);
    } else if (!timer) {
      timer = setTimeout(() => {
        timer = null;
        last = Date.now();
        fn(...args);
      }, remain);
    }
  };
}
