// =============================================================
// Analytics — Executive tab
// Plain-language summary of the period + the customisable widget board.
// (Header, filters, alerts, export and tabs live in AnalyticsHub.)
// =============================================================
import { memo, useMemo } from 'react';
import { useKPIs, useTrends, useKpiMetaMap, useAnalyticsStatus } from '../hooks/useAnalytics';
import { buildExecutiveSummary } from '../services/reportMath';
import DashboardBuilder from '../components/DashboardBuilder';
import StateBox from '../components/StateBox';

function ExecutiveDashboard() {
  const kpis = useKPIs();
  const trends = useTrends();
  const meta = useKpiMetaMap();
  const status = useAnalyticsStatus();
  const lines = useMemo(() => buildExecutiveSummary(kpis, trends, meta), [kpis, trends, meta]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <section className="bg-surface border border-border" aria-label="ملخص الفترة" style={{ borderRadius: 12, padding: '14px 16px' }}>
        <h2 className="text-text" style={{ fontSize: 15, fontWeight: 700, margin: '0 0 8px' }}>ملخص الفترة للإدارة</h2>
        {status === 'loading' && Object.keys(kpis).length === 0 ? (
          <StateBox kind="loading" compact />
        ) : (
          <ul className="text-text" style={{ margin: 0, paddingInlineStart: 20, fontSize: 14, lineHeight: 1.9 }}>
            {lines.map((l) => <li key={l}>{l}</li>)}
          </ul>
        )}
      </section>

      <DashboardBuilder editable />
    </div>
  );
}

export default memo(ExecutiveDashboard);
