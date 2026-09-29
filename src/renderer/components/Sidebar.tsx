/** 左侧导航栏 */
import { useAppStore, type PageKey } from '../store/appStore';

interface NavItem {
  key: PageKey;
  label: string;
  icon: string;
  /** 该模块是否已启用（用于显示状态点） */
  enabled: (config: ReturnType<typeof useAppStore.getState>['config']) => boolean;
}

const NAV_ITEMS: NavItem[] = [
  { key: 'dashboard', label: '首页', icon: '⌂', enabled: () => false },
  { key: 'cursor', label: '光标', icon: '✜', enabled: (c) => c.cursorFx.enabled },
  { key: 'settings', label: '设置', icon: '⚙', enabled: () => false },
];

export function Sidebar() {
  const page = useAppStore((s) => s.page);
  const setPage = useAppStore((s) => s.setPage);
  const config = useAppStore((s) => s.config);

  return (
    <nav className="sidebar" aria-label="主导航">
      <div className="sidebar__group">功能</div>
      {NAV_ITEMS.slice(0, 2).map((item) => (
        <NavButton
          key={item.key}
          item={item}
          active={page === item.key}
          enabled={item.enabled(config)}
          onClick={() => setPage(item.key)}
        />
      ))}

      <div className="sidebar__group">系统</div>
      {NAV_ITEMS.slice(2).map((item) => (
        <NavButton
          key={item.key}
          item={item}
          active={page === item.key}
          enabled={item.enabled(config)}
          onClick={() => setPage(item.key)}
        />
      ))}

      <div style={{ flex: 1 }} />
      <p className="dim" style={{ margin: '0 8px', fontSize: 10.5, lineHeight: 1.6 }}>
        桌面UI美化 v1.0.0
        <br />
        Electron + React + Win32
      </p>
    </nav>
  );
}

function NavButton({
  item,
  active,
  enabled,
  onClick,
}: {
  item: NavItem;
  active: boolean;
  enabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`nav-item${active ? ' nav-item--active' : ''}`}
      aria-current={active ? 'page' : undefined}
      onClick={onClick}
    >
      <span className="nav-item__icon" aria-hidden>
        {item.icon}
      </span>
      <span>{item.label}</span>
      {enabled ? <span className="nav-item__dot" title="已启用" /> : null}
    </button>
  );
}
