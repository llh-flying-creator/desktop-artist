/**
 * IPC 路由注册
 * 渲染进程只能通过这些受限通道访问系统能力（contextIsolation + preload 白名单）。
 */
import { app, BrowserWindow, dialog, ipcMain, screen, shell } from 'electron';
import { readFileSync, writeFileSync } from 'node:fs';
import { IPC } from '../shared/ipc';
import type { AppConfig, DeepPartial } from '../shared/types';
import { configStore } from './store';
import { beautify } from './services/beautify';
import { capturePrimaryScreen } from './services/picker';
import { createMainWindow, getMainWindow } from './windows';
import { markQuitting, refreshTray } from './tray';
import { applyAutoStart, refreshAutoStartStatus } from './util/autostart';
import { logger } from './util/logger';

/**
 * 关闭主窗口（按配置驻留托盘）。
 *
 * 这里直接 destroy() 而不是 hide()：隐藏的 BrowserWindow 仍会常驻一个渲染进程
 * （约 60–90MB）。托盘再次点开时按需重建，换来的是后台几乎零窗口内存开销。
 */
function closeMainWindow(): void {
  const win = getMainWindow();
  if (win) win.destroy();
}

export function registerIpcHandlers(): void {
  /* ---------------- 应用级 ---------------- */

  ipcMain.handle(IPC.APP_STATUS, () => beautify.getStatus());

  ipcMain.handle(IPC.APP_PAUSE, (_e, paused: boolean) => {
    beautify.setManualPaused(Boolean(paused));
    refreshTray();
    return beautify.getStatus();
  });

  ipcMain.handle(IPC.APP_QUIT, () => {
    markQuitting();
    app.quit();
  });

  ipcMain.handle(IPC.APP_MINIMIZE_TRAY, () => {
    closeMainWindow();
  });

  ipcMain.handle(IPC.APP_OPEN_USER_DATA, async () => {
    await shell.openPath(app.getPath('userData'));
  });

  ipcMain.handle(IPC.APP_OPEN_LOG, async () => {
    await shell.openPath(logger.logFilePath);
  });

  /* 开机自启：读取系统上的真实状态 / 手动设置 */
  ipcMain.handle(IPC.APP_AUTOSTART_STATUS, () => refreshAutoStartStatus());

  ipcMain.handle(IPC.APP_AUTOSTART_SET, async (_e, enabled: boolean) => {
    const status = await applyAutoStart(Boolean(enabled));
    // 把真实结果回写到配置，避免界面显示与系统状态不一致
    if (status.available && status.enabled !== configStore.get().system.startWithWindows) {
      configStore.patch({ system: { startWithWindows: status.enabled } });
    }
    return status;
  });

  /* ---------------- 配置 ---------------- */

  ipcMain.handle(IPC.CONFIG_GET, () => configStore.get());

  ipcMain.handle(IPC.CONFIG_PATCH, (_e, patch: DeepPartial<AppConfig>) => {
    const next = configStore.patch(patch ?? {});
    // 立即应用（内部有防抖），保证拖动滑块时预览流畅
    beautify.refreshFromConfig(next);
    return next;
  });

  ipcMain.handle(IPC.CONFIG_RESET, async () => {
    const next = configStore.reset();
    await beautify.resetToSystemDefault();
    return next;
  });

  ipcMain.handle(IPC.CONFIG_EXPORT, async () => {
    const win = getMainWindow();
    const result = await dialog.showSaveDialog(win ?? undefined!, {
      title: '导出配置',
      defaultPath: 'desktop-ui-beautify.config.json',
      filters: [{ name: '配置文件', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePath) return { ok: false, message: '已取消' };
    try {
      writeFileSync(result.filePath, JSON.stringify(configStore.get(), null, 2), 'utf8');
      return { ok: true, message: `已导出到 ${result.filePath}` };
    } catch (err) {
      return { ok: false, message: `导出失败：${String(err)}` };
    }
  });

  ipcMain.handle(IPC.CONFIG_IMPORT, async () => {
    const win = getMainWindow();
    const result = await dialog.showOpenDialog(win ?? undefined!, {
      title: '导入配置',
      properties: ['openFile'],
      filters: [{ name: '配置文件', extensions: ['json'] }],
    });
    if (result.canceled || result.filePaths.length === 0) return { ok: false, message: '已取消' };
    try {
      const raw = JSON.parse(readFileSync(result.filePaths[0], 'utf8')) as unknown;
      const next = configStore.replace(raw);
      beautify.applyAll();
      return { ok: true, message: '配置已导入并生效', config: next };
    } catch (err) {
      return { ok: false, message: `导入失败：${String(err)}` };
    }
  });

  /* ---------------- 光标 ---------------- */

  ipcMain.handle(IPC.CURSOR_OVERLAY_SYNC, (_e, config: AppConfig['cursorFx']) => {
    const next = configStore.patch({ cursorFx: config });
    beautify.refreshFromConfig(next);
    return beautify.getStatus();
  });

  /* ---------------- 吸色器 ---------------- */

  ipcMain.handle(IPC.PICKER_CAPTURE, async () => capturePrimaryScreen());

  /* ---------------- 主窗口控制 ---------------- */

  ipcMain.handle(IPC.WIN_MINIMIZE, () => {
    getMainWindow()?.minimize();
  });

  ipcMain.handle(IPC.WIN_MAXIMIZE, () => {
    const win = getMainWindow() ?? createMainWindow();
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
    return win.isMaximized();
  });

  ipcMain.handle(IPC.WIN_CLOSE, () => {
    if (configStore.get().system.minimizeToTray) {
      closeMainWindow();
    } else {
      markQuitting();
      app.quit();
    }
  });

  ipcMain.handle(IPC.WIN_IS_MAXIMIZED, () => getMainWindow()?.isMaximized() ?? false);

  /* ---------------- 覆盖层专用（渲染进程 -> 主进程拉取） ---------------- */

  ipcMain.on(IPC.OVERLAY_REQUEST_BOUNDS, (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed()) return;
    try {
      const display = screen.getDisplayMatching(win.getBounds());
      event.reply(IPC.OVERLAY_BOUNDS, display.bounds);
    } catch {
      /* 忽略 */
    }
  });

  ipcMain.on(IPC.OVERLAY_REQUEST_CONFIG, (event) => {
    event.reply(IPC.CURSOR_CONFIG, configStore.get().cursorFx);
  });

  logger.info('ipc', 'IPC 路由已注册');
}
