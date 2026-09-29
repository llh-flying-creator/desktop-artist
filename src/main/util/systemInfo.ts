/**
 * 系统版本探测
 * 启动时探测一次并缓存（用于主界面亚克力背景与界面提示）。
 */
import os from 'node:os';

export interface WindowsInfo {
  /** 完整版本串，例如 10.0.22631 */
  release: string;
  /** 构建号，例如 22631 */
  build: number;
  /** 主版本，例如 10 / 11 */
  major: number;
  /** 展示名 */
  name: string;
  /** 是否支持 Mica / SystemBackdrop（Win11 22H2+，build >= 22621） */
  supportsMica: boolean;
}

function detect(): WindowsInfo {
  let release = '0.0.0';
  try {
    release = os.release();
  } catch {
    /* 忽略 */
  }
  const parts = release.split('.').map((n) => Number.parseInt(n, 10));
  const build = Number.isFinite(parts[2]) ? parts[2] : 0;
  const isWin11 = build >= 22000;

  return {
    release,
    build,
    major: isWin11 ? 11 : 10,
    name: isWin11 ? `Windows 11 (Build ${build})` : `Windows 10 (Build ${build})`,
    supportsMica: build >= 22621,
  };
}

export const windowsInfo: WindowsInfo = detect();

/** 人类可读的系统能力摘要（用于 UI 提示） */
export function capabilitySummary(): string[] {
  const notes: string[] = [];
  if (!windowsInfo.supportsMica) notes.push('主界面亚克力背景需要 Windows 11 22H2 及以上，将回退为纯色');
  return notes;
}
