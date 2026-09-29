/**
 * 全局状态（zustand）
 * 采用"乐观更新"策略：本地立即更新 -> 异步同步到主进程，
 * 保证拖动滑块时的视觉反馈无延迟（满足 60fps 手感）。
 */
import { create } from 'zustand';
import { DEFAULT_CONFIG, deepMerge, normalizeConfig } from '@shared/config';
import type { AppConfig, DeepPartial, SystemStatus } from '@shared/types';

export type PageKey = 'dashboard' | 'cursor' | 'settings';

export interface ToastItem {
  id: number;
  text: string;
  kind: 'info' | 'success' | 'error';
}

/** 吸色器的取值目标：表单里由调用方传入一个 setter 注册表 */
export type PickerTargetId = string;

interface AppState {
  config: AppConfig;
  status: SystemStatus | null;
  page: PageKey;
  toasts: ToastItem[];
  /** 当前打开的吸色器目标（null = 关闭） */
  pickerTarget: PickerTargetId | null;
  /** 保存吸色结果的回调 */
  pickerSink: ((hex: string) => void) | null;

  ready: boolean;

  init: () => Promise<void>;
  setPage: (page: PageKey) => void;
  patchConfig: (patch: DeepPartial<AppConfig>) => void;
  replaceConfig: (config: AppConfig) => void;
  toast: (text: string, kind?: ToastItem['kind']) => void;
  dismissToast: (id: number) => void;
  openPicker: (target: PickerTargetId, sink: (hex: string) => void) => void;
  closePicker: () => void;
}

let toastSeq = 0;

export const useAppStore = create<AppState>((set, get) => ({
  config: DEFAULT_CONFIG,
  status: null,
  page: 'dashboard',
  toasts: [],
  pickerTarget: null,
  pickerSink: null,
  ready: false,

  init: async () => {
    // 先订阅后拉取，避免漏掉启动瞬间的广播
    window.api.config.onChange((config) => set({ config: normalizeConfig(config) }));
    window.api.app.onStatus((status) => set({ status }));

    const [config, status] = await Promise.all([
      window.api.config.get(),
      window.api.app.getStatus(),
    ]);

    set({ config: normalizeConfig(config), status, ready: true });
  },

  setPage: (page) => set({ page }),

  patchConfig: (patch) => {
    // 乐观更新：本地深合并后立即渲染，再异步下发主进程
    const next = normalizeConfig(deepMerge(get().config, patch));
    set({ config: next });
    void window.api.config.patch(patch);
  },

  replaceConfig: (config) => set({ config: normalizeConfig(config) }),

  toast: (text, kind = 'info') => {
    const id = ++toastSeq;
    set((state) => ({ toasts: [...state.toasts, { id, text, kind }] }));
    setTimeout(() => get().dismissToast(id), 3200);
  },

  dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),

  openPicker: (target, sink) => set({ pickerTarget: target, pickerSink: sink }),

  closePicker: () => set({ pickerTarget: null, pickerSink: null }),
}));

/** 便捷选择器 */
export const selectConfig = (s: AppState): AppConfig => s.config;
export const selectStatus = (s: AppState): SystemStatus | null => s.status;
