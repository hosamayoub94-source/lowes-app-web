// =============================================================
// Hero — gradient banner used at top of dashboards/screens.
// Two slots: title block + actions slot on the end.
// =============================================================
import { cn } from '@utils/classNames';

export function Hero({
  title,
  subtitle,
  eyebrow,
  actions,
  className = '',
  children,
}) {
  return (
    <section
      className={cn(
        'relative overflow-hidden rounded-3xl text-white p-5 sm:p-7',
        'bg-gradient-to-br from-navy via-navy to-teal shadow-soft',
        className,
      )}
    >
      <div className="absolute -top-10 -end-10 w-40 h-40 rounded-full bg-white/10 blur-2xl pointer-events-none" />
      <div className="absolute -bottom-12 -start-12 w-48 h-48 rounded-full bg-teal/30 blur-3xl pointer-events-none" />
      <div className="relative flex items-start gap-4 flex-wrap sm:flex-nowrap">
        <div className="flex-1 min-w-0">
          {eyebrow && (
            <div className="text-xs font-semibold opacity-80 uppercase tracking-wider mb-1.5">
              {eyebrow}
            </div>
          )}
          {title && (
            <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight">
              {title}
            </h1>
          )}
          {subtitle && (
            <p className="mt-1.5 text-sm opacity-85 leading-relaxed">{subtitle}</p>
          )}
        </div>
        {actions && <div className="shrink-0 flex items-center gap-2">{actions}</div>}
      </div>
      {children && <div className="relative mt-4">{children}</div>}
    </section>
  );
}

export default Hero;
