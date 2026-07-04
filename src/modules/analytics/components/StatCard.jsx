// =============================================================
// Analytics — StatCard widget
// Displays a single KPI value with trend indicator.
// =============================================================
import { memo } from 'react';
import { useKPI, useTrend } from '../hooks/useAnalytics';
import { formatKPI, getKPIStatus, KPI_LABELS, KPI_COLORS, KPI_STATUS_COLORS } from '../types/analytics.types';

const TREND_ICONS = { up: '↑', down: '↓', flat: '→' };

function StatCard({ metric, title, icon, style = {} }) {
  const value  = useKPI(metric);
  const trend  = useTrend(metric);
  const status = getKPIStatus(metric, value);

  const borderColor  = KPI_STATUS_COLORS[status];
  const metricColor  = KPI_COLORS[metric] ?? '#3b82f6';
  const trendColor   = trend.direction === 'up' ? '#22c55e' : trend.direction === 'down' ? '#ef4444' : '#64748b';
  const trendIcon    = TREND_ICONS[trend.direction] ?? '→';

  return (
    <div className="bg-surface" style={{
      border: `1px solid ${borderColor}33`,
      borderTop: `3px solid ${borderColor}`,
      borderRadius: 12,
      padding: '16px 20px',
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      minHeight: 120,
      ...style,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="text-muted" style={{ fontSize: 13, fontWeight: 500 }}>
          {title ?? KPI_LABELS[metric] ?? metric}
        </span>
        {icon && <span style={{ fontSize: 18 }}>{icon}</span>}
      </div>

      {/* Value */}
      <div style={{ fontSize: 28, fontWeight: 700, color: metricColor, lineHeight: 1 }}>
        {value !== null ? formatKPI(metric, value) : '—'}
      </div>

      {/* Trend */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: trendColor }}>
        <span style={{ fontWeight: 600 }}>{trendIcon}</span>
        <span>
          {trend.trendPct !== 0
            ? `${trend.trendPct > 0 ? '+' : ''}${trend.trendPct}% مقارنة بالفترة السابقة`
            : 'لا تغيير'}
        </span>
      </div>

      {/* Status badge */}
      {status !== 'good' && (
        <div style={{
          alignSelf: 'flex-start',
          background: `${borderColor}22`,
          color: borderColor,
          borderRadius: 6,
          padding: '2px 8px',
          fontSize: 11,
          fontWeight: 600,
        }}>
          {status === 'critical' ? 'حرج' : 'تحذير'}
        </div>
      )}
    </div>
  );
}

export default memo(StatCard);
