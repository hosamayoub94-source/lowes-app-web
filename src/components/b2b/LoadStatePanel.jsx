// حالة فشل تحميل ليدز B2B: رسالة مفهومة + إعادة محاولة يدوية (لا retry تلقائي متكرر) — النص من b2bErrors.errorPanelCopy.
import { errorPanelCopy } from '@services/b2bErrors';

const ICON = { session: '🔑', forbidden: '🚫', not_deployed: '🛠️', migration: '🗄️', network: '📡', timeout: '⏱️', server: '⚠️' };

export default function LoadStatePanel({ err, onRetry }) {
  const c = errorPanelCopy(err);
  if (!c) return null;
  return (
    <div role="alert" data-testid={`load-error-${c.kind}`} className="rounded-2xl border border-red-200 bg-red-50 px-4 py-6 text-center space-y-2" dir="rtl">
      <p className="text-3xl" aria-hidden>{ICON[c.kind] || '⚠️'}</p>
      <p className="text-sm font-extrabold text-red-700">{c.message}</p>
      <p className="text-xs text-red-600">{c.hint}</p>
      {c.retryable && onRetry && (
        <button type="button" onClick={onRetry} data-testid="load-retry"
          className="mt-1 text-xs font-bold px-4 py-2 rounded-xl bg-white border border-red-300 text-red-700 hover:bg-red-100">
          🔄 إعادة المحاولة
        </button>
      )}
    </div>
  );
}

export function SlowLoadHint() {
  return <p className="text-xs text-muted text-center" data-testid="slow-load" role="status">التحميل أبطأ من المعتاد… سنوقفه تلقائياً إن طال أكثر ونعرض لك خيار إعادة المحاولة.</p>;
}
