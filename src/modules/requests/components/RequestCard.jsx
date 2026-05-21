// =============================================================
// RequestCard — single request row/card
// =============================================================
import {
  REQUEST_TYPE_LABELS,
  REQUEST_TYPE_ICONS,
  REQUEST_STATUS_LABELS,
  requestStatusColor,
} from '../types/requests.types.js';

export function RequestCard({ request, onApprove, onReject, onCancel, canDecide, isOwn }) {
  const icon   = REQUEST_TYPE_ICONS[request.request_type] ?? '📝';
  const badge  = requestStatusColor(request.status);
  const typeLabel = REQUEST_TYPE_LABELS[request.request_type] ?? request.request_type;

  return (
    <div className="bg-surface border border-border rounded-xl p-4 hover:shadow-sm transition">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xl">{icon}</span>
          <div>
            <p className="text-sm font-semibold text-text">{request.employee_name}</p>
            <p className="text-xs text-muted">{typeLabel}</p>
          </div>
        </div>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${badge}`}>
          {REQUEST_STATUS_LABELS[request.status] ?? request.status}
        </span>
      </div>

      {request.reason && (
        <p className="text-xs text-muted mb-2 line-clamp-2">{request.reason}</p>
      )}

      {/* Leave details */}
      {request.request_type === 'leave' && request.leave_from && (
        <p className="text-xs text-text mb-2">
          📅 {request.leave_from} — {request.leave_to}
          {request.leave_days && <span className="text-muted mr-1">({request.leave_days} أيام)</span>}
        </p>
      )}

      {/* Advance details */}
      {request.request_type === 'advance' && request.advance_amount && (
        <p className="text-xs text-text mb-2">
          💵 {request.advance_amount} {request.advance_currency}
        </p>
      )}

      {/* Decision note */}
      {request.decision_note && (
        <p className="text-xs italic text-muted mb-2">ملاحظة: {request.decision_note}</p>
      )}

      <div className="flex items-center justify-between gap-2 mt-3">
        <span className="text-xs text-muted">
          {new Date(request.created_at).toLocaleDateString('ar-EG')}
        </span>

        {canDecide && request.status === 'pending' && (
          <div className="flex gap-1.5">
            <button
              onClick={() => onApprove?.(request.id)}
              className="px-3 py-1 rounded-lg bg-green-100 text-green-700 text-xs font-semibold hover:bg-green-200 transition"
            >
              موافقة
            </button>
            <button
              onClick={() => onReject?.(request.id)}
              className="px-3 py-1 rounded-lg bg-red-100 text-red-600 text-xs font-semibold hover:bg-red-200 transition"
            >
              رفض
            </button>
          </div>
        )}

        {isOwn && request.status === 'pending' && (
          <button
            onClick={() => onCancel?.(request.id)}
            className="px-3 py-1 rounded-lg bg-gray-100 text-gray-600 text-xs font-semibold hover:bg-gray-200 transition"
          >
            إلغاء
          </button>
        )}
      </div>
    </div>
  );
}

export default RequestCard;
