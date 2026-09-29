/**
 * 全局共享类型定义
 * 主进程 / 预加载 / 渲染进程 / 光标覆盖层 共用，避免类型漂移。
 */

/** 界面深浅色模式 */
export type ThemeMode = 'system' | 'dark' | 'light';
/** 鼠标拖尾样式 */
export type TrailStyle = 'particles' | 'gradient' | 'glow';

export interface AppearanceConfig {
  /** 深浅色模式 */
  mode: ThemeMode;
  /** 程序自身强调色 */
  accent: string;
}

export interface CursorTrailConfig {
  enabled: boolean;
  style: TrailStyle;
  color: string;
  /** 拖尾长度（粒子数量上限 / 采样点数） */
  length: number;
  /** 粒子尺寸 px */
  size: number;
  /** 粒子存活时间 ms */
  life: number;
}

export interface CursorRippleConfig {
  enabled: boolean;
  color: string;
  /** 涟漪最大半径 px */
  size: number;
  /** 持续时间 ms */
  duration: number;
}

export interface CursorFxConfig {
  enabled: boolean;
  trail: CursorTrailConfig;
  ripple: CursorRippleConfig;
  /** 系统光标缩放 1-3 */
  scale: number;
}

export interface SystemConfig {
  /** 开机自启 */
  startWithWindows: boolean;
  /** 关闭主窗口时最小化到托盘 */
  minimizeToTray: boolean;
  /** 全屏应用时自动暂停特效 */
  autoPauseFullscreen: boolean;
  /** 启动时自动应用上次配置 */
  autoApplyOnStart: boolean;
  /**
   * 定时自动重启进程（分钟，0 = 关闭）。
   * 长时间运行后跟随手感可能逐渐变差，定期重启可立即恢复，
   * 属于兜底措施（重启瞬间特效会中断约 1 秒）。
   */
  autoRestartMinutes: number;
}

export interface AppConfig {
  version: number;
  appearance: AppearanceConfig;
  cursorFx: CursorFxConfig;
  system: SystemConfig;
}

/** 递归可选，用于配置增量更新 */
export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

/** 原生能力自检项 */
export interface NativeFeatureState {
  key: string;
  label: string;
  ok: boolean;
  detail?: string;
}

/** 全局运行状态（顶部状态栏与首页使用） */
export interface SystemStatus {
  nativeReady: boolean;
  nativeError: string | null;
  windowsBuild: number;
  windowsName: string;
  features: NativeFeatureState[];
  paused: boolean;
  cursorOverlayActive: boolean;
  overlayAvailable: boolean;
  /** 主界面自身是否成功启用了亚克力背景 */
  selfAcrylic: boolean;
  message: string | null;
}

/** 光标帧数据（主进程 -> 覆盖层） */
export interface CursorFrame {
  x: number;
  y: number;
  /** 当前按下的按键位掩码（1=左键，2=右键） */
  buttons: number;
  /** 本帧新按下的按键位掩码 */
  down: number;
}

/** 覆盖层虚拟屏幕原点（多显示器时用于坐标换算） */
export interface OverlayBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 吸色器截图结果 */
export interface ScreenShot {
  dataUrl: string;
  width: number;
  height: number;
  displayId: string;
}

/** 开机自启的真实状态（由计划任务决定，可能滞后于配置项） */
export interface AutoStartStatus {
  /** 是否支持（开发模式下不支持） */
  available: boolean;
  /** 系统上是否真的存在该计划任务 */
  enabled: boolean;
  /** 自启所指向的程序路径 */
  target: string;
  /** 最近一次操作的错误信息 */
  error: string | null;
}
