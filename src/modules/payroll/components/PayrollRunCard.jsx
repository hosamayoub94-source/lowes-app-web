// =============================================================
// PayrollRunCard — summary card for a single payroll run (theme-aware)
// =============================================================
import { PAYROLL_STATUS_LABELS, PAYROLL_STATUS, formatCurrency, periodLabel } from '../types/payroll.types.js';

const STATUS_META = {
  [PAYROLL_STATUS.DRAFT]:       { cls: 'bg-surface-alt text-muted border-border/30',         icon: '📝' },
  [PAYROLL_STATUS.PROCESSING]:  { cls: 'bg-amber-bg text-amber-fg border-amber/20',           icon: '⚙️' },
  [PAYROLL_STATUS.APPROVED]:    { cls: 'bg-blue-bg text-blue-fg border-blue/20',              icon: '✅' },
  [PAYROLL_STATUS.PAID]:        { cls: 'bg-green-bg text-green-fg border-green/20',           icon: '💳' },
  [PAYROLL_STATUS.CANCELLED]:   { cls: 'bg-red-bg text-red-fg border-red/20',                 icon: '✕'  },
};

export function PayrollRunCard({ run, isSelected, onClick }) {
  const label  = periodLabel(run.period_year, run.period_month);
  const meta   = STATUS_META[run.status] ?? STATUS_META[PAYROLL_STATUS.DRAFT];

  return (
    <button
      onClick={onClick}
      className={[
        'w-full text-right p-4 rounded-xl border transition-all',
        isSelected
          ? 'border-teal bg-teal/5 shadow-sm ring-1 ring-teal/20'
          : 'border-border bg-surface hover:border-teal/40',
      ].join(' ')}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${meta.cls}`}>
          {meta.icon} {PAYROLL_STATUS_LABELS[run.status] ?? run.status}
        </span>
        <span className="text-sm font-bold text-text">{label}</span>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="text-xs text-muted">{run.employee_count ?? 0} موظف</span>
        <span className="text-base font-extrabold text-teal">
          {formatCurrency(run.total_net_usd, 'USD')}
        </span>
      </div>
    </button>
  );
}

export default PayrollRunCard;
