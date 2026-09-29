/**
 * 光标相关原生能力
 * - 读取鼠标按键状态（覆盖层无法接收点击事件，只能轮询）
 * - 修改系统光标缩放
 */
import { nativeReady, user32Api } from './ffi';

/** 虚拟键码 */
const VK_LBUTTON = 0x01;
const VK_RBUTTON = 0x02;

/** SPI 常量 */
const SPI_SETCURSORSIZE = 0x2029;
const SPIF_UPDATEINIFILE = 0x0001;
const SPIF_SENDCHANGE = 0x0002;

export interface MouseButtons {
  buttons: number;
  /** 本帧新按下的位掩码 */
  down: number;
}

let previousButtons = 0;

/**
 * 轮询鼠标按键状态。
 * 位掩码：1 = 左键，2 = 右键。
 */
export function pollMouseButtons(): MouseButtons {
  if (!nativeReady || !user32Api) return { buttons: 0, down: 0 };
  let buttons = 0;
  try {
    if ((user32Api.GetAsyncKeyState(VK_LBUTTON) & 0x8000) !== 0) buttons |= 1;
    if ((user32Api.GetAsyncKeyState(VK_RBUTTON) & 0x8000) !== 0) buttons |= 2;
  } catch {
    return { buttons: 0, down: 0 };
  }
  // 仅保留"新按下"的位（按下瞬间触发涟漪，长按不重复触发）
  const down = buttons & ~previousButtons;
  previousButtons = buttons;
  return { buttons, down };
}

/** 重置按键状态（停用特效时调用，避免恢复后误触发） */
export function resetMouseButtons(): void {
  previousButtons = 0;
}

/**
 * 设置系统光标缩放。
 * @param scale 1 = 100%，2 ≈ 200%，3 ≈ 300%（Windows 使用 1-15 档位，此处做近似映射）
 */
export function setCursorScale(scale: number): boolean {
  if (!nativeReady || !user32Api) return false;
  const map: Record<number, number> = { 1: 1, 2: 5, 3: 9 };
  const value = map[Math.round(scale)] ?? 1;
  try {
    const res = user32Api.SystemParametersInfoW(
      SPI_SETCURSORSIZE,
      value,
      null,
      SPIF_UPDATEINIFILE | SPIF_SENDCHANGE,
    );
    return res !== 0;
  } catch {
    return false;
  }
}
