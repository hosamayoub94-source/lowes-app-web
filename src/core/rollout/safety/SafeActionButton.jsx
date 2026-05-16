// =============================================================
// SafeActionButton — Button with built-in safety guards
//
// Drop-in replacement for any destructive action button.
// Handles: confirm dialog, duplicate prevention, loading state.
//
// Usage:
//   <SafeActionButton
//     danger
//     confirmTitle="حذف المهمة"
//     confirmMessage="هل أنت متأكد من حذف هذه المهمة؟"
//     onConfirm={() => deleteTask(id)}
//   >
//     حذف
//   </SafeActionButton>
// =============================================================
import { useState, useCallback } from 'react';
import { useConfirm }           from './ConfirmDialog';
import { guardDuplicate }       from './safetyGuards';

export function SafeActionButton({
  children,
  onConfirm,
  confirmTitle   = 'تأكيد الإجراء',
  confirmMessage = 'هل أنت متأكد من تنفيذ هذا الإجراء؟',
  danger         = false,
  confirmLabel   = 'تأكيد',
  cancelLabel    = 'إلغاء',
  lockKey        = null,
  lockTtlMs      = 3_000,
  skipConfirm    = false,
  disabled       = false,
  className      = '',
  size           = 'md',
  ...rest
}) {
  const confirm = useConfirm();
  const [loading, setLoading] = useState(false);

  const handleClick = useCallback(async () => {
    if (disabled || loading) return;

    // Duplicate guard
    const key = lockKey ?? `safe_btn_${confirmTitle}`;
    if (!guardDuplicate(key, lockTtlMs)) return;

    // Confirm gate
    if (!skipConfirm) {
      const ok = await confirm({
        title:        confirmTitle,
        message:      confirmMessage,
        danger,
        confirmLabel,
        cancelLabel,
      });
      if (!ok) return;
    }

    setLoading(true);
    try {
      await onConfirm?.();
    } finally {
      setLoading(false);
    }
  }, [disabled, loading, lockKey, confirmTitle, confirmMessage, danger, confirmLabel, cancelLabel, skipConfirm, onConfirm, confirm, lockTtlMs]);

  const sizeClasses = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2 text-sm',
    lg: 'px-5 py-2.5 text-base',
  }[size] ?? 'px-4 py-2 text-sm';

  const colorClasses = danger
    ? 'bg-red-600 hover:bg-red-700 text-white shadow-red-500/20'
    : 'bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200';

  return (
    <button
      {...rest}
      onClick={handleClick}
      disabled={disabled || loading}
      className={`
        inline-flex items-center justify-center gap-2 rounded-xl font-medium
        transition-all duration-150 active:scale-95 shadow
        disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100
        ${sizeClasses} ${colorClasses} ${className}
      `}
    >
      {loading ? (
        <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
      ) : null}
      {children}
    </button>
  );
}

export default SafeActionButton;
