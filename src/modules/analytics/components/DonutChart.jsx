// =============================================================
// Analytics — DonutChart widget
// Proportion / distribution view for a set of metrics.
// =============================================================
import { memo, Suspense, lazy } from 'react';
import { useKPIs } from '../hooks/useAnalytics';
import { KPI_LABELS, KPI_COLORS, formatKPI } from '../types/analytics.types';

const LazyDonut = lazy(() =>
  import('recharts').then((m) => ({
    default: function DonutInner({ segments }) {
      const { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } = m;
      return (
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie
              data={segments}
              cx="50%"
              cy="50%"
              innerRadius={55}
              outerRadius={85}
              paddingAngle={3}
              dataKey="value"
            >
              {segments.map((seg, i) => (
                <Cell key={i} fill={seg.color} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ background: 'rgb(var(--color-surface))', border: '1px solid rgb(var(--color-border) / 0.15)', borderRadius: 8, color: 'rgb(var(--color-text))' }}
              formatter={(val, name) => [val, name]}
            />
            <Legend
              formatter={(value) => (
                <span style={{ color: 'rgb(var(--color-muted))', fontSize: 11 }}>{value}</span>
              )}
            />
          </PieChart>
        </ResponsiveContainer>
      );
    },
  })),
);

/**
 * @param {{ metrics: string[], title?: string }} props
 * metrics — list of KPI keys to show as donut segments
 */
function DonutChart({ metrics = [], title, style = {} }) {
  const kpis = useKPIs();

  const segments = metrics
    .map((m) => ({
      name:  KPI_LABELS[m] ?? m,
      value: Math.round(kpis[m] ?? 0),
      color: KPI_COLORS[m] ?? '#64748b',
    }))
    .filter((s) => s.value > 0);

  return (
    <div className="bg-surface border border-border" style={{
      borderRadius: 12,
      padding: '16px 20px',
      ...style,
    }}>
      <div className="text-muted" style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>
        {title ?? 'توزيع المقاييس'}
      </div>

      {segments.length === 0 ? (
        <div className="text-muted" style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>
          لا توجد بيانات
        </div>
      ) : (
        <Suspense fallback={
          <div className="text-muted" style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            جارٍ التحميل…
          </div>
        }>
          <LazyDonut segments={segments} />
        </Suspense>
      )}
    </div>
  );
}

export default memo(DonutChart);
