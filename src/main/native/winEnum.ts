/**
 * 窗口查询工具
 *
 * 只保留「全屏检测」所需的最小能力：
 * 读取前台窗口、读取窗口矩形、判断是否铺满所在显示器。
 * （窗口枚举 / 任务栏查找等已随相关功能一并移除）
 */
import {
  decodeRect,
  decodeUint32,
  isNullHandle,
  nativeReady,
  rectBuffer,
  uint32Buffer,
  user32Api,
  type Hwnd,
  type Rect,
} from './ffi';

const EMPTY: Rect = { left: 0, top: 0, right: 0, bottom: 0 };

function getWindowRect(hwnd: Hwnd): Rect {
  if (!user32Api || isNullHandle(hwnd)) return { ...EMPTY };
  const buf = rectBuffer('winRect');
  if (!buf) return { ...EMPTY };
  try {
    if (!user32Api.GetWindowRect(hwnd, buf)) return { ...EMPTY };
    return decodeRect(buf);
  } catch {
    return { ...EMPTY };
  }
}

/** 读取窗口矩形（供全屏检测与显示器匹配使用） */
export function getWindowBounds(hwnd: Hwnd): Rect {
  if (!nativeReady || isNullHandle(hwnd)) return { ...EMPTY };
  return getWindowRect(hwnd);
}

/** 取当前前台窗口 */
export function getForegroundWindow(): Hwnd {
  if (!nativeReady || !user32Api) return null;
  try {
    return user32Api.GetForegroundWindow();
  } catch {
    return null;
  }
}

/** 读取窗口所属进程 PID（用于排除本程序自身的窗口） */
export function getWindowPid(hwnd: Hwnd): number {
  if (!nativeReady || !user32Api || isNullHandle(hwnd)) return 0;
  const buf = uint32Buffer('pid');
  if (!buf) return 0;
  try {
    user32Api.GetWindowThreadProcessId(hwnd, buf);
    return decodeUint32(buf);
  } catch {
    return 0;
  }
}

/** 判断窗口是否为"全屏"（用于自动暂停特效） */
export function isLikelyFullscreen(hwnd: Hwnd, screenBounds: Rect): boolean {
  if (!nativeReady || isNullHandle(hwnd)) return false;
  const rect = getWindowRect(hwnd);
  const w = rect.right - rect.left;
  const h = rect.bottom - rect.top;
  const sw = screenBounds.right - screenBounds.left;
  const sh = screenBounds.bottom - screenBounds.top;
  if (sw <= 0 || sh <= 0) return false;
  const coversWidth = w >= sw * 0.96;
  const coversHeight = h >= sh * 0.96;
  const aligned = Math.abs(rect.left - screenBounds.left) < 4 && Math.abs(rect.top - screenBounds.top) < 4;
  return coversWidth && coversHeight && aligned;
}
