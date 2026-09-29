/// <reference types="vite/client" />

import type { PreloadApi } from '../preload/index';

declare global {
  interface Window {
    /** 由 preload 通过 contextBridge 注入 */
    api: PreloadApi;
  }
}

export {};
