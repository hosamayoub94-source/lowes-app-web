// =============================================================
// PayrollDashboard — Payroll Hub (theme-aware v2)
// =============================================================
import { useState } from 'react';
import { useAuth } from '@hooks/useAuth';
import {
  usePayrollBootstrap,
  usePayrollDashboard,
  usePayrollActions,
  useSelectedRunId,
  useRunDetail,
  usePayrollLoading,
} from '../hooks/usePayroll.js';
import { PayrollRunCard } from '../components/PayrollRunCard.jsx';
import { EntryRow } from '../components/EntryRow.jsx';
import {
  PAYROLL_STATUS,
  MONTHS_AR,
  formatCurrency,
  calcRunTotal,
  periodLabel,
} from '../types/payroll.types.js';
import { ROLES } from '@data/teams';

// ─── Input class ─────────────────────────────────────────────
const INP = 'w-full border border-border rounded-xl px-3 py-2.5 text-sm bg-cream text-text outline-none focus:border-teal transition';

// ─── KPI card ────────────────────────────────────────────────
function KpiCard({ icon, label, value, sub }) {
  return (
    <div className="bg-surface border border-border rounded-xl p-4 flex flex-col gap-2">
      <div className="w-9 h-9 rounded-xl bg-surface-alt flex items-center justify-center text-lg">{icon}</div>
      <div className="text-xl font-extrabold text-text tracking-tight leading-tight">{value}</div>
      <div className="text-xs text-muted">{label}</div>
      {sub && <div className="text-[11px] text-muted/70">{sub}</div>}
    </div>
  );
}

