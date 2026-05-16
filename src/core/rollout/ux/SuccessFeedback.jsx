// =============================================================
// SuccessFeedback — Micro-interaction success states
//
// Components:
//   • SuccessFlash — temporary green overlay flash on a container
//   • SuccessBadge — inline success chip
//   • useSuccessFeedback — hook for programmatic feedback
//   • SuccessToast — full-width toast (uses existing toast system if available)
// =============================================================
import { useState, useCallback, useEffect, memo } from 'react';

// ── useSuccessFeedback ─────────────────────────────────────────
export function useSuccessFeedback(durationMs = 1500) {
  const [state, setState] = useState({ showing: false, message: '' });

  const show = useCallback((message = '✓ تم بنجاح') => {
    setState({ showing: true, message });
    setTimeout(() => setState({ showing: false, message: '' }), durationMs);
  }, [durationMs]);

  return { ...state, show };
}

// ── SuccessFlash ───────────────────────────────────────────────
export const SuccessFlash = memo(function SuccessFlash({ showing, message = '✓ تم بنجاح', className = '' }) {
  return (
    <div
      className={`
        absolute inset-0 flex items-center justify-center rounded-xl
        transition-all duration-300 pointer-events-none z-10
        ${showing ? 'opacity-100' : 'opacity-0'}
        ${className}
      `}
    >
      <div className="bg-green-500 text-white text-sm font-semibold px-4 py-2 rounded-xl shadow-lg shadow-green-500/25 flex items-center gap-2">
        <span>✓</span>
        <span>{message}</span>
      </div>
    </div>
  );
});

// ── SuccessBadge ───────────────────────────────────────────────
export const SuccessBadge = memo(function SuccessBadge({ label = 'تم', className = '' }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs font-medium rounded-full ${className}`}>
      <span>✓</span>
      <span>{label}</span>
    </span>
  );
});

// ── SuccessToast ───────────────────────────────────────────────
let _toastQueue = [];
let _toastSetter = null;

export function registerToastSetter(setter) { _toastSetter = setter; }

export function showSuccessToast(message, durationMs = 3000) {
  const item = { id: Date.now(), message, durationMs };
  if (_toastSetter) {
    _toastSetter((prev) => [...prev.slice(-4), item]);
    setTimeout(() => _toastSetter((prev) => prev.filter((t) => t.id !== item.id)), durationMs);
  }
}

export function GlobalSuccessToasts() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    registerToastSetter(setToasts);
    return () => registerToastSetter(null);
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 inset-x-4 z-[10004] flex flex-col gap-2 items-center pointer-events-none" dir="rtl">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="bg-green-600 text-white text-sm font-medium px-5 py-3 rounded-xl shadow-lg shadow-green-600/20 flex items-center gap-2 animate-in slide-in-from-top-2 fade-in duration-200"
        >
          <span className="text-base">✅</span>
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}

// ── LoadingPulse ───────────────────────────────────────────────
export const LoadingPulse = memo(function LoadingPulse({ rows = 3, className = '' }) {
  return (
    <div className={`space-y-3 ${className}`} aria-busy="true" aria-label="جارٍ التحميل">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-12 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse"
          style={{ animationDelay: `${i * 100}ms` }}
        />
      ))}
    </div>
  );
});

// ── ActionFeedback — wraps any action button ───────────────────
export function ActionFeedback({ children, onAction, successMessage = 'تم بنجاح', className = '' }) {
  const { showing, show } = useSuccessFeedback(1200);

  const handleClick = useCallback(async () => {
    await onAction?.();
    show(successMessage);
  }, [onAction, show, successMessage]);

  return (
    <div className={`relative ${className}`} onClick={handleClick}>
      {children}
      <SuccessFlash showing={showing} message={successMessage} />
    </div>
  );
}
