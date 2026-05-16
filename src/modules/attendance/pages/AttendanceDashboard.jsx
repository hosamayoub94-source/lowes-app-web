// =============================================================
// Attendance — Dashboard Page
//
// Full-page view combining:
//   Left panel  : AttendanceWidget (my status + check-in/out + break)
//   Right panel : TeamAttendanceBoard
//   Header      : date, team stats summary bar
// =============================================================
import React, { useMemo } from 'react';
import AttendanceWidget    from '../components/AttendanceWidget';
import TeamAttendanceBoard from '../components/TeamAttendanceBoard';
import { useTeamStats, useAttendanceInit } from '../hooks/useAttendance';

// Demo: replace with real auth context
const DEMO_USER = {
  id:   'user_current',
  name: 'أنت',
};

function StatChip({ label, value, color }) {
  return (
    <div className="flex flex-col items-center px-4">
      <span className="text-2xl font-bold" style={{ color }}>
        {value}
      </span>
      <span className="text-xs text-slate-400 mt-0.5">{label}</span>
    </div>
  );
}

function StatsDivider() {
  return <div className="w-px h-8 bg-slate-100 self-center" />;
}

export default function AttendanceDashboard() {
  // Boot once at dashboard level (widget also calls this — idempotent)
  useAttendanceInit(DEMO_USER.id);

  const stats = useTeamStats();

  const today = useMemo(
    () =>
      new Date().toLocaleDateString('ar-SA', {
        weekday: 'long',
        year:    'numeric',
        month:   'long',
        day:     'numeric',
      }),
    [],
  );

  return (
    <div className="min-h-screen bg-slate-50 p-6" dir="rtl">

      {/* ── Page header ──────────────────────────────────────── */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">الحضور والانصراف</h1>
        <p className="text-sm text-slate-500 mt-1">{today}</p>
      </div>

      {/* ── Team stats bar ────────────────────────────────────── */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 px-6 py-4 flex items-center justify-start gap-0 mb-6 flex-wrap">
        <StatChip label="حاضر"     value={stats.present}    color="#22c55e" />
        <StatsDivider />
        <StatChip label="متأخر"    value={stats.late}       color="#f59e0b" />
        <StatsDivider />
        <StatChip label="في استراحة" value={stats.onBreak}  color="#0ea5e9" />
        <StatsDivider />
        <StatChip label="انصرف"    value={stats.checkedOut} color="#8b5cf6" />
        <StatsDivider />
        <StatChip label="غائب"     value={stats.absent}     color="#ef4444" />
        <StatsDivider />
        <StatChip label="لم يسجّل" value={stats.pending}    color="#94a3b8" />
        <StatsDivider />
        <div className="flex flex-col items-center px-4">
          <span className="text-2xl font-bold text-slate-700">
            {stats.attendanceRate}%
          </span>
          <span className="text-xs text-slate-400 mt-0.5">معدل الحضور</span>
        </div>
      </div>

      {/* ── Main content grid ─────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* My attendance widget — left column on LTR / right on RTL */}
        <div className="lg:col-span-1">
          <h2 className="text-sm font-semibold text-slate-500 mb-3 uppercase">
            حضوري
          </h2>
          <AttendanceWidget
            userId={DEMO_USER.id}
            employeeName={DEMO_USER.name}
          />
        </div>

        {/* Team board — takes 2/3 of the grid */}
        <div className="lg:col-span-2">
          <h2 className="text-sm font-semibold text-slate-500 mb-3 uppercase">
            حضور الفريق
          </h2>
          <TeamAttendanceBoard />
        </div>

      </div>
    </div>
  );
}
