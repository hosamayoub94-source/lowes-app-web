// =============================================================
// ActivityTimeline — task activity history in a vertical timeline.
// Pure presentational.
// =============================================================

import { memo } from 'react';
import { cn } from '@utils/classNames';
import { ACTIVITY_META } from '../types/task.types';
import { timeAgo } from '../utils/taskUtils';

// ── Single timeline entry ─────────────────────────────────────
const TimelineItem = memo(function TimelineItem({ entry, isLast }) {
  const meta = ACTIVITY_META[entry.type] || ACTIVITY_META.created;
  const { actor, note, created_at } = entry;

  return (
    <div className="flex gap-3 relative">
      {/* Line */}
      {!isLast && (
        <div className="absolute start-4 top-8 bottom-0 w-px bg-border" aria-hidden />
      )}
      {/* Icon dot */}
      <div className={cn(
        'w-8 h-8 rounded-full grid place-items-center text-sm shrink-0 z-10 border-2 border-surface',
        meta.colorClass,
      )}>
        <span aria-hidden>{meta.icon}</span>
      </div>
      {/* Content */}
      <div className="flex-1 min-w-0 pb-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <span className="text-xs font-bold text-text">{actor?.name || 'النظام'}</span>
            {actor?.role && (
              <span className="text-[10px] text-muted ms-1">— {actor.role}</span>
            )}
            <p className="text-xs text-muted mt-0.5 leading-relaxed">{note}</p>
          </div>
          <span className="text-[10px] text-muted whitespace-nowrap shrink-0 mt-0.5">
            {timeAgo(created_at)}
          </span>
        </div>
      </div>
    </div>
  );
});

// ── Main ──────────────────────────────────────────────────────
export const ActivityTimeline = memo(function ActivityTimeline({
  activities = [],
  className = '',
}) {
  if (!activities.length) {
    return (
      <p className={cn('text-sm text-muted text-center py-6', className)}>
        لا يوجد سجل نشاط بعد
      </p>
    );
  }

  // Show newest first
  const sorted = [...activities].sort(
    (a, b) => new Date(b.created_at) - new Date(a.created_at),
  );

  return (
    <div className={cn('space-y-0', className)}>
      <div className="flex items-center gap-2 mb-4">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden className="text-teal">
          <path d="M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
        </svg>
        <span className="text-sm font-bold text-text">سجل النشاط</span>
      </div>
      {sorted.map((entry, idx) => (
        <TimelineItem
          key={entry.id}
          entry={entry}
          isLast={idx === sorted.length - 1}
        />
      ))}
    </div>
  );
});

export default ActivityTimeline;
