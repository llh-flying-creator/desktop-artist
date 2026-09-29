/**
 * 光标特效渲染引擎（纯 Canvas，无 Electron 依赖）
 * 同一份代码同时用于：
 *   - 桌面覆盖层（overlay），渲染真实的系统光标特效
 *   - 设置页的实时预览，避免"设置与实际效果不一致"
 *
 * 性能约定：
 *   - 只使用 fillRect / arc / 线段等轻量绘制，避免逐帧 shadowBlur 大面积调用
 *   - 粒子数量受 length 限制，超出即淘汰最旧的，保证 60fps
 */
import { hexToRgb } from '@shared/color';
import type { TrailStyle } from '@shared/types';

export interface EngineOptions {
  color: string;
  style: TrailStyle;
  /** 粒子数量上限 / 拖尾采样点数量 */
  length: number;
  /** 粒子尺寸（px） */
  size: number;
  /** 粒子存活时间（ms） */
  life: number;
  ripple: {
    enabled: boolean;
    color: string;
    /** 涟漪最大半径 */
    size: number;
    /** 涟漪持续时间（ms） */
    duration: number;
  };
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  born: number;
  life: number;
  size: number;
}

interface TrailPoint {
  x: number;
  y: number;
  t: number;
}

interface Ripple {
  x: number;
  y: number;
  t: number;
  duration: number;
  size: number;
  color: string;
}

