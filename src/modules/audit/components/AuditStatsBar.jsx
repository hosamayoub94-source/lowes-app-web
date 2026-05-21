// =============================================================
// Audit — AuditStatsBar
// Summary cards shown at the top of the audit dashboard.
// =============================================================
import { memo } from 'react';

const toneClasses = {
  blue:    'from-blue-bg border-blue',
  red:     'from-red-bg border-red',
  amber:   'from-amber-bg border-amber',
  teal:    'from-teal/10 border-teal',
  neutral: 'from-surface border-border',
};

const StatCard = memo(function StatCard({ label, value, sub, tone, icon, loading }) {
  const tc = toneClasses[tone] || toneClasses.neutral;

  return (
    <div className={`relative overflow-hidden rounded-xl border bg-gradient-to-br to-surface p-4 ${tc}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs text-muted mb-1">{label}</p>
          {loading ? (
            <div className="h-7 w-14 rounded bg-border/30 animate-pulse" />
          ) : (
            <p className="text-2xl font-bold text-text tabular-nums">
              {value ?? '—'}
            </p>
          )}
          {sub && (
            <p className="text-[11px] text-muted mt-0.5">{sub}</p>
          )}
        </div>
        <span className="text-2xl opacity-60">{icon}</span>
      </div>
    </div>
  );
});

/**
 * @param {object}  props
 * @param {object}  props.stats        — from fetchAuditStats()
 * @param {boolean} props.loading
 */
export const AuditStatsBar = memo(function AuditStatsBar({ stats, loading }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <StatCard
        label="اليوم"
        value={stats?.totalToday}
        sub="إجمالي الأحداث"
        icon="📊"
        tone="teal"
        loading={loading}
      />
      <StatCard
        label="هذا الأسبوع"
        value={stats?.totalWeek}
        sub="آخر 7 أيام"
        icon="📅"
        tone="blue"
        loading={loading}
      />
      <StatCard
        label="محاولات دخول فاشلة"
        value={stats?.failedLogins}
        sub="آخر 7 أيام"
        icon="🚫"
        tone="amber"
        loading={loading}
      />
      <StatCard
        label="أحداث حرجة"
        value={stats?.criticalCount}
        sub="آخر 7 أيام"
        icon="🔴"
        tone={stats?.criticalCount > 0 ? 'red' : 'neutral'}
        loading={loading}
      />
    </div>
  );
});
