/** 数值滑块（带进度填充与数值回显） */
import type { CSSProperties } from 'react';

interface SliderProps {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
  /** 右侧数值展示格式化 */
  format?: (value: number) => string;
  disabled?: boolean;
}

export function Slider({ value, min = 0, max = 100, step = 1, onChange, format, disabled }: SliderProps) {
  const ratio = max === min ? 0 : (value - min) / (max - min);
  const style = { '--fill': `${Math.round(ratio * 100)}%` } as CSSProperties;

  return (
    <div className="slider">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        style={style}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="slider__value">{format ? format(value) : value}</span>
    </div>
  );
}
