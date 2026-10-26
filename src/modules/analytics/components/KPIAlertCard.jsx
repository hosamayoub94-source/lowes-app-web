// =============================================================
// Analytics — "يحتاج انتباهك" (KPIAlertCard)
// Threshold breaches, falling trends, overdue work and data problems for
// the current tab, most severe first. Each item can open its details.
// =============================================================
import { memo, useState } from 'react';
import { useAlerts, useAnalyticsStatus } from '../hooks/useAnalytics';
import { useAnalyticsNav } from './AnalyticsNavContext';
import { KPI_DRILLDOWN } from '../types/analytics.types';

const SEVERITY = {
  critical: { color: '#dc2626', label: 'حرج',    icon: '🔴' },
  warn:     { color: '#d97706', label: 'تحذير',  icon: '🟡' },
  info:     { color: '#64748b', label: 'معلومة', icon: 'ℹ️' },
};
const KIND_LABEL = { threshold: 'حدود التقييم', trend: 'تراجع', action: 'إجراء مطلوب', data: 'جودة البيانات' };
const LIMIT = 6;

function KPIAlertCard({ title = 'يحتاج انتباهك', style = {} }) {
  const alerts = useAlerts();
  const status = useAnalyticsStatus();
  const nav    = useAnalyticsNav();
  const [all, setAll] = useState(false);
  const shown = all ? alerts : alerts.slice(0, LIMIT);
  const urgent = alerts.filter((a) => a.severity !== 'info').length;

  return (
    <section className="bg-surface border border-border" aria-label={title} style={{ borderRadius: 12, padding: '14px 16px', ...style }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <h3 className="text-text" style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>{title}</h3>
        {urgent > 0 && (
          <span style={{ background: '#dc262622', color: '#dc2626', borderRadius: 999, padding: '2px 8px', fontSize: 11, fontWeight: 700 }} aria-label={`${urgent} تنبيه`}>
            {urgent}
          </span>
        )}
      </div>

      {status === 'loading' && alerts.length === 0 ? (
        <div className="text-muted" style={{ fontSize: 13, padding: '12px 0' }}>جارٍ التحقق…</div>
      ) : alerts.length === 0 ? (
        <div className="text-muted" style={{ fontSize: 13, padding: '12px 0' }}>
          <span aria-hidden="true">✅ </span>لا شيء يحتاج انتباهك ضمن الفترة والفلاتر الحالية.
        </div>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {shown.map((a) => {
            const sev = SEVERITY[a.severity] ?? SEVERITY.info;
            const canOpen = !!(nav.open && KPI_DRILLDOWN[a.metric]);
            return (
              <li key={a.id} style={{ background: `${sev.color}12`, border: `1px solid ${sev.color}33`, borderRadius: 8, padding: '8px 12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span aria-hidden="true">{sev.icon}</span>
                  <strong className="text-text" style={{ fontSize: 13, flex: 1, minWidth: 140 }}>{a.title}</strong>
                  <span style={{ fontSize: 10, fontWeight: 700, color: sev.color, background: `${sev.color}22`, padding: '2px 6px', borderRadius: 4 }}>
                    {sev.label} · {KIND_LABEL[a.kind] ?? a.kind}
                  </span>
                </div>
                <div className="text-muted" style={{ fontSize: 12, marginTop: 4, lineHeight: 1.6 }}>{a.detail}</div>
                {canOpen && (
                  <button type="button" onClick={() => nav.open(a.metric)} style={{ marginTop: 2, fontSize: 12, color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', padding: '6px 0', minHeight: 36 }}>
                    عرض التفاصيل ←
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {alerts.length > LIMIT && (
        <button type="button" onClick={() => setAll((v) => !v)} className="text-muted" style={{ marginTop: 8, fontSize: 12, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', minHeight: 36 }}>
          {all ? 'عرض أقل' : `عرض الكل (${alerts.length})`}
        </button>
      )}
    </section>
  );
}

export default memo(KPIAlertCard);
