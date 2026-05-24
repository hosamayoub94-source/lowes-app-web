// =============================================================
// RequestCard — single request card (theme-aware)
// =============================================================
import {
  REQUEST_TYPE_LABELS,
  REQUEST_TYPE_ICONS,
  REQUEST_STATUS_LABELS,
  LEAVE_TYPE_LABELS,
  requestStatusColor,
} from '../types/requests.types.js';

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function RequestCard({ request, onApprove, onReject, onCancel, canDecide, isOwn }) {
  const icon      = REQUEST_TYPE_ICONS[request.request_type] ?? '📝';
  const badge     = requestStatusColor(request.status);
  const typeLabel = REQUEST_TYPE_LABELS[request.request_type] ?? request.request_type;
  const isPending = request.status === 'pending';

  return (
    <div className="bg-surface border border-border rounded-xl p-4 flex flex-col gap-3 hover:shadow-sm transition">
      {/* Top row: icon + name + status */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-surface-alt flex items-center justify-center text-lg flex-shrink-0">
            {icon}
          </div>
          <div>
            <p className="text-sm font-bold text-text leading-tight">{request.employee_name}</p>
            <p className="text-xs text-muted mt-0.5">{typeLabel}</p>
          </div>
        </div>
        <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap flex-shrink-0 ${badge}`}>
          {REQUEST_STATUS_LABELS[request.status] ?? request.status}
        </span>
      </div>

      {/* Details */}
      <div className="space-y-1.5">
        {request.reason && (
          <p className="text-xs text-muted line-clamp-2">{request.reason}</p>
        )}

        {/* Leave details */}
        {request.request_type === 'leave' && (
          <div className="flex flex-wrap gap-2 text-xs">
            {request.leave_type && (
              <span className="bg-surface-alt text-text px-2 py-0.5 rounded-full">
                {LEAVE_TYPE_LABELS[request.leave_type] ?? request.leave_type}
              </span>
            )}
            {request.leave_from && (
              <span className="text-muted">
                📅 {formatDate(request.leave_from)}
                {request.leave_to && ` — ${formatDate(request.leave_to)}`}
                {request.leave_days && <span className="text-teal font-semibold ml-1">({request.leave_days} أيام)</span>}
              </span>
            )}
          </div>
        )}

        {/* Advance details */}
        {request.request_type === 'advance' && request.advance_amount && (
          <div className="flex items-center gap-1.5 text-xs">
            <span className="bg-green-bg text-green-fg font-bold px-2.5 py-0.5 rounded-full">
              💵 {Number(request.advance_amount).toLocaleString('ar-EG')} {request.advance_currency}
            </span>
          </div>
        )}

        {/* Decision note */}
        {request.decision_note && (
          <p className="text-xs text-muted italic bg-surface-alt rounded-lg px-2.5 py-1.5">
            💬 {request.decision_note}
          </p>
        )}
      </div>

      {/* Bottom row: date + actions */}
      <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/30">
        <span className="text-[11px] text-muted">{formatDate(request.created_at)}</span>

        <div className="flex gap-1.5">
          {canDecide && isPending && (
            <>
              <button
                onClick={() => onApprove?.(request.id)}
                className="px-3 py-1.5 rounded-lg bg-green-bg text-green-fg text-xs font-bold hover:opacity-80 transition border border-green/20"
              >
                ✓ موافقة
              </button>
              <button
                onClick={() => onReject?.(request.id)}
                className="px-3 py-1.5 rounded-lg bg-red-bg text-red-fg text-xs font-bold hover:opacity-80 transition border border-red/20"
              >
                ✕ رفض
              </button>
            </>
          )}

          {isOwn && isPending && !canDecide && (
            <button
              onClick={() => onCancel?.(request.id)}
              className="px-3 py-1.5 rounded-lg bg-surface-alt text-muted text-xs font-bold hover:text-text transition border border-border/30"
            >
              إلغاء
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default RequestCard;
