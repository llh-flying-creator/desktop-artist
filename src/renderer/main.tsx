/** 主界面渲染入口 */
import { createRoot } from 'react-dom/client';
import './styles/global.css';
import { App } from './App';

const container = document.getElementById('root');
if (!container) throw new Error('未找到 #root 挂载点');

// 不使用 StrictMode：避免开发模式下副作用（IPC 订阅）被重复执行
createRoot(container).render(<App />);
