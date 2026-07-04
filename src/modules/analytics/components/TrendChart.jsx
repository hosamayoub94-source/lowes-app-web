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
            <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--color-border) / 0.15)" />
            <XAxis
              dataKey="date"
              tick={{ fill: 'rgb(var(--color-muted))', fontSize: 11 }}
              tickFormatter={(d) => d?.slice(5)}  // MM-DD
            />
            <YAxis tick={{ fill: 'rgb(var(--color-muted))', fontSize: 11 }} width={38} />
            <Tooltip
              contentStyle={{ background: 'rgb(var(--color-surface))', border: '1px solid rgb(var(--color-border) / 0.15)', borderRadius: 8, color: 'rgb(var(--color-text))' }}
              labelStyle={{ color: 'rgb(var(--color-muted))', fontSize: 12 }}
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
    <div className="bg-surface border border-border" style={{
      borderRadius: 12,
      padding: '16px 20px',
      ...style,
    }}>
      <div className="text-muted" style={{ fontSize: 13, fontWeight: 500, marginBottom: 12 }}>
        {title ?? KPI_LABELS[metric] ?? metric}
      </div>

      {loading ? (
        <div className="text-muted" style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          جارٍ التحميل…
        </div>
      ) : data.length === 0 ? (
        <div className="text-muted" style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>
          لا توجد بيانات
        </div>
      ) : (
        <Suspense fallback={
          <div className="text-muted" style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
