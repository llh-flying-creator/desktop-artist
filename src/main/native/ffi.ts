/**
 * Win32 原生绑定层（基于 koffi FFI）
 *
 * 本程序只保留「光标特效」一项系统能力，因此这里只绑定真正需要的函数：
 *   - GetAsyncKeyState      轮询鼠标左右键（覆盖层鼠标穿透，收不到点击事件）
 *   - SystemParametersInfoW 调整系统光标缩放
 *   - GetForegroundWindow / GetWindowRect / GetWindowThreadProcessId
 *                           全屏检测（全屏应用时自动暂停特效）
 *
 * 设计原则：
 * 1. 所有绑定集中在此文件，便于后续替换（例如换成 Rust 模块）；
 * 2. 任何一步失败都不抛出到顶层，而是通过 nativeReady / nativeError 上报，
 *    由 UI 友好提示并自动降级为"仅配置，不注入系统"；
 * 3. 不再使用任何未公开接口，也就不再需要管理员权限。
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

/** koffi 运行时最小接口描述（避免强依赖其类型声明文件） */
interface KoffiLib {
  func(signature: string): (...args: any[]) => any;
}

interface Koffi {
  load(path: string): KoffiLib;
  struct(name: string, fields: Record<string, string>): any;
  alloc(type: any, count?: number): any;
  encode(ptr: any, type: any, value: any): void;
  decode(ptr: any, type: any, len?: number): any;
  sizeof(type: any): number;
}

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}
export type Hwnd = any;

let koffi: Koffi | null = null;
let loadError: string | null = null;

try {
  // 动态 require：koffi 是原生模块，缺失时不能让整个主进程崩溃
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require('koffi') as Koffi;
  if (typeof mod?.load !== 'function') throw new Error('koffi 导出异常');
  koffi = mod;
} catch (err) {
  loadError = err instanceof Error ? err.message : String(err);
}

export const nativeReady = koffi !== null;
export const nativeError: string | null = nativeReady
  ? null
  : `未能加载原生模块 koffi（${loadError ?? '未知原因'}），光标涟漪与光标缩放功能不可用。请执行 npm install 后重试。`;

/* ------------------------------------------------------------------ */
/* 函数绑定                                                            */
/* ------------------------------------------------------------------ */

function bind<T extends object>(lib: KoffiLib | null, signatures: Record<string, string>): T | null {
  if (!lib) return null;
  const out: Record<string, (...args: any[]) => any> = {};
  try {
    for (const [name, sig] of Object.entries(signatures)) {
      out[name] = lib.func(sig);
    }
    return out as unknown as T;
  } catch {
    return null;
  }
}

let user32: KoffiLib | null = null;
let winmm: KoffiLib | null = null;
if (koffi) {
  try {
    user32 = koffi.load('user32.dll');
  } catch {
    user32 = null;
  }
  try {
    winmm = koffi.load('winmm.dll');
  } catch {
    winmm = null;
  }
}

/**
 * Windows 多媒体定时器接口。
 *
 * 为什么需要：Windows 默认时钟中断粒度约 15.6ms，Node 的 setInterval(8) 实际会被
 * 夹到 ~15ms（实测 14.1ms）。采样率与 60Hz 刷新率不匹配会产生"拍频"抖动，
 * 而且一旦系统不再为该进程提供高精度定时器，间隔还会进一步漂移 ——
 * 表现为"刚启动很流畅，用一会儿就变卡"。显式申请 1ms 精度即可稳定在 8ms。
 *
 * 注意：Win10 2004 起 timeBeginPeriod 只影响调用进程，不再全局拖慢系统。
 */
export interface WinmmApi {
  timeBeginPeriod: (period: number) => number;
  timeEndPeriod: (period: number) => number;
}

export const winmmApi: WinmmApi | null = bind<WinmmApi>(winmm, {
  timeBeginPeriod: 'uint32_t timeBeginPeriod(uint32_t uPeriod)',
  timeEndPeriod: 'uint32_t timeEndPeriod(uint32_t uPeriod)',
});

export interface User32Api {
  GetForegroundWindow: () => Hwnd;
  GetWindowRect: (hwnd: Hwnd, rect: any) => number;
  IsWindow: (hwnd: Hwnd) => number;
  GetWindowThreadProcessId: (hwnd: Hwnd, pid: any) => number;
  GetAsyncKeyState: (vkey: number) => number;
  SystemParametersInfoW: (action: number, param: number, pv: any, winIni: number) => number;
}

export const user32Api: User32Api | null = bind<User32Api>(user32, {
  GetForegroundWindow: 'void *GetForegroundWindow()',
  GetWindowRect: 'int GetWindowRect(void *hWnd, void *lpRect)',
  IsWindow: 'int IsWindow(void *hWnd)',
  GetWindowThreadProcessId: 'uint32_t GetWindowThreadProcessId(void *hWnd, void *lpdwProcessId)',
  GetAsyncKeyState: 'int16_t GetAsyncKeyState(int vKey)',
  SystemParametersInfoW:
    'int SystemParametersInfoW(uint32_t uiAction, uint32_t uiParam, void *pvParam, uint32_t fWinIni)',
});

