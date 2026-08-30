// =============================================================
// EmployeePayrollCard — full, professional per-employee payroll card
// Order (owner spec 2026-08-30): name+workplace → base → target →
// actual sales → target diff (auto increase/shortfall, never both) →
// deductions → commission → internet allowance → final net → actions.
// Pure display component — no calculation logic changes; reuses the
// existing approved formulas from payroll.types.js / payrollEngine.js.
// =============================================================
import { formatCurrency, calcNetSalary, calcTotalDeductions } from '../types/payroll.types.js';
import { printPayslip } from '../utils/printPayslip.js';

// بدل باقة الإنترنت — قيمة ثابتة معتمدة من المالك للعرض فقط (السياسة
// الحالية)، لا تُحسب هنا ولا تُضاف للصافي: هي أصلاً جزء من "البدلات"
// المحتسبة بالمحرك (internet_allowance ضمن employee_salary_settings).
const INTERNET_ALLOWANCE_USD = 10;

/** مكان العمل — مُشتق من فريق الموظف الفعلي، ليس حقلاً مستقلاً. */
function workplaceLabel(entry) {
  if (entry.team === 'syria') return 'سوريا';
  if (entry.team === 'turkey') return 'تركيا';
  if (entry.commission_exempt) return entry.role_label || 'إدارة / دعم';
  return 'غير محدد';
}

function Field({ label, children, tone = 'text' }) {
  const toneCls = {
    text: 'text-text',
    positive: 'text-green-fg',
    negative: 'text-red-fg',
    muted: 'text-muted',
    teal: 'text-teal',
  }[tone];
  return (
    <div className="flex flex-col gap-0.5 min-w-[110px]">
      <span className="text-[11px] text-muted font-semibold">{label}</span>
      <span className={`text-sm font-bold tabular-nums ${toneCls}`}>{children}</span>
    </div>
  );
}

export function EmployeePayrollCard({ entry, run, canEdit, onEdit, onDelete, onStatement }) {
  const cur = entry.currency || run?.currency || 'USD';
  const localCur = entry.target_currency || cur;
  const net = calcNetSalary(entry);
  const totalDeductions = calcTotalDeductions(entry);
  const commission = Number(entry.commission_usd ?? 0);
  const hasTarget = !!entry.team;

  // الفرق عن التارجت — تلقائي: إما زيادة أو نقص، أبداً كلاهما معاً.
  const increase = Number(entry.adjusted_increase_local ?? entry.increase_local ?? 0);
  const shortfall = Number(entry.shortfall_local ?? 0);
  const isOverTarget = increase > 0;
  const isUnderTarget = !isOverTarget && shortfall > 0;

  return (
    <div className="bg-surface border border-border rounded-2xl p-5 space-y-4">
      {/* 1) اسم الموظف + مكان العمل */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-base font-extrabold text-text flex items-center gap-1.5 flex-wrap">
            {entry.employee_name}
            {entry.source === 'auto' && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-teal/10 text-teal font-bold align-middle">تلقائي</span>
            )}
            {!entry.salary_source && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-bg text-red-fg font-bold align-middle">⚠️ بلا راتب</span>
            )}
            {entry.salary_source && !entry.team && !entry.commission_exempt && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-bg text-amber-fg font-bold align-middle">⚠️ بلا فريق</span>
            )}
          </h3>
          <p className="text-xs text-muted mt-0.5">{workplaceLabel(entry)}</p>
        </div>

        <span className="text-xl font-extrabold text-teal tabular-nums">
          {formatCurrency(net, cur)}
        </span>
      </div>

      {/* 2–8) تفاصيل الحسبة */}
      <div className="flex flex-wrap gap-x-6 gap-y-3 border-t border-border/40 pt-4">
        <Field label="الراتب الأساسي">{formatCurrency(entry.base_salary_usd, cur)}</Field>

        <Field label="التارجت المطلوب">
          {hasTarget ? formatCurrency(entry.target_local, localCur) : <span className="text-muted">—</span>}
        </Field>

        <Field label="المبيعات / الإنجاز الفعلي">
          {hasTarget ? formatCurrency(entry.sales_local, localCur) : <span className="text-muted">—</span>}
        </Field>

        {/* الفرق عن التارجت — تلقائي (زيادة أو نقص، لا كلاهما) */}
        {hasTarget && isOverTarget && (
          <Field label="الزيادة عن التارجت" tone="positive">
            +{formatCurrency(increase, localCur)}
          </Field>
        )}
        {hasTarget && isUnderTarget && (
          <Field label="النقص عن التارجت" tone="negative">
            -{formatCurrency(shortfall, localCur)}
          </Field>
        )}
        {hasTarget && !isOverTarget && !isUnderTarget && (
          <Field label="الفرق عن التارجت" tone="muted">—</Field>
        )}

        <Field label="الخصومات" tone={totalDeductions > 0 ? 'negative' : 'muted'}>
          {totalDeductions > 0 ? `-${formatCurrency(totalDeductions, cur)}` : '—'}
        </Field>

        <Field label="العمولة" tone={commission > 0 ? 'positive' : 'muted'}>
          {commission > 0 ? (
            <button
              onClick={() => onStatement?.(entry)}
              title="كشف حركة المبيعات"
              className="hover:underline decoration-dotted"
            >
              +{formatCurrency(commission, cur)}
            </button>
          ) : '—'}
        </Field>

        <Field label="بدل باقة الإنترنت">
          {formatCurrency(INTERNET_ALLOWANCE_USD, 'USD')}
        </Field>

        <Field label="صافي الراتب النهائي" tone="teal">
          {formatCurrency(net, cur)}
        </Field>
      </div>

      {/* 9) الإجراءات */}
      <div className="flex items-center justify-end gap-2 border-t border-border/40 pt-3">
        <button
          onClick={() => printPayslip(entry, run)}
          className="text-xs px-3 py-1.5 rounded-lg bg-surface-alt text-muted border border-border hover:text-text hover:border-navy/30 transition font-semibold"
        >
          🖨️ طباعة
        </button>
        {canEdit && (
          <>
            <button
              onClick={() => onEdit?.(entry)}
              className="text-xs px-3 py-1.5 rounded-lg bg-blue-bg text-blue-fg border border-blue/20 hover:opacity-80 transition font-semibold"
            >
              ✏️ تعديل
            </button>
            <button
              onClick={() => onDelete?.(entry.id)}
              className="text-xs px-3 py-1.5 rounded-lg bg-red-bg text-red-fg border border-red/20 hover:opacity-80 transition font-semibold"
            >
              🗑️ حذف
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default EmployeePayrollCard;
