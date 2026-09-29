/**
 * 窗口管理：主界面窗口
 * 采用「无边框 + 透明」以承载 Glassmorphism 外观，
 * 窗口自身的亚克力效果由 beautify 服务统一注入（自我美化，顺便验证注入链路）。
 */
import { BrowserWindow, shell } from 'electron';
import { IPC } from '../shared/ipc';
import { isDev, pageUrl, preloadPath, rendererIndex } from './paths';
import { logger } from './util/logger';
import { windowsInfo } from './util/systemInfo';

let mainWindow: BrowserWindow | null = null;
let selfAcrylic = false;

export function getMainWindow(): BrowserWindow | null {
  return mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
}

/** 主界面自身是否启用了亚克力（决定前端玻璃层的不透明度） */
export function isSelfAcrylicActive(): boolean {
  return selfAcrylic;
}

/**
 * 让主界面自身也享受一次"美化"：Windows 11 下调用 DWM 系统背景材质。
 * 这是自我验证：如果该接口可用，说明系统合成链路正常。
 */
function applySelfAcrylic(win: BrowserWindow): void {
  type MaterialWindow = BrowserWindow & {
    setBackgroundMaterial?: (m: 'auto' | 'none' | 'mica' | 'acrylic' | 'tabbed') => void;
  };
  const target = win as MaterialWindow;
  if (typeof target.setBackgroundMaterial !== 'function') return;
  if (!windowsInfo.supportsMica) return;
  try {
    target.setBackgroundMaterial('acrylic');
    selfAcrylic = true;
    logger.info('window', '主界面已启用系统亚克力背景');
  } catch (err) {
    selfAcrylic = false;
    logger.warn('window', `启用亚克力背景失败，改用纯色回退：${String(err)}`);
  }
}

/**
 * 创建（或唤出）主窗口。
 *
 * @param options.hidden 仅用于「开机自启」那一次创建：启动后不显示主界面、只驻留托盘。
 *   注意必须由调用方显式传入，不能去读 process.argv —— 否则以 --hidden 启动后，
 *   用户在托盘里点「显示主界面」新建的窗口也会命中该判断而永远不显示。
 */
export function createMainWindow(options: { hidden?: boolean } = {}): BrowserWindow {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
    return mainWindow;
  }

  const { hidden = false } = options;

  const win = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 960,
    minHeight: 640,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    title: '桌面UI美化',
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
    },
  });

  win.once('ready-to-show', () => {
    applySelfAcrylic(win);
    if (hidden) {
      logger.info('window', '以隐藏方式启动：不显示主界面，仅驻留托盘');
    } else {
      win.show();
    }
    if (isDev) win.webContents.openDevTools({ mode: 'detach' });
  });

  // 广播最大化状态，供标题栏按钮切换图标
  const emitMaximized = () => win.webContents.send(IPC.WIN_MAXIMIZED_CHANGED, win.isMaximized());
  win.on('maximize', emitMaximized);
  win.on('unmaximize', emitMaximized);

  win.on('closed', () => {
    mainWindow = null;
  });

  // 外链一律用系统浏览器打开，避免在应用内导航
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  const page = pageUrl(rendererIndex, 'index.html');
  if (page.url) {
    void win.loadURL(page.url);
  } else if (page.file) {
    void win.loadFile(page.file);
  }

  logger.info('window', '主窗口已创建');
  mainWindow = win;
  return win;
}
