// =============================================================
// Analytics — Tasks & productivity tab
// Completed vs overdue work, completion rate, and who owns the overdue tasks.
// =============================================================
import { memo } from 'react';
import { Link } from 'react-router-dom';
import { KPI } from '../types/analytics.types';
import StatCard        from '../components/StatCard';
import BarChartWidget  from '../components/BarChartWidget';
import TrendChart      from '../components/TrendChart';
import BreakdownTable  from '../components/BreakdownTable';

function ProductivityReport() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard metric={KPI.COMPLETED_TASKS} title="مهام منجزة خلال الفترة" />
        <StatCard metric={KPI.OVERDUE_TASKS} title="مهام متأخرة (مفتوحة)" />
        <StatCard metric={KPI.TASK_COMPLETION_RATE} title="معدل إنجاز المهام المُنشأة" />
        <StatCard metric={KPI.PRODUCTIVITY_SCORE} title="متوسط تقدّم المهام" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <BarChartWidget metric={KPI.COMPLETED_TASKS} title="المهام المنجزة يومياً" />
        <TrendChart metric={KPI.PRODUCTIVITY_SCORE} title="اتجاه متوسط التقدّم (من اللقطات اليومية)" />
      </div>

      <BreakdownTable onlyOverdue title="المهام المتأخرة حسب المسؤول" />
      <div style={{ fontSize: 13 }}>
        <Link to="/tasks-report" style={{ color: '#2563eb', fontWeight: 600 }}>فتح تقرير المهام الكامل (العمر، المشاريع، العالقة) ←</Link>
      </div>

      <details className="bg-surface border border-border" style={{ borderRadius: 12, padding: '12px 16px' }}>
        <summary className="text-text" style={{ cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>كيف تُحسب هذه الأرقام؟</summary>
        <ul className="text-muted" style={{ fontSize: 12, lineHeight: 1.9, margin: '8px 0 0', paddingInlineStart: 20 }}>
          <li><strong>المنجزة</strong> = مهام تاريخ إنجازها يقع داخل الفترة.</li>
          <li><strong>المتأخرة</strong> = مهام مفتوحة تجاوز يوم استحقاقها (حتى نهاية الفترة أو اليوم أيهما أقدم)، بحالتها الحالية، وبنفس قاعدة تقرير المهام.</li>
          <li><strong>معدل الإنجاز</strong> = المنجز حالياً من المهام المُنشأة في الفترة (دون الملغاة).</li>
          <li><strong>متوسط التقدّم</strong> = متوسط نسبة تقدّم المهام المُنشأة في الفترة (المنجزة = 100).</li>
          <li>المهام الحساسة تظهر للمدير العام فقط، كما في تقرير المهام.</li>
        </ul>
      </details>
    </div>
  );
}

export default memo(ProductivityReport);
