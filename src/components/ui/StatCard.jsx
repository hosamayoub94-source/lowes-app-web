// =============================================================
// StatCard — KPI tile (label + value + delta + icon).
// Used heavily on dashboards: attendance, accounting, team.
// =============================================================
import { cn } from '@utils/classNames';
import Card from './Card';

export function StatCard({
  label,
  value,
  hint,
  delta,            // { value: number|string, dir: 'up'|'down'|'neutral' }
  icon,
  tone = 'default', // default | navy | teal | green | red | amber | purple | blue
  className = '',
}) {
  const tones = {
    default: 'bg-surface text-text border-border',
    navy: 'bg-navy text-white border-transparent',
    teal: 'bg-teal text-white border-transparent',
    green: 'bg-green-bg text-green-fg border-transparent',
    red: 'bg-red-bg text-red-fg border-transparent',
    amber: 'bg-amber-bg text-amber-fg border-transparent',
    purple: 'bg-purple-bg text-purple-fg border-transparent',
    blue: 'bg-blue-bg text-blue-fg border-transparent',
  };
  const isOnTone = tone !== 'default';
  const dirColor =
    delta?.dir === 'up'
      ? 'text-green-fg'
      : delta?.dir === 'down'
        ? 'text-red-fg'
        : 'text-muted';

  return (
    <Card variant="flat" padding="md" className={cn(tones[tone] || tones.default, className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className={cn('text-xs font-medium', isOnTone ? 'opacity-80' : 'text-muted')}>
            {label}
          </div>
          <div className="mt-1 text-2xl sm:text-3xl font-extrabold tracking-tight truncate">
            {value}
          </div>
          {hint && (
            <div className={cn('mt-1 text-xs', isOnTone ? 'opacity-80' : 'text-muted')}>
              {hint}
            </div>
          )}
        </div>
        {icon && (
          <div
            className={cn(
              'w-10 h-10 rounded-xl grid place-items-center shrink-0',
              isOnTone ? 'bg-white/15' : 'bg-surface-alt',
            )}
          >
            {icon}
          </div>
        )}
      </div>
      {delta && (
        <div className={cn('mt-3 inline-flex items-center gap-1 text-xs font-semibold', isOnTone ? 'opacity-90' : dirColor)}>
          {delta.dir === 'up' && <span aria-hidden>▲</span>}
          {delta.dir === 'down' && <span aria-hidden>▼</span>}
          <span>{delta.value}</span>
        </div>
      )}
    </Card>
  );
}

export default StatCard;
