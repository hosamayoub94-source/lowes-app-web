// =============================================================
// EntryRow — single payroll entry row (theme-aware)
// =============================================================
import { formatCurrency, calcNetSalary } from '../types/payroll.types.js';
import { printPayslip } from '../utils/printPayslip.js';

export function EntryRow({ entry, run, onEdit, onDelete, canEdit }) {
  const net = calcNetSalary(entry);
  const totalDeductions = Number(entry.deductions_usd ?? 0) + Number(entry.advance_deduction_usd ?? 0);

  return (
    <tr className="border-b border-border/40 hover:bg-surface-alt/50 transition-colors">
      <td className="py-3 px-4 text-sm font-semibold text-text text-right whitespace-nowrap">
        {entry.employee_name}
      </td>
      <td className="py-3 px-4 text-sm text-muted text-center">
        {entry.working_days ?? '—'}
      </td>
      <td className="py-3 px-4 text-sm text-center">
        {(entry.absent_days ?? 0) > 0 ? (
          <span className="text-red-fg font-semibold">{entry.absent_days}</span>
        ) : (
          <span className="text-muted">—</span>
        )}
      </td>
      <td className="py-3 px-4 text-sm text-center text-text tabular-nums">
        {formatCurrency(entry.base_salary_usd, 'USD')}
      </td>
      <td className="py-3 px-4 text-sm text-center tabular-nums">
        {(entry.bonus_usd ?? 0) > 0
          ? <span className="text-green-fg font-semibold">+{formatCurrency(entry.bonus_usd, 'USD')}</span>
          : <span className="text-muted">—</span>}
      </td>
      <td className="py-3 px-4 text-sm text-center tabular-nums">
        {totalDeductions > 0
          ? <span className="text-red-fg font-semibold">-{formatCurrency(totalDeductions, 'USD')}</span>
          : <span className="text-muted">—</span>}
      </td>
      <td className="py-3 px-4 text-sm font-extrabold text-center text-teal tabular-nums">
        {formatCurrency(net, 'USD')}
      </td>
      {/* Print button — always visible */}
      <td className="py-3 px-4 text-center">
        <div className="flex items-center justify-center gap-1.5">
          <button
            onClick={() => printPayslip(entry, run)}
            title="طباعة كشف الراتب"
            className="text-xs px-2.5 py-1 rounded-lg bg-surface-alt text-muted border border-border hover:text-text hover:border-navy/30 transition font-semibold"
          >
            🖨️
          </button>
          {canEdit && (
            <>
              <button
                onClick={() => onEdit?.(entry)}
                className="text-xs px-2.5 py-1 rounded-lg bg-blue-bg text-blue-fg border border-blue/20 hover:opacity-80 transition font-semibold"
              >
                تعديل
              </button>
              <button
                onClick={() => onDelete?.(entry.id)}
                className="text-xs px-2.5 py-1 rounded-lg bg-red-bg text-red-fg border border-red/20 hover:opacity-80 transition font-semibold"
              >
                حذف
              </button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}

export default EntryRow;
