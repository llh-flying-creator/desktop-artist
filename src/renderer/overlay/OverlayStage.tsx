/**
 * 覆盖层渲染组件
 * 接收主进程推送的全局光标帧，换算为窗口内坐标后交给引擎绘制。
 */
import { useEffect, useRef, useState } from 'react';
import type { CursorConfigPayload } from './types';
import { CursorFxEngine, type EngineOptions } from './engine';
import type { OverlayBounds } from '@shared/types';

const DEFAULT_OPTIONS: EngineOptions = {
  color: '#7c8cff',
  style: 'glow',
  length: 26,
  size: 6,
  life: 620,
  ripple: { enabled: true, color: '#7c8cff', size: 96, duration: 520 },
};

export function OverlayStage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<CursorFxEngine | null>(null);
  const boundsRef = useRef<OverlayBounds>({ x: 0, y: 0, width: window.innerWidth, height: window.innerHeight });
  const [options, setOptions] = useState<EngineOptions>(DEFAULT_OPTIONS);

  /* 初始化引擎与尺寸监听 */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const engine = new CursorFxEngine(canvas, DEFAULT_OPTIONS);
    engineRef.current = engine;
    engine.resize(window.innerWidth, window.innerHeight);
    engine.start();

    const onResize = () => engine.resize(window.innerWidth, window.innerHeight);
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      engine.stop();
      engineRef.current = null;
    };
  }, []);

  /* 配置变更 */
  useEffect(() => {
    engineRef.current?.setOptions(options);
  }, [options]);

  /*
   * 可见性变化时清空画布。
   * 窗口被隐藏（暂停特效 / 连按 Win 等）时绘制循环会挂起，画布上会残留最后一帧；
   * 重新显示后若不清掉，就会看到"光标特效卡在原来的位置"。
   */
  useEffect(() => {
    const onVisibilityChange = () => engineRef.current?.clear();
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

  /* 订阅主进程推流 */
  useEffect(() => {
    const offConfig = window.api.overlay.onConfig((payload: CursorConfigPayload) => {
      setOptions({
        color: payload.trail.color,
        style: payload.trail.style,
        length: payload.trail.length,
        size: payload.trail.size,
        life: payload.trail.life,
        ripple: {
          enabled: payload.ripple.enabled,
          color: payload.ripple.color,
          size: payload.ripple.size,
          duration: payload.ripple.duration,
        },
      });
    });

    const offBounds = window.api.overlay.onBounds((bounds) => {
      boundsRef.current = bounds;
    });

    const offFrame = window.api.overlay.onFrame((frame) => {
      const engine = engineRef.current;
      if (!engine) return;
      const localX = frame.x - boundsRef.current.x;
      const localY = frame.y - boundsRef.current.y;
      engine.moveTo(localX, localY);
      if (frame.down & 1) engine.ripple(localX, localY);
      if (frame.down & 2) engine.ripple(localX, localY);
    });

    // 主动拉取一次，避免错过启动瞬间的广播
    window.api.overlay.requestBounds();
    window.api.overlay.requestConfig();

    return () => {
      offConfig();
      offBounds();
      offFrame();
    };
  }, []);

  return <canvas ref={canvasRef} />;
}
