/**
 * 外观同步：
 * 1. 把配置中的强调色注入 CSS 变量
 * 2. 深浅色跟随系统（prefers-color-scheme）或按用户指定强制切换
 * 3. 根据主界面自身是否启用亚克力，调整玻璃层不透明度
 */
import { useEffect } from 'react';
import { mixHex } from '@shared/color';
import { useAppStore } from '../store/appStore';

export function useAppearance(): void {
  const accent = useAppStore((s) => s.config.appearance.accent);
  const mode = useAppStore((s) => s.config.appearance.mode);
  const selfAcrylic = useAppStore((s) => s.status?.selfAcrylic ?? false);

  // 强调色
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--accent', accent);
    root.style.setProperty('--accent-2', mixHex(accent, '#ffffff', 0.28));
    // 由强调色推导半透明底色，用于高光与阴影
    const rgb = accent.replace('#', '');
    const normalized = rgb.length === 3 ? rgb.split('').map((c) => c + c).join('') : rgb;
    const num = Number.parseInt(normalized, 16);
    root.style.setProperty(
      '--accent-soft',
      `rgba(${(num >> 16) & 0xff}, ${(num >> 8) & 0xff}, ${num & 0xff}, 0.18)`,
    );
  }, [accent]);

  // 深浅色
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = mode === 'dark' || (mode === 'system' && media.matches);
      document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [mode]);

  // 玻璃层强度
  useEffect(() => {
    document.documentElement.setAttribute('data-acrylic', selfAcrylic ? 'on' : 'off');
  }, [selfAcrylic]);
}
