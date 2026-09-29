/**
 * 特效编排服务（核心）
 *
 * 职责：把"配置"翻译成系统操作，并维护其生命周期：
 *   配置变更 -> 防抖 -> 应用到光标覆盖层 -> 广播状态
 *
 * 本程序只保留「光标特效」：不修改任何系统窗口、不写注册表、不重启资源管理器，
 * 因此也不需要管理员权限。所有原生调用都是"尽力而为"：失败时记录原因并通过
 * 状态栏提示用户，绝不抛出异常影响主进程稳定性。
 */
import { screen } from 'electron';
import type { AppConfig, NativeFeatureState, SystemStatus } from '../../shared/types';
import { configStore } from '../store';
import { cursorTracker } from '../cursorTracker';
import { overlayController } from '../overlay';
import { isNullHandle, nativeError, nativeReady, selfTest } from '../native/ffi';
import * as cursorNative from '../native/cursorNative';
import { getForegroundWindow, getWindowBounds, getWindowPid, isLikelyFullscreen } from '../native/winEnum';
import { isSelfAcrylicActive } from '../windows';
import { debounce } from '../util/debounce';
import { logger } from '../util/logger';
import { capabilitySummary, windowsInfo } from '../util/systemInfo';

/** 前台窗口 / 全屏检测轮询间隔 */
const WATCH_INTERVAL = 1000;
/**
 * 抖动抑制：全屏状态需要连续多少次采样一致才真正切换。
 * 窗口切换、弹窗、UAC 对话框都会造成瞬时"全屏/非全屏"跳变，
 * 直接跟随会让特效反复开关（表现为"时有时无"）。
 * 进入全屏判定更严格（避免误判把特效关掉），退出更宽松（尽快恢复特效）。
 */
const FULLSCREEN_ENTER_TICKS = 3;
const FULLSCREEN_EXIT_TICKS = 2;

type StatusListener = (status: SystemStatus) => void;

class BeautifyService {
  private features: NativeFeatureState[] = selfTest();
  private manualPaused = false;
  private autoPaused = false;
  private message: string | null = null;

  private lastCursorScale = 1;

  /** 全屏判定去抖：记录当前候选状态与连续命中次数 */
  private fullscreenStreak: { value: boolean; count: number } = { value: false, count: 0 };

  private listeners = new Set<StatusListener>();
  private watchTimer: NodeJS.Timeout | null = null;

  /** 滑块拖动会高频触发，统一在主进程侧防抖 */
  private readonly applyCursorDebounced = debounce(() => {
    this.applyCursorNow(configStore.get());
    this.emitStatus();
  }, 60);

  /* ------------------------------------------------------------------ */
  /* 生命周期                                                            */
  /* ------------------------------------------------------------------ */

  start(): void {
    // 每秒检测前台窗口变化与全屏状态
    this.watchTimer = setInterval(() => this.watchTick(), WATCH_INTERVAL);
    this.watchTick();

    const config = configStore.get();
    if (config.system.autoApplyOnStart) {
      logger.info('beautify', '启动时自动应用上次配置');
      this.applyAll();
    } else {
      this.emitStatus();
    }

    const notes = capabilitySummary();
    if (notes.length) logger.warn('beautify', `系统能力提示：${notes.join('；')}`);
  }

  dispose(): void {
    if (this.watchTimer) clearInterval(this.watchTimer);
    this.watchTimer = null;
    this.applyCursorDebounced.cancel();
    cursorTracker.stop();
    overlayController.destroy();
  }

  /* ------------------------------------------------------------------ */
  /* 状态                                                                */
  /* ------------------------------------------------------------------ */

  get paused(): boolean {
    return this.manualPaused || this.autoPaused;
  }

  getStatus(): SystemStatus {
    return {
      nativeReady,
      nativeError,
      windowsBuild: windowsInfo.build,
      windowsName: windowsInfo.name,
      features: this.features,
      paused: this.paused,
      cursorOverlayActive: overlayController.active,
      overlayAvailable: nativeReady && windowsInfo.build > 0,
      selfAcrylic: isSelfAcrylicActive(),
      message: this.message,
    };
  }

