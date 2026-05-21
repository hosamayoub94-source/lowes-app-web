// =============================================================
// Audit — AuditLogRow
// Single row in the audit log table / list.
// =============================================================
import { memo } from 'react';
import { cn } from '@utils/classNames';
import { SeverityBadge } from './SeverityBadge';
import { ENTITY_META } from '../types/audit.types';

function formatTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('ar-SA', {
    month:  'short', day: 'numeric',
    hour:   '2-digit', minute: '2-digit',
    hour12: false,
  });
}

function timeAgo(iso) {
  if (!iso) return '';
  const diff  = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60_000);
  if (mins < 1)  return 'الآن';
  if (mins < 60) return `منذ ${mins} د`;
  const hrs = Math.floor(mins / 60);
  if (hrs  < 24) return `منذ ${hrs} س`;
  return `منذ ${Math.floor(hrs / 24)} ي`;
}

function severityDot(s) {
  if (s === 'critical') return 'bg-red';
  if (s === 'warning')  return 'bg-amber';
  return 'bg-blue';
}

/**
 * @param {object}   props
 * @param {object}   props.log         — activity_logs row
 * @param {boolean}  [props.compact]   — condensed list mode vs table row
 * @param {function} [props.onClick]   — row click handler
 */
export const AuditLogRow = memo(function AuditLogRow({ log, compact = false, onClick }) {
  const entityMeta = ENTITY_META[log.entity_type] || { label: log.entity_type || '', icon: '📄' };

  if (compact) {
    return (
      <button
        type="button"
        onClick={() => onClick?.(log)}
        className="w-full text-start flex items-start gap-3 px-4 py-3 hover:bg-border/30 transition-colors border-b border-border last:border-0"
      >
        {/* Severity dot */}
        <span className={cn('mt-1.5 w-2 h-2 rounded-full flex-shrink-0', severityDot(log.severity))} />

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-text truncate">
              {log.action_label}
            </span>
            {log.entity_label && (
              <span className="text-xs text-muted truncate">
                {entityMeta.icon} {log.entity_label}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            {log.user_name && (
              <span className="text-xs text-muted">{log.user_name}</span>
            )}
            <span className="text-xs text-muted">{timeAgo(log.created_at)}</span>
          </div>
        </div>

        <SeverityBadge severity={log.severity} size="xs" />
      </button>
    );
  }

  // Table row mode
  return (
    <tr
      onClick={() => onClick?.(log)}
      className={cn(
        'border-b border-border last:border-0 hover:bg-border/30 transition-colors',
        onClick && 'cursor-pointer',
        log.severity === 'critical' && 'bg-red-bg/40',
      )}
    >
      {/* Severity dot */}
      <td className="px-3 py-3 w-8">
        <span className={cn('block w-2 h-2 rounded-full mx-auto', severityDot(log.severity))} />
      </td>

      {/* Time */}
      <td className="px-3 py-3 whitespace-nowrap">
        <span className="text-xs text-muted" title={log.created_at}>
          {formatTime(log.created_at)}
        </span>
      </td>

      {/* User */}
      <td className="px-3 py-3 max-w-[120px]">
        <span className="text-sm text-text truncate block">
          {log.user_name || '—'}
        </span>
      </td>

      {/* Action */}
      <td className="px-3 py-3">
        <span className="text-sm text-text">{log.action_label}</span>
      </td>

      {/* Entity */}
      <td className="px-3 py-3 max-w-[140px]">
        {log.entity_type ? (
          <span className="text-xs text-muted truncate block">
            {entityMeta.icon} {log.entity_label || log.entity_type}
          </span>
        ) : (
          <span className="text-muted text-xs">—</span>
        )}
      </td>

      {/* Severity badge */}
      <td className="px-3 py-3">
        <SeverityBadge severity={log.severity} />
      </td>
    </tr>
  );
});
