// =============================================================
// mediaBuyer/charts — رسوم لوحة الميديا باير (recharts، lazy، تقبل data props).
// نمط lazy-import من modules/analytics/components لكن مستقلّة عن ستور التحليلات.
// =============================================================
import { Suspense, lazy } from 'react';

const AXIS = '#94a3b8', GRID = 'var(--color-border, #e5e7eb)';
const TT = { background: 'var(--color-surface, #1e293b)', border: '1px solid #33415533', borderRadius: 8, fontSize: 12 };

function Box({ height = 220, children }) {
  return (
    <Suspense fallback={<div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 13 }}>جارٍ تحميل الرسم…</div>}>
      {children}
    </Suspense>
  );
}

// ── خطّي: الرسائل + التأكيدات عبر الأيام ──────────────────────
const LazyTrend = lazy(() => import('recharts').then((m) => ({
  default: function Inner({ data }) {
    const { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } = m;
    return (
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={data} margin={{ top: 6, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
          <XAxis dataKey="date" tick={{ fill: AXIS, fontSize: 11 }} tickFormatter={(d) => (d || '').slice(5)} />
          <YAxis tick={{ fill: AXIS, fontSize: 11 }} width={34} />
          <Tooltip contentStyle={TT} labelFormatter={(d) => d} />
          <Legend formatter={(v) => <span style={{ color: AXIS, fontSize: 11 }}>{v}</span>} />
          <Line type="monotone" dataKey="messages" name="رسائل" stroke="#2563eb" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="confirmations" name="تأكيدات" stroke="#0d7377" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    );
  },
})));

export function DailyTrendChart({ data = [] }) {
  if (!data.length) return <div className="h-[240px] grid place-items-center text-sm text-muted">لا بيانات</div>;
  return <Box height={240}><LazyTrend data={data} /></Box>;
}

// ── أعمدة أفقية: قيمة لكل عنصر (حملة/إعلان) ──────────────────
const LazyBars = lazy(() => import('recharts').then((m) => ({
  default: function Inner({ data, color, valueLabel }) {
    const { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } = m;
    return (
      <ResponsiveContainer width="100%" height={Math.max(160, data.length * 38)}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
          <XAxis type="number" tick={{ fill: AXIS, fontSize: 11 }} />
          <YAxis type="category" dataKey="name" tick={{ fill: AXIS, fontSize: 11 }} width={110} />
          <Tooltip contentStyle={TT} formatter={(v) => [v, valueLabel || 'قيمة']} cursor={{ fill: '#94a3b822' }} />
          <Bar dataKey="value" fill={color || '#0d7377'} radius={[0, 6, 6, 0]} />
        </BarChart>
      </ResponsiveContainer>
    );
  },
})));

export function HBarChart({ data = [], color, valueLabel }) {
  if (!data.length) return <div className="h-[160px] grid place-items-center text-sm text-muted">لا بيانات</div>;
  return <Box height={Math.max(160, data.length * 38)}><LazyBars data={data} color={color} valueLabel={valueLabel} /></Box>;
}

// ── دونات: تقسيم المصدر ───────────────────────────────────────
const LazyDonut = lazy(() => import('recharts').then((m) => ({
  default: function Inner({ segments }) {
    const { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } = m;
    return (
      <ResponsiveContainer width="100%" height={240}>
        <PieChart>
          <Pie data={segments} cx="50%" cy="50%" innerRadius={58} outerRadius={88} paddingAngle={3} dataKey="value">
            {segments.map((s, i) => <Cell key={i} fill={s.color} />)}
          </Pie>
          <Tooltip contentStyle={TT} formatter={(v, n) => [v, n]} />
          <Legend formatter={(v) => <span style={{ color: AXIS, fontSize: 11 }}>{v}</span>} />
        </PieChart>
      </ResponsiveContainer>
    );
  },
})));

export function SourceSplitDonut({ segments = [] }) {
  const valid = segments.filter((s) => s.value > 0);
  if (!valid.length) return <div className="h-[240px] grid place-items-center text-sm text-muted">لا بيانات</div>;
  return <Box height={240}><LazyDonut segments={valid} /></Box>;
}
