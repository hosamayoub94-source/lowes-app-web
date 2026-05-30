// =============================================================
// Notifications Module — NotificationItem
// Single notification row (used in panel + toast).
// =============================================================
import { getTypeMeta } from '../types/notification.types';
import { cn }          from '@utils/classNames';

function timeAgo(dateStr) {
  try {
    const seconds = Math.floor((Date.now() - new Date(dateStr)) / 1000);
    if (seconds < 60)  return 'الآن';
    const mins = Math.floor(seconds / 60);
    if (mins < 60)     return `منذ ${mins} دقيقة`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24)      return `منذ ${hrs} ساعة`;
    const days = Math.floor(hrs / 24);
    if (days === 1)    return 'أمس';
    if (days < 7)      return `منذ ${days} أيام`;
    return new Date(dateStr).toLocaleDateString('ar-SA-u-nu-latn-ca-gregory', { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

const SEVERITY_DOT = {
  info:     'bg-blue',
  warning:  'bg-amber',
  critical: 'bg-red',
};

/**
 * @param {object}   props
 * @param {object}   props.notification  — notification row from DB
 * @param {function} props.onRead        — called with notification.id
 * @param {boolean}  [props.compact]     — smaller padding for toast mode
 */
export function NotificationItem({ notification, onRead, compact = false }) {
  const { icon, label, colorClass } = getTypeMeta(notification.type);
  const isUnread = !notification.is_read;

  function handleClick() {
    if (isUnread) onRead?.(notification.id);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        'w-full text-right flex items-start gap-3 transition-colors',
        compact  ? 'px-3 py-2.5' : 'px-4 py-3',
        isUnread
          ? 'bg-surface hover:bg-border/30'
          : 'bg-cream hover:bg-border/20 opacity-75',
      )}
    >
      {/* Icon pill */}
      <span
        className={cn(
          'flex-shrink-0 flex items-center justify-center rounded-xl text-base',
          compact ? 'w-8 h-8 text-sm' : 'w-9 h-9',
          colorClass,
        )}
      >
        {icon}
      </span>

      {/* Content */}
      <div className="flex-1 min-w-0 text-right">
        <div className="flex items-center justify-between gap-2">
          <p className={cn(
            'text-sm leading-snug text-text truncate',
            isUnread && 'font-semibold',
          )}>
            {notification.title}
          </p>
          {isUnread && (
            <span className={cn(
              'flex-shrink-0 w-2 h-2 rounded-full',
              SEVERITY_DOT[notification.severity] ?? 'bg-blue',

            )} />
          )}
        </div>

        {notification.message && (
          <p className="text-xs text-muted mt-0.5 truncate">
            {notification.message}
          </p>
        )}

        <p className="text-xs text-muted/60 mt-1">
          {timeAgo(notification.created_at)}
        </p>
      </div>
    </button>
  );
}
