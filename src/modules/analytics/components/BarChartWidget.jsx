// =============================================================
// Analytics — BarChartWidget
// Vertical bars for one metric per day over the selected period.
// =============================================================
import { memo, Suspense, lazy } from 'react';
import ChartFrame from './ChartFrame';
import StateBox from './StateBox';
import { KPI_LABELS, KPI_COLORS, formatKPI } from '../types/analytics.types';

const LazyBarChart = lazy(() =>
  import('recharts').then((m) => ({
    default: function BarChartInner({ metric, data, color }) {
      const { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } = m;
      return (
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--color-border) / 0.15)" vertical={false} />
            <XAxis dataKey="date" tick={{ fill: 'rgb(var(--color-muted))', fontSize: 11 }} tickFormatter={(d) => d?.slice(5)} minTickGap={16} />
            <YAxis tick={{ fill: 'rgb(var(--color-muted))', fontSize: 11 }} width={38} allowDecimals={false} />
            <Tooltip
              contentStyle={{ background: 'rgb(var(--color-surface))', border: '1px solid rgb(var(--color-border) / 0.15)', borderRadius: 8, color: 'rgb(var(--color-text))' }}
              labelStyle={{ color: 'rgb(var(--color-muted))', fontSize: 12 }}
              formatter={(val) => [formatKPI(metric, val), KPI_LABELS[metric] ?? metric]}
            />
            <Bar dataKey="value" fill={color} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      );
    },
  })),
);

function BarChartWidget({ metric, title, style = {} }) {
  const color = KPI_COLORS[metric] ?? '#3b82f6';
  return (
    <ChartFrame metric={metric} title={title} style={style}>
      {(points) => (
        <Suspense fallback={<StateBox kind="loading" compact style={{ minHeight: 200 }} />}>
          <LazyBarChart metric={metric} data={points} color={color} />
        </Suspense>
      )}
    </ChartFrame>
  );
}

export default memo(BarChartWidget);
