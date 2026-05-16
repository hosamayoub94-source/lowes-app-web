// =============================================================
// Analytics — HeatmapWidget
// 7-column calendar heatmap (days of week × weeks).
// Works with any numeric time-series — darker = higher value.
// =============================================================
import { memo, useMemo } from 'react';
import { useSeriesFor } from '../hooks/useAnalytics';
import { KPI_LABELS, KPI_COLORS } from '../types/analytics.types';

const DAYS_AR = ['أح', 'إث', 'ثل', 'أر', 'خم', 'جم', 'سب'];

function _buildGrid(data) {
  // Group by day-of-week × week number
  if (!data.length) return { grid: [], maxVal: 1 };

  const byDate = Object.fromEntries(data.map((d) => [d.date, d.value]));
  const dates  = [...data].sort((a, b) => a.date.localeCompare(b.date));
  const start  = new Date(dates[0].date);
  const end    = new Date(dates[dates.length - 1].date);

  // Pad start to Sunday
  const padStart = start.getDay();
  const d = new Date(start);
  d.setDate(d.getDate() - padStart);

  const cells = [];
  let maxVal  = 1;
  while (d <= end) {
    const key = d.toISOString().slice(0, 10);
    const val = byDate[key] ?? null;
    if (val !== null && val > maxVal) maxVal = val;
    cells.push({ date: key, value: val });
    d.setDate(d.getDate() + 1);
  }

  // Chunk into weeks
  const grid = [];
  for (let i = 0; i < cells.length; i += 7) {
    grid.push(cells.slice(i, i + 7));
  }
  return { grid, maxVal };
}

function HeatmapWidget({ metric, title, style = {} }) {
  const data           = useSeriesFor(metric);
  const { grid, maxVal } = useMemo(() => _buildGrid(data), [data]);
  const baseColor      = KPI_COLORS[metric] ?? '#3b82f6';

  // Convert hex to RGB for interpolation
  const r = parseInt(baseColor.slice(1, 3), 16);
  const g = parseInt(baseColor.slice(3, 5), 16);
  const b = parseInt(baseColor.slice(5, 7), 16);

  function cellColor(val) {
    if (val === null) return '#1e293b';
    const intensity = Math.min(1, val / maxVal);
    const ir = Math.round(30 + intensity * (r - 30));
    const ig = Math.round(41 + intensity * (g - 41));
    const ib = Math.round(59 + intensity * (b - 59));
    return `rgb(${ir},${ig},${ib})`;
  }

  return (
    <div style={{
      background: 'var(--surface, #1e293b)',
      border: '1px solid #334155',
      borderRadius: 12,
      padding: '16px 20px',
      ...style,
    }}>
      <div style={{ fontSize: 13, color: 'var(--text-secondary, #94a3b8)', fontWeight: 500, marginBottom: 12 }}>
        {title ?? `خريطة حرارة — ${KPI_LABELS[metric] ?? metric}`}
      </div>

      {grid.length === 0 ? (
        <div style={{ color: '#64748b', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>
          لا توجد بيانات
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          {/* Day labels */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 4, paddingRight: 0 }}>
            {DAYS_AR.map((d, i) => (
              <div key={i} style={{ width: 20, textAlign: 'center', fontSize: 10, color: '#64748b' }}>{d}</div>
            ))}
          </div>

          {/* Grid rows (weeks) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {grid.map((week, wi) => (
              <div key={wi} style={{ display: 'flex', gap: 4 }}>
                {week.map((cell, di) => (
                  <div
                    key={di}
                    title={cell.value !== null ? `${cell.date}: ${Math.round(cell.value)}` : cell.date}
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: 3,
                      background: cellColor(cell.value),
                      border: '1px solid #0f172a44',
                      cursor: cell.value !== null ? 'default' : 'not-allowed',
                    }}
                  />
                ))}
              </div>
            ))}
          </div>

          {/* Legend */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 8 }}>
            <span style={{ fontSize: 10, color: '#64748b' }}>أقل</span>
            {[0.1, 0.3, 0.5, 0.7, 0.9].map((t, i) => (
              <div key={i} style={{
                width: 14,
                height: 14,
                borderRadius: 2,
                background: cellColor(t * maxVal),
              }} />
            ))}
            <span style={{ fontSize: 10, color: '#64748b' }}>أكثر</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default memo(HeatmapWidget);
