import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

/** 统一路径别名（与 tsconfig.json 的 paths 保持一致） */
const alias = {
  '@shared': resolve(process.cwd(), 'src/shared'),
  '@': resolve(process.cwd(), 'src/renderer'),
};

export default defineConfig({
  // 主进程：Node 环境，依赖外部化（koffi 走 require，不被打包）
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias },
    build: {
      rollupOptions: {
        input: { index: resolve(process.cwd(), 'src/main/index.ts') },
      },
    },
  },

  // 预加载脚本：向渲染进程暴露受限的 IPC API
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias },
    build: {
      rollupOptions: {
        input: { index: resolve(process.cwd(), 'src/preload/index.ts') },
      },
    },
  },

  // 渲染进程：两个入口（主界面 index.html + 光标特效覆盖层 overlay.html）
  renderer: {
    root: resolve(process.cwd(), 'src/renderer'),
    resolve: { alias },
    plugins: [react()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(process.cwd(), 'src/renderer/index.html'),
          overlay: resolve(process.cwd(), 'src/renderer/overlay.html'),
        },
      },
    },
  },
});
