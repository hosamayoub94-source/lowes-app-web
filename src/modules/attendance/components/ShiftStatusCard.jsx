// =============================================================
// Attendance — ShiftStatusCard
//
// Displays the active shift + today's attendance summary:
//   • Shift name + time window
//   • Expected vs actual check-in
//   • Worked hours so far
//   • Late / OT badges
// =============================================================
import React from 'react';
import { useMyRecord, useMyStatus, useShifts } from '../hooks/useAttendance';
import {
  ATTENDANCE_STATUS,
  ATTENDANCE_STATUS_LABELS,
  ATTENDANCE_STATUS_COLORS,
  SHIFT_TYPE_LABELS,
  SHIFT_TYPE_COLORS,
} from '../types/attendance.types';
import { formatDuration } from '../services/shiftService';

/**
 * @param {object} props
 * @param {string} [props.className]
 */
export default function ShiftStatusCard({ className = '' }) {
  const record = useMyRecord();
  const status = useMyStatus();
  const shifts = useShifts();

  const shift = shifts.find((s) => s.id === record?.shift_id) ?? shifts[0];

  const statusColor = ATTENDANCE_STATUS_COLORS[status] ?? '#94a3b8';
  const statusLabel = ATTENDANCE_STATUS_LABELS[status] ?? 'غير معروف';
  const shiftColor  = shift ? (SHIFT_TYPE_COLORS[shift.type] ?? '#64748b') : '#64748b';
  const shiftLabel  = shift ? (SHIFT_TYPE_LABELS[shift.type] ?? shift.type) : '—';

  const formatTime = (iso) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleTimeString('ar-SA', {
      hour:   '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  };

  const workedLabel = formatDuration(record?.worked_minutes ?? 0);

  return (
    <div
      className={`
        bg-white rounded-2xl shadow-sm border border-slate-100
        p-5 flex flex-col gap-4 ${className}
      `}
    >
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className="w-3 h-3 rounded-full inline-block"
            style={{ backgroundColor: shiftColor }}
          />
          <span className="text-sm font-medium text-slate-600">
            {shift?.name_ar ?? shift?.name ?? 'الوردية'}
          </span>
          <span className="text-xs text-slate-400">({shiftLabel})</span>
        </div>

        {/* Status badge */}
        <span
          className="text-xs font-bold px-3 py-1 rounded-full text-white"
          style={{ backgroundColor: statusColor }}
        >
          {statusLabel}
        </span>
      </div>

      {/* Shift time window */}
      {shift && (
        <div className="flex items-center gap-1 text-sm text-slate-500">
          <span>🕐</span>
          <span dir="ltr">{shift.start_time} — {shift.end_time}</span>
        </div>
      )}

      {/* Check-in / check-out row */}
      <div className="grid grid-cols-2 gap-3 text-center">
        <div className="bg-slate-50 rounded-xl py-3 px-2">
          <p className="text-xs text-slate-400 mb-1">الدخول</p>
          <p className="text-base font-bold text-slate-700">
            {formatTime(record?.check_in_time)}
          </p>
          {(record?.late_by_minutes ?? 0) > 0 && (
            <p className="text-xs text-amber-600 mt-0.5">
              +{record.late_by_minutes} د تأخر
            </p>
          )}
        </div>

        <div className="bg-slate-50 rounded-xl py-3 px-2">
          <p className="text-xs text-slate-400 mb-1">الخروج</p>
          <p className="text-base font-bold text-slate-700">
            {formatTime(record?.check_out_time)}
          </p>
        </div>
      </div>

      {/* Worked + OT */}
      {record?.check_in_time && (
        <div className="flex items-center justify-between border-t border-slate-100 pt-3">
          <div className="flex items-center gap-2">
            <span className="text-slate-400 text-sm">⏱ ساعات العمل</span>
            <span className="font-bold text-slate-700" dir="ltr">{workedLabel}</span>
          </div>
          {(record?.overtime_minutes ?? 0) > 0 && (
            <span className="text-xs font-semibold bg-violet-100 text-violet-700 px-2 py-1 rounded-full">
              إضافي: {record.overtime_minutes} د
            </span>
          )}
        </div>
      )}

      {/* No record yet */}
      {!record && (
        <p className="text-sm text-slate-400 text-center py-2">
          لا يوجد سجل حضور اليوم بعد
        </p>
      )}
    </div>
  );
}
