// =============================================================
// EntryRow — single payroll entry row (theme-aware, native currency)
// =============================================================
import { formatCurrency, calcNetSalary, calcTotalDeductions } from '../types/payroll.types.js';
import { printPayslip } from '../utils/printPayslip.js';

export function EntryRow({ entry, run, onEdit, onDelete, onStatement, canEdit }) {
  const cur = entry.currency || run?.currency || 'USD';
  const net = calcNetSalary(entry);
  const totalDeductions = calcTotalDeductions(entry);
  const allowances = Number(entry.allowances_usd ?? 0) + Number(entry.bonus_usd ?? 0);
  const commission = Number(entry.commission_usd ?? 0);

  return (
    <tr className="border-b border-border/40 hover:bg-surface-alt/50 transition-colors">
      <td className="py-3 px-4 text-sm font-semibold text-text text-right whitespace-nowrap">
        {entry.employee_name}
        {entry.source === 'auto' && (
          <span className="ms-1.5 text-[9px] px-1.5 py-0.5 rounded bg-teal/10 text-teal font-bold align-middle">تلقائي</span>
        )}
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
        {formatCurrency(entry.base_salary_usd, cur)}
      </td>
      <td className="py-3 px-4 text-sm text-center tabular-nums">
        {allowances > 0
          ? <span className="text-green-fg font-semibold">+{formatCurrency(allowances, cur)}</span>
          : <span className="text-muted">—</span>}
      </td>
      <td className="py-3 px-4 text-sm text-center tabular-nums">
        {commission > 0 ? (
          <button
            onClick={() => onStatement?.(entry)}
            title="كشف حركة المبيعات"
            className="text-teal font-semibold hover:underline decoration-dotted"
          >
            +{formatCurrency(commission, cur)}
          </button>
        ) : (
          <span className="text-muted">—</span>
        )}
      </td>
      <td className="py-3 px-4 text-sm text-center tabular-nums">
        {totalDeductions > 0
          ? <span className="text-red-fg font-semibold">-{formatCurrency(totalDeductions, cur)}</span>
          : <span className="text-muted">—</span>}
      </td>
      <td className="py-3 px-4 text-sm font-extrabold text-center text-teal tabular-nums">
        {formatCurrency(net, cur)}
      </td>
      {/* Actions */}
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
