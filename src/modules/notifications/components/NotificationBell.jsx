// =============================================================
// Notifications Module — NotificationBell
//
// Bell icon with unread badge. Click opens dropdown panel.
// Closes on outside click or Escape key.
// =============================================================
import { useState, useEffect, useRef, useCallback } from 'react';
import { useNotifications }  from '../hooks/useNotifications';
import { NotificationPanel } from './NotificationPanel';
import { cn }                from '@utils/classNames';

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const ref             = useRef(null);

  const { unreadCount, loading, realtimeActive } = useNotifications({
    realtime: true,
    autoLoad: true,
    autoToast: false, // ToastContainer handles toasts globally
  });

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handler(e) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  const displayCount = Math.min(unreadCount, 99);

  return (
    <div ref={ref} className="relative">
      {/* Bell button */}
      <button
        type="button"
        aria-label="الإشعارات"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((p) => !p)}
        className={cn(
          'relative flex items-center justify-center w-9 h-9 rounded-xl',
          'text-muted hover:text-text hover:bg-border/30 transition-colors',
          open && 'bg-border/30 text-text',
        )}
      >
        {/* Bell SVG */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-5 h-5"
        >
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>

        {/* Unread badge */}
        {displayCount > 0 && (
          <span className={cn(
            'absolute -top-1 -left-1 min-w-[1.1rem] h-[1.1rem] px-0.5',
            'flex items-center justify-center rounded-full',
            'bg-red text-white text-[10px] font-bold leading-none',
          )}>
            {displayCount > 9 ? '9+' : displayCount}
          </span>
        )}

        {/* Realtime pulse dot */}
        {realtimeActive && (
          <span className="absolute bottom-1 left-1 w-1.5 h-1.5 rounded-full bg-teal" />
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          className={cn(
            'absolute z-50 top-full mt-2',
            // RTL: align panel to the right edge of the bell on mobile
            'left-0 sm:right-0 sm:left-auto',
            'w-80 sm:w-96',
            'max-h-[80vh]',
            'bg-surface border border-border rounded-2xl shadow-lg',
            'overflow-hidden flex flex-col',
            'animate-fadeIn',
          )}
        >
          <NotificationPanel onClose={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}
