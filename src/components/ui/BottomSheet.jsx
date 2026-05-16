// =============================================================
// BottomSheet — mobile-first sheet that slides from the bottom.
// Use for action menus and forms on small screens. On desktop
// it gracefully behaves like a centered modal.
// =============================================================
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@utils/classNames';

export function BottomSheet({
  open,
  onClose,
  title,
  className = '',
  children,
  closeOnBackdrop = true,
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-fadeIn"
        onClick={() => closeOnBackdrop && onClose?.()}
      />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          'relative w-full sm:max-w-md bg-surface text-text border border-border',
          'rounded-t-3xl sm:rounded-2xl shadow-soft',
          'max-h-[85vh] overflow-hidden flex flex-col animate-slideUp',
          className,
        )}
      >
        <div className="pt-2 pb-1 grid place-items-center sm:hidden">
          <span className="w-10 h-1.5 rounded-full bg-border" aria-hidden />
        </div>
        {title && (
          <div className="px-5 py-3 border-b border-border">
            <h2 className="text-base font-bold">{title}</h2>
          </div>
        )}
        <div className="p-5 overflow-y-auto flex-1">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

export default BottomSheet;
