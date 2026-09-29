/**
 * 定时 / 手动重启进程
 *
 * 【为什么需要】
 * 本程序的窗口是全屏透明、从不获得焦点的置顶窗口，因此总是被系统当作"后台进程"。
 * 长时间运行后，受系统对后台进程的调度与节能策略、以及图形合成状态的累积影响，
 * 光点跟随会逐渐变卡；重启进程可以让手感立刻恢复到初始状态。
 *
 * 这是一个兜底措施，不解决根因，但保证手感始终在线。
 * 默认每 30 分钟重启一次（可在设置里关闭），重启瞬间特效会中断约 1 秒。
 */
import { app } from 'electron';
import { logger } from './logger';

const MINUTE = 60_000;

let timer: NodeJS.Timeout | null = null;

/** 依据配置启动 / 停止自动重启计时器 */
export function applyAutoRestart(minutes: number): void {
  const enabled = app.isPackaged && Number.isFinite(minutes) && minutes > 0;

  if (timer) {
    clearInterval(timer);
    timer = null;
  }

  if (!enabled) {
    logger.info('restart', '定时自动重启已关闭');
    return;
  }

  const interval = Math.max(1, Math.round(minutes)) * MINUTE;
  timer = setInterval(() => relaunch('达到定时重启间隔'), interval);
  logger.info('restart', `已启用定时自动重启：每 ${Math.max(1, Math.round(minutes))} 分钟`);
}

/** 立刻重启（定时器与托盘菜单共用） */
export function relaunch(reason: string): void {
  logger.info('restart', `即将重启进程：${reason}`);

  try {
    // 默认沿用当前命令行参数（例如 --hidden），保证重启后行为一致
    app.relaunch({ args: process.argv.slice(1) });
  } catch (err) {
    logger.error('restart', `relaunch 调用失败：${String(err)}`);
    return;
  }

  app.quit();
}

export function disposeAutoRestart(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
