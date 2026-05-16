// =============================================================
// Analytics — ActivityFeed widget
// Live feed of recent system events.
// =============================================================
import { memo } from 'react';
import { useActivity } from '../hooks/useAnalytics';
import { ACTIVITY_ICONS } from '../types/analytics.types';

function _timeAgo(isoString) {
  const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
  if (diff < 60)   return `منذ ${diff} ث`;
  if (diff < 3600) return `منذ ${Math.floor(diff / 60)} د`;
  if (diff < 86400)return `منذ ${Math.floor(diff / 3600)} س`;
  return `منذ ${Math.floor(diff / 86400)} ي`;
}

const TYPE_COLORS = {
  check_in:       '#22c55e',
  check_out:      '#94a3b8',
  check_late:     '#f59e0b',
  task_completed: '#3b82f6',
  task_overdue:   '#ef4444',
  file_upload:    '#ec4899',
  notification:   '#a855f7',
  export:         '#06b6d4',
  error:          '#ef4444',
  default:        '#64748b',
};

function ActivityFeed({ title = 'النشاط الأخير', limit = 8, style = {} }) {
  const activity = useActivity();
  const items    = (activity ?? []).slice(0, limit);

  return (
    <div style={{
      background: 'var(--surface, #1e293b)',
      border: '1px solid #334155',
      borderRadius: 12,
      padding: '16px 20px',
      ...style,
    }}>
      <div style={{ fontSize: 13, color: 'var(--text-secondary, #94a3b8)', fontWeight: 500, marginBottom: 12 }}>
        {title}
      </div>

      {items.length === 0 ? (
        <div style={{ color: '#64748b', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>
          لا يوجد نشاط حديث
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {items.map((item, idx) => {
            const icon  = ACTIVITY_ICONS[item.type] ?? ACTIVITY_ICONS.default;
            const color = TYPE_COLORS[item.type] ?? TYPE_COLORS.default;
            return (
              <div key={item.id ?? idx} style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
                padding: '8px 0',
                borderBottom: idx < items.length - 1 ? '1px solid #1e293b88' : 'none',
              }}>
                {/* Icon dot */}
                <div style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  background: `${color}22`,
                  border: `1.5px solid ${color}55`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 13,
                  flexShrink: 0,
                  marginTop: 1,
                }}>
                  {icon}
                </div>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: 'var(--text, #e2e8f0)', lineHeight: 1.4 }}>
                    <strong style={{ color }}>{item.user}</strong>
                    {' '}
                    {item.message}
                  </div>
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                    {item.time ? _timeAgo(item.time) : ''}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default memo(ActivityFeed);
