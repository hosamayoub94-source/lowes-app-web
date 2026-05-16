// =============================================================
// Analytics — TrendChart widget
// Line chart for a single metric over time (Recharts, lazy).
// =============================================================
import { memo, Suspense, lazy } from 'react';
import { useSeriesFor, useKPIsLoading } from '../hooks/useAnalytics';
import { KPI_LABELS, KPI_COLORS, formatKPI } from '../types/analytics.types';

// Lazy-load Recharts so the main bundle stays small
const LazyChart = lazy(() =>
  import('recharts').then((m) => ({
    default: function TrendChartInner({ metric, data, color }) {
      const { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } = m;
      return (
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis
              dataKey="date"
              tick={{ fill: '#94a3b8', fontSize: 11 }}
              tickFormatter={(d) => d?.slice(5)}  // MM-DD
            />
            <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} width={38} />
            <Tooltip
              contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
              labelStyle={{ color: '#94a3b8', fontSize: 12 }}
              formatter={(val) => [formatKPI(metric, val), KPI_LABELS[metric] ?? metric]}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke={color}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: color }}
            />
          </LineChart>
        </ResponsiveContainer>
      );
    },
  })),
);

function TrendChart({ metric, title, style = {} }) {
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
        <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
          جارٍ التحميل…
        </div>
      ) : data.length === 0 ? (
        <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontSize: 13 }}>
          لا توجد بيانات
        </div>
      ) : (
        <Suspense fallback={
          <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
            جارٍ تحميل الرسم البياني…
          </div>
        }>
          <LazyChart metric={metric} data={data} color={color} />
        </Suspense>
      )}
    </div>
  );
}

export default memo(TrendChart);
