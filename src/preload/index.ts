/**
 * 预加载脚本
 * 在 contextIsolation 开启的前提下，把受控的 IPC 能力以白名单形式暴露给渲染进程。
 * 渲染进程无法直接访问 Node / Electron 内部对象。
 */
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { IPC } from '../shared/ipc';
import type {
  AppConfig,
  AutoStartStatus,
  CursorFrame,
  CursorFxConfig,
  DeepPartial,
  OverlayBounds,
  ScreenShot,
  SystemStatus,
} from '../shared/types';

/** 订阅主进程推送，返回取消订阅函数 */
function subscribe<T>(channel: string, callback: (payload: T) => void): () => void {
  const listener = (_event: IpcRendererEvent, payload: T) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

const api = {
  /* ---------------- 应用 ---------------- */
  app: {
    getStatus: (): Promise<SystemStatus> => ipcRenderer.invoke(IPC.APP_STATUS),
    setPaused: (paused: boolean): Promise<SystemStatus> => ipcRenderer.invoke(IPC.APP_PAUSE, paused),
    quit: (): Promise<void> => ipcRenderer.invoke(IPC.APP_QUIT),
    minimizeToTray: (): Promise<void> => ipcRenderer.invoke(IPC.APP_MINIMIZE_TRAY),
    openUserData: (): Promise<void> => ipcRenderer.invoke(IPC.APP_OPEN_USER_DATA),
    openLog: (): Promise<void> => ipcRenderer.invoke(IPC.APP_OPEN_LOG),
    getAutoStartStatus: (): Promise<AutoStartStatus> => ipcRenderer.invoke(IPC.APP_AUTOSTART_STATUS),
    setAutoStart: (enabled: boolean): Promise<AutoStartStatus> =>
      ipcRenderer.invoke(IPC.APP_AUTOSTART_SET, enabled),
    onStatus: (cb: (status: SystemStatus) => void): (() => void) => subscribe(IPC.APP_STATUS_CHANGED, cb),
  },

  /* ---------------- 配置 ---------------- */
  config: {
    get: (): Promise<AppConfig> => ipcRenderer.invoke(IPC.CONFIG_GET),
    patch: (patch: DeepPartial<AppConfig>): Promise<AppConfig> => ipcRenderer.invoke(IPC.CONFIG_PATCH, patch),
    reset: (): Promise<AppConfig> => ipcRenderer.invoke(IPC.CONFIG_RESET),
    exportFile: (): Promise<{ ok: boolean; message: string }> => ipcRenderer.invoke(IPC.CONFIG_EXPORT),
    importFile: (): Promise<{ ok: boolean; message: string; config?: AppConfig }> =>
      ipcRenderer.invoke(IPC.CONFIG_IMPORT),
    onChange: (cb: (config: AppConfig) => void): (() => void) => subscribe(IPC.CONFIG_CHANGED, cb),
  },

  /* ---------------- 功能模块 ---------------- */
  cursor: {
    sync: (config: CursorFxConfig): Promise<SystemStatus> => ipcRenderer.invoke(IPC.CURSOR_OVERLAY_SYNC, config),
  },
  picker: {
    capture: (): Promise<ScreenShot | null> => ipcRenderer.invoke(IPC.PICKER_CAPTURE),
  },

  /* ---------------- 窗口控制 ---------------- */
  win: {
    minimize: (): Promise<void> => ipcRenderer.invoke(IPC.WIN_MINIMIZE),
    maximize: (): Promise<boolean> => ipcRenderer.invoke(IPC.WIN_MAXIMIZE),
    close: (): Promise<void> => ipcRenderer.invoke(IPC.WIN_CLOSE),
    isMaximized: (): Promise<boolean> => ipcRenderer.invoke(IPC.WIN_IS_MAXIMIZED),
    onMaximizedChanged: (cb: (maximized: boolean) => void): (() => void) =>
      subscribe(IPC.WIN_MAXIMIZED_CHANGED, cb),
  },

  /* ---------------- 光标覆盖层专用 ---------------- */
  overlay: {
    onFrame: (cb: (frame: CursorFrame) => void): (() => void) => subscribe(IPC.CURSOR_FRAME, cb),
    onConfig: (cb: (config: CursorFxConfig) => void): (() => void) => subscribe(IPC.CURSOR_CONFIG, cb),
    onBounds: (cb: (bounds: OverlayBounds) => void): (() => void) => subscribe(IPC.OVERLAY_BOUNDS, cb),
    requestBounds: (): void => ipcRenderer.send(IPC.OVERLAY_REQUEST_BOUNDS),
    requestConfig: (): void => ipcRenderer.send(IPC.OVERLAY_REQUEST_CONFIG),
  },
};

export type PreloadApi = typeof api;

contextBridge.exposeInMainWorld('api', api);
