// =============================================================
// Analytics — Attendance tab
// Rate, late, absent, worked hours (+ overtime when a source exists).
// =============================================================
import { memo } from 'react';
import { KPI } from '../types/analytics.types';
import StatCard      from '../components/StatCard';
import TrendChart    from '../components/TrendChart';
import HeatmapWidget from '../components/HeatmapWidget';

function AttendanceInsights() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        <StatCard metric={KPI.ATTENDANCE_RATE} />
        <StatCard metric={KPI.LATE_EMPLOYEES} title="حالات التأخير" />
        <StatCard metric={KPI.ABSENT_EMPLOYEES} title="حالات الغياب" />
        <StatCard metric={KPI.WORKED_HOURS_TOTAL} />
        <StatCard metric={KPI.OVERTIME_HOURS_TOTAL} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TrendChart metric={KPI.ATTENDANCE_RATE} title="معدل الحضور يومياً (%)" />
        <TrendChart metric={KPI.LATE_EMPLOYEES} title="حالات التأخير يومياً" />
      </div>

      <HeatmapWidget metric={KPI.ATTENDANCE_RATE} title="خريطة حرارة معدل الحضور" />

      <details className="bg-surface border border-border" style={{ borderRadius: 12, padding: '12px 16px' }}>
        <summary className="text-text" style={{ cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>كيف تُحسب هذه الأرقام؟</summary>
        <ul className="text-muted" style={{ fontSize: 12, lineHeight: 1.9, margin: '8px 0 0', paddingInlineStart: 20 }}>
          <li><strong>معدل الحضور</strong> = (أيام الحضور الفعلية) ÷ (عدد الموظفين النشطين × الأيام التي لها سجلات).</li>
          <li><strong>حالات التأخير</strong> = عدد أيام الحضور التي سُجّل فيها تأخير.</li>
          <li><strong>حالات الغياب</strong> = مجموع (عدد الموظفين النشطين − الحاضرين) لكل يوم له سجلات. أيام العطل بلا سجلات لا تُحتسب.</li>
          <li><strong>ساعات العمل</strong> = مجموع ساعات سجلات الانصراف.</li>
          <li><strong>الوقت الإضافي</strong> غير متوفر: لا يوجد عمود له في جدول الحضور.</li>
        </ul>
      </details>
    </div>
  );
}

export default memo(AttendanceInsights);
