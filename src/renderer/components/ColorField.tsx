/**
 * 颜色字段
 * 支持三种取值：'' = 跟随系统默认，'none' = 不绘制，'#RRGGBB' = 自定义
 * 点击色块会打开吸色器（截屏取色 + 手动输入）
 */
import { useState, type CSSProperties } from 'react';
import { isHexColor } from '@shared/color';
import { useAppStore } from '../store/appStore';

interface ColorFieldProps {
  value: string;
  onChange: (value: string) => void;
  /** 允许"不绘制" */
  allowNone?: boolean;
  /** 允许"跟随系统默认" */
  allowDefault?: boolean;
  /** 吸色器目标标识（用于调试与语义化） */
  pickerId: string;
}

export function ColorField({ value, onChange, allowNone = true, allowDefault = true, pickerId }: ColorFieldProps) {
  const openPicker = useAppStore((s) => s.openPicker);
  const [draft, setDraft] = useState<string | null>(null);

  const isHex = isHexColor(value);
  const shown = draft ?? (isHex ? value.toUpperCase() : value === 'none' ? 'NONE' : 'AUTO');

  const commit = (raw: string) => {
    const text = raw.trim();
    if (isHexColor(text)) onChange(text.toLowerCase());
    else if (text === '' && allowDefault) onChange('');
    setDraft(null);
  };

  const swatchStyle: CSSProperties = isHex
    ? { background: value }
    : value === 'none'
      ? { background: 'transparent' }
      : { background: 'linear-gradient(135deg, var(--accent), var(--accent-2))' };

  return (
    <div className="color-field">
      <button
        type="button"
        className="swatch"
        title="点击使用吸色器"
        onClick={() => openPicker(pickerId, (hex) => onChange(hex))}
      >
        <span className="swatch__fill" style={swatchStyle} />
        {value === 'none' ? (
          <span
            style={{
              position: 'absolute',
              inset: 0,
              display: 'grid',
              placeItems: 'center',
              color: 'var(--text-muted)',
              fontSize: 12,
            }}
          >
            ⊘
          </span>
        ) : null}
      </button>

      <input
        className="color-field__hex"
        value={shown}
        spellCheck={false}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit((e.target as HTMLInputElement).value);
          if (e.key === 'Escape') setDraft(null);
        }}
      />

      {allowDefault ? (
        <button className="btn btn--sm btn--ghost" type="button" title="跟随系统默认" onClick={() => onChange('')}>
          默认
        </button>
      ) : null}
      {allowNone ? (
        <button className="btn btn--sm btn--ghost" type="button" title="不绘制该颜色" onClick={() => onChange('none')}>
          无
        </button>
      ) : null}
    </div>
  );
}
