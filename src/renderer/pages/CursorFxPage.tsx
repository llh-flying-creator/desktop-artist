/** 光标特效模块（含所见即所得的实时预览） */
import { useEffect, useRef } from 'react';
import type { CursorRippleConfig, CursorTrailConfig, TrailStyle } from '@shared/types';
import { CursorFxEngine, type EngineOptions } from '../overlay/engine';
import { Card, Notice, SettingRow } from '../components/Card';
import { ColorField } from '../components/ColorField';
import { Segmented } from '../components/Segmented';
import { Slider } from '../components/Slider';
import { Switch } from '../components/Switch';
import { useAppStore } from '../store/appStore';

const STYLE_OPTIONS = [
  { value: 'glow' as TrailStyle, label: '光晕' },
  { value: 'particles' as TrailStyle, label: '粒子' },
  { value: 'gradient' as TrailStyle, label: '渐变' },
];

const SCALE_OPTIONS = [
  { value: '1', label: '100%' },
  { value: '2', label: '200%' },
  { value: '3', label: '300%' },
];

function toEngineOptions(trail: CursorTrailConfig, ripple: CursorRippleConfig): EngineOptions {
  return {
    color: trail.color,
    style: trail.style,
    length: trail.length,
    size: trail.size,
    life: trail.life,
    ripple: {
      enabled: ripple.enabled,
      color: ripple.color,
      size: ripple.size,
      duration: ripple.duration,
    },
  };
}

/** 在设置页内直接复用覆盖层的渲染引擎，做到"所见即所得" */
function CursorPreview({ trail, ripple }: { trail: CursorTrailConfig; ripple: CursorRippleConfig }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<CursorFxEngine | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const engine = new CursorFxEngine(canvas, toEngineOptions(trail, ripple));
    engineRef.current = engine;

    const sync = () => engine.resize(canvas.clientWidth, canvas.clientHeight);
    sync();
    engine.start();

    const observer = new ResizeObserver(sync);
    observer.observe(canvas);
    return () => {
      observer.disconnect();
      engine.stop();
      engineRef.current = null;
    };
    // 仅在挂载时创建引擎，参数变化通过下面的 effect 下发
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    engineRef.current?.setOptions(toEngineOptions(trail, ripple));
  }, [trail, ripple]);

  return (
    <div className="row-inline" style={{ alignItems: 'stretch' }}>
      <canvas
        ref={canvasRef}
        style={{
          flex: 1,
          height: 132,
          borderRadius: 12,
          border: '1px dashed var(--border-strong)',
          background:
            'radial-gradient(circle at 30% 30%, rgba(255,255,255,0.06), transparent 60%), rgba(0,0,0,0.18)',
          cursor: 'crosshair',
        }}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          engineRef.current?.moveTo(e.clientX - rect.left, e.clientY - rect.top);
        }}
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          engineRef.current?.ripple(e.clientX - rect.left, e.clientY - rect.top);
        }}
      />
    </div>
  );
}

