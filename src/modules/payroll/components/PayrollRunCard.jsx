// =============================================================
// PayrollRunCard — summary card for a single payroll run
// =============================================================
import { PAYROLL_STATUS_LABELS, formatCurrency, periodLabel } from '../types/payroll.types.js';

const STATUS_COLORS = {
  draft:      'bg-gray-100 text-gray-600',
  processing: 'bg-yellow-100 text-yellow-700',
  approved:   'bg-blue-100 text-blue-700',
  paid:       'bg-green-100 text-green-700',
  cancelled:  'bg-red-100 text-red-600',
};

export function PayrollRunCard({ run, isSelected, onClick }) {
  const label  = periodLabel(run.period_year, run.period_month);
  const badge  = STATUS_COLORS[run.status] ?? 'bg-gray-100 text-gray-600';

  return (
    <button
      onClick={onClick}
      className={[
        'w-full text-right p-4 rounded-xl border transition-all',
        isSelected
          ? 'border-teal bg-teal/5 shadow-sm'
          : 'border-border bg-surface hover:border-teal/40',
      ].join(' ')}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${badge}`}>
          {PAYROLL_STATUS_LABELS[run.status] ?? run.status}
        </span>
        <span className="text-sm font-bold text-text">{label}</span>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="text-xs text-muted">{run.employee_count ?? 0} موظف</span>
        <span className="text-base font-bold text-teal">
          {formatCurrency(run.total_net_usd, 'USD')}
        </span>
      </div>
    </button>
  );
}

export default PayrollRunCard;
