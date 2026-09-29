/**
 * 构建产物路径统一管理
 * electron-vite 输出结构：
 *   out/main/index.js
 *   out/preload/index.js
 *   out/renderer/index.html + overlay.html
 */
import { join } from 'node:path';

export const preloadPath = join(__dirname, '../preload/index.js');
export const rendererDir = join(__dirname, '../renderer');
export const rendererIndex = join(rendererDir, 'index.html');
export const rendererOverlay = join(rendererDir, 'overlay.html');

/** 开发模式下 electron-vite 注入的渲染进程地址 */
export const devServerUrl: string | undefined = process.env['ELECTRON_RENDERER_URL'];

export const isDev = Boolean(devServerUrl);

/** 拼接渲染页地址（开发直连 devserver，生产走本地文件） */
export function pageUrl(file: string, devPath: string): { url?: string; file?: string } {
  return devServerUrl ? { url: `${devServerUrl}/${devPath}` } : { file };
}