export function CursorFxPage() {
  const config = useAppStore((s) => s.config);
  const status = useAppStore((s) => s.status);
  const patch = useAppStore((s) => s.patchConfig);
  const cursor = config.cursorFx;
  const { trail, ripple } = cursor;

  return (
    <div className="page">
      <div className="page__head">
        <h2 className="page__title">光标特效</h2>
        <p className="page__desc">
          通过一个全屏透明覆盖层绘制拖尾与涟漪，鼠标点击会直接穿透到下层窗口，不影响正常操作。
        </p>
      </div>

      {!status?.nativeReady ? (
        <Notice kind="error">原生模块不可用：无法读取鼠标按键，涟漪效果与光标缩放将不可用。</Notice>
      ) : null}

      <div className="grid" style={{ marginTop: 12 }}>
        <Card
          title="启用光标特效"
          desc={cursor.enabled ? '覆盖层运行中' : '关闭时不创建任何覆盖窗口'}
          extra={<Switch checked={cursor.enabled} onChange={(v) => patch({ cursorFx: { enabled: v } })} />}
        >
          <SettingRow label="实时预览" hint="在此区域内移动鼠标即可看到实际效果，点击可触发涟漪" stack>
            <CursorPreview trail={trail} ripple={ripple} />
          </SettingRow>
        </Card>

        <div className="grid grid--2">
          <Card
            title="鼠标拖尾"
            extra={
              <Switch
                checked={trail.enabled}
                disabled={!cursor.enabled}
                onChange={(v) => patch({ cursorFx: { trail: { enabled: v } } })}
              />
            }
          >
            <SettingRow label="样式" stack>
              <Segmented
                value={trail.style}
                options={STYLE_OPTIONS}
                disabled={!cursor.enabled || !trail.enabled}
                onChange={(v) => patch({ cursorFx: { trail: { style: v } } })}
              />
            </SettingRow>

            <SettingRow label="颜色" stack>
              <ColorField
                pickerId="cursor.trail.color"
                value={trail.color}
                allowNone={false}
                allowDefault={false}
                onChange={(v) => patch({ cursorFx: { trail: { color: v } } })}
              />
            </SettingRow>

            <SettingRow label="拖尾长度" stack>
              <Slider
                value={trail.length}
                min={4}
                max={120}
                disabled={!cursor.enabled || !trail.enabled}
                onChange={(v) => patch({ cursorFx: { trail: { length: v } } })}
              />
            </SettingRow>

            <SettingRow label="粒子尺寸" stack>
              <Slider
                value={trail.size}
                min={1}
                max={40}
                disabled={!cursor.enabled || !trail.enabled}
                onChange={(v) => patch({ cursorFx: { trail: { size: v } } })}
                format={(v) => `${v}px`}
              />
            </SettingRow>

            <SettingRow label="存活时间" stack>
              <Slider
                value={trail.life}
                min={80}
                max={3000}
                step={20}
                disabled={!cursor.enabled || !trail.enabled}
                onChange={(v) => patch({ cursorFx: { trail: { life: v } } })}
                format={(v) => `${(v / 1000).toFixed(2)}s`}
              />
            </SettingRow>
          </Card>

          <Card
            title="点击涟漪"
            extra={
              <Switch
                checked={ripple.enabled}
                disabled={!cursor.enabled}
                onChange={(v) => patch({ cursorFx: { ripple: { enabled: v } } })}
              />
            }
          >
            <SettingRow label="涟漪颜色" stack>
              <ColorField
                pickerId="cursor.ripple.color"
                value={ripple.color}
                allowNone={false}
                allowDefault={false}
                onChange={(v) => patch({ cursorFx: { ripple: { color: v } } })}
              />
            </SettingRow>

            <SettingRow label="最大半径" stack>
              <Slider
                value={ripple.size}
                min={20}
                max={400}
                disabled={!cursor.enabled || !ripple.enabled}
                onChange={(v) => patch({ cursorFx: { ripple: { size: v } } })}
                format={(v) => `${v}px`}
              />
            </SettingRow>

            <SettingRow label="持续时间" stack>
              <Slider
                value={ripple.duration}
                min={150}
                max={2000}
                step={10}
                disabled={!cursor.enabled || !ripple.enabled}
                onChange={(v) => patch({ cursorFx: { ripple: { duration: v } } })}
                format={(v) => `${(v / 1000).toFixed(2)}s`}
              />
            </SettingRow>
          </Card>
        </div>

        <Card title="系统光标缩放" desc="直接修改 Windows 光标尺寸设置，影响所有程序">
          <SettingRow label="缩放比例" hint="修改后立即生效；恢复默认请选择 100%">
            <Segmented
              value={String(cursor.scale)}
              options={SCALE_OPTIONS}
              onChange={(v) => patch({ cursorFx: { scale: Number(v) } })}
            />
          </SettingRow>
        </Card>
      </div>
    </div>
  );
}
