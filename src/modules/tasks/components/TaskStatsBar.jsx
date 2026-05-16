// =============================================================
// TaskStatsBar — KPI dashboard row for Tasks page.
// Pure presentational — receives stats object as prop.
// =============================================================

import { memo } from 'react';
import { cn } from '@utils/classNames';
import { StatCard } from '@components/ui/StatCard';
import { ProgressBar } from '@components/ui/ProgressBar';
import { Card } from '@components/ui/Card';

// ── Completion ring ───────────────────────────────────────────
function CompletionRing({ pct }) {
  const r = 28;
  const circ = 2 * Math.PI * r;
  const dash = circ - (pct / 100) * circ;
  return (
    <div className="relative w-16 h-16 shrink-0">
      <svg className="-rotate-90" width="64" height="64" viewBox="0 0 64 64" aria-hidden>
        <circle cx="32" cy="32" r={r} fill="none" stroke="rgb(var(--color-surface-alt))" strokeWidth="6" />
        <circle
          cx="32" cy="32" r={r}
          fill="none"
          stroke="rgb(var(--color-teal))"
          strokeWidth="6"
          strokeDasharray={`${circ}`}
          strokeDashoffset={dash}
          strokeLinecap="round"
          className="transition-[stroke-dashoffset] duration-700"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-sm font-extrabold text-text">
        {pct}%
      </span>
    </div>
  );
}

// ── Stat item ─────────────────────────────────────────────────
function StatItem({ label, value, colorClass, icon }) {
  return (
    <div className="flex flex-col items-center gap-0.5 min-w-0">
      <span className={cn('text-2xl font-extrabold tabular-nums', colorClass)}>
        {value}
      </span>
      <span className="text-[11px] text-muted text-center leading-tight whitespace-nowrap">
        {icon && <span className="me-0.5" aria-hidden>{icon}</span>}
        {label}
      </span>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────
export const TaskStatsBar = memo(function TaskStatsBar({ stats, className = '' }) {
  if (!stats) return null;
  const { total, pending, inProgress, completed, cancelled, overdue, completionPct } = stats;

  return (
    <div className={cn('space-y-3', className)}>
      {/* ── Main stat cards row ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          label="إجمالي المهام"
          value={total}
          icon={<span className="text-lg" aria-hidden>📋</span>}
          tone="default"
        />
        <StatCard
          label="قيد التنفيذ"
          value={inProgress}
          icon={<span className="text-lg" aria-hidden>🔄</span>}
          tone="blue"
        />
        <StatCard
          label="مكتملة"
          value={completed}
          icon={<span className="text-lg" aria-hidden>✅</span>}
          tone="green"
        />
        <StatCard
          label="متأخرة"
          value={overdue}
          icon={<span className="text-lg" aria-hidden>🔥</span>}
          tone={overdue > 0 ? 'red' : 'default'}
          delta={overdue > 0 ? { value: 'تحتاج اهتماماً', dir: 'down' } : undefined}
        />
      </div>

      {/* ── Completion summary card ── */}
      <Card variant="flat" padding="md">
        <div className="flex items-center gap-4">
          <CompletionRing pct={completionPct} />
          <div className="flex-1 min-w-0 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-text">نسبة الإنجاز الكلية</span>
              <span className="text-sm font-bold text-teal">{completed}/{total}</span>
            </div>
            <ProgressBar value={completionPct} max={100} tone="teal" size="md" />
            <div className="flex items-center gap-4 flex-wrap">
              <StatItem label="قيد الانتظار" value={pending}   colorClass="text-muted"    icon="⏳" />
              <StatItem label="ملغاة"         value={cancelled} colorClass="text-muted"    icon="⛔" />
              {overdue > 0 && (
                <StatItem label="متأخرة"      value={overdue}   colorClass="text-red-fg"   icon="🔥" />
              )}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
});

export default TaskStatsBar;
