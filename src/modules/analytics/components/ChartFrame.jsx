// =============================================================
// Analytics — ChartFrame
// Card shell shared by every series-based widget: title, loading / empty /
// error / unavailable states with the reason, and the data source line.
// children: (points) => ReactNode — rendered only when there is real data.
// =============================================================
import { memo } from 'react';
import { useSeriesFor, useSeriesMeta, useIsAnalyticsLoading } from '../hooks/useAnalytics';
import { KPI_LABELS } from '../types/analytics.types';
import StateBox from './StateBox';

function ChartFrame({ metric, title, style = {}, minHeight = 200, children }) {
  const points  = useSeriesFor(metric);
  const meta    = useSeriesMeta(metric);
  const loading = useIsAnalyticsLoading();
  const heading = title ?? KPI_LABELS[metric] ?? metric;

  let body;
  if (loading && !meta) body = <StateBox kind="loading" compact style={{ minHeight }} />;
  else if (!meta) body = <StateBox kind="empty" compact style={{ minHeight }} />;
  else if (meta.status === 'error') body = <StateBox kind="error" compact reason={meta.reason} style={{ minHeight }} />;
  else if (meta.status === 'unavailable') body = <StateBox kind="unavailable" compact reason={meta.reason} style={{ minHeight }} />;
  else if (meta.status === 'empty' || points.length === 0) body = <StateBox kind="empty" compact reason={meta.reason} style={{ minHeight }} />;
  else body = children(points);

  return (
    <section className="bg-surface border border-border" aria-label={heading} style={{ borderRadius: 12, padding: '16px 20px', minWidth: 0, ...style }}>
      <h3 className="text-muted" style={{ fontSize: 13, fontWeight: 600, margin: '0 0 12px' }}>{heading}</h3>
      {body}
      {meta?.source && meta.status === 'ok' && (
        <div className="text-muted" style={{ fontSize: 11, marginTop: 8 }}>المصدر: {meta.source}</div>
      )}
    </section>
  );
}

export default memo(ChartFrame);
