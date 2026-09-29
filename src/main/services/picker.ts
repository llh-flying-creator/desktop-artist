/**
 * 吸色器：抓取主显示器截图，交给渲染进程做像素级取色。
 * 使用 desktopCapturer 的 thumbnail 接口，无需额外依赖。
 */
import { desktopCapturer, screen } from 'electron';
import type { ScreenShot } from '../../shared/types';
import { logger } from '../util/logger';

export async function capturePrimaryScreen(): Promise<ScreenShot | null> {
  try {
    const display = screen.getPrimaryDisplay();
    const scale = display.scaleFactor || 1;
    // 按物理像素抓取，保证取色精度
    const width = Math.round(display.size.width * scale);
    const height = Math.round(display.size.height * scale);

    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width, height },
      fetchWindowIcons: false,
    });

    if (sources.length === 0) return null;

    const matched =
      sources.find((s) => s.display_id === String(display.id)) ??
      sources.find((s) => s.name.toLowerCase().includes('screen')) ??
      sources[0];

    const thumbnail = matched.thumbnail;
    if (thumbnail.isEmpty()) return null;

    const size = thumbnail.getSize();
    return {
      dataUrl: thumbnail.toDataURL(),
      width: size.width,
      height: size.height,
      displayId: String(display.id),
    };
  } catch (err) {
    logger.error('picker', `截屏失败：${String(err)}`);
    return null;
  }
}
