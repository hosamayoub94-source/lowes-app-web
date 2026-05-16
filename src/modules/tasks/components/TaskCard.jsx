// =============================================================
// TaskCard — production-grade task card. Mobile-first, RTL.
// Pure presentational. All logic lives in store/utils.
// =============================================================

import { memo } from 'react';
import { cn } from '@utils/classNames';
import { Card } from '@components/ui/Card';
import { Badge } from '@components/ui/Badge';
import { Avatar } from '@components/ui/Avatar';
import { ProgressBar } from '@components/ui/ProgressBar';
import { STATUS_META, PRIORITY_META, progressTone } from '../types/task.types';
import { useCountdown } from '../hooks/useCountdown';
import { shortDate, effectiveStatus } from '../utils/taskUtils';

// ── Sub-components ────────────────────────────────────────────

function UnseenDot() {
  return (
    <span
      aria-label="غير مقروء"
      className="absolute top-3 start-3 w-2 h-2 rounded-full bg-teal shadow-[0_0_0_3px_rgb(var(--color-surface))] animate-pulse"
    />
  );
}

function CommentsBadge({ count }) {
  if (!count) return null;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
      {count}
    </span>
  );
}

function ProgressSection({ progress }) {
  if (progress == null) return null;
  const tone = progressTone(progress);
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted">الإنجاز</span>
        <span className={cn(
          'font-bold tabular-nums',
          progress >= 100 ? 'text-green-fg' : progress >= 60 ? 'text-teal' : progress >= 30 ? 'text-amber-fg' : 'text-red-fg',
        )}>
          {progress}%
        </span>
      </div>
      <ProgressBar value={progress} max={100} tone={tone} size="sm" />
    </div>
  );
}

// ── Main Card ─────────────────────────────────────────────────

export const TaskCard = memo(function TaskCard({
  task,
  onClick,
  className = '',
}) {
  if (!task) return null;

  const effStatus = effectiveStatus(task);
  const { title, description, priority, progress, due_date, assigned_to, comments_count, seen, tags } = task;
  const statusMeta   = STATUS_META[effStatus]  || STATUS_META.pending;
  const priorityMeta = PRIORITY_META[priority] || null;
  const isOverdue    = effStatus === 'overdue';
  const isCompleted  = effStatus === 'completed';
  const { label: countdown, colorClass: countdownColor } = useCountdown(due_date, effStatus);

  return (
    <article className="relative">
      {!seen && <UnseenDot />}
      <Card
        as="button"
        variant="default"
        padding="none"
        onClick={onClick}
        className={cn(
          'text-start w-full transition-all duration-200 cursor-pointer group',
          'hover:shadow-[0_4px_20px_rgba(13,115,119,0.12)] hover:-translate-y-[1px]',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-teal/40',
          'active:scale-[0.99] active:shadow-none',
          isOverdue  && 'border-red/40 bg-red-bg/20',
          isCompleted && 'opacity-80',
          className,
        )}
      >
        <div className="p-4 space-y-3">

          {/* ── Badges row ── */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <Badge tone={statusMeta.tone} className="gap-1">
              <span aria-hidden className="text-[10px]">{statusMeta.icon}</span>
              {statusMeta.label}
            </Badge>
            {priorityMeta && (
              <Badge tone={priorityMeta.tone} className="gap-1">
                <span aria-hidden className="text-[10px]">{priorityMeta.icon}</span>
                {priorityMeta.label}
              </Badge>
            )}
            {tags?.slice(0, 2).map((tag) => (
              <Badge key={tag} tone="teal" className="text-[10px] h-5 px-2">
                {tag}
              </Badge>
            ))}
          </div>

          {/* ── Title + description ── */}
          <div className="min-w-0">
            <h4 className={cn(
              'font-bold text-text leading-snug line-clamp-2 text-sm sm:text-base',
              'group-hover:text-teal transition-colors',
              isCompleted && 'line-through text-muted',
            )}>
              {title}
            </h4>
            {description && (
              <p className="mt-1 text-xs sm:text-sm text-muted line-clamp-2 leading-relaxed">
                {description}
              </p>
            )}
          </div>

          {/* ── Progress bar ── */}
          {!isCompleted && progress != null && (
            <ProgressSection progress={progress} />
          )}

          {/* ── Footer: assignee + meta ── */}
          <div className="flex items-center justify-between gap-2 pt-0.5">
            {/* Assigned to */}
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              {assigned_to ? (
                <>
                  <Avatar name={assigned_to.name} src={assigned_to.avatar} size="xs" />
                  <span className="text-xs text-muted truncate">{assigned_to.name}</span>
                </>
              ) : (
                <span className="text-xs text-muted italic">غير مُعيَّن</span>
              )}
            </div>

            {/* Right meta: comments + countdown */}
            <div className="flex items-center gap-3 shrink-0">
              <CommentsBadge count={comments_count} />
              {due_date && (
                <span className={cn('text-xs font-medium whitespace-nowrap', countdownColor)}>
                  {countdown || shortDate(due_date)}
                </span>
              )}
            </div>
          </div>

        </div>

        {/* ── Bottom accent line for overdue ── */}
        {isOverdue && (
          <div className="h-0.5 w-full bg-red rounded-b-2xl" aria-hidden />
        )}
        {isCompleted && (
          <div className="h-0.5 w-full bg-green rounded-b-2xl" aria-hidden />
        )}
      </Card>
    </article>
  );
});

export default TaskCard;
