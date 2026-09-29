/**
 * 光标特效覆盖层
 *
 * 实现思路：
 * 为每个显示器创建一个"全屏透明 + 鼠标穿透 + 置顶"的窗口，
 * 渲染进程用 Canvas 以 60fps 绘制拖尾与涟漪。
 * 由于窗口鼠标穿透，无法接收鼠标事件，位置由主进程轮询后推送。
 */
import { BrowserWindow, screen, type Display } from 'electron';
import { IPC } from '../shared/ipc';
import type { CursorFrame, CursorFxConfig } from '../shared/types';
import { preloadPath, pageUrl, rendererOverlay } from './paths';
import { logger } from './util/logger';

interface OverlayEntry {
  win: BrowserWindow;
  displayId: number;
}

class OverlayController {
  private entries: OverlayEntry[] = [];
  private config: CursorFxConfig | null = null;
  private visible = false;
  private destroyed = false;
  /** 置顶重新断言的计数节流 */
  private topmostTick = 0;

  /** 是否成功创建过覆盖层（用于向 UI 反馈能力） */
  get available(): boolean {
    return this.entries.length > 0 || this.destroyed === false;
  }

  get active(): boolean {
    return this.visible && this.entries.some((e) => e.win && !e.win.isDestroyed() && e.win.isVisible());
  }

  /** 应用配置：决定是否需要显示覆盖层、以及下发绘制参数 */
  sync(config: CursorFxConfig, paused: boolean): void {
    if (this.destroyed) return;
    this.config = config;
    const shouldShow = config.enabled && !paused;

    if (shouldShow) {
      this.ensureWindows();
      this.show();
    } else {
      this.hide();
    }
    this.broadcastConfig();
  }

  /** 下发配置给覆盖层渲染进程 */
  private broadcastConfig(): void {
    if (!this.config) return;
    for (const entry of this.entries) {
      if (entry.win.isDestroyed()) continue;
      entry.win.webContents.send(IPC.CURSOR_CONFIG, this.config);
    }
  }

  private createWindow(display: Display): BrowserWindow {
    const { x, y, width, height } = display.bounds;
    const win = new BrowserWindow({
      x,
      y,
      width,
      height,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      closable: false,
      fullscreenable: false,
      skipTaskbar: true,
      focusable: false,
      hasShadow: false,
      show: false,
      enableLargerThanScreen: true,
      acceptFirstMouse: true,
      webPreferences: {
        preload: preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        // 覆盖层需要持续动画，必须关闭后台节流
        backgroundThrottling: false,
      },
    });

    // 鼠标穿透：所有点击都落到下层的真实窗口上
    win.setIgnoreMouseEvents(true, { forward: true });
    win.setAlwaysOnTop(true, 'screen-saver');
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

    const page = pageUrl(rendererOverlay, 'overlay.html');
    if (page.url) {
      void win.loadURL(page.url);
    } else if (page.file) {
      void win.loadFile(page.file);
    }

    // 页面加载完成后推送显示器边界，渲染进程据此把全局坐标换算为窗口内坐标
    win.webContents.on('did-finish-load', () => {
      if (win.isDestroyed()) return;
      win.webContents.send(IPC.OVERLAY_BOUNDS, display.bounds);
      if (this.config) win.webContents.send(IPC.CURSOR_CONFIG, this.config);
    });

    return win;
  }

  /** 确保每个显示器都有一个覆盖层窗口；显示器变化时自动重建 */
  private ensureWindows(): void {
    const displays = screen.getAllDisplays();
    const existing = new Map(this.entries.map((e) => [e.displayId, e]));

    // 移除已拔掉的显示器
    for (const entry of [...this.entries]) {
      if (!displays.some((d) => d.id === entry.displayId)) {
        this.disposeEntry(entry);
        this.entries = this.entries.filter((e) => e !== entry);
      }
    }

    for (const display of displays) {
      const hit = existing.get(display.id);
      if (hit && !hit.win.isDestroyed()) {
        // 只有几何真的变化时才重设：本方法每秒都会被调用一次，
        // 无条件 setBounds 会让透明置顶窗口反复重排，造成闪烁与绘制抖动
        const cur = hit.win.getBounds();
        const next = display.bounds;
        if (cur.x !== next.x || cur.y !== next.y || cur.width !== next.width || cur.height !== next.height) {
          hit.win.setBounds(next);
          hit.win.webContents.send(IPC.OVERLAY_BOUNDS, next);
        }
        continue;
      }
      try {
        this.entries.push({ win: this.createWindow(display), displayId: display.id });
      } catch (err) {
        logger.error('overlay', `创建光标覆盖层失败：${String(err)}`);
      }
    }
  }

  private disposeEntry(entry: OverlayEntry): void {
    try {
      if (!entry.win.isDestroyed()) entry.win.destroy();
    } catch {
      /* 忽略 */
    }
  }

  private show(): void {
    if (this.visible) return;
    for (const entry of this.entries) {
      if (entry.win.isDestroyed()) continue;
      try {
        entry.win.showInactive();
      } catch {
        /* 忽略 */
      }
    }
    this.visible = true;
    logger.info('overlay', `光标特效覆盖层已启用（${this.entries.length} 个显示器）`);
  }

  private hide(): void {
    if (!this.visible) return;
    for (const entry of this.entries) {
      if (entry.win.isDestroyed()) continue;
      try {
        entry.win.hide();
      } catch {
        /* 忽略 */
      }
    }
    this.visible = false;
  }

  /** 广播光标帧 */
  broadcastFrame(frame: CursorFrame): void {
    if (!this.active) return;
    for (const entry of this.entries) {
      if (entry.win.isDestroyed()) continue;
      entry.win.webContents.send(IPC.CURSOR_FRAME, frame);
    }
  }

  /** 重新断言置顶：Windows 上的置顶窗口可能被全屏应用退出、UAC 等操作挤下去 */
  private reassertTopmost(): void {
    for (const entry of this.entries) {
      if (entry.win.isDestroyed()) continue;
      try {
        entry.win.setAlwaysOnTop(true, 'screen-saver');
      } catch {
        /* 忽略 */
      }
    }
  }

  /** 显示器配置变化时重建；顺带周期性重新断言置顶 */
  handleDisplaysChanged(): void {
    if (this.destroyed) return;
    if (this.visible) this.ensureWindows();
    // 本方法由主进程每秒调用一次，这里每 5 次（约 5 秒）重新断言一次置顶，
    // 避免特效因为窗口被挤到下层而"时有时无"
    this.topmostTick = (this.topmostTick + 1) % 5;
    if (this.topmostTick === 0) this.reassertTopmost();
  }

  destroy(): void {
    this.destroyed = true;
    for (const entry of this.entries) this.disposeEntry(entry);
    this.entries = [];
    this.visible = false;
  }
}

export const overlayController = new OverlayController();
