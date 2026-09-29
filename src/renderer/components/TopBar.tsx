/** 顶部状态栏：实时显示当前生效的美化模块 */
import { useAppStore } from '../store/appStore';

type DotKind = 'on' | 'off' | 'warn' | 'error';

function Chip({ label, value, dot }: { label: string; value: string; dot: DotKind }) {
  return (
    <span className={`chip${dot === 'on' ? ' chip--active' : ''}`}>
      <i className={`dot dot--${dot}`} />
      <span className="dim">{label}</span>
      <strong style={{ fontWeight: 560 }}>{value}</strong>
    </span>
  );
}

export function TopBar() {
  const status = useAppStore((s) => s.status);
  const config = useAppStore((s) => s.config);
  const toast = useAppStore((s) => s.toast);

  const cursorDot: DotKind = !config.cursorFx.enabled ? 'off' : status?.cursorOverlayActive ? 'on' : 'warn';

  const handleTogglePause = async () => {
    const next = await window.api.app.setPaused(!(status?.paused ?? false));
    toast(next.paused ? '美化已暂停' : '美化已恢复', next.paused ? 'info' : 'success');
  };

  return (
    <div className="topbar">
      <Chip label="光标" value={config.cursorFx.enabled ? (status?.cursorOverlayActive ? '特效中' : '待生效') : '关闭'} dot={cursorDot} />

      <span className="topbar__spacer" />

      {status?.paused ? <span className="chip chip--active">已暂停</span> : null}

      <button className="btn btn--sm" type="button" onClick={handleTogglePause}>
        {status?.paused ? '恢复美化' : '暂停美化'}
      </button>
      <button
        className="btn btn--primary btn--sm"
        type="button"
        onClick={() => {
          void window.api.config.get().then((cfg) => {
            void window.api.cursor.sync(cfg.cursorFx);
          });
          toast('已重新应用光标特效', 'success');
        }}
      >
        全部应用
      </button>
    </div>
  );
}
