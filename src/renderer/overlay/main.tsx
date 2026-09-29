/** 光标特效覆盖层入口（独立 BrowserWindow） */
import { createRoot } from 'react-dom/client';
import { OverlayStage } from './OverlayStage';

const container = document.getElementById('root');
if (container) createRoot(container).render(<OverlayStage />);
