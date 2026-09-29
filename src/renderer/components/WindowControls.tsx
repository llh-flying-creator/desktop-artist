/** 自定义标题栏的最小化 / 最大化 / 关闭按钮 */
import { useEffect, useState } from 'react';

const ICON_SIZE = 10;

export function WindowControls() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    void window.api.win.isMaximized().then(setMaximized);
    return window.api.win.onMaximizedChanged(setMaximized);
  }, []);

  return (
    <div className="win-controls">
      <button type="button" title="最小化" onClick={() => void window.api.win.minimize()}>
        <svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 10 10" aria-hidden>
          <line x1="0" y1="5" x2="10" y2="5" stroke="currentColor" strokeWidth="1" />
        </svg>
      </button>
      <button
        type="button"
        title={maximized ? '还原' : '最大化'}
        onClick={() => void window.api.win.maximize().then(setMaximized)}
      >
        {maximized ? (
          <svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 10 10" aria-hidden>
            <rect x="0.5" y="2.5" width="7" height="7" fill="none" stroke="currentColor" strokeWidth="1" />
            <path d="M2.5 2.5V0.5h7v7h-2" fill="none" stroke="currentColor" strokeWidth="1" />
          </svg>
        ) : (
          <svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 10 10" aria-hidden>
            <rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="1" />
          </svg>
        )}
      </button>
      <button type="button" data-role="close" title="关闭" onClick={() => void window.api.win.close()}>
        <svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 10 10" aria-hidden>
          <path d="M0 0l10 10M10 0L0 10" stroke="currentColor" strokeWidth="1.1" fill="none" />
        </svg>
      </button>
    </div>
  );
}
