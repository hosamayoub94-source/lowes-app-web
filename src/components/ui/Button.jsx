// =============================================================
// Button — single source of truth. Variants map directly to
// the legacy .btn / .btn-primary / .btn-ghost styles.
//   primary | secondary | ghost | danger | success
// Sizes: sm | md | lg
// =============================================================
import { forwardRef } from 'react';
import { cn } from '@utils/classNames';

const VARIANTS = {
  primary:
    'bg-navy text-white hover:opacity-95 active:opacity-90 shadow-soft border border-transparent',
  secondary:
    'bg-surface-alt text-text hover:bg-surface border border-border',
  ghost:
    'bg-transparent text-text hover:bg-surface-alt border border-transparent',
  outline:
    'bg-transparent text-text hover:bg-surface-alt border border-border',
  danger:
    'bg-red text-white hover:opacity-95 border border-transparent',
  success:
    'bg-green text-white hover:opacity-95 border border-transparent',
  teal:
    'bg-teal text-navy hover:opacity-95 border border-transparent',
};

const SIZES = {
  sm: 'h-9 px-3 text-xs rounded-xl',
  md: 'h-11 px-4 text-sm rounded-xl',
  lg: 'h-12 px-5 text-base rounded-2xl',
  icon: 'h-10 w-10 rounded-xl',
};

export const Button = forwardRef(function Button(
  {
    as: Tag = 'button',
    variant = 'primary',
    size = 'md',
    loading = false,
    disabled = false,
    leftIcon,
    rightIcon,
    fullWidth = false,
    className = '',
    children,
    type = 'button',
    ...rest
  },
  ref,
) {
  const base =
    'inline-flex items-center justify-center gap-2 font-semibold transition-all duration-150 select-none ' +
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-teal/40 ' +
    'disabled:opacity-50 disabled:cursor-not-allowed';

  return (
    <Tag
      ref={ref}
      type={Tag === 'button' ? type : undefined}
      disabled={Tag === 'button' ? (disabled || loading) : undefined}
      aria-busy={loading || undefined}
      className={cn(
        base,
        VARIANTS[variant] || VARIANTS.primary,
        SIZES[size] || SIZES.md,
        fullWidth && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading ? (
        <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
      ) : leftIcon ? (
        <span className="inline-flex shrink-0">{leftIcon}</span>
      ) : null}
      {children && <span>{children}</span>}
      {!loading && rightIcon ? (
        <span className="inline-flex shrink-0">{rightIcon}</span>
      ) : null}
    </Tag>
  );
});

export default Button;
