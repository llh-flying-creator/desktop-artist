/**
 * 光标追踪器
 * 覆盖层窗口是鼠标穿透的，收不到鼠标事件，因此由主进程以 ~120Hz 轮询
 * 全局光标位置与按键状态，仅在发生变化时推送给覆盖层（避免无谓 IPC）。
 */
import { screen } from 'electron';
import { overlayController } from './overlay';
import { pollMouseButtons, resetMouseButtons } from './native/cursorNative';
import { winmmApi } from './native/ffi';
import { logger } from './util/logger';

/**
 * 轮询间隔（毫秒）。
 * 采样率与刷新率接近但不相等时会产生"拍频"抖动（一顿一顿），
 * 因此这里取 8ms（125Hz），保证每帧都有新鲜坐标；
 * 单次开销只是两个只读 API 调用，成本可以忽略。
 */
const POLL_INTERVAL = 8;

class CursorTracker {
  private timer: NodeJS.Timeout | null = null;
  private lastX = Number.NaN;
  private lastY = Number.NaN;
  private lastButtons = 0;

  /**
   * 采样统计，每分钟输出一行日志。
   * 用途：排查"用一段时间后变卡"。如果系统对该进程做了定时器节流
   * （EcoQoS / 后台限速），这里的平均间隔会明显大于目标值。
   */
  private stats = { lastAt: 0, sum: 0, count: 0, frames: 0, reportedAt: 0 };

  start(): void {
    if (this.timer) return;
    this.reset();
    this.stats = { lastAt: 0, sum: 0, count: 0, frames: 0, reportedAt: 0 };

    // 申请 1ms 定时器精度，否则 setInterval(8) 会被系统夹到 ~15.6ms，
    // 采样率与刷新率不匹配会导致"拍频"式抖动（详见 ffi.ts 中的说明）
    try {
      winmmApi?.timeBeginPeriod(1);
    } catch {
      /* 忽略：失败时只是精度差一些 */
    }

    this.timer = setInterval(() => this.tick(), POLL_INTERVAL);
    logger.info('cursor', `光标追踪已启动（目标间隔 ${POLL_INTERVAL}ms）`);
  }

  stop(): void {
    // 只在确实在运行时才打日志：applyCursorNow 在特效关闭时每次都会调用本方法，
    // 无条件的日志会刷出大量"已停止"，干扰排查
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      try {
        winmmApi?.timeEndPeriod(1);
      } catch {
        /* 忽略 */
      }
      logger.info('cursor', '光标追踪已停止');
    }
    resetMouseButtons();
    this.reset();
  }

  private reset(): void {
    this.lastX = Number.NaN;
    this.lastY = Number.NaN;
    this.lastButtons = 0;
  }

  /** 记录采样间隔并每分钟输出一次统计 */
  private recordSample(): void {
    const wall = Date.now();
    if (this.stats.lastAt !== 0) {
      this.stats.sum += wall - this.stats.lastAt;
      this.stats.count += 1;
    }
    this.stats.lastAt = wall;
    if (this.stats.reportedAt === 0) this.stats.reportedAt = wall;
    if (wall - this.stats.reportedAt < 60000) return;

    const avg = this.stats.count > 0 ? this.stats.sum / this.stats.count : 0;
    logger.info(
      'cursor',
      `采样统计：平均间隔 ${avg.toFixed(1)}ms（目标 ${POLL_INTERVAL}ms）/ 本分钟推送 ${this.stats.frames} 帧`,
    );
    this.stats.sum = 0;
    this.stats.count = 0;
    this.stats.frames = 0;
    this.stats.reportedAt = wall;
  }

  private tick(): void {
    if (!overlayController.active) return;

    let point: { x: number; y: number };
    try {
      point = screen.getCursorScreenPoint();
    } catch {
      return;
    }

    const { buttons, down } = pollMouseButtons();
    this.recordSample();

    const moved = point.x !== this.lastX || point.y !== this.lastY;
    const changed = moved || buttons !== this.lastButtons || down !== 0;
    if (!changed) return;

    this.lastX = point.x;
    this.lastY = point.y;
    this.lastButtons = buttons;
    this.stats.frames += 1;

    overlayController.broadcastFrame({
      x: point.x,
      y: point.y,
      buttons,
      down,
    });
  }
}

export const cursorTracker = new CursorTracker();
