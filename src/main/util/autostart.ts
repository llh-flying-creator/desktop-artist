/**
 * 开机自启动
 *
 * 【为什么现在用注册表登录项，而不是计划任务】
 * 早先的实现使用「计划任务 + /RL HIGHEST」，原因是程序带 requireAdministrator
 * 清单，而 Windows 不会为注册表 Run 项中的这类程序自动提权（会静默跳过）。
 *
 * 现在程序只做光标覆盖层，**不再需要管理员权限**，这个限制也就不存在了，
 * 因此直接使用 Electron 内置的登录项（写入 HKCU\...\Run）即可：
 * 更简单、任何权限下都能设置成功，也不会再留下需要管理员才能清理的计划任务。
 *
 * 启动参数 --hidden 让程序静默驻留托盘，不弹出主界面
 * （主进程此时也不会创建主窗口，进一步降低后台内存占用）。
 */
import { app } from 'electron';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { AutoStartStatus } from '../../shared/types';
import { logger } from './logger';

const run = promisify(execFile);

/** 旧版本遗留的计划任务名（尽力清理） */
const LEGACY_TASK_NAME = 'DesktopUIBeautify';

/** 静默启动参数 */
const HIDDEN_ARG = '--hidden';

let cached: AutoStartStatus = {
  available: false,
  enabled: false,
  target: '',
  error: null,
};

/** 最近一次下发的期望值：避免反复写入注册表 */
let lastRequested: boolean | null = null;

export function getAutoStartStatus(): AutoStartStatus {
  return cached;
}

/** 读取系统上的真实状态 */
export async function refreshAutoStartStatus(): Promise<AutoStartStatus> {
  const available = app.isPackaged;
  let enabled = false;
  let error: string | null = null;

  if (available) {
    try {
      enabled = app.getLoginItemSettings().openAtLogin;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
  } else {
    error = '开发模式下不支持开机自启，请使用打包后的程序';
  }

  cached = { available, enabled, target: available ? process.execPath : '', error };
  return cached;
}

/** 清理旧版本写入的计划任务（需要管理员权限时会失败，忽略即可） */
async function removeLegacyTask(): Promise<void> {
  try {
    await run('schtasks.exe', ['/Query', '/TN', LEGACY_TASK_NAME], { windowsHide: true, timeout: 10000 });
  } catch {
    return; // 任务不存在，无需清理
  }
  try {
    await run('schtasks.exe', ['/Delete', '/TN', LEGACY_TASK_NAME, '/F'], { windowsHide: true, timeout: 15000 });
    logger.info('autostart', '已清理旧版本遗留的计划任务自启项');
  } catch (err) {
    logger.warn('autostart', `旧版计划任务清理失败（可忽略）：${String(err)}`);
  }
}

/** 实际执行设置 */
export async function setAutoStart(enabled: boolean): Promise<AutoStartStatus> {
  if (!app.isPackaged) {
    cached = {
      available: false,
      enabled: false,
      target: '',
      error: '开发模式下不支持开机自启，请使用打包后的程序',
    };
    return cached;
  }

  try {
    app.setLoginItemSettings({
      openAtLogin: enabled,
      path: process.execPath,
      args: [HIDDEN_ARG],
    });
    if (enabled) await removeLegacyTask();
    cached = { available: true, enabled, target: process.execPath, error: null };
    logger.info('autostart', enabled ? '已启用开机自启（注册表登录项）' : '已关闭开机自启');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    let actual = false;
    try {
      actual = app.getLoginItemSettings().openAtLogin;
    } catch {
      /* 忽略 */
    }
    cached = {
      available: true,
      enabled: actual,
      target: process.execPath,
      error: enabled ? `设置自启失败：${message}` : message,
    };
    logger.error('autostart', `设置开机自启失败：${message}`);
  }

  return cached;
}

/** 应用期望状态；若未达成目标则允许下次重试 */
export async function applyAutoStart(desired: boolean): Promise<AutoStartStatus> {
  lastRequested = desired;
  const status = await setAutoStart(desired);
  if (desired !== status.enabled) {
    lastRequested = null;
  }
  return status;
}

/** 依据配置变化触发（带去重，供 configStore.onChange 调用） */
export function requestAutoStart(desired: boolean): void {
  if (lastRequested === desired) return;
  void applyAutoStart(desired).then((status) => {
    if (status.error) logger.warn('autostart', status.error);
  });
}
