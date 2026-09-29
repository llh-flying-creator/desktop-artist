/** 玻璃卡片与设置行容器 */
import type { ReactNode } from 'react';

interface CardProps {
  title?: ReactNode;
  desc?: ReactNode;
  icon?: ReactNode;
  /** 是否使用更强的玻璃渐变背景 */
  glass?: boolean;
  className?: string;
  children?: ReactNode;
  /** 右上角操作区 */
  extra?: ReactNode;
}

export function Card({ title, desc, icon, glass, className, children, extra }: CardProps) {
  return (
    <section className={`card${glass ? ' card--glass' : ''}${className ? ` ${className}` : ''}`}>
      {(title || extra) && (
        <header className="card__head">
          {icon ? <span aria-hidden>{icon}</span> : null}
          <div style={{ flex: 1, minWidth: 0 }}>
            {title ? <h3 className="card__title">{title}</h3> : null}
            {desc ? <p className="card__desc">{desc}</p> : null}
          </div>
          {extra}
        </header>
      )}
      <div className="card__body">{children}</div>
    </section>
  );
}

interface SettingRowProps {
  label: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  /** 纵向排列（控件较宽时使用） */
  stack?: boolean;
}

export function SettingRow({ label, hint, children, stack }: SettingRowProps) {
  return (
    <div className={`row${stack ? ' row--stack' : ''}`}>
      <div className="row__label">
        <strong>{label}</strong>
        {hint ? <span>{hint}</span> : null}
      </div>
      <div className="row__control">{children}</div>
    </div>
  );
}

/** 提示条 */
export function Notice({
  children,
  kind = 'warn',
}: {
  children: ReactNode;
  kind?: 'warn' | 'error' | 'ok';
}) {
  return (
    <div className="notice" data-kind={kind}>
      <span aria-hidden>{kind === 'error' ? '⚠' : kind === 'ok' ? '✔' : 'ⓘ'}</span>
      <span>{children}</span>
    </div>
  );
}
