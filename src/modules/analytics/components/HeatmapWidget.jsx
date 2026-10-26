// =============================================================
// Analytics — HeatmapWidget
// Calendar grid (weeks × weekdays) coloured by a daily metric. Days without
// a value are shown empty — not as zero.
// =============================================================
import { memo, useMemo } from 'react';
import ChartFrame from './ChartFrame';
import { parseYMD, addDays } from '../services/reportMath';
import { KPI_LABELS, KPI_COLORS, formatKPI } from '../types/analytics.types';

const DAYS_AR = ['أح', 'إث', 'ثل', 'أر', 'خم', 'جم', 'سب'];
const hexAlpha = (a) => Math.round(Math.min(1, Math.max(0.08, a)) * 255).toString(16).padStart(2, '0');

/** Weeks start on Sunday; all keys are local 'YYYY-MM-DD' (no UTC conversion). */
function buildGrid(data) {
  const byDate = Object.fromEntries(data.map((d) => [d.date, d.value]));
  const keys = data.map((d) => d.date).sort();
  const first = keys[0];
  const last = keys[keys.length - 1];
  const startDow = parseYMD(first)?.getDay() ?? 0;

  const cells = [];
  let maxVal = 1;
  for (let k = addDays(first, -startDow); k && k <= last; k = addDays(k, 1)) {
    const inRange = k >= first;
    const val = inRange ? (byDate[k] ?? null) : null;
    if (val !== null && val > maxVal) maxVal = val;
    cells.push({ date: k, value: val, pad: !inRange });
  }
  const grid = [];
  for (let i = 0; i < cells.length; i += 7) grid.push(cells.slice(i, i + 7));
  return { grid, maxVal };
}

function Heat({ metric, data }) {
  const { grid, maxVal } = useMemo(() => buildGrid(data), [data]);
  const color = KPI_COLORS[metric] ?? '#3b82f6';
  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
        {DAYS_AR.map((d) => <div key={d} className="text-muted" style={{ width: 22, textAlign: 'center', fontSize: 10 }}>{d}</div>)}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {grid.map((week, wi) => (
          <div key={wi} style={{ display: 'flex', gap: 4 }}>
            {week.map((cell) => (
              <div
                key={cell.date}
                role="img"
                aria-label={cell.value !== null ? `${cell.date}: ${formatKPI(metric, cell.value)}` : `${cell.date}: لا بيانات`}
                title={cell.value !== null ? `${cell.date}: ${formatKPI(metric, cell.value)}` : `${cell.date}: لا بيانات`}
                className={cell.value === null ? 'bg-surface-alt' : undefined}
                style={{
                  width: 22, height: 22, borderRadius: 4, opacity: cell.pad ? 0.25 : 1,
                  background: cell.value === null ? undefined : `${color}${hexAlpha(cell.value / maxVal)}`,
                }}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="text-muted" style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, fontSize: 10 }}>
        <span>أقل</span>
        {[0.15, 0.4, 0.65, 0.9].map((t) => <span key={t} style={{ width: 14, height: 14, borderRadius: 3, background: `${color}${hexAlpha(t)}` }} />)}
        <span>أكثر</span>
        <span style={{ marginInlineStart: 8 }}>المربع الفارغ = لا توجد بيانات لذلك اليوم</span>
      </div>
    </div>
  );
}

function HeatmapWidget({ metric, title, style = {} }) {
  return (
    <ChartFrame metric={metric} title={title ?? `خريطة حرارة — ${KPI_LABELS[metric] ?? metric}`} style={style} minHeight={120}>
      {(points) => <Heat metric={metric} data={points} />}
    </ChartFrame>
  );
}

export default memo(HeatmapWidget);
