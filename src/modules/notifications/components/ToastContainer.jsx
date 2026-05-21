// =============================================================
// Notifications Module — ToastContainer
//
// Renders a stacked list of live notification toasts in the
// bottom-left corner (RTL: bottom-right visually).
// Auto-dismissed by useNotifications after TOAST_DURATION_MS.
// Mount once at the app root (inside MainLayout or App).
// =============================================================
import { useEffect }           from 'react';
import { getTypeMeta }         from '../types/notification.types';
import { useNotificationStore,
         selectToasts,
         TOAST_DURATION_MS }   from '../store/useNotificationStore';
import { cn }                  from '@utils/classNames';

const SEVERITY_BORDER = {
  info:     'border-blue/40',
  warning:  'border-amber/60',
  critical: 'border-red/60',
};

function Toast({ toast, onDismiss }) {
  const { icon, label, colorClass } = getTypeMeta(toast.type);

  // Progress bar — visual countdown
  return (
    <div
      role="alert"
      aria-live="polite"
      className={cn(
        'relative flex items-start gap-3 w-80 rounded-xl px-3.5 py-3',
        'bg-surface border shadow-lg overflow-hidden',
        SEVERITY_BORDER[toast.severity] ?? 'border-border',
        'animate-slideUp',
      )}
    >
      {/* Icon */}
      <span
        className={cn(
          'flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-lg text-sm',
          colorClass,
        )}
      >
        {icon}
      </span>

      {/* Text */}
      <div className="flex-1 min-w-0 text-right">
        <p className="text-sm font-semibold text-text leading-snug truncate">
          {toast.title}
        </p>
        {toast.message && (
          <p className="text-xs text-muted mt-0.5 line-clamp-2">
            {toast.message}
          </p>
        )}
      </div>

      {/* Close button */}
      <button
        type="button"
        aria-label="إغلاق"
        onClick={() => onDismiss(toast._toastId)}
        className="flex-shrink-0 text-muted hover:text-text transition-colors mt-0.5"
      >
        <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="currentColor">
          <path d="M4.293 4.293a1 1 0 011.414 0L8 6.586l2.293-2.293a1 1 0 111.414 1.414L9.414 8l2.293 2.293a1 1 0 01-1.414 1.414L8 9.414l-2.293 2.293a1 1 0 01-1.414-1.414L6.586 8 4.293 5.707a1 1 0 010-1.414z" />
        </svg>
      </button>

      {/* Progress bar */}
      <span
        className="absolute bottom-0 left-0 h-0.5 bg-teal/60 animate-notifShrink"
        style={{ animationDuration: `${TOAST_DURATION_MS}ms` }}
      />
    </div>
  );
}

export function ToastContainer() {
  const toasts      = useNotificationStore(selectToasts);
  const dismissToast = useNotificationStore((s) => s.dismissToast);

  // Max 5 toasts visible at once
  const visible = toasts.slice(-5);

  if (!visible.length) return null;

  return (
    <div
      aria-label="الإشعارات الحية"
      className={cn(
        'fixed bottom-4 left-4 z-[100]',
        'flex flex-col-reverse gap-2',
        'pointer-events-none',
        // All children get pointer-events back
        '[&>*]:pointer-events-auto',
      )}
    >
      {visible.map((toast) => (
        <Toast key={toast._toastId} toast={toast} onDismiss={dismissToast} />
      ))}
    </div>
  );
}
