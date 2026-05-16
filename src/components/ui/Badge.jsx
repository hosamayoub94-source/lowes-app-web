// =============================================================
// Badge — status pill. Tones map to theme color tokens so
// they swap correctly in light/dark.
//   neutral | green | red | blue | amber | purple | teal
// =============================================================
import { cn } from '@utils/classNames';

const TONES = {
  neutral: 'bg-surface-alt text-text border-border',
  green: 'bg-green-bg text-green-fg border-transparent',
  red: 'bg-red-bg text-red-fg border-transparent',
  blue: 'bg-blue-bg text-blue-fg border-transparent',
  amber: 'bg-amber-bg text-amber-fg border-transparent',
  purple: 'bg-purple-bg text-purple-fg border-transparent',
  teal: 'bg-teal/10 text-teal border-transparent',
};

export function Badge({ tone = 'neutral', className = '', children, ...rest }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2.5 h-7 rounded-full text-xs font-semibold border',
        TONES[tone] || TONES.neutral,
        className,
      )}
      {...rest}
    >
      {children}
    </span>
  );
}

export default Badge;
