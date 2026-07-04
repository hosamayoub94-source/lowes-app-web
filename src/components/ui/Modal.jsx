// =============================================================
// Modal — centered dialog. Esc closes, click outside closes,
// body scroll locked while open. Composable header/body/footer.
// =============================================================
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@utils/classNames';

const SIZES = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  full: 'max-w-3xl',
};

export function Modal({
  open,
  onClose,
  size = 'md',
  closeOnBackdrop = true,
  className = '',
  children,
  labelledBy,
}) {
  const dialogRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    // احفظ العنصر المركّز حالياً لاستعادته عند الإغلاق.
    const prevFocus = document.activeElement;
    const FOCUSABLE = 'a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])';
    const focusables = () => Array.from(dialog?.querySelectorAll(FOCUSABLE) || [])
      .filter((el) => el.offsetParent !== null);
    // ركّز أول عنصر داخل النافذة (أو النافذة نفسها).
    const first = focusables()[0];
    (first || dialog)?.focus?.();

    const onKey = (e) => {
      if (e.key === 'Escape') { onClose?.(); return; }
      if (e.key !== 'Tab') return;
      // حصر التركيز داخل النافذة (focus trap).
      const els = focusables();
      if (els.length === 0) { e.preventDefault(); return; }
      const firstEl = els[0], lastEl = els[els.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) { e.preventDefault(); lastEl.focus(); }
      else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); firstEl.focus(); }
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
      // استعادة التركيز للعنصر الذي فتح النافذة.
      if (prevFocus && typeof prevFocus.focus === 'function') prevFocus.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
    >
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-fadeIn"
        onClick={() => closeOnBackdrop && onClose?.()}
      />
      <div
        ref={dialogRef}
        tabIndex={-1}
        className={cn(
          'relative w-full bg-surface text-text rounded-2xl shadow-soft border border-border outline-none',
          'max-h-[90vh] overflow-hidden flex flex-col animate-slideUp',
          SIZES[size] || SIZES.md,
          className,
        )}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function ModalHeader({ title, onClose, subtitle, className = '' }) {
  return (
    <div className={cn('flex items-start gap-3 p-5 border-b border-border', className)}>
      <div className="flex-1 min-w-0">
        {title && <h2 className="text-lg font-bold truncate">{title}</h2>}
        {subtitle && <p className="text-sm text-muted mt-0.5">{subtitle}</p>}
      </div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="w-9 h-9 rounded-xl hover:bg-surface-alt grid place-items-center text-muted shrink-0"
          aria-label="Close"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      )}
    </div>
  );
}

export function ModalBody({ className = '', children }) {
  return (
    <div className={cn('p-5 overflow-y-auto flex-1', className)}>{children}</div>
  );
}

export function ModalFooter({ className = '', children }) {
  return (
    <div className={cn('flex items-center justify-end gap-2 p-4 border-t border-border bg-surface-alt/40', className)}>
      {children}
    </div>
  );
}

export default Modal;