  onStatus(listener: StatusListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emitStatus(): void {
    const status = this.getStatus();
    for (const listener of this.listeners) {
      try {
        listener(status);
      } catch (err) {
        logger.error('beautify', `状态广播失败：${String(err)}`);
      }
    }
  }

  private setMessage(message: string | null): void {
    this.message = message;
  }

  /* ------------------------------------------------------------------ */
  /* 对外操作                                                            */
  /* ------------------------------------------------------------------ */

  /** 应用全部配置 */
  applyAll(): void {
    if (this.paused) {
      this.emitStatus();
      return;
    }
    this.applyCursorNow(configStore.get());
    this.emitStatus();
  }

  /** 配置变更后调用（内部已做防抖） */
  refreshFromConfig(_config: AppConfig): void {
    if (this.paused) {
      this.emitStatus();
      return;
    }
    this.applyCursorDebounced();
  }

  setManualPaused(paused: boolean): void {
    this.manualPaused = paused;
    if (paused) {
      this.setMessage('特效已暂停');
      this.restoreAll();
    } else {
      this.setMessage(null);
      this.applyAll();
    }
    this.emitStatus();
  }

  togglePaused(): boolean {
    this.setManualPaused(!this.manualPaused);
    return this.manualPaused;
  }

  /** 停止特效并恢复光标缩放 */
  restoreAll(): void {
    const config = configStore.get();
    overlayController.sync(config.cursorFx, true);
    cursorTracker.stop();
    this.applyCursorDebounced.cancel();
    this.setMessage(this.manualPaused ? '特效已暂停' : null);
    this.emitStatus();
  }

  /** 恢复默认（包含光标缩放） */
  async resetToSystemDefault(): Promise<void> {
    this.restoreAll();
    cursorNative.setCursorScale(1);
    this.lastCursorScale = 1;
    logger.info('beautify', '已恢复系统默认光标与特效');
  }

  /* ------------------------------------------------------------------ */
  /* 光标特效                                                            */
  /* ------------------------------------------------------------------ */

  private applyCursorNow(config: AppConfig): void {
    const cx = config.cursorFx;

    if (cx.enabled && !this.paused) {
      overlayController.sync(cx, false);
      cursorTracker.start();
    } else {
      overlayController.sync(cx, true);
      cursorTracker.stop();
    }

    if (cx.scale !== this.lastCursorScale) {
      if (cursorNative.setCursorScale(cx.scale)) {
        this.lastCursorScale = cx.scale;
      } else {
        this.setMessage('调整系统光标大小失败');
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* 定时任务                                                            */
  /* ------------------------------------------------------------------ */

  /** 每秒执行：全屏自动暂停（带抖动抑制，且忽略本程序自身的窗口） */
  private watchTick(): void {
    if (!nativeReady) return;

    const foreground = getForegroundWindow();
    if (!isNullHandle(foreground)) {
      const config = configStore.get();
      if (config.system.autoPauseFullscreen && !this.manualPaused) {
        let fullscreen = false;
        let fgPid = 0;
        try {
          fgPid = getWindowPid(foreground);
          // 本程序自己的窗口不参与判定，否则打开/关闭界面时会被误判成全屏
          if (fgPid !== 0 && fgPid !== process.pid) {
            const rect = getWindowBounds(foreground);
            const target = screen.getDisplayMatching({
              x: rect.left,
              y: rect.top,
              width: Math.max(1, rect.right - rect.left),
              height: Math.max(1, rect.bottom - rect.top),
            });
            const b = target.bounds;
            fullscreen = isLikelyFullscreen(foreground, {
              left: b.x,
              top: b.y,
              right: b.x + b.width,
              bottom: b.y + b.height,
            });
          }
        } catch {
          fullscreen = false;
        }

        // 抖动抑制：连续 N 次采样一致才认为状态真的变了
        if (fullscreen === this.fullscreenStreak.value) {
          this.fullscreenStreak.count += 1;
        } else {
          this.fullscreenStreak = { value: fullscreen, count: 1 };
        }
        const need = fullscreen ? FULLSCREEN_ENTER_TICKS : FULLSCREEN_EXIT_TICKS;

        if (this.fullscreenStreak.count >= need && fullscreen !== this.autoPaused) {
          this.autoPaused = fullscreen;
          logger.info(
            'beautify',
            fullscreen ? `检测到全屏应用（PID ${fgPid}），自动暂停特效` : '退出全屏，恢复特效',
          );
          if (fullscreen) {
            this.restoreAll();
            this.setMessage('检测到全屏应用，已自动暂停特效');
          } else {
            this.setMessage(null);
            this.applyAll();
          }
        }
      }
    }

    // 覆盖层因显示器变化需要重建
    overlayController.handleDisplaysChanged();
  }

  /** 供外部（显示器变化事件）调用 */
  onDisplaysChanged(): void {
    overlayController.handleDisplaysChanged();
    if (!this.paused) this.refreshFromConfig(configStore.get());
  }
}

export const beautify = new BeautifyService();
