/**
 * 吸色器
 * 主进程先隐藏本窗口再截屏，因此截图里不会出现自己；
 * 取色通过离屏 Canvas 的 getImageData 完成，附带放大镜便于精确取色。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ScreenShot } from '@shared/types';
import { rgbToHex } from '@shared/color';
import { useAppStore } from '../store/appStore';

/** 放大镜放大倍率 */
const ZOOM = 9;
/** 放大镜取样范围（像素） */
const SAMPLE = 13;

export function ColorPickerModal() {
  const target = useAppStore((s) => s.pickerTarget);
  const sink = useAppStore((s) => s.pickerSink);
  const close = useAppStore((s) => s.closePicker);
  const toast = useAppStore((s) => s.toast);

  const [shot, setShot] = useState<ScreenShot | null>(null);
  const [loading, setLoading] = useState(false);
  const [hex, setHex] = useState('#000000');
  const [cursor, setCursor] = useState<{ x: number; y: number; px: number; py: number } | null>(null);

  const stageRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const sourceRef = useRef<HTMLCanvasElement | null>(null);
  const magnifierRef = useRef<HTMLCanvasElement>(null);

  const open = target !== null;

  /* 打开时截屏，并预先把图像绘制到离屏 canvas 供取色使用 */
  useEffect(() => {
    if (!open) {
      setShot(null);
      setCursor(null);
      sourceRef.current = null;
      return;
    }
    let cancelled = false;
    setLoading(true);

    void window.api.picker
      .capture()
      .then((result) => {
        if (cancelled) return;
        setLoading(false);
        if (!result) {
          toast('屏幕捕获失败，请改用手动输入色值', 'error');
          close();
          return;
        }
        setShot(result);
        const image = new Image();
        image.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = image.naturalWidth;
          canvas.height = image.naturalHeight;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (ctx) {
            ctx.drawImage(image, 0, 0);
            sourceRef.current = canvas;
          }
        };
        image.src = result.dataUrl;
      })
      .catch(() => {
        if (!cancelled) {
          setLoading(false);
          close();
        }
      });

    return () => {
      cancelled = true;
    };
  }, [open, close, toast]);

  /** 读取某个图像像素颜色 */
  const readPixel = useCallback((px: number, py: number): string | null => {
    const source = sourceRef.current;
    if (!source) return null;
    const ctx = source.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    const x = Math.max(0, Math.min(source.width - 1, Math.round(px)));
    const y = Math.max(0, Math.min(source.height - 1, Math.round(py)));
    const data = ctx.getImageData(x, y, 1, 1).data;
    return rgbToHex(data[0], data[1], data[2]);
  }, []);

  /** 绘制放大镜 */
  const drawMagnifier = useCallback((px: number, py: number) => {
    const source = sourceRef.current;
    const canvas = magnifierRef.current;
    const ctx = canvas?.getContext('2d');
    if (!source || !canvas || !ctx) return;
    const half = Math.floor(SAMPLE / 2);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(
      source,
      Math.round(px) - half,
      Math.round(py) - half,
      SAMPLE,
      SAMPLE,
      0,
      0,
      canvas.width,
      canvas.height,
    );
    // 中心十字与像素格
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 1;
    const cell = canvas.width / SAMPLE;
    ctx.strokeRect(Math.floor(SAMPLE / 2) * cell + 0.5, Math.floor(SAMPLE / 2) * cell + 0.5, cell, cell);
    ctx.beginPath();
    ctx.moveTo(canvas.width / 2 + 0.5, 0);
    ctx.lineTo(canvas.width / 2 + 0.5, canvas.height);
    ctx.moveTo(0, canvas.height / 2 + 0.5);
    ctx.lineTo(canvas.width, canvas.height / 2 + 0.5);
    ctx.strokeStyle = 'rgba(255,60,90,0.8)';
    ctx.stroke();
  }, []);

  const handleMove = (event: React.MouseEvent<HTMLDivElement>) => {
    const stage = stageRef.current;
    const image = imageRef.current;
    if (!stage || !image || !shot) return;
    const rect = stage.getBoundingClientRect();
    const ratioX = (event.clientX - rect.left) / rect.width;
    const ratioY = (event.clientY - rect.top) / rect.height;
    const px = ratioX * shot.width;
    const py = ratioY * shot.height;
    const color = readPixel(px, py);
    if (color) setHex(color);
    // 放大镜跟随鼠标，并做边界收敛
    const localX = Math.max(80, Math.min(rect.width - 80, event.clientX - rect.left));
    const localY = Math.max(80, Math.min(rect.height - 80, event.clientY - rect.top));
    setCursor({ x: localX, y: localY, px, py });
    drawMagnifier(px, py);
  };

  const handlePick = () => {
    if (sink) sink(hex);
    close();
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      if (e.key === 'Enter') handlePick();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!open) return null;

  return (
    <div className="picker" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="picker__panel">
        <div className="picker__head">
          <h3>吸色器</h3>
          <span className="dim" style={{ fontSize: 11 }}>
            {loading ? '正在捕获屏幕…' : '在图像上移动鼠标取色，点击确定'}
          </span>
          <span style={{ flex: 1 }} />
          <span className="swatch" style={{ cursor: 'default' }}>
            <span className="swatch__fill" style={{ background: hex }} />
          </span>
          <input
            className="color-field__hex"
            value={hex.toUpperCase()}
            spellCheck={false}
            onChange={(e) => setHex(e.target.value)}
          />
        </div>

        <div
          ref={stageRef}
          className="picker__stage"
          onMouseMove={handleMove}
          onMouseLeave={() => setCursor(null)}
          onClick={handlePick}
        >
          {shot ? <img ref={imageRef} src={shot.dataUrl} alt="屏幕截图" draggable={false} /> : null}
          {cursor ? (
            <canvas
              ref={magnifierRef}
              className="picker__magnifier"
              width={SAMPLE * ZOOM}
              height={SAMPLE * ZOOM}
              style={{ left: cursor.x, top: cursor.y }}
            />
          ) : null}
        </div>

        <div className="picker__foot">
          <span className="dim" style={{ fontSize: 11 }}>
            提示：截图前已临时隐藏本窗口，因此可以取到任意桌面区域的颜色
          </span>
          <span style={{ flex: 1 }} />
          <button className="btn" type="button" onClick={close}>
            取消
          </button>
          <button className="btn btn--primary" type="button" onClick={handlePick}>
            使用此颜色
          </button>
        </div>
      </div>
    </div>
  );
}
