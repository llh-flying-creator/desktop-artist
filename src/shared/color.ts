/**
 * 颜色工具
 * 统一处理 CSS 十六进制颜色与 Win32 所需的 COLORREF / ABGR 格式互转。
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** DWM 特殊色值：使用系统默认颜色 */
export const COLORREF_DEFAULT = 0xffffffff;
/** DWM 特殊色值：不绘制（透明） */
export const COLORREF_NONE = 0xfffffffe;

export function isHexColor(value: string | undefined | null): boolean {
  return typeof value === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value.trim());
}

export function hexToRgb(hex: string): Rgb {
  let v = (hex || '').trim().replace('#', '');
  if (v.length === 3) {
    v = v
      .split('')
      .map((c) => c + c)
      .join('');
  }
  if (v.length !== 6 || !/^[0-9a-f]{6}$/i.test(v)) {
    return { r: 0, g: 0, b: 0 };
  }
  const num = Number.parseInt(v, 16);
  return { r: (num >> 16) & 0xff, g: (num >> 8) & 0xff, b: num & 0xff };
}

export function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return `#${[clamp(r), clamp(g), clamp(b)].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
}

/** CSS 十六进制 -> COLORREF（0x00BBGGRR，DWM 边框/标题栏使用） */
export function toColorRef(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  return ((b & 0xff) << 16) | ((g & 0xff) << 8) | (r & 0xff);
}

/** CSS 十六进制 -> ABGR（0xAABBGGRR，任务栏亚克力着色使用） */
export function toAbgr(hex: string, alpha255: number): number {
  const { r, g, b } = hexToRgb(hex);
  const a = Math.max(0, Math.min(255, Math.round(alpha255)));
  // 使用无符号右移保证结果为 32 位无符号数
  return ((a << 24) | ((b & 0xff) << 16) | ((g & 0xff) << 8) | (r & 0xff)) >>> 0;
}

/** 将颜色值翻译为 DWM 参数：'' -> 默认，'none' -> 不绘制，其余 -> COLORREF */
export function toDwmColor(value: string): number {
  const v = (value || '').trim().toLowerCase();
  if (v === '' || v === 'default') return COLORREF_DEFAULT;
  if (v === 'none' || v === 'transparent') return COLORREF_NONE;
  return isHexColor(v) ? toColorRef(v) : COLORREF_DEFAULT;
}

/** 转 CSS rgba 字符串 */
export function withAlpha(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha)).toFixed(3)})`;
}

/** 线性混合两个颜色（t=0 取 a，t=1 取 b） */
export function mixHex(a: string, b: string, t: number): string {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  const k = Math.max(0, Math.min(1, t));
  return rgbToHex(ca.r + (cb.r - ca.r) * k, ca.g + (cb.g - ca.g) * k, ca.b + (cb.b - ca.b) * k);
}

/** 根据背景色亮度判断应使用深色还是浅色文字 */
export function readableTextColor(hex: string): string {
  const { r, g, b } = hexToRgb(hex);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? '#101014' : '#ffffff';
}
