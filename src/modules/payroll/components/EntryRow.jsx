// =============================================================
// EntryRow — single payroll entry row for the run detail table
// =============================================================
import { formatCurrency, calcNetSalary } from '../types/payroll.types.js';

export function EntryRow({ entry, onEdit, onDelete, canEdit }) {
  const net = calcNetSalary(entry);

  return (
    <tr className="border-b border-border hover:bg-surface/50 transition-colors">
      <td className="py-3 px-4 text-sm font-medium text-text text-right">
        {entry.employee_name}
      </td>
      <td className="py-3 px-4 text-sm text-muted text-center">
        {entry.working_days ?? '-'}
      </td>
      <td className="py-3 px-4 text-sm text-center">
        {entry.absent_days > 0 ? (
          <span className="text-red-500 font-medium">{entry.absent_days}</span>
        ) : (
          <span className="text-muted">0</span>
        )}
      </td>
      <td className="py-3 px-4 text-sm text-center text-text">
        {formatCurrency(entry.base_salary_usd, 'USD')}
      </td>
      <td className="py-3 px-4 text-sm text-center text-green-600">
        {entry.bonus_usd > 0 ? `+${formatCurrency(entry.bonus_usd, 'USD')}` : '-'}
      </td>
      <td className="py-3 px-4 text-sm text-center text-red-500">
        {(entry.deductions_usd > 0 || entry.advance_deduction_usd > 0)
          ? `-${formatCurrency((Number(entry.deductions_usd) + Number(entry.advance_deduction_usd)), 'USD')}`
          : '-'}
      </td>
      <td className="py-3 px-4 text-sm font-bold text-center text-teal">
        {formatCurrency(net, 'USD')}
      </td>
      {canEdit && (
        <td className="py-3 px-4 text-center">
          <div className="flex items-center justify-center gap-2">
            <button
              onClick={() => onEdit?.(entry)}
              className="text-xs px-2 py-1 rounded bg-blue-100 text-blue-600 hover:bg-blue-200 transition"
            >
              تعديل
            </button>
            <button
              onClick={() => onDelete?.(entry.id)}
              className="text-xs px-2 py-1 rounded bg-red-100 text-red-600 hover:bg-red-200 transition"
            >
              حذف
            </button>
          </div>
        </td>
      )}
    </tr>
  );
}

export default EntryRow;
