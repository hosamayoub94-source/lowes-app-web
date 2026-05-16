// =============================================================
// Attendance — TeamAttendanceBoard
//
// Compact table / grid showing the full team's attendance today.
// Groups by status with colour-coded chips.
// Refreshes every 60 s via useTeamRefresh hook.
// =============================================================
import React, { useState } from 'react';
import {
  useTeamRecords,
  useTeamStats,
  useTeamRefresh,
  useAttendanceLoading,
} from '../hooks/useAttendance';
import {
  ATTENDANCE_STATUS,
  ATTENDANCE_STATUS_LABELS,
  ATTENDANCE_STATUS_COLORS,
} from '../types/attendance.types';

const STATUS_ORDER = [
  ATTENDANCE_STATUS.PRESENT,
  ATTENDANCE_STATUS.LATE,
  ATTENDANCE_STATUS.ON_BREAK,
  ATTENDANCE_STATUS.CHECKED_OUT,
  ATTENDANCE_STATUS.ABSENT,
  ATTENDANCE_STATUS.PENDING,
];

function formatTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('ar-SA', {
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
}

function formatMinutes(mins) {
  if (!mins) return '—';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}س ${m}د` : `${m}د`;
}

/**
 * @param {object}  props
 * @param {string}  [props.date]       "YYYY-MM-DD" — defaults to today
 * @param {string}  [props.className]
 */
export default function TeamAttendanceBoard({ date, className = '' }) {
  const records  = useTeamRecords();
  const stats    = useTeamStats();
  const loading  = useAttendanceLoading();
  const refresh  = useTeamRefresh(date);

  const [filterStatus, setFilterStatus] = useState(null);
  const [search, setSearch]             = useState('');

  const filtered = records
    .filter((r) => !filterStatus || r.status === filterStatus)
    .filter((r) => {
      if (!search) return true;
      const name = (r.metadata?.name ?? r.user_id ?? '').toLowerCase();
      return name.includes(search.toLowerCase());
    })
    .sort((a, b) => {
      const ai = STATUS_ORDER.indexOf(a.status);
      const bi = STATUS_ORDER.indexOf(b.status);
      return ai - bi;
    });

  return (
    <div
      className={`bg-white rounded-2xl shadow-sm border border-slate-100 ${className}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <h2 className="font-bold text-slate-700">حضور الفريق</h2>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">
            {records.length} موظف · نسبة {stats.attendanceRate}%
          </span>
          <button
            onClick={refresh}
            disabled={loading}
            className="text-slate-400 hover:text-slate-600 transition-colors disabled:opacity-40"
            title="تحديث"
          >
            ↻
          </button>
        </div>
      </div>

      {/* Stats chips */}
      <div className="flex flex-wrap gap-2 px-5 py-3 border-b border-slate-50">
        <button
          onClick={() => setFilterStatus(null)}
          className={`text-xs px-3 py-1 rounded-full border transition-colors
            ${!filterStatus
              ? 'bg-slate-700 text-white border-slate-700'
              : 'text-slate-500 border-slate-200 hover:bg-slate-50'}`}
        >
          الكل ({records.length})
        </button>

        {STATUS_ORDER.map((st) => {
          const count = records.filter((r) => r.status === st).length;
          if (!count) return null;
          return (
            <button
              key={st}
              onClick={() => setFilterStatus(filterStatus === st ? null : st)}
              className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                filterStatus === st ? 'text-white' : 'text-slate-600 hover:opacity-80'
              }`}
              style={{
                backgroundColor: filterStatus === st ? ATTENDANCE_STATUS_COLORS[st] : `${ATTENDANCE_STATUS_COLORS[st]}22`,
                borderColor: `${ATTENDANCE_STATUS_COLORS[st]}66`,
                color: filterStatus === st ? '#fff' : ATTENDANCE_STATUS_COLORS[st],
              }}
            >
              {ATTENDANCE_STATUS_LABELS[st]} ({count})
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div className="px-5 py-2 border-b border-slate-50">
        <input
          type="text"
          placeholder="بحث باسم الموظف…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 outline-none focus:border-slate-400 bg-slate-50"
        />
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        {filtered.length === 0 ? (
          <div className="text-center py-10 text-slate-400 text-sm">
            {records.length === 0 ? 'لا يوجد سجلات حضور اليوم' : 'لا توجد نتائج'}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-right text-xs text-slate-400 border-b border-slate-100">
                <th className="px-5 py-2 font-medium">الموظف</th>
                <th className="px-4 py-2 font-medium">الحالة</th>
                <th className="px-4 py-2 font-medium">الدخول</th>
                <th className="px-4 py-2 font-medium">الخروج</th>
                <th className="px-4 py-2 font-medium">العمل</th>
                <th className="px-4 py-2 font-medium">تأخر</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((rec) => {
                const name    = rec.metadata?.name ?? rec.user_id?.slice(0, 8) ?? '—';
                const color   = ATTENDANCE_STATUS_COLORS[rec.status];
                const label   = ATTENDANCE_STATUS_LABELS[rec.status];

                return (
                  <tr
                    key={rec.id ?? `${rec.user_id}-${rec.date}`}
                    className="border-b border-slate-50 hover:bg-slate-50/60 transition-colors"
                  >
                    <td className="px-5 py-3 font-medium text-slate-700 whitespace-nowrap">
                      {name}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="text-xs font-semibold px-2 py-0.5 rounded-full"
                        style={{
                          backgroundColor: `${color}22`,
                          color,
                        }}
                      >
                        {label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500" dir="ltr">
                      {formatTime(rec.check_in_time)}
                    </td>
                    <td className="px-4 py-3 text-slate-500" dir="ltr">
                      {formatTime(rec.check_out_time)}
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {formatMinutes(rec.worked_minutes)}
                    </td>
                    <td className="px-4 py-3">
                      {(rec.late_by_minutes ?? 0) > 0 ? (
                        <span className="text-xs text-amber-600 font-medium">
                          +{rec.late_by_minutes}د
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
