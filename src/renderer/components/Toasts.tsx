/** 轻量全局提示 */
import { useAppStore } from '../store/appStore';

export function Toasts() {
  const toasts = useAppStore((s) => s.toasts);

  if (toasts.length === 0) return null;

  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="toast" data-kind={t.kind}>
          {t.text}
        </div>
      ))}
    </div>
  );
}
