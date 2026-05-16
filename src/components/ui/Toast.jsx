// =============================================================
// Toast — single toast item; the container renders many.
// =============================================================
import { cn } from '@utils/classNames';

const TONES = {
  success: 'bg-green text-white',
  error: 'bg-red text-white',
  info: 'bg-navy text-white',
  warning: 'bg-amber text-white',
};

const ICONS = {
  success: '✓',
  error: '✕',
  info: 'i',
  warning: '!',
};

export function Toast({ kind = 'success', message, onDismiss, className = '' }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'pointer-events-auto flex items-center gap-3 min-w-[260px] max-w-md px-4 py-3 rounded-2xl shadow-soft',
        'animate-slideUp',
        TONES[kind] || TONES.info,
        className,
      )}
    >
      <span className="w-6 h-6 grid place-items-center rounded-full bg-white/20 font-bold text-sm shrink-0">
        {ICONS[kind] || ICONS.info}
      </span>
      <div className="flex-1 text-sm font-medium leading-snug">{message}</div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Close"
          className="opacity-80 hover:opacity-100 ms-2"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      )}
    </div>
  );
}

export default Toast;
