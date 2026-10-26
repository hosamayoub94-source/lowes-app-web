// =============================================================
// OpsTaskCard — compact card for the Ops Center.
// Shows only what is needed to act: title · owner · status · due ·
// blocker · next step · project/KPI/decision. Everything else lives in
// the drawer. Pure presentational.
// =============================================================
import { memo } from 'react';
import { cn } from '@utils/classNames';
import { Badge } from '@components/ui/Badge';
import { Avatar } from '@components/ui/Avatar';
import { STATUS_META_V3, normalizeStatus, isOverdue, isClosed, ownerId } from '../utils/taskWorkflow';
import { daysOverdue, dueKey, todayKey } from '../utils/taskDates';
import { readLinks, projectLabel, kpiLabel } from '../utils/taskLinks';
import { shortDate } from '../utils/taskUtils';

function DueLabel({ task, today }) {
  const k = dueKey(task.due_date);
  if (!k) return <span className="text-xs text-red-fg font-semibold">بلا موعد</span>;
  if (isOverdue(task, today)) {
    const d = daysOverdue(task.due_date, today);
    return <span className="text-xs font-bold text-red-fg whitespace-nowrap">متأخرة {d} {d === 1 ? 'يوم' : 'أيام'}</span>;
  }
  if (k === today) return <span className="text-xs font-bold text-amber-fg whitespace-nowrap">اليوم</span>;
  return <span className="text-xs text-muted whitespace-nowrap">{shortDate(task.due_date)}</span>;
}

export const OpsTaskCard = memo(function OpsTaskCard({ task, onClick, today = todayKey(), className = '' }) {
  if (!task) return null;
  const st = normalizeStatus(task.status);
  const meta = STATUS_META_V3[st] || STATUS_META_V3.ready;
  const closed = isClosed(task);
  const owner = task.assigned_to && typeof task.assigned_to === 'object' ? task.assigned_to : null;
  const links = readLinks(task);
  const late = isOverdue(task, today);

  return (
    <article className="relative">
      {!task.seen && (
        <span aria-label="غير مقروء" className="absolute top-3 start-3 w-2 h-2 rounded-full bg-teal animate-pulse" />
      )}
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'w-full text-start rounded-2xl border bg-surface p-4 space-y-2.5 transition-all',
          'hover:shadow-[0_4px_20px_rgba(13,115,119,0.12)] focus:outline-none focus-visible:ring-2 focus-visible:ring-teal/40',
          late ? 'border-red/40 bg-red-bg/10' : 'border-border',
          closed && 'opacity-75',
          className,
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <h4 className={cn('text-sm font-bold text-text leading-snug line-clamp-2 min-w-0', closed && 'line-through text-muted')}>
            {task.title}
          </h4>
          <Badge tone={meta.tone} className="shrink-0 h-6 text-[11px]">
            <span aria-hidden>{meta.icon}</span>{meta.label}
          </Badge>
        </div>

        {st === 'blocked' && task.blocker && (
          <p className="text-xs text-red-fg bg-red-bg/60 rounded-lg px-2.5 py-1.5 leading-relaxed">⛔ {task.blocker}</p>
        )}
        {st === 'waiting_reply' && task.next_step && (
          <p className="text-xs text-amber-fg bg-amber-bg/60 rounded-lg px-2.5 py-1.5 leading-relaxed">💬 {task.next_step}</p>
        )}
        {st !== 'blocked' && st !== 'waiting_reply' && task.next_step && !closed && (
          <p className="text-xs text-muted leading-relaxed line-clamp-2"><span className="font-semibold">التالي:</span> {task.next_step}</p>
        )}

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            {owner?.name || ownerId(task) ? (
              <>
                <Avatar name={owner?.name} src={owner?.avatar} size="xs" />
                <span className="text-xs text-muted truncate">{owner?.name || 'مالك غير معروف'}</span>
              </>
            ) : (
              <span className="text-xs font-semibold text-red-fg">بلا مالك</span>
            )}
          </div>
          <DueLabel task={task} today={today} />
        </div>

        {(links.project_code || links.kpi_key || links.decision_ref) && (
          <div className="flex flex-wrap gap-1.5">
            {links.project_code && <Badge tone="teal" className="h-5 text-[10px] px-2" title={projectLabel(links.project_code) || ''}>{links.project_code}</Badge>}
            {links.kpi_key && <Badge tone="blue" className="h-5 text-[10px] px-2">KPI · {kpiLabel(links.kpi_key)}</Badge>}
            {links.decision_ref && <Badge tone="purple" className="h-5 text-[10px] px-2">{links.decision_ref}</Badge>}
          </div>
        )}
      </button>
    </article>
  );
});

export default OpsTaskCard;
