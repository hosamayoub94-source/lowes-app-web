// =============================================================
// Input + Field — labelled form control with hint/error slots.
// Use <Field label="..."><Input /></Field> for the common case.
// =============================================================
import { forwardRef } from 'react';
import { cn } from '@utils/classNames';

export const Input = forwardRef(function Input(
  { className = '', ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      className={cn(
        'h-11 w-full rounded-xl border border-border bg-surface text-text px-3 text-sm',
        'placeholder:text-muted transition-shadow',
        'focus:outline-none focus:border-teal focus:ring-2 focus:ring-teal/20',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        className,
      )}
      {...rest}
    />
  );
});

export const Textarea = forwardRef(function Textarea(
  { className = '', rows = 3, ...rest },
  ref,
) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      className={cn(
        'w-full rounded-xl border border-border bg-surface text-text px-3 py-2.5 text-sm',
        'placeholder:text-muted transition-shadow resize-y',
        'focus:outline-none focus:border-teal focus:ring-2 focus:ring-teal/20',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        className,
      )}
      {...rest}
    />
  );
});

export const Select = forwardRef(function Select(
  { className = '', children, ...rest },
  ref,
) {
  return (
    <select
      ref={ref}
      className={cn(
        'h-11 w-full rounded-xl border border-border bg-surface text-text px-3 text-sm',
        'transition-shadow appearance-none',
        'focus:outline-none focus:border-teal focus:ring-2 focus:ring-teal/20',
        className,
      )}
      {...rest}
    >
      {children}
    </select>
  );
});

export function Field({ label, hint, error, htmlFor, required, children, className = '' }) {
  return (
    <label htmlFor={htmlFor} className={cn('block', className)}>
      {label && (
        <span className="block text-xs font-semibold text-text mb-1.5">
          {label}
          {required && <span className="text-red ms-1" aria-hidden>*</span>}
        </span>
      )}
      {children}
      {error ? (
        <span className="block mt-1 text-xs text-red-fg">{error}</span>
      ) : hint ? (
        <span className="block mt-1 text-xs text-muted">{hint}</span>
      ) : null}
    </label>
  );
}

export default Input;
