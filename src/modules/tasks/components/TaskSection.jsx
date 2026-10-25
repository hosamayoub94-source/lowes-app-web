// =============================================================
// TaskSection — collapsible titled group with a count (Today page,
// project groups). Presentational.
// =============================================================
import { useState } from 'react';
import { cn } from '@utils/classNames';

const TONES = {
  red: 'text-red-fg bg-red-bg',
  amber: 'text-amber-fg bg-amber-bg',
  blue: 'text-blue-fg bg-blue-bg',
  teal: 'text-teal bg-teal/10',
  neutral: 'text-muted bg-surface-alt',
};

export function TaskSection({ title, icon, count, tone = 'neutral', defaultOpen = true, hint, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="space-y-2.5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center gap-2 text-start"
      >
        <span aria-hidden>{icon}</span>
        <h3 className="text-sm font-extrabold text-text">{title}</h3>
        <span className={cn('text-xs font-bold px-2 py-0.5 rounded-full tabular-nums', TONES[tone] || TONES.neutral)}>{count}</span>
        {hint && <span className="text-[11px] text-muted hidden sm:inline">{hint}</span>}
        <span className="ms-auto text-muted text-xs" aria-hidden>{open ? '▾' : '◂'}</span>
      </button>
      {open && children}
    </section>
  );
}

export default TaskSection;
