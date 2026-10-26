// =============================================================
// Analytics — StatCard widget
// One KPI: current value, comparison with the previous period, assessment
// limits (NOT management targets), data source, and drill-down on click.
// A metric with no real data shows WHY — never a made-up number.
// =============================================================
import { memo } from 'react';
import { useKPI, useKpiMeta, useTrend, usePrevKPI, useIsAnalyticsLoading } from '../hooks/useAnalytics';
import { useAnalyticsNav } from './AnalyticsNavContext';
import { thresholdInfo } from '../services/reportMath';
import { formatKPI, KPI_LABELS, KPI_COLORS, KPI_STATUS_COLORS, KPI_DRILLDOWN } from '../types/analytics.types';

const ARROWS = { up: '↑', down: '↓', flat: '→' };
const STATUS_TEXT = { critical: 'حرج', warn: 'تحذير' };

function StatCard({ metric, title, icon, style = {} }) {
  const value   = useKPI(metric);
  const meta    = useKpiMeta(metric);
  const trend   = useTrend(metric);
  const prev    = usePrevKPI(metric);
  const loading = useIsAnalyticsLoading();
  const nav     = useAnalyticsNav();

  const heading   = title ?? KPI_LABELS[metric] ?? metric;
  const th        = Number.isFinite(value) ? thresholdInfo(metric, value) : null;
  const status    = th?.status ?? 'unknown';
  const edge      = KPI_STATUS_COLORS[status] ?? KPI_STATUS_COLORS.unknown;
  const hasValue  = Number.isFinite(value);
  const drill     = KPI_DRILLDOWN[metric];
  const clickable = !!(nav.open && drill);

  let trendColor = '#64748b';
  if (trend.available && trend.improving === true) trendColor = '#16a34a';
  if (trend.available && trend.improving === false) trendColor = '#dc2626';

  const reasonText = meta?.reason;
  const emptyLabel = meta?.status === 'error' ? 'خطأ' : meta?.status === 'unavailable' ? 'غير متوفر' : 'لا توجد بيانات';

  const inner = (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <span className="text-muted" style={{ fontSize: 13, fontWeight: 600 }}>{heading}</span>
        {icon && <span aria-hidden="true" style={{ fontSize: 18 }}>{icon}</span>}
      </div>

      {hasValue ? (
        <div style={{ fontSize: 28, fontWeight: 700, color: KPI_COLORS[metric] ?? '#3b82f6', lineHeight: 1.1 }}>
          {formatKPI(metric, value)}
        </div>
      ) : loading && !meta ? (
        <div className="text-muted" style={{ fontSize: 20, lineHeight: 1.1 }} aria-label="جارٍ التحميل">…</div>
      ) : (
        <div>
          <div className={meta?.status === 'error' ? undefined : 'text-muted'} style={{ fontSize: 16, fontWeight: 700, color: meta?.status === 'error' ? '#dc2626' : undefined }}>{emptyLabel}</div>
          {reasonText && <div className="text-muted" style={{ fontSize: 11, marginTop: 2, lineHeight: 1.5 }}>{reasonText}</div>}
        </div>
      )}

      {hasValue && (
        <div style={{ fontSize: 12, color: trendColor }}>
          {trend.available ? (
            <>
              <span aria-hidden="true" style={{ fontWeight: 700 }}>{ARROWS[trend.direction]} </span>
              {trend.direction === 'flat'
                ? 'بلا تغيير عن الفترة السابقة'
                : `${trend.pct === null ? Math.abs(trend.delta) : `${Math.abs(trend.pct)}%`} ${trend.direction === 'up' ? 'ارتفاعاً' : 'انخفاضاً'} عن الفترة السابقة`}
              {Number.isFinite(prev) && <span className="text-muted"> (السابقة: {formatKPI(metric, prev)})</span>}
            </>
          ) : (
            <span className="text-muted">لا مقارنة متاحة بالفترة السابقة</span>
          )}
        </div>
      )}

      {th && hasValue && (
        <div className="text-muted" style={{ fontSize: 11, lineHeight: 1.5 }}>
          {STATUS_TEXT[status] && (
            <span style={{ color: edge, fontWeight: 700 }}>{STATUS_TEXT[status]} · </span>
          )}
          {th.note}
          {th.proximityPct !== null && ` · ${th.proximityPct}% من حد التحذير`}
        </div>
      )}

      {meta?.source && <div className="text-muted" style={{ fontSize: 10, marginTop: 'auto' }}>المصدر: {meta.source}</div>}
      {clickable && <div style={{ fontSize: 11, color: '#3b82f6' }}>عرض التفاصيل ←</div>}
    </>
  );

  const shell = {
    border: `1px solid ${edge}33`,
    borderTop: `3px solid ${edge}`,
    borderRadius: 12,
    padding: '14px 16px',
    display: 'flex', flexDirection: 'column', gap: 6,
    minHeight: 120, minWidth: 0, textAlign: 'right', width: '100%',
    ...style,
  };

  return clickable ? (
    <button
      type="button"
      className="bg-surface hover:bg-surface-alt focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
      style={{ ...shell, cursor: 'pointer', font: 'inherit' }}
      onClick={() => nav.open(metric)}
      aria-label={`${heading}: ${hasValue ? formatKPI(metric, value) : emptyLabel} — عرض التفاصيل`}
    >
      {inner}
    </button>
  ) : (
    <div className="bg-surface" style={shell}>{inner}</div>
  );
}

export default memo(StatCard);
