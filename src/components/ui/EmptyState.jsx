// =============================================================
// EmptyState — friendly placeholder for empty lists.
// =============================================================
import { cn } from '@utils/classNames';

export function EmptyState({
  icon,
  title = 'لا توجد بيانات',
  description,
  action,
  className = '',
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center px-4 py-10 rounded-2xl',
        'bg-surface border border-dashed border-border',
        className,
      )}
    >
      {icon && (
        <div className="w-14 h-14 rounded-2xl bg-surface-alt grid place-items-center mb-3 text-muted">
          {icon}
        </div>
      )}
      <h3 className="text-base font-bold text-text">{title}</h3>
      {description && (
        <p className="mt-1 text-sm text-muted max-w-sm">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export default EmptyState;
