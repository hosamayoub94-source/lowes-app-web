// =============================================================
// Card — primary surface container. Variants:
//   default  → standard card with border + soft shadow
//   flat     → no shadow, just border
//   gradient → for hero/feature blocks (uses --grad-* tokens)
// =============================================================
import { cn } from '@utils/classNames';

export function Card({
  as: Tag = 'div',
  variant = 'default',
  padding = 'md',
  className = '',
  children,
  ...rest
}) {
  const base = 'rounded-2xl bg-surface text-text border';
  const variants = {
    default: 'border-border shadow-soft',
    flat: 'border-border',
    gradient: 'border-transparent shadow-soft text-white bg-navy',
  };
  const paddings = {
    none: '',
    sm: 'p-3',
    md: 'p-4 sm:p-5',
    lg: 'p-5 sm:p-7',
  };
  return (
    <Tag
      className={cn(base, variants[variant], paddings[padding], className)}
      {...rest}
    >
      {children}
    </Tag>
  );
}

export function CardHeader({ className = '', children, ...rest }) {
  return (
    <div className={cn('flex items-center justify-between gap-3 mb-3', className)} {...rest}>
      {children}
    </div>
  );
}

export function CardTitle({ className = '', children, ...rest }) {
  return (
    <h3 className={cn('text-base sm:text-lg font-bold text-text', className)} {...rest}>
      {children}
    </h3>
  );
}

export function CardSubtitle({ className = '', children, ...rest }) {
  return (
    <p className={cn('text-sm text-muted', className)} {...rest}>
      {children}
    </p>
  );
}

export default Card;
