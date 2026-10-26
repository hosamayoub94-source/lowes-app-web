// =============================================================
// Analytics — TrendChart widget
// Line chart for one metric over the selected period (Recharts, lazy).
// =============================================================
import { memo, Suspense, lazy } from 'react';
import ChartFrame from './ChartFrame';
import StateBox from './StateBox';
import { KPI_LABELS, KPI_COLORS, formatKPI } from '../types/analytics.types';

const LazyChart = lazy(() =>
  import('recharts').then((m) => ({
    default: function TrendChartInner({ metric, data, color }) {
      const { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } = m;
      return (
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--color-border) / 0.15)" />
            <XAxis dataKey="date" tick={{ fill: 'rgb(var(--color-muted))', fontSize: 11 }} tickFormatter={(d) => d?.slice(5)} minTickGap={16} />
            <YAxis tick={{ fill: 'rgb(var(--color-muted))', fontSize: 11 }} width={38} />
            <Tooltip
              contentStyle={{ background: 'rgb(var(--color-surface))', border: '1px solid rgb(var(--color-border) / 0.15)', borderRadius: 8, color: 'rgb(var(--color-text))' }}
              labelStyle={{ color: 'rgb(var(--color-muted))', fontSize: 12 }}
              formatter={(val) => [formatKPI(metric, val), KPI_LABELS[metric] ?? metric]}
            />
            <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={data.length <= 31} activeDot={{ r: 4, fill: color }} />
          </LineChart>
        </ResponsiveContainer>
      );
    },
  })),
);

function TrendChart({ metric, title, style = {} }) {
  const color = KPI_COLORS[metric] ?? '#3b82f6';
  return (
    <ChartFrame metric={metric} title={title} style={style}>
      {(points) => (
        <Suspense fallback={<StateBox kind="loading" compact style={{ minHeight: 200 }} />}>
          <LazyChart metric={metric} data={points} color={color} />
        </Suspense>
      )}
    </ChartFrame>
  );
}

export default memo(TrendChart);
