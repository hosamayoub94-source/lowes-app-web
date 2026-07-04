// =============================================================
// Analytics — KPIAlertCard widget
// Lists all KPIs that have breached warn/critical thresholds.
// =============================================================
import { memo } from 'react';
import { useAlerts } from '../hooks/useAnalytics';
import { KPI_LABELS, formatKPI, KPI_STATUS_COLORS } from '../types/analytics.types';

const STATUS_LABELS = {
  critical: 'حرج',
  warn:     'تحذير',
};

const STATUS_ICONS = {
  critical: '🔴',
  warn:     '🟡',
};

function KPIAlertCard({ title = 'تنبيهات المؤشرات', style = {} }) {
  const alerts = useAlerts();

  return (
    <div className="bg-surface border border-border" style={{
      borderRadius: 12,
      padding: '16px 20px',
      ...style,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span className="text-muted" style={{ fontSize: 13, fontWeight: 500 }}>
          {title}
        </span>
        {alerts.length > 0 && (
          <span style={{
            background: '#ef444433',
            color: '#ef4444',
            borderRadius: 999,
            padding: '2px 8px',
            fontSize: 11,
            fontWeight: 700,
          }}>
            {alerts.length}
          </span>
        )}
      </div>

      {alerts.length === 0 ? (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 6,
          padding: '20px 0',
          color: '#22c55e',
        }}>
          <span style={{ fontSize: 24 }}>✅</span>
          <span className="text-muted" style={{ fontSize: 13 }}>جميع المؤشرات في الحدود الطبيعية</span>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {alerts.map((alert) => {
            const color = KPI_STATUS_COLORS[alert.status] ?? '#f59e0b';
            return (
              <div key={alert.metric} style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                background: `${color}11`,
                border: `1px solid ${color}33`,
                borderRadius: 8,
                padding: '8px 12px',
              }}>
                <span style={{ fontSize: 14 }}>{STATUS_ICONS[alert.status]}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color }}>
                    {KPI_LABELS[alert.metric] ?? alert.metric}
                  </div>
                  <div className="text-muted" style={{ fontSize: 11, marginTop: 1 }}>
                    القيمة الحالية: {formatKPI(alert.metric, alert.value)}
                  </div>
                </div>
                <span style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color,
                  background: `${color}22`,
                  padding: '2px 6px',
                  borderRadius: 4,
                }}>
                  {STATUS_LABELS[alert.status] ?? alert.status}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default memo(KPIAlertCard);
