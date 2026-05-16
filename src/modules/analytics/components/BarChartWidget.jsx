// =============================================================
// Analytics — BarChartWidget
// Vertical bar chart for comparing metric values over time.
// =============================================================
import { memo, Suspense, lazy } from 'react';
import { useSeriesFor, useKPIsLoading } from '../hooks/useAnalytics';
import { KPI_LABELS, KPI_COLORS, formatKPI } from '../types/analytics.types';

const LazyBarChart = lazy(() =>
  import('recharts').then((m) => ({
    default: function BarChartInner({ metric, data, color }) {
      const { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell } = m;
      return (
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
            <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={(d) => d?.slice(5)} />
            <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} width={38} />
            <Tooltip
              contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
              labelStyle={{ color: '#94a3b8', fontSize: 12 }}
              formatter={(val) => [formatKPI(metric, val), KPI_LABELS[metric] ?? metric]}
            />
            <Bar dataKey="value" radius={[4, 4, 0, 0]}>
              {data.map((_, i) => (
                <Cell key={i} fill={`${color}${Math.round(155 + (i / data.length) * 100).toString(16)}`} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      );
    },
  })),
);

function BarChartWidget({ metric, title, style = {} }) {
  const data    = useSeriesFor(metric);
  const loading = useKPIsLoading();
  const color   = KPI_COLORS[metric] ?? '#3b82f6';

  return (
    <div style={{
      background: 'var(--surface, #1e293b)',
      border: '1px solid #334155',
      borderRadius: 12,
      padding: '16px 20px',
      ...style,
    }}>
      <div style={{ fontSize: 13, color: 'var(--text-secondary, #94a3b8)', fontWeight: 500, marginBottom: 12 }}>
        {title ?? KPI_LABELS[metric] ?? metric}
      </div>

      {loading ? (
        <_Placeholder />
      ) : data.length === 0 ? (
        <_Empty />
      ) : (
        <Suspense fallback={<_Placeholder />}>
          <LazyBarChart metric={metric} data={data} color={color} />
        </Suspense>
      )}
    </div>
  );
}

const _Placeholder = () => (
  <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
    جارٍ التحميل…
  </div>
);

const _Empty = () => (
  <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontSize: 13 }}>
    لا توجد بيانات
  </div>
);

export default memo(BarChartWidget);
