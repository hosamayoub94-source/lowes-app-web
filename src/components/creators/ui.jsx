import * as V from '@services/creatorReview';
import { VERDICT_COLOR } from './uiData';

export const Pill = ({ children, cls = 'bg-surface-alt text-muted border-border' }) => <span className={`inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full border ${cls}`}>{children}</span>;
export const Btn = ({ children, onClick, kind = 'ghost', disabled, type = 'button', title }) => (
  <button type={type} title={title} disabled={disabled} onClick={onClick}
    className={`text-xs font-bold rounded-xl px-3 py-2 border disabled:opacity-40 ${kind === 'primary' ? 'bg-navy text-white border-navy' : kind === 'good' ? 'bg-green-600 text-white border-green-600' : kind === 'danger' ? 'bg-red-50 text-red-600 border-red-200' : 'bg-surface text-text border-border'}`}>{children}</button>
);
export const VerdictPill = ({ v }) => <Pill cls={VERDICT_COLOR[v] || ''}>{V.VERDICT_LABEL_AR[v] || v}</Pill>;

/** Button group for a small enum. options: [[value, label]] */
export function Seg({ value, onChange, options, disabled }) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map(([v, l]) => (
        <button key={String(v)} type="button" disabled={disabled} onClick={() => onChange(v)}
          className={`text-[12px] font-bold px-3 py-1.5 rounded-lg border ${value === v ? 'bg-navy text-white border-navy' : 'bg-surface text-text border-border'}`}>{l}</button>
      ))}
    </div>
  );
}
export const Q = ({ n, title, hint, done, children }) => (
  <section className={`bg-surface border rounded-2xl p-3 space-y-2 ${done === false ? 'border-amber-300' : 'border-border'}`}>
    <p className="text-[13px] font-extrabold text-text"><span className="text-muted">{n}.</span> {title} {done === true && <span className="text-green-600">✓</span>}</p>
    {hint && <p className="text-[11px] text-muted">{hint}</p>}
    {children}
  </section>
);
