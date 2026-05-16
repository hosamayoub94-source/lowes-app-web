// =============================================================
// ConfirmDialog — Reusable imperative confirmation modal
//
// Mount once in App.jsx. It registers itself with safetyGuards
// so guardDelete/guardBatch can call it imperatively.
//
// Also exports useConfirm() for component-level usage.
// =============================================================
import { useState, useEffect, useCallback, useRef } from 'react';
import { registerConfirmHandler } from './safetyGuards';

// ── Internal promise resolver ──────────────────────────────────
let _resolve = null;

// ── Hook: useConfirm ───────────────────────────────────────────
/**
 * Returns a confirm() function that opens the dialog.
 * Must have <ConfirmDialog /> mounted somewhere above.
 */
export function useConfirm() {
  return useCallback((options = {}) => {
    return new Promise((resolve) => {
      _resolve = resolve;
      // Dispatch a custom event to trigger the dialog
      window.dispatchEvent(new CustomEvent('__confirm_open', { detail: options }));
    });
  }, []);
}

// ── Main component ─────────────────────────────────────────────
export function ConfirmDialog() {
  const [state, setState] = useState({
    open:         false,
    title:        '',
    message:      '',
    danger:       false,
    confirmLabel: 'تأكيد',
    cancelLabel:  'إلغاء',
    detail:       null,
  });

  const confirmBtnRef = useRef(null);

  // Register with safetyGuards and listen to custom event
  useEffect(() => {
    const handler = (e) => {
      const detail = e.detail ?? {};
      setState({
        open:         true,
        title:        detail.title        ?? 'تأكيد الإجراء',
        message:      detail.message      ?? 'هل أنت متأكد؟',
        danger:       detail.danger       ?? false,
        confirmLabel: detail.confirmLabel ?? 'تأكيد',
        cancelLabel:  detail.cancelLabel  ?? 'إلغاء',
        detail:       detail.detail       ?? null,
      });
      // Auto-focus confirm button after render
      setTimeout(() => confirmBtnRef.current?.focus(), 50);
    };

    window.addEventListener('__confirm_open', handler);

    // Register as the imperative handler for safetyGuards
    registerConfirmHandler((options) => {
      return new Promise((resolve) => {
        _resolve = resolve;
        handler({ detail: options });
      });
    });

    return () => window.removeEventListener('__confirm_open', handler);
  }, []);

  // Keyboard: Escape = cancel, Enter = confirm
  useEffect(() => {
    if (!state.open) return;
    const handler = (e) => {
      if (e.key === 'Escape') handleCancel();
      if (e.key === 'Enter')  handleConfirm();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [state.open]);

  const handleConfirm = useCallback(() => {
    setState((s) => ({ ...s, open: false }));
    _resolve?.(true);
    _resolve = null;
  }, []);

  const handleCancel = useCallback(() => {
    setState((s) => ({ ...s, open: false }));
    _resolve?.(false);
    _resolve = null;
  }, []);

  if (!state.open) return null;

  return (
    <div
      className="fixed inset-0 z-[10002] flex items-center justify-center p-4"
      dir="rtl"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleCancel}
      />

      {/* Dialog */}
      <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-200">
        {/* Danger stripe */}
        {state.danger && (
          <div className="h-1 bg-red-500" />
        )}

        <div className="p-6">
          {/* Icon */}
          <div className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 ${
            state.danger ? 'bg-red-100 dark:bg-red-900/30' : 'bg-blue-100 dark:bg-blue-900/30'
          }`}>
            <span className="text-2xl">{state.danger ? '⚠️' : '❓'}</span>
          </div>

          {/* Title */}
          <h3
            id="confirm-title"
            className="text-lg font-bold text-center text-gray-900 dark:text-white mb-2"
          >
            {state.title}
          </h3>

          {/* Message */}
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center leading-relaxed">
            {state.message}
          </p>

          {/* Extra detail */}
          {state.detail && (
            <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-xl text-xs text-gray-600 dark:text-gray-400 text-center">
              {state.detail}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="px-6 pb-6 flex gap-3">
          <button
            onClick={handleCancel}
            className="flex-1 px-4 py-2.5 rounded-xl bg-gray-100 dark:bg-gray-800
                       hover:bg-gray-200 dark:hover:bg-gray-700
                       text-gray-700 dark:text-gray-300 text-sm font-medium
                       transition-all duration-150 active:scale-95"
          >
            {state.cancelLabel}
          </button>
          <button
            ref={confirmBtnRef}
            onClick={handleConfirm}
            className={`flex-1 px-4 py-2.5 rounded-xl text-white text-sm font-semibold
                        transition-all duration-150 active:scale-95 shadow-lg ${
              state.danger
                ? 'bg-red-600 hover:bg-red-700 shadow-red-500/25'
                : 'bg-blue-600 hover:bg-blue-700 shadow-blue-500/25'
            }`}
          >
            {state.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmDialog;
