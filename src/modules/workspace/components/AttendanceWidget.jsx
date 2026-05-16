// =============================================================
// AttendanceWidget — shows today's attendance status
// =============================================================
import { useNavigate }   from 'react-router-dom';
import useAttendanceStore from '@modules/attendance/store/useAttendanceStore';
import { ROUTES }        from '@routes/paths';

function fmt(ts) {
  if (!ts) return '–';
  return new Date(ts).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
}

function fmtMins(mins) {
  if (!mins) return '0 د';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}س ${m}د` : `${m}د`;
}

const STATUS_CONFIG = {
  checked_in:  { label: 'حاضر',     color: 'text-green-600',  bg: 'bg-green-50',  dot: '🟢' },
  on_break:    { label: 'استراحة',  color: 'text-amber-600',  bg: 'bg-amber-50',  dot: '🟡' },
  checked_out: { label: 'منصرف',    color: 'text-gray-500',   bg: 'bg-gray-50',   dot: '⚪' },
  absent:      { label: 'غائب',     color: 'text-red-500',    bg: 'bg-red-50',    dot: '🔴' },
  default:     { label: 'لم يسجل',  color: 'text-gray-400',   bg: 'bg-gray-50',   dot: '⭕' },
};

export function AttendanceWidget() {
  const navigate  = useNavigate();
  const myRecord  = useAttendanceStore((s) => s.myRecord);
  const loading   = useAttendanceStore((s) => s.loading);

  const status = myRecord?.status ?? 'default';
  const cfg    = STATUS_CONFIG[status] ?? STATUS_CONFIG.default;

  if (loading && !myRecord) {
    return (
      <div className="animate-pulse space-y-2">
        <div className="h-4 bg-gray-200 rounded w-2/3" />
        <div className="h-8 bg-gray-100 rounded" />
      </div>
    );
  }

  return (
    <button
      onClick={() => navigate(ROUTES.ATTENDANCE)}
      className={`w-full text-right ${cfg.bg} rounded-xl p-3 hover:opacity-90 transition-opacity`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-gray-700 flex items-center gap-1">
          {cfg.dot} {cfg.label}
        </span>
        <span className="text-xs text-gray-400">اليوم</span>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-xs text-gray-500">دخول</p>
          <p className="text-sm font-semibold text-gray-700">{fmt(myRecord?.check_in_time)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">خروج</p>
          <p className="text-sm font-semibold text-gray-700">{fmt(myRecord?.check_out_time)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">العمل</p>
          <p className="text-sm font-semibold text-gray-700">{fmtMins(myRecord?.worked_minutes)}</p>
        </div>
      </div>

      {myRecord?.late_by_minutes > 0 && (
        <p className="text-xs text-red-500 mt-2 text-right">
          ⚠️ تأخر {myRecord.late_by_minutes} دقيقة
        </p>
      )}
    </button>
  );
}

export default AttendanceWidget;