function rgba(color: string, alpha: number): string {
  const { r, g, b } = hexToRgb(color);
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`;
}

/** 头部光点在停止移动后的淡出时长（ms） */
const HEAD_DECAY_MS = 420;

export class CursorFxEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private options: EngineOptions;
  private dpr = 1;

  private particles: Particle[] = [];
  private trail: TrailPoint[] = [];
  private ripples: Ripple[] = [];

  private pointer = { x: 0, y: 0, has: false };
  /** 最近一次"真实位移"的时间戳：用于让跟随光点在停止移动后淡出 */
  private lastMoveAt = 0;
  /** 画布上是否还残留内容（决定空闲时是否需要清屏一次） */
  private canvasDirty = false;
  private raf = 0;
  private lastFrame = 0;
  private running = false;
  /** rAF 被挂起时的兜底定时器，见 start() */
  private watchdog: number | null = null;
  /** 最近一次真实绘制的时刻 */
  private lastTick = 0;
  /** 预渲染的径向渐变贴图 + 其对应颜色 */
  private sprite: HTMLCanvasElement | null = null;
  private spriteColor = '';

  constructor(canvas: HTMLCanvasElement, options: EngineOptions) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) throw new Error('无法创建 2D 上下文');
    this.ctx = ctx;
    this.options = options;
  }

  /**
   * 调整画布后备缓冲区尺寸（保证高分屏下不模糊）。
   * 注意：只改后备缓冲，显示尺寸交给 CSS，避免与布局冲突。
   */
  resize(width: number, height: number, dpr = window.devicePixelRatio || 1): void {
    this.dpr = dpr;
    this.canvas.width = Math.max(1, Math.round(width * dpr));
    this.canvas.height = Math.max(1, Math.round(height * dpr));
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  setOptions(options: EngineOptions): void {
    this.options = options;
    // 收紧粒子上限，避免降低配置后仍残留大量粒子
    if (this.particles.length > options.length * 4) {
      this.particles.splice(0, this.particles.length - options.length * 4);
    }
  }

  /** 更新光标位置，并按移动距离插值生成粒子 */
  moveTo(x: number, y: number): void {
    const { options } = this;
    if (!this.pointer.has) {
      this.pointer = { x, y, has: true };
      return;
    }

    const dx = x - this.pointer.x;
    const dy = y - this.pointer.y;
    const distance = Math.hypot(dx, dy);
    this.pointer = { x, y, has: true };

    // 距离过小视为静止，不生成新粒子（同时也是性能保护）
    if (distance < 1.2) return;
    this.lastMoveAt = performance.now();
    // 单帧移动过大（例如瞬移）时限制插值数量
    const steps = Math.min(Math.max(1, Math.ceil(distance / 4)), 24);

    for (let i = 0; i < steps; i += 1) {
      // 在当前帧的位移线段上均匀插值，快速移动时也能得到连续的拖尾
      const t = i / steps;
      this.spawnParticle(x - dx * (1 - t), y - dy * (1 - t), dx, dy);
    }

    if (options.style === 'gradient') {
      this.trail.push({ x, y, t: performance.now() });
      const maxPoints = Math.max(4, options.length);
      if (this.trail.length > maxPoints) this.trail.splice(0, this.trail.length - maxPoints);
    }
  }

  private spawnParticle(x: number, y: number, dx: number, dy: number): void {
    const { options } = this;
    // 粒子速度带有随机扰动，让拖尾更自然。
    // 数值越大越发散；调小可以让光点更聚焦、看起来更"跟手"。
    const spread = 0.22;
    const jitterX = (Math.random() - 0.5) * options.size * spread * 4;
    const jitterY = (Math.random() - 0.5) * options.size * spread * 4;

    if (this.particles.length > options.length * 5) {
      this.particles.splice(0, this.particles.length - options.length * 5);
    }

    this.particles.push({
      x: x + jitterX,
      y: y + jitterY,
      vx: dx * 0.06 + (Math.random() - 0.5) * 0.6,
      vy: dy * 0.06 + (Math.random() - 0.5) * 0.6,
      born: performance.now(),
      life: options.life,
      size: options.size * (0.65 + Math.random() * 0.7),
    });
  }

  /** 生成点击涟漪 */
  ripple(x: number, y: number): void {
    if (!this.options.ripple.enabled) return;
    this.ripples.push({
      x,
      y,
      t: performance.now(),
      duration: this.options.ripple.duration,
      size: this.options.ripple.size,
      color: this.options.ripple.color,
    });
    if (this.ripples.length > 12) this.ripples.splice(0, this.ripples.length - 12);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastFrame = performance.now();
    this.lastTick = this.lastFrame;
    this.raf = requestAnimationFrame(this.frame);

    /*
     * 兜底看门狗。
     * 当窗口被系统判定为"不可见 / 被遮挡"时，Chromium 会挂起 requestAnimationFrame，
     * 此时画布会一直保留最后一帧 —— 表现出来就是"光标特效卡在原地不动"。
     * 这里只要发现 rAF 超过 200ms 没触发，就手动驱动一帧，保证特效始终跟随光标。
     */
    this.watchdog = window.setInterval(() => {
      if (!this.running) return;
      const now = performance.now();
      if (now - this.lastTick < 200) return;
      const dt = Math.min(48, now - this.lastFrame);
      this.lastFrame = now;
      this.lastTick = now;
      this.update(dt, now);
      this.render(now);
    }, 100);
  }

  stop(): void {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    if (this.watchdog !== null) {
      window.clearInterval(this.watchdog);
      this.watchdog = null;
    }
    this.particles = [];
    this.trail = [];
    this.ripples = [];
    this.clear();
  }

  clear(): void {
    const { width, height } = this.logicalSize();
    this.ctx.clearRect(0, 0, width, height);
    this.canvasDirty = false;
  }

  /**
   * 预渲染一张径向渐变贴图。
   * 原来每个粒子每帧都要 createRadialGradient + addColorStop，
   * 几十上百个粒子时这一步就是掉帧的主因；改成一次性生成贴图后逐帧 drawImage。
   */
  private ensureSprite(color: string): HTMLCanvasElement {
    if (this.sprite && this.spriteColor === color) return this.sprite;

    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const g = canvas.getContext('2d');
    if (g) {
      const half = size / 2;
      const gradient = g.createRadialGradient(half, half, 0, half, half, half);
      gradient.addColorStop(0, rgba(color, 1));
      gradient.addColorStop(0.45, rgba(color, 0.35));
      gradient.addColorStop(1, rgba(color, 0));
      g.fillStyle = gradient;
      g.fillRect(0, 0, size, size);
    }

    this.sprite = canvas;
    this.spriteColor = color;
    return canvas;
  }

  private logicalSize(): { width: number; height: number } {
    return { width: this.canvas.width / this.dpr, height: this.canvas.height / this.dpr };
  }

  private frame = (now: number): void => {
    if (!this.running) return;
    this.lastTick = now;
    // 帧间隔钳制，防止窗口切回前台时出现"粒子瞬移"
    const dt = Math.min(48, now - this.lastFrame);
    this.lastFrame = now;

    this.update(dt, now);
    this.render(now);

    this.raf = requestAnimationFrame(this.frame);
  };

  private update(dt: number, now: number): void {
    const { options } = this;
    const friction = 0.94;

    for (let i = this.particles.length - 1; i >= 0; i -= 1) {
      const p = this.particles[i];
      const age = now - p.born;
      if (age >= p.life) {
        this.particles.splice(i, 1);
        continue;
      }
      // 用 dt 归一化，保证不同刷新率下速度一致
      const k = dt / 16.667;
      p.x += p.vx * k;
      p.y += p.vy * k;
      p.vx *= Math.pow(friction, k);
      p.vy *= Math.pow(friction, k);
    }

    if (options.style === 'gradient') {
      const maxPoints = Math.max(4, options.length);
      while (this.trail.length > maxPoints) this.trail.shift();
    }

    for (let i = this.ripples.length - 1; i >= 0; i -= 1) {
      if (now - this.ripples[i].t >= this.ripples[i].duration) this.ripples.splice(i, 1);
    }
  }

  /** 头部光点是否仍在可见期内 */
  private isHeadVisible(now: number): boolean {
    return this.options.style === 'glow' && this.pointer.has && now - this.lastMoveAt < HEAD_DECAY_MS;
  }

  private render(now: number): void {
    const { options } = this;

    const hasContent =
      this.particles.length > 0 ||
      this.ripples.length > 0 ||
      (options.style === 'gradient' && this.trail.length > 1) ||
      this.isHeadVisible(now);

    /*
     * 空闲时不绘制。
     * 这一步不会增加响应延迟：粒子是在 moveTo() 里生成的，下一帧照样会画出来；
     * 收益是鼠标静止时不再每帧「全屏 clear + 重新合成」—— 那部分开销会持续占用
     * GPU 与 CPU（表现为空闲也在烧 10% 左右的 CPU），长时间使用后容易因发热降频
     * 而出现"越用越卡"。
     */
    if (!hasContent) {
      if (this.canvasDirty) this.clear();
      return;
    }
    this.canvasDirty = true;

    const { ctx } = this;
    const { width, height } = this.logicalSize();
    ctx.clearRect(0, 0, width, height);

    if (options.style === 'glow') {
      // 光晕：叠加混合 + 预渲染贴图（不再逐粒子创建径向渐变）
      const sprite = this.ensureSprite(options.color);
      ctx.globalCompositeOperation = 'lighter';

      // 头部光点：直接画在最新光标位置，鼠标一动立刻有反应。
      // 停止移动后按 420ms 淡出，避免在光标下留一个常驻光斑。
      if (this.pointer.has) {
        const headAlpha = Math.max(0, 1 - (now - this.lastMoveAt) / HEAD_DECAY_MS) * 0.5;
        if (headAlpha > 0.01) {
          const headRadius = options.size * 3.6;
          ctx.globalAlpha = headAlpha;
          ctx.drawImage(
            sprite,
            this.pointer.x - headRadius,
            this.pointer.y - headRadius,
            headRadius * 2,
            headRadius * 2,
          );
        }
      }

      for (const p of this.particles) {
        const progress = (now - p.born) / p.life;
        // 幂次衰减：头部更实、尾巴更快淡出，整体更利落
        const alpha = Math.pow(1 - progress, 1.6) * 0.7;
        if (alpha <= 0.01) continue;
        const radius = p.size * (1 + progress * 1.6) * 2.4;
        ctx.globalAlpha = alpha;
        ctx.drawImage(sprite, p.x - radius, p.y - radius, radius * 2, radius * 2);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    } else if (options.style === 'particles') {
      for (const p of this.particles) {
        const progress = (now - p.born) / p.life;
        const alpha = (1 - progress) * 0.9;
        ctx.fillStyle = rgba(options.color, alpha);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 0.5 * (1 - progress * 0.6), 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      // 渐变拖尾：按新旧程度衰减线宽与透明度
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      const points = this.trail;
      for (let i = 1; i < points.length; i += 1) {
        const prev = points[i - 1];
        const cur = points[i];
        const ratio = i / points.length;
        ctx.strokeStyle = rgba(options.color, ratio * 0.85);
        ctx.lineWidth = Math.max(1, options.size * ratio);
        ctx.beginPath();
        ctx.moveTo(prev.x, prev.y);
        ctx.lineTo(cur.x, cur.y);
        ctx.stroke();
      }
    }

    // 涟漪
    for (const r of this.ripples) {
      const progress = Math.min(1, (now - r.t) / r.duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const radius = r.size * eased;
      const alpha = (1 - progress) * 0.85;

      ctx.strokeStyle = rgba(r.color, alpha);
      ctx.lineWidth = Math.max(1, 3 * (1 - progress));
      ctx.beginPath();
      ctx.arc(r.x, r.y, radius, 0, Math.PI * 2);
      ctx.stroke();

      // 内圈柔光
      ctx.strokeStyle = rgba(r.color, alpha * 0.35);
      ctx.lineWidth = Math.max(1, 6 * (1 - progress));
      ctx.beginPath();
      ctx.arc(r.x, r.y, radius * 0.72, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}