/* ------------------------------------------------------------------ */
/* 结构体与内存工具                                                    */
/* ------------------------------------------------------------------ */

const RECT = (() => {
  if (!koffi) return null;
  try {
    return koffi.struct('DUI_RECT', {
      left: 'int32_t',
      top: 'int32_t',
      right: 'int32_t',
      bottom: 'int32_t',
    });
  } catch {
    return null;
  }
})();

/** 一次性小内存分配缓存：单线程主进程中复用是安全的 */
const cache = new Map<string, any>();

function buffer(name: string, type: any, count = 1): any {
  if (!koffi) return null;
  const hit = cache.get(name);
  if (hit) return hit;
  try {
    const buf = koffi.alloc(type, count);
    cache.set(name, buf);
    return buf;
  } catch {
    return null;
  }
}

/** 分配 RECT 缓冲区 */
export function rectBuffer(slot = 'rect'): any {
  if (!RECT) return null;
  return buffer(slot, RECT);
}

/** 读取 RECT 缓冲区 */
export function decodeRect(buf: any): Rect {
  if (!koffi || !buf || !RECT) return { left: 0, top: 0, right: 0, bottom: 0 };
  try {
    const r = koffi.decode(buf, RECT) as Rect;
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  } catch {
    return { left: 0, top: 0, right: 0, bottom: 0 };
  }
}

/** 分配一个 32 位无符号整数缓冲区（用于接收出参，如进程 PID） */
export function uint32Buffer(slot: string): any {
  return buffer(slot, 'uint32_t');
}

/** 读取 32 位无符号整数缓冲区 */
export function decodeUint32(buf: any): number {
  if (!koffi || !buf) return 0;
  try {
    return koffi.decode(buf, 'uint32_t') as number;
  } catch {
    return 0;
  }
}

/** 判断句柄是否为"空" */
export function isNullHandle(hwnd: Hwnd): boolean {
  if (hwnd === null || hwnd === undefined) return true;
  if (typeof hwnd === 'number') return hwnd === 0;
  if (typeof hwnd === 'bigint') return hwnd === 0n;
  return false;
}

/* ------------------------------------------------------------------ */
/* 进程调度                                                            */
/* ------------------------------------------------------------------ */

/**
 * 关闭 Windows 对"后台进程"的 CPU 节能节流（EcoQoS）。
 *
 * 为什么需要：本程序的窗口全屏透明且从不获得焦点，系统很容易把整个进程判定为
 * 后台进程，从而施加 PROCESS_POWER_THROTTLING_EXECUTION_SPEED 限速。被限速后
 * 定时器间隔会被拉长、调度优先级下降 —— 表现为"刚启动很流畅，用一会儿变卡，
 * 别的程序一抢 CPU 就更卡"。显式声明不使用该节流即可避免。
 *
 * 做法：ControlMask 置位、StateMask 清零 = 强制关闭这一项节流。
 */
export function disablePowerThrottling(): boolean {
  if (!koffi) return false;

  try {
    const kernel32 = koffi.load('kernel32.dll');
    const GetCurrentProcess = kernel32.func('void *GetCurrentProcess()');
    const SetProcessInformation = kernel32.func(
      'int SetProcessInformation(void *hProcess, int ProcessInformationClass, void *ProcessInformation, uint32_t ProcessInformationSize)',
    );

    const STATE = koffi.struct('DUI_POWER_THROTTLING_STATE', {
      Version: 'uint32_t',
      ControlMask: 'uint32_t',
      StateMask: 'uint32_t',
    });

    const buf = koffi.alloc(STATE, 1);
    koffi.encode(buf, STATE, {
      Version: 1, // PROCESS_POWER_THROTTLING_CURRENT_VERSION
      ControlMask: 1, // PROCESS_POWER_THROTTLING_EXECUTION_SPEED
      StateMask: 0, // 关闭
    });

    // ProcessPowerThrottling = 4
    return SetProcessInformation(GetCurrentProcess(), 4, buf, koffi.sizeof(STATE)) !== 0;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* 能力自检                                                            */
/* ------------------------------------------------------------------ */

export interface Feature {
  key: string;
  label: string;
  ok: boolean;
  detail?: string;
}

export function selfTest(): Feature[] {
  const features: Feature[] = [];
  const add = (key: string, label: string, ok: boolean, detail?: string) =>
    features.push({ key, label, ok, ...(detail ? { detail } : {}) });

  add('ffi', '原生 FFI 模块 (koffi)', nativeReady, nativeError ?? '已加载');
  add('user32', 'user32.dll 绑定', user32Api !== null);
  add('types', 'Win32 结构体定义', RECT !== null);
  add('timer', '高精度定时器', winmmApi !== null, 'timeBeginPeriod(1)');
  add('input', '鼠标按键轮询', typeof user32Api?.GetAsyncKeyState === 'function', 'GetAsyncKeyState');
  add(
    'cursor',
    '系统光标缩放',
    typeof user32Api?.SystemParametersInfoW === 'function',
    'SystemParametersInfoW',
  );

  return features;
}
