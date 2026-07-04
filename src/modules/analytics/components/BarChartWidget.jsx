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
            <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--color-border) / 0.15)" vertical={false} />
            <XAxis dataKey="date" tick={{ fill: 'rgb(var(--color-muted))', fontSize: 11 }} tickFormatter={(d) => d?.slice(5)} />
            <YAxis tick={{ fill: 'rgb(var(--color-muted))', fontSize: 11 }} width={38} />
            <Tooltip
              contentStyle={{ background: 'rgb(var(--color-surface))', border: '1px solid rgb(var(--color-border) / 0.15)', borderRadius: 8, color: 'rgb(var(--color-text))' }}
              labelStyle={{ color: 'rgb(var(--color-muted))', fontSize: 12 }}
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
    <div className="bg-surface border border-border" style={{
      borderRadius: 12,
      padding: '16px 20px',
      ...style,
    }}>
      <div className="text-muted" style={{ fontSize: 13, fontWeight: 500, marginBottom: 12 }}>
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
  <div className="text-muted" style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
    جارٍ التحميل…
  </div>
);

const _Empty = () => (
  <div className="text-muted" style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>
    لا توجد بيانات
  </div>
);

export default memo(BarChartWidget);
