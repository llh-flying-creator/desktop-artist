/** 首页：总览当前生效的模块与系统能力 */
import { Card, Notice } from '../components/Card';
import { useAppStore, type PageKey } from '../store/appStore';

export function DashboardPage({ onNavigate }: { onNavigate: (page: PageKey) => void }) {
  const status = useAppStore((s) => s.status);
  const config = useAppStore((s) => s.config);
  const toast = useAppStore((s) => s.toast);

  const resetAll = async () => {
    const next = await window.api.config.reset();
    useAppStore.getState().replaceConfig(next);
    toast('已恢复系统默认设置', 'success');
  };

  return (
    <div className="page">
      <div className="page__head">
        <h2 className="page__title">欢迎使用桌面UI美化</h2>
        <p className="page__desc">
          只做一件事：为鼠标加上拖尾与点击涟漪。全部绘制在透明覆盖层上，不修改任何系统窗口、不写注册表。
        </p>
      </div>

      <div className="grid" style={{ marginBottom: 12 }}>
        <Card glass>
          <div className="hero">
            <div className="hero__ring" aria-hidden>
              ✦
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h3 style={{ margin: 0, fontSize: 15 }}>
                {status?.paused ? '特效已暂停' : config.cursorFx.enabled ? '光标特效正在生效' : '光标特效未启用'}
              </h3>
              <p className="muted" style={{ margin: '3px 0 0', fontSize: 12 }}>
                {status?.windowsName ?? '正在读取系统信息…'}
                {status && !status.nativeReady ? ' · 原生模块不可用' : ''}
                {status && config.cursorFx.enabled && !status.cursorOverlayActive ? ' · 覆盖层待生效' : ''}
              </p>
            </div>
            <div className="row-inline">
              <button className="btn" type="button" onClick={() => void resetAll()}>
                恢复系统默认
              </button>
              <button
                className="btn btn--primary"
                type="button"
                onClick={() => {
                  void window.api.cursor.sync(config.cursorFx);
                  toast('已重新应用光标特效', 'success');
                }}
              >
                全部应用
              </button>
            </div>
          </div>
        </Card>
      </div>

      {status && !status.nativeReady ? (
        <div style={{ marginBottom: 12 }}>
          <Notice kind="error">{status.nativeError}</Notice>
        </div>
      ) : null}

      <div className="grid" style={{ marginBottom: 12 }}>
        <ModuleCard
          title="光标特效"
          enabled={config.cursorFx.enabled}
          applied={status?.cursorOverlayActive ?? false}
          detail={
            config.cursorFx.enabled
              ? `${config.cursorFx.trail.style === 'glow' ? '光晕' : config.cursorFx.trail.style === 'gradient' ? '渐变' : '粒子'}拖尾 · ${config.cursorFx.ripple.enabled ? '含涟漪' : '无涟漪'} · 光标 ${config.cursorFx.scale * 100}%`
              : '拖尾、点击涟漪、系统光标缩放'
          }
          onOpen={() => onNavigate('cursor')}
        />
      </div>

      <div className="grid grid--2">
        <Card title="系统信息" desc="用于判断哪些特性可用">
          <div className="kv">
            <span>系统版本</span>
            <span>{status?.windowsName ?? '—'}</span>
          </div>
          <div className="kv">
            <span>构建号</span>
            <span>{status?.windowsBuild ?? '—'}</span>
          </div>
          <div className="kv">
            <span>原生 FFI 模块</span>
            <span>{status?.nativeReady ? '正常' : '不可用'}</span>
          </div>
          <div className="kv">
            <span>主界面亚克力背景</span>
            <span>{status?.selfAcrylic ? '已启用' : '回退为纯色'}</span>
          </div>
          <div className="kv">
            <span>光标覆盖层</span>
            <span>{status?.overlayAvailable ? (status.cursorOverlayActive ? '运行中' : '就绪') : '不可用'}</span>
          </div>
        </Card>

        <Card title="原生能力自检" desc="失败项会自动降级，不影响其它功能">
          <div className="stack">
            {status?.features.map((f) => (
              <div className="row" key={f.key}>
                <div className="row__label">
                  <strong>{f.label}</strong>
                  {f.detail ? <span>{f.detail}</span> : null}
                </div>
                <i className={`dot dot--${f.ok ? 'on' : 'error'}`} />
              </div>
            ))}
            {!status ? <span className="dim">读取中…</span> : null}
          </div>
        </Card>
      </div>
    </div>
  );
}

function ModuleCard({
  title,
  enabled,
  applied,
  detail,
  onOpen,
}: {
  title: string;
  enabled: boolean;
  applied: boolean;
  detail: string;
  onOpen: () => void;
}) {
  const dot = !enabled ? 'off' : applied ? 'on' : 'warn';
  return (
    <Card
      title={
        <span className="row-inline">
          <i className={`dot dot--${dot}`} />
          {title}
        </span>
      }
      extra={
        <button className="btn btn--sm btn--ghost" type="button" onClick={onOpen}>
          配置
        </button>
      }
    >
      <p className="muted" style={{ margin: 0, fontSize: 11.5 }}>
        {detail}
      </p>
    </Card>
  );
}
