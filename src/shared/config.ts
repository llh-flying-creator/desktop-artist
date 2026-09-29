/**
 * 配置默认值与深合并工具
 */
import type { AppConfig, DeepPartial } from './types';

/** 配置结构版本，用于后续迁移 */
export const CONFIG_VERSION = 1;

export const DEFAULT_CONFIG: AppConfig = {
  version: CONFIG_VERSION,
  appearance: {
    mode: 'system',
    accent: '#7c8cff',
  },
  cursorFx: {
    enabled: false,
    trail: {
      enabled: true,
      style: 'glow',
      color: '#7c8cff',
      length: 26,
      size: 6,
      life: 620,
    },
    ripple: {
      enabled: true,
      color: '#7c8cff',
      size: 96,
      duration: 520,
    },
    scale: 1,
  },
  system: {
    startWithWindows: false,
    minimizeToTray: true,
    autoPauseFullscreen: true,
    autoApplyOnStart: true,
    autoRestartMinutes: 30,
  },
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 深合并：以 base 为基准，用 patch 覆盖。
 * 数组与基础类型直接替换，仅纯对象递归合并。
 */
export function deepMerge<T>(base: T, patch: unknown): T {
  if (patch === undefined) return base;
  if (!isPlainObject(base) || !isPlainObject(patch)) {
    return (patch === undefined ? base : (patch as T));
  }
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    const current = out[key];
    out[key] = isPlainObject(current) && isPlainObject(value) ? deepMerge(current, value) : value;
  }
  return out as T;
}

/** 规范化配置：补齐缺失字段 + 限幅 */
export function normalizeConfig(raw: unknown): AppConfig {
  const merged = deepMerge(DEFAULT_CONFIG, raw ?? {}) as AppConfig;
  const clamp = (n: unknown, min: number, max: number, fallback: number): number => {
    const v = typeof n === 'number' && Number.isFinite(n) ? n : fallback;
    return Math.max(min, Math.min(max, v));
  };

  merged.version = CONFIG_VERSION;

  merged.cursorFx.trail.length = clamp(merged.cursorFx.trail.length, 4, 120, 26);
  merged.cursorFx.trail.size = clamp(merged.cursorFx.trail.size, 1, 40, 6);
  merged.cursorFx.trail.life = clamp(merged.cursorFx.trail.life, 80, 3000, 620);
  merged.cursorFx.ripple.size = clamp(merged.cursorFx.ripple.size, 20, 400, 96);
  merged.cursorFx.ripple.duration = clamp(merged.cursorFx.ripple.duration, 150, 2000, 520);
  merged.cursorFx.scale = clamp(merged.cursorFx.scale, 1, 3, 1);
  merged.system.autoRestartMinutes = clamp(merged.system.autoRestartMinutes, 0, 1440, 30);

  if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(merged.appearance.accent)) {
    merged.appearance.accent = DEFAULT_CONFIG.appearance.accent;
  }

  // 迁移：清理已移除功能的遗留字段（窗口特效 / 任务栏）
  const legacy = merged as unknown as Record<string, unknown>;
  delete legacy.windowFx;
  delete legacy.taskbar;

  return merged;
}

/** 判断两个配置是否完全一致（用于跳过无意义的原生调用） */
export function isSameConfig(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export type { DeepPartial };
