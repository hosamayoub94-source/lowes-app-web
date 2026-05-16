// =============================================================
// TaskCard — list item for a task in the Tasks screen.
// Pure presentational; parent decides what onClick / onStatusChange does.
// =============================================================
import { cn } from '@utils/classNames';
import { Card } from '@components/ui/Card';
import { Badge } from '@components/ui/Badge';
import { Avatar } from '@components/ui/Avatar';

const STATUS_TONE = {
  todo: 'neutral',
  in_progress: 'blue',
  review: 'purple',
  done: 'green',
  blocked: 'red',
};

const PRIORITY_TONE = {
  low: 'neutral',
  medium: 'blue',
  high: 'amber',
  urgent: 'red',
};

const STATUS_LABEL = {
  todo: 'قيد الانتظار',
  in_progress: 'قيد التنفيذ',
  review: 'مراجعة',
  done: 'مكتملة',
  blocked: 'معلّقة',
};

const PRIORITY_LABEL = {
  low: 'منخفضة',
  medium: 'متوسطة',
  high: 'مرتفعة',
  urgent: 'عاجلة',
};

export function TaskCard({
  task,
  onClick,
  className = '',
  showAssignee = true,
}) {
  if (!task) return null;
  const { title, description, status, priority, due_date, points, assigned_to_name, assigned_to_avatar } = task;

  return (
    <Card
      as="button"
      variant="default"
      padding="md"
      onClick={onClick}
      className={cn(
        'text-start w-full hover:border-teal/40 transition-colors cursor-pointer',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-teal/30',
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge tone={STATUS_TONE[status] || 'neutral'}>{STATUS_LABEL[status] || status}</Badge>
            {priority && (
              <Badge tone={PRIORITY_TONE[priority] || 'neutral'}>
                {PRIORITY_LABEL[priority] || priority}
              </Badge>
            )}
            {points != null && Number(points) > 0 && (
              <Badge tone="teal">★ {points}</Badge>
            )}
          </div>
          <h4 className="mt-2 font-bold text-text truncate">{title}</h4>
          {description && (
            <p className="mt-1 text-sm text-muted line-clamp-2">{description}</p>
          )}
          <div className="mt-2 flex items-center gap-3 text-xs text-muted">
            {due_date && (
              <span className="inline-flex items-center gap-1">
                <span aria-hidden>📅</span>
                {due_date}
              </span>
            )}
            {showAssignee && assigned_to_name && (
              <span className="inline-flex items-center gap-1.5">
                <Avatar name={assigned_to_name} src={assigned_to_avatar} size="xs" />
                <span className="truncate">{assigned_to_name}</span>
              </span>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

export default TaskCard;
