/**
 * 主进程入口
 * 生命周期：单实例锁 -> 初始化存储 -> 创建窗口/托盘 -> 注册 IPC -> 启动美化服务
 */
import { app, dialog, nativeTheme, screen } from 'electron';
import { IPC } from '../shared/ipc';
import { configStore } from './store';
import { createMainWindow, getMainWindow } from './windows';
import { createTray, destroyTray, isQuitting, markQuitting, refreshTray } from './tray';
import { registerIpcHandlers } from './ipc';
import { beautify } from './services/beautify';
import { logger } from './util/logger';
import { disablePowerThrottling, nativeError, nativeReady } from './native/ffi';
import { windowsInfo } from './util/systemInfo';
import { refreshAutoStartStatus, requestAutoStart } from './util/autostart';
import { applyAutoRestart, disposeAutoRestart } from './util/restart';

// Windows 任务栏分组与通知需要 AppUserModelId
app.setAppUserModelId('com.desktopui.beautify');

/* ------------------------------------------------------------------ */
/* 降低内存占用：必须在 app ready 之前设置                              */
/* ------------------------------------------------------------------ */
// 限制 V8 老生代堆上限，避免长时间驻留后堆无节制增长
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=192');
// 关闭本项目用不到的 Chromium 特性，减少各渲染进程的内存与线程开销
app.commandLine.appendSwitch(
  'disable-features',
  [
    'MediaRouter',
    'GlobalMediaControls',
    'OptimizationHints',
    'Translate',
    'AcceptCHFrame',
    'BackForwardCache',
    'AutofillServerCommunication',
    'InterestFeedContentSuggestions',
    // 关键：关闭 Chromium 的原生窗口遮挡计算。
    // 光标覆盖层是全屏置顶窗口，一旦被判定为"被遮挡"，Chromium 会挂起
    // requestAnimationFrame，画布就停在最后一帧（表现为特效卡在原地不动）。
    'CalculateNativeWinOcclusion',
  ].join(','),
);

/*
 * 关闭系统对后台进程的节能节流（EcoQoS）。
 * 本程序的窗口全屏透明且从不获得焦点，很容易被判定为后台进程而被限速，
 * 定时器间隔会被拉长、调度优先级下降 —— 表现为"用一会儿变卡，别的程序一抢 CPU 更卡"。
 */
if (disablePowerThrottling()) {
  logger.info('main', '已关闭后台进程节能节流（EcoQoS）');
} else {
  logger.warn('main', '关闭后台节能节流失败（不影响功能，但可能更容易被系统限速）');
}

/* ------------------------------------------------------------------ */
/* 单实例：多实例并发注入系统 UI 会互相覆盖                            */
/* ------------------------------------------------------------------ */
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const existing = getMainWindow();
    if (!existing) {
      createMainWindow();
      return;
    }
    if (existing.isMinimized()) existing.restore();
    existing.show();
    existing.focus();
  });

  /* ------------------------------------------------------------------ */
  /* 全局异常兜底：避免美化失败导致程序直接崩溃                          */
  /* ------------------------------------------------------------------ */
  process.on('uncaughtException', (err) => {
    logger.error('main', `未捕获异常：${err?.stack ?? String(err)}`);
  });
  process.on('unhandledRejection', (reason) => {
    logger.error('main', `未处理的 Promise 拒绝：${String(reason)}`);
  });

  void app.whenReady().then(async () => {
    logger.info('main', `启动中… ${windowsInfo.name} / Node ${process.versions.node} / Electron ${process.versions.electron}`);
    if (!nativeReady) logger.warn('main', nativeError ?? '原生模块不可用');

    applyNativeTheme();
    registerIpcHandlers();
    // 开机自启（--hidden）时不创建主窗口：只驻留托盘，
    // 省掉一个常驻渲染进程（约 60–90MB），点托盘时再按需重建。
    if (process.argv.includes('--hidden')) {
      logger.info('main', '以 --hidden 启动：不创建主窗口，仅驻留托盘');
    } else {
      createMainWindow({ hidden: false });
    }
    createTray();

    // 配置变更 -> 广播到渲染进程 + 同步托盘菜单 + 同步系统设置
    configStore.onChange((config) => {
      const win = getMainWindow();
      if (win && !win.isDestroyed()) win.webContents.send(IPC.CONFIG_CHANGED, config);
      refreshTray();
      applyNativeTheme();
      // 开机自启写入注册表登录项，这里与配置对齐
      requestAutoStart(config.system.startWithWindows);
      // 定时重启
      applyAutoRestart(config.system.autoRestartMinutes);
    });

    // 状态变更 -> 广播到渲染进程（顶部状态栏实时刷新）
    beautify.onStatus((status) => {
      const win = getMainWindow();
      if (win && !win.isDestroyed()) win.webContents.send(IPC.APP_STATUS_CHANGED, status);
    });

    // 显示器热插拔：重建光标覆盖层
    screen.on('display-added', () => beautify.onDisplaysChanged());
    screen.on('display-removed', () => beautify.onDisplaysChanged());
    screen.on('display-metrics-changed', () => beautify.onDisplaysChanged());

    // 系统深浅色变化：重新应用（标题栏颜色等需要跟随）
    nativeTheme.on('updated', () => {
      beautify.emitStatus();
      beautify.refreshFromConfig(configStore.get());
    });

    beautify.start();

    // 读取系统上真实的自启状态，并与配置对齐（例如任务被手动删除后自动重建）
    await refreshAutoStartStatus();
    requestAutoStart(configStore.get().system.startWithWindows);
    applyAutoRestart(configStore.get().system.autoRestartMinutes);

    // 权限/系统能力不足时给出友好提示（不阻塞使用）
    if (!nativeReady) {
      await dialog.showMessageBox({
        type: 'warning',
        title: '部分功能不可用',
        message: '未能加载原生系统模块',
        detail: `${nativeError ?? ''}\n\n界面与主题管理仍可正常使用，但任务栏透明化、窗口特效等功能将不可用。`,
        buttons: ['我知道了'],
      });
    }
  });

  /* 主窗口关闭时的行为由托盘配置决定 */
  app.on('window-all-closed', () => {
    if (process.platform !== 'win32') {
      app.quit();
      return;
    }
    if (!configStore.get().system.minimizeToTray) {
      markQuitting();
      app.quit();
    }
  });

  app.on('before-quit', () => {
    markQuitting();
    logger.info('main', '正在退出，恢复系统默认外观');
    try {
      beautify.restoreAll();
    } catch (err) {
      logger.error('main', `退出时恢复失败：${String(err)}`);
    }
    beautify.dispose();
    destroyTray();
    disposeAutoRestart();
  });

  app.on('activate', () => {
    if (!isQuitting()) createMainWindow();
  });
}

/** 把配置中的深浅色模式同步给 Electron */
function applyNativeTheme(): void {
  try {
    nativeTheme.themeSource = configStore.get().appearance.mode;
  } catch (err) {
    logger.warn('main', `设置主题模式失败：${String(err)}`);
  }
}

export { applyNativeTheme };
