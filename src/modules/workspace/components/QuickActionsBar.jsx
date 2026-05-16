// =============================================================
// QuickActionsBar v2 — adaptive, animated, role-aware actions
// =============================================================
import { useState } from 'react';
import { useQuickActions } from '../hooks/useQuickActions';

export function QuickActionsBar() {
  const { actions } = useQuickActions();
  const [loading, setLoading]   = useState(null);
  const [success, setSuccess]   = useState(null);

  const handleClick = async (action) => {
    if (!action.action || action.disabled) return;
    setLoading(action.id);
    try {
      await action.action();
      // Brief success flash
      setSuccess(action.id);
      setTimeout(() => setSuccess(null), 1200);
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none -mx-1 px-1">
      {actions.map((action) => {
        const isLoading = loading === action.id;
        const isSuccess = success === action.id;

        return (
          <button
            key={action.id}
            onClick={() => handleClick(action)}
            disabled={action.disabled || isLoading}
            title={action.label}
            className={`
              relative flex-none flex flex-col items-center gap-1.5
              px-3 py-2.5 rounded-xl text-xs font-medium
              transition-all duration-150 select-none
              min-w-[68px] max-w-[90px]
              ${action.color ?? 'bg-gray-100 text-gray-700'}
              ${action.disabled
                ? 'opacity-40 cursor-not-allowed'
                : 'hover:scale-105 active:scale-95 cursor-pointer hover:shadow-sm'}
              ${isSuccess ? 'scale-95 opacity-80' : ''}
            `}
          >
            {/* Pulse ring for urgent actions */}
            {action.pulse && !isLoading && (
              <span className="absolute inset-0 rounded-xl animate-ping opacity-20 bg-current" />
            )}

            {/* Badge count */}
            {action.badge != null && !isLoading && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-bold leading-none z-10">
                {action.badge > 9 ? '9+' : action.badge}
              </span>
            )}

            {/* Icon */}
            <span className="text-lg leading-none">
              {isLoading ? '⏳' : isSuccess ? '✓' : action.icon}
            </span>

            {/* Label */}
            <span className="whitespace-nowrap truncate w-full text-center leading-tight">
              {action.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export default QuickActionsBar;
