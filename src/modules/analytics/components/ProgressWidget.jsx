// =============================================================
// Analytics — ProgressWidget
// Shows multiple KPIs as progress bars toward their targets.
// =============================================================
import { memo } from 'react';
import { useKPIs } from '../hooks/useAnalytics';
import { KPI_LABELS, KPI_COLORS, KPI_THRESHOLDS, formatKPI, getKPIStatus, KPI_STATUS_COLORS } from '../types/analytics.types';

function ProgressBar({ value, max, color }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div style={{
      height: 6,
      background: '#334155',
      borderRadius: 999,
      overflow: 'hidden',
    }}>
      <div style={{
        height: '100%',
        width: `${pct}%`,
        background: color,
        borderRadius: 999,
        transition: 'width 0.4s ease',
      }} />
    </div>
  );
}

/**
 * @param {{ metrics: string[], title?: string }} props
 */
function ProgressWidget({ metrics = [], title = 'تقدم المؤشرات', style = {} }) {
  const kpis = useKPIs();

  return (
    <div style={{
      background: 'var(--surface, #1e293b)',
      border: '1px solid #334155',
      borderRadius: 12,
      padding: '16px 20px',
      ...style,
    }}>
      <div style={{ fontSize: 13, color: 'var(--text-secondary, #94a3b8)', fontWeight: 500, marginBottom: 14 }}>
        {title}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {metrics.map((metric) => {
          const value   = kpis[metric] ?? null;
          const thresh  = KPI_THRESHOLDS[metric];
          const max     = thresh ? (thresh.lower_is_better ? thresh.critical : 100) : 100;
          const status  = getKPIStatus(metric, value);
          const color   = KPI_STATUS_COLORS[status] ?? KPI_COLORS[metric] ?? '#3b82f6';

          return (
            <div key={metric}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: 'var(--text-secondary, #94a3b8)' }}>
                  {KPI_LABELS[metric] ?? metric}
                </span>
                <span style={{ fontSize: 13, fontWeight: 600, color }}>
                  {value !== null ? formatKPI(metric, value) : '—'}
                </span>
              </div>
              <ProgressBar value={value ?? 0} max={max} color={color} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default memo(ProgressWidget);
