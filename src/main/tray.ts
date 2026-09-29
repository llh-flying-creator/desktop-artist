/**
 * 系统托盘
 * 右键菜单：显示主界面 / 暂停(恢复)美化 / 重新应用 / 退出
 */
import { app, Menu, Tray, nativeImage } from 'electron';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { createMainWindow, getMainWindow } from './windows';
import { beautify } from './services/beautify';
import { configStore } from './store';
import { logger } from './util/logger';
import { relaunch } from './util/restart';

let tray: Tray | null = null;
let quitting = false;

/** 标记为"正在退出"，避免窗口关闭时被最小化到托盘 */
export function isQuitting(): boolean {
  return quitting;
}

export function markQuitting(): void {
  quitting = true;
}

function resolveIcon(): Electron.NativeImage {
  const candidates = [
    join(process.resourcesPath ?? '', 'icon.ico'),
    join(__dirname, '../../build/icon.ico'),
    join(__dirname, '../../resources/icon.ico'),
  ];
  for (const path of candidates) {
    try {
      if (path && existsSync(path)) {
        const image = nativeImage.createFromPath(path);
        if (!image.isEmpty()) return image;
      }
    } catch {
      /* 继续尝试下一个 */
    }
  }
  // 兜底：生成一个 16x16 的纯色图标，保证托盘项始终可见
  return nativeImage.createFromBuffer(createFallbackIcon(), { width: 16, height: 16 });
}

/** 生成兜底图标（BGRA，紫色圆角方块） */
function createFallbackIcon(): Buffer {
  const size = 16;
  const buf = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = (y * size + x) * 4;
      const inside = x > 1 && x < 14 && y > 1 && y < 14;
      buf[i] = inside ? 0xff : 0x00; // B
      buf[i + 1] = inside ? 0x8c : 0x00; // G
      buf[i + 2] = inside ? 0x7c : 0x00; // R
      buf[i + 3] = inside ? 0xff : 0x00; // A
    }
  }
  return buf;
}

function buildMenu(): Menu {
  return Menu.buildFromTemplate([
    {
      label: '显示主界面',
      click: () => {
        const existing = getMainWindow();
        if (existing) {
          if (existing.isMinimized()) existing.restore();
          existing.show();
          existing.focus();
          return;
        }
        // 首次创建交给 ready-to-show 显示，避免加载完成前出现白屏闪烁
        createMainWindow();
      },
    },
    { type: 'separator' },
    {
      label: beautify.paused ? '恢复美化' : '暂停美化',
      click: () => {
        beautify.togglePaused();
        refreshTray();
      },
    },
    {
      label: '重新应用当前设置',
      click: () => {
        beautify.applyAll();
        refreshTray();
      },
    },
    {
      label: '立即重启（恢复跟手手感）',
      click: () => relaunch('托盘手动触发'),
    },
    {
      label: '恢复系统默认光标与特效',
      click: () => {
        void beautify.resetToSystemDefault();
        configStore.patch({ cursorFx: { enabled: false } });
        refreshTray();
      },
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        markQuitting();
        app.quit();
      },
    },
  ]);
}

export function createTray(): void {
  if (tray) return;
  try {
    tray = new Tray(resolveIcon());
    tray.setToolTip('桌面UI美化');
    tray.setContextMenu(buildMenu());
    tray.on('double-click', () => {
      const existing = getMainWindow();
      if (existing) {
        existing.show();
        existing.focus();
        return;
      }
      createMainWindow();
    });
    logger.info('tray', '系统托盘已创建');
  } catch (err) {
    logger.error('tray', `创建托盘失败：${String(err)}`);
    tray = null;
  }
}

/** 刷新菜单文案（暂停/恢复状态） */
export function refreshTray(): void {
  if (!tray || tray.isDestroyed()) return;
  tray.setContextMenu(buildMenu());
}

export function destroyTray(): void {
  if (tray && !tray.isDestroyed()) tray.destroy();
  tray = null;
}
