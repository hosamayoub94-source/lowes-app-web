// =============================================================
// AttendanceWidget — shows today's check-in/out status
// Uses real `attendance` table via useMyAttendanceToday hook
// =============================================================
import { useNavigate }          from 'react-router-dom';
import { useMyAttendanceToday } from '@hooks/useMyAttendanceToday';
import { ROUTES }               from '@routes/paths';

export function AttendanceWidget() {
  const navigate = useNavigate();
  const { checkedIn, checkedOut, timeIn, timeOut, loading } = useMyAttendanceToday();

  const status = checkedOut ? 'checked_out' : checkedIn ? 'checked_in' : 'absent';

  const STATUS_CONFIG = {
    checked_in:  { label: 'حاضر',     color: 'text-green-600', bg: 'bg-green-50 dark:bg-green-900/20', dot: '🟢' },
    checked_out: { label: 'منصرف',    color: 'text-gray-500',  bg: 'bg-gray-50 dark:bg-gray-800/40',  dot: '⚪' },
    absent:      { label: 'لم يسجّل', color: 'text-red-500',   bg: 'bg-red-50 dark:bg-red-900/20',   dot: '🔴' },
  };
  const cfg = STATUS_CONFIG[status];

  if (loading) {
    return (
      <div className="animate-pulse space-y-2 p-1">
        <div className="h-4 bg-surface-alt rounded w-2/3" />
        <div className="h-8 bg-surface-alt rounded" />
      </div>
    );
  }

  return (
    <button
      onClick={() => navigate(ROUTES.ATTENDANCE)}
      className={`w-full text-right ${cfg.bg} rounded-xl p-3 hover:opacity-90 transition-opacity`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className={`text-sm font-medium flex items-center gap-1 ${cfg.color}`}>
          {cfg.dot} {cfg.label}
        </span>
        <span className="text-xs text-muted">اليوم</span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-center">
        <div>
          <p className="text-xs text-muted">دخول</p>
          <p className="text-sm font-semibold text-text">{timeIn ?? '—'}</p>
        </div>
        <div>
          <p className="text-xs text-muted">خروج</p>
          <p className="text-sm font-semibold text-text">{timeOut ?? '—'}</p>
        </div>
      </div>

      {!checkedIn && (
        <p className="text-xs text-amber-500 mt-2 text-right">
          ⚠️ اضغط لتسجيل الحضور
        </p>
      )}
    </button>
  );
}

export default AttendanceWidget;
