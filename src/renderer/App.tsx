/**
 * 应用外壳
 * 组合：标题栏 + 侧边导航 + 顶部状态栏 + 页面内容
 */
import { useEffect, useState } from 'react';
import { ColorPickerModal } from './components/ColorPickerModal';
import { Sidebar } from './components/Sidebar';
import { Toasts } from './components/Toasts';
import { TopBar } from './components/TopBar';
import { WindowControls } from './components/WindowControls';
import { useAppearance } from './hooks/useAppearance';
import { CursorFxPage } from './pages/CursorFxPage';
import { DashboardPage } from './pages/DashboardPage';
import { SettingsPage } from './pages/SettingsPage';
import { useAppStore, type PageKey } from './store/appStore';

export function App() {
  const page = useAppStore((s) => s.page);
  const setPage = useAppStore((s) => s.setPage);
  const ready = useAppStore((s) => s.ready);
  const init = useAppStore((s) => s.init);
  const status = useAppStore((s) => s.status);
  const message = useAppStore((s) => s.status?.message);
  const toast = useAppStore((s) => s.toast);

  const [maximized, setMaximized] = useState(false);

  // 强调色 / 深浅色 / 玻璃强度
  useAppearance();

  useEffect(() => {
    void init();
  }, [init]);

  useEffect(() => window.api.win.onMaximizedChanged(setMaximized), []);

  // 主进程的状态提示通过 Toast 展示
  useEffect(() => {
    if (message) toast(message);
  }, [message, toast]);

  return (
    <div className="app-shell" data-maximized={maximized}>
      <header className="titlebar">
        <span className="titlebar__logo" aria-hidden>
          ✦
        </span>
        <span className="titlebar__title">桌面UI美化</span>
        <span className="titlebar__sub">{status?.windowsName ?? ''}</span>
        <span className="titlebar__spacer" />
        <WindowControls />
      </header>

      <div className="app-body">
        <Sidebar />
        <main className="main">
          <TopBar />
          <div className="content">
            {ready ? <PageRouter page={page} onNavigate={setPage} /> : <p className="dim">正在初始化…</p>}
          </div>
        </main>
      </div>

      <ColorPickerModal />
      <Toasts />
    </div>
  );
}

function PageRouter({ page, onNavigate }: { page: PageKey; onNavigate: (page: PageKey) => void }) {
  switch (page) {
    case 'cursor':
      return <CursorFxPage />;
    case 'settings':
      return <SettingsPage />;
    case 'dashboard':
    default:
      return <DashboardPage onNavigate={onNavigate} />;
  }
}
