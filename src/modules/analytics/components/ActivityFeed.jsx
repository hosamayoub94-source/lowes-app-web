// =============================================================
// Analytics — ActivityFeed widget
// Latest rows of activity_logs (company-wide, not filtered by the period).
// =============================================================
import { memo } from 'react';
import { useActivity, useActivityMeta, useIsAnalyticsLoading } from '../hooks/useAnalytics';
import { ACTIVITY_ICONS } from '../types/analytics.types';
import StateBox from './StateBox';

function timeAgo(isoString) {
  const t = new Date(isoString).getTime();
  if (Number.isNaN(t)) return '';
  const diff = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (diff < 60)    return `منذ ${diff} ث`;
  if (diff < 3600)  return `منذ ${Math.floor(diff / 60)} د`;
  if (diff < 86400) return `منذ ${Math.floor(diff / 3600)} س`;
  return `منذ ${Math.floor(diff / 86400)} ي`;
}

const TYPE_COLORS = {
  check_in: '#22c55e', check_out: '#94a3b8', check_late: '#f59e0b', task_completed: '#3b82f6',
  task_overdue: '#ef4444', file_upload: '#ec4899', notification: '#a855f7', export: '#06b6d4',
  error: '#ef4444', default: '#64748b',
};

function ActivityFeed({ title = 'آخر النشاطات', limit = 8, style = {} }) {
  const activity = useActivity();
  const meta     = useActivityMeta();
  const loading  = useIsAnalyticsLoading();
  const items    = (activity ?? []).slice(0, limit);

  let body;
  if (loading && !meta) body = <StateBox kind="loading" compact />;
  else if (meta?.status === 'error') body = <StateBox kind="error" compact reason={meta.reason} />;
  else if (items.length === 0) body = <StateBox kind="empty" compact title="لا يوجد نشاط حديث" reason={meta?.reason} />;
  else {
    body = (
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {items.map((item, idx) => {
          const color = TYPE_COLORS[item.type] ?? TYPE_COLORS.default;
          return (
            <li key={item.id ?? idx} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 0', borderBottom: idx < items.length - 1 ? '1px solid rgb(var(--color-border) / 0.1)' : 'none' }}>
              <div aria-hidden="true" style={{ width: 28, height: 28, borderRadius: '50%', background: `${color}22`, border: `1.5px solid ${color}55`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, flexShrink: 0 }}>
                {ACTIVITY_ICONS[item.type] ?? ACTIVITY_ICONS.default}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="text-text" style={{ fontSize: 13, lineHeight: 1.4, overflowWrap: 'anywhere' }}>
                  <strong style={{ color }}>{item.user}</strong>{' '}{item.message}
                </div>
                <div className="text-muted" style={{ fontSize: 11, marginTop: 2 }}>{item.time ? timeAgo(item.time) : ''}</div>
              </div>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <section className="bg-surface border border-border" aria-label={title} style={{ borderRadius: 12, padding: '16px 20px', minWidth: 0, ...style }}>
      <h3 className="text-muted" style={{ fontSize: 13, fontWeight: 600, margin: '0 0 10px' }}>{title}</h3>
      {body}
      {meta?.source && meta.status === 'ok' && <div className="text-muted" style={{ fontSize: 11, marginTop: 8 }}>المصدر: {meta.source}</div>}
    </section>
  );
}

export default memo(ActivityFeed);
