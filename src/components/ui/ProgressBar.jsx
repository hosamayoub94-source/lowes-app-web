// =============================================================
// ProgressBar — linear indicator. Tones map to status colors.
// =============================================================
import { cn } from '@utils/classNames';

const TONES = {
  navy: 'bg-navy',
  teal: 'bg-teal',
  green: 'bg-green',
  red: 'bg-red',
  amber: 'bg-amber',
  blue: 'bg-blue',
  purple: 'bg-purple',
};

export function ProgressBar({
  value = 0,
  max = 100,
  tone = 'teal',
  showLabel = false,
  size = 'md',
  className = '',
}) {
  const pct = Math.max(0, Math.min(100, Math.round((Number(value) / Math.max(1, Number(max))) * 100)));
  const heights = { sm: 'h-1.5', md: 'h-2', lg: 'h-3' };
  return (
    <div className={cn('w-full', className)}>
      <div
        className={cn(
          'w-full rounded-full bg-surface-alt overflow-hidden',
          heights[size] || heights.md,
        )}
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={cn('h-full rounded-full transition-[width] duration-500', TONES[tone] || TONES.teal)}
          style={{ width: `${pct}%` }}
        />
      </div>
      {showLabel && (
        <div className="mt-1 text-xs text-muted text-end">{pct}%</div>
      )}
    </div>
  );
}

export default ProgressBar;