// ─── Status action button ────────────────────────────────────
function ActionBtn({ onClick, disabled, children, variant = 'blue' }) {
  const cls = {
    blue:  'bg-blue-bg text-blue-fg border-blue/20 hover:opacity-80',
    green: 'bg-green-bg text-green-fg border-green/20 hover:opacity-80',
  }[variant];
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-4 py-2 rounded-xl border text-xs font-bold transition disabled:opacity-50 active:scale-95 ${cls}`}
    >
      {children}
    </button>
  );
}

// ─── Modal wrapper ────────────────────────────────────────────
function Modal({ title, onClose, children, footer }) {
  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-surface rounded-2xl w-full max-w-md shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/40">
          <h3 className="font-bold text-base text-text">{title}</h3>
          <button onClick={onClose}
            className="w-8 h-8 rounded-full bg-surface-alt flex items-center justify-center text-muted hover:text-text transition">
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z"/></svg>
          </button>
        </div>
        <div className="p-5 space-y-4 max-h-[65vh] overflow-y-auto">
          {children}
        </div>
        {footer && (
          <div className="flex gap-3 px-5 py-4 border-t border-border/40">{footer}</div>
        )}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────
export function PayrollDashboard() {
  const { id, role } = useAuth();
  usePayrollBootstrap(id);

  const { runs, kpis, isLoading } = usePayrollDashboard();
  const { run, entries, isLoading: loadingEntries, isSubmitting, approveRun, markRunPaid } = useRunDetail();
  const selectedRunId = useSelectedRunId();
  const { selectRun, createRun, deleteEntry, upsertEntry } = usePayrollActions();
  const loading = usePayrollLoading();

  const isAdmin = role === ROLES.ADMIN || role === ROLES.MANAGER;

  // ── New Run form
  const [showNewRun, setShowNewRun] = useState(false);
  const [newRunForm, setNewRunForm] = useState({
    period_year:  new Date().getFullYear(),
    period_month: new Date().getMonth() + 1,
    currency: 'USD',
  });

  // ── Edit entry form
  const [editEntry, setEditEntry] = useState(null);
  const [entryForm, setEntryForm] = useState({});

  const handleCreateRun = async () => {
    try {
      const newRun = await createRun({
        ...newRunForm,
        status: PAYROLL_STATUS.DRAFT,
        total_net_usd: 0,
        employee_count: 0,
      });
      setShowNewRun(false);
      selectRun(newRun.id);
    } catch (_) { /* handled in store */ }
  };

  const openEditEntry = (entry) => {
    setEditEntry(entry);
    setEntryForm({
      id: entry.id,
      employee_id: entry.employee_id,
      employee_name: entry.employee_name,
      base_salary_usd: entry.base_salary_usd,
      bonus_usd: entry.bonus_usd,
      deductions_usd: entry.deductions_usd,
      advance_deduction_usd: entry.advance_deduction_usd,
      absent_days: entry.absent_days,
      working_days: entry.working_days,
      notes: entry.notes ?? '',
    });
  };

  const handleSaveEntry = async () => {
    const net =
      Number(entryForm.base_salary_usd) +
      Number(entryForm.bonus_usd) -
      Number(entryForm.deductions_usd) -
      Number(entryForm.advance_deduction_usd);
    await upsertEntry({ ...entryForm, net_salary_usd: net });
    setEditEntry(null);
    setEntryForm({});
  };

  const runTotal = calcRunTotal(entries);

  return (
    <div className="min-h-screen bg-cream p-4 md:p-6" dir="rtl">

      {/* ── Header ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-extrabold text-text tracking-tight">الرواتب</h1>
          <p className="text-sm text-muted mt-0.5">إدارة الرواتب والمستحقات الشهرية</p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowNewRun(true)}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-teal text-white text-sm font-bold hover:bg-teal/90 active:scale-95 transition shadow-sm"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z"/></svg>
            دورة جديدة
          </button>
        )}
      </div>

      {/* ── KPIs ───────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <KpiCard icon="📋" label="إجمالي الدورات"   value={kpis.totalRuns}                   />
        <KpiCard icon="💳" label="مدفوع"             value={formatCurrency(kpis.totalPaid)}    />
        <KpiCard icon="⏳" label="معلق"              value={formatCurrency(kpis.totalPending)} />
        <KpiCard icon="💼" label="الدورة الحالية"    value={formatCurrency(kpis.currentRunTotal)} />
      </div>

      {/* ── Split layout ───────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

        {/* Runs list */}
        <div className="md:col-span-1">
          <h2 className="text-xs font-bold text-muted uppercase tracking-wider mb-3">دورات الرواتب</h2>
          {isLoading ? (
            <div className="flex items-center gap-2 justify-center py-10 text-muted text-sm">
              <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
              جار التحميل…
            </div>
          ) : runs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 gap-2 text-muted text-sm bg-surface border border-border rounded-xl">
              <div className="text-3xl">💰</div>
              <p>لا توجد دورات بعد</p>
              {isAdmin && (
                <button onClick={() => setShowNewRun(true)}
                  className="mt-1 text-teal text-xs font-semibold hover:underline">
                  + إنشاء أول دورة
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {runs.map(r => (
                <PayrollRunCard
                  key={r.id}
                  run={r}
                  isSelected={selectedRunId === r.id}
                  onClick={() => selectRun(r.id)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Run detail */}
        <div className="md:col-span-2">
          {!run ? (
            <div className="flex flex-col items-center justify-center h-64 gap-3 bg-surface border border-border rounded-xl text-muted">
              <div className="w-14 h-14 rounded-2xl bg-surface-alt flex items-center justify-center text-2xl">💼</div>
              <p className="text-sm">اختر دورة لعرض التفاصيل</p>
            </div>
          ) : (
            <div className="bg-surface border border-border rounded-xl overflow-hidden">
              {/* Run header */}
              <div className="px-5 py-4 border-b border-border/40 flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-extrabold text-text text-lg tracking-tight">
                    {periodLabel(run.period_year, run.period_month)}
                  </h2>
                  <p className="text-xs text-muted mt-0.5">
                    {entries.length} موظف
                    {entries.length > 0 && <span className="text-teal font-semibold mr-2"> · {formatCurrency(runTotal)}</span>}
                  </p>
                </div>
                <div className="flex gap-2">
                  {isAdmin && run.status === PAYROLL_STATUS.DRAFT && (
                    <ActionBtn onClick={approveRun} disabled={isSubmitting} variant="blue">
                      ✓ اعتماد
                    </ActionBtn>
                  )}
                  {isAdmin && run.status === PAYROLL_STATUS.APPROVED && (
                    <ActionBtn onClick={markRunPaid} disabled={isSubmitting} variant="green">
                      💳 تسجيل دفع
                    </ActionBtn>
                  )}
                </div>
              </div>

              {/* Entries */}
              {loadingEntries ? (
                <div className="flex items-center gap-2 justify-center py-12 text-muted text-sm">
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
                  جار التحميل…
                </div>
              ) : entries.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-14 gap-2 text-muted text-sm">
                  <div className="text-3xl">👤</div>
                  <p>لا توجد إدخالات في هذه الدورة</p>
                  {isAdmin && run.status === PAYROLL_STATUS.DRAFT && (
                    <p className="text-xs">أضف موظفين لهذه الدورة من لوحة الإدارة</p>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-surface-alt text-muted text-xs border-b border-border/40">
                        <th className="py-2.5 px-4 text-right font-semibold">الموظف</th>
                        <th className="py-2.5 px-4 text-center font-semibold">العمل</th>
                        <th className="py-2.5 px-4 text-center font-semibold">غياب</th>
                        <th className="py-2.5 px-4 text-center font-semibold">الأساسي</th>
                        <th className="py-2.5 px-4 text-center font-semibold">مكافأة</th>
                        <th className="py-2.5 px-4 text-center font-semibold">خصومات</th>
                        <th className="py-2.5 px-4 text-center font-semibold">الصافي</th>
                        {isAdmin && run.status === PAYROLL_STATUS.DRAFT && (
                          <th className="py-2.5 px-4 text-center font-semibold">إجراء</th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {entries.map(e => (
                        <EntryRow
                          key={e.id}
                          entry={e}
                          canEdit={isAdmin && run.status === PAYROLL_STATUS.DRAFT}
                          onEdit={openEditEntry}
                          onDelete={deleteEntry}
                        />
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-surface-alt/60 border-t border-border/40 font-bold">
                        <td className="py-3 px-4 text-right text-xs text-muted" colSpan={6}>الإجمالي</td>
                        <td className="py-3 px-4 text-center text-teal font-extrabold text-sm tabular-nums">
                          {formatCurrency(runTotal)}
                        </td>
                        {isAdmin && run.status === PAYROLL_STATUS.DRAFT && <td />}
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── New Run Modal ───────────────────────────────────── */}
      {showNewRun && (
        <Modal
          title="دورة رواتب جديدة"
          onClose={() => setShowNewRun(false)}
          footer={
            <>
              <button
                onClick={handleCreateRun}
                disabled={loading.action}
                className="flex-1 py-2.5 rounded-xl bg-teal text-white text-sm font-bold hover:bg-teal/90 disabled:opacity-50 transition"
              >
                {loading.action ? '…جار الإنشاء' : '✓ إنشاء الدورة'}
              </button>
              <button
                onClick={() => setShowNewRun(false)}
                className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold text-muted hover:text-text transition"
              >
                إلغاء
              </button>
            </>
          }
        >
          <div>
            <label className="text-xs font-semibold text-muted mb-1.5 block">السنة</label>
            <input
              type="number"
              value={newRunForm.period_year}
              onChange={e => setNewRunForm(f => ({ ...f, period_year: Number(e.target.value) }))}
              className={INP}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted mb-1.5 block">الشهر</label>
            <select
              value={newRunForm.period_month}
              onChange={e => setNewRunForm(f => ({ ...f, period_month: Number(e.target.value) }))}
              className={INP}
            >
              {MONTHS_AR.map((m, i) => (
                <option key={i + 1} value={i + 1}>{m}</option>
              ))}
            </select>
          </div>
        </Modal>
      )}

      {/* ── Edit Entry Modal ────────────────────────────────── */}
      {editEntry && (
        <Modal
          title={`تعديل راتب — ${editEntry.employee_name}`}
          onClose={() => setEditEntry(null)}
          footer={
            <>
              <button
                onClick={handleSaveEntry}
                disabled={isSubmitting}
                className="flex-1 py-2.5 rounded-xl bg-teal text-white text-sm font-bold hover:bg-teal/90 disabled:opacity-50 transition"
              >
                {isSubmitting ? '…جار الحفظ' : '✓ حفظ'}
              </button>
              <button
                onClick={() => setEditEntry(null)}
                className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold text-muted hover:text-text transition"
              >
                إلغاء
              </button>
            </>
          }
        >
          <div className="grid grid-cols-2 gap-3">
            {[
              { key: 'base_salary_usd',       label: 'الراتب الأساسي ($)' },
              { key: 'bonus_usd',              label: 'مكافأة ($)' },
              { key: 'deductions_usd',         label: 'خصومات ($)' },
              { key: 'advance_deduction_usd',  label: 'سلفة ($)' },
              { key: 'absent_days',            label: 'أيام غياب' },
              { key: 'working_days',           label: 'أيام عمل' },
            ].map(({ key, label }) => (
              <div key={key}>
                <label className="text-xs font-semibold text-muted mb-1.5 block">{label}</label>
                <input
                  type="number"
                  value={entryForm[key] ?? 0}
                  onChange={e => setEntryForm(f => ({ ...f, [key]: Number(e.target.value) }))}
                  className={INP}
                />
              </div>
            ))}
          </div>
          <div>
            <label className="text-xs font-semibold text-muted mb-1.5 block">ملاحظات</label>
            <input
              type="text"
              value={entryForm.notes ?? ''}
              onChange={e => setEntryForm(f => ({ ...f, notes: e.target.value }))}
              className={INP}
              placeholder="اختياري"
            />
          </div>
          {/* Net preview */}
          <div className="bg-teal/10 rounded-xl px-4 py-3 flex items-center justify-between">
            <span className="text-sm font-semibold text-teal">الراتب الصافي</span>
            <span className="text-lg font-extrabold text-teal tabular-nums">
              ${(
                Number(entryForm.base_salary_usd ?? 0) +
                Number(entryForm.bonus_usd ?? 0) -
                Number(entryForm.deductions_usd ?? 0) -
                Number(entryForm.advance_deduction_usd ?? 0)
              ).toFixed(2)}
            </span>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default PayrollDashboard;
