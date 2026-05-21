// =============================================================
// PayrollDashboard — main page for the Payroll module
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

export function PayrollDashboard() {
  const { id, role } = useAuth();
  usePayrollBootstrap(id);

  const { runs, kpis, isLoading } = usePayrollDashboard();
  const { run, entries, isLoading: loadingEntries, isSubmitting, approveRun, markRunPaid } = useRunDetail();
  const selectedRunId = useSelectedRunId();
  const { selectRun, createRun, deleteRun, upsertEntry, deleteEntry } = usePayrollActions();
  const loading = usePayrollLoading();

  const isAdmin = role === ROLES.ADMIN || role === ROLES.MANAGER;

  // New Run form
  const [showNewRun, setShowNewRun] = useState(false);
  const [newRunForm, setNewRunForm] = useState({
    period_year: new Date().getFullYear(),
    period_month: new Date().getMonth() + 1,
    currency: 'USD',
  });

  // Entry edit form
  const [editEntry, setEditEntry] = useState(null);
  const [entryForm, setEntryForm] = useState({});

  const handleCreateRun = async () => {
    try {
      const run = await createRun({
        ...newRunForm,
        status: PAYROLL_STATUS.DRAFT,
        total_net_usd: 0,
        employee_count: 0,
      });
      setShowNewRun(false);
      selectRun(run.id);
    } catch (e) {
      // error handled in store
    }
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

  return (
    <div className="min-h-screen bg-cream p-4 md:p-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-text">💰 الرواتب</h1>
          <p className="text-sm text-muted mt-0.5">إدارة الرواتب والمستحقات الشهرية</p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowNewRun(true)}
            className="px-4 py-2 rounded-xl bg-teal text-white text-sm font-semibold hover:bg-teal/90 transition"
          >
            + دورة جديدة
          </button>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'إجمالي الدورات', value: kpis.totalRuns, icon: '📋' },
          { label: 'مدفوع', value: formatCurrency(kpis.totalPaid), icon: '✅' },
          { label: 'معلق', value: formatCurrency(kpis.totalPending), icon: '⏳' },
          { label: 'الدورة الحالية', value: formatCurrency(kpis.currentRunTotal), icon: '💼' },
        ].map(k => (
          <div key={k.label} className="bg-surface border border-border rounded-xl p-4">
            <div className="text-2xl mb-1">{k.icon}</div>
            <div className="text-lg font-bold text-text">{k.value}</div>
            <div className="text-xs text-muted mt-0.5">{k.label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Runs list */}
        <div className="md:col-span-1 space-y-2">
          <h2 className="text-sm font-semibold text-muted mb-2">دورات الرواتب</h2>
          {isLoading ? (
            <div className="text-center py-8 text-muted text-sm">جار التحميل…</div>
          ) : runs.length === 0 ? (
            <div className="text-center py-8 text-muted text-sm">لا توجد دورات بعد</div>
          ) : (
            runs.map(r => (
              <PayrollRunCard
                key={r.id}
                run={r}
                isSelected={selectedRunId === r.id}
                onClick={() => selectRun(r.id)}
              />
            ))
          )}
        </div>

        {/* Run detail */}
        <div className="md:col-span-2">
          {!run ? (
            <div className="flex flex-col items-center justify-center h-64 text-muted text-sm bg-surface border border-border rounded-xl">
              <span className="text-3xl mb-2">💰</span>
              <p>اختر دورة لعرض التفاصيل</p>
            </div>
          ) : (
            <div className="bg-surface border border-border rounded-xl overflow-hidden">
              {/* Run header */}
              <div className="p-4 border-b border-border flex items-center justify-between">
                <div>
                  <h2 className="font-bold text-text text-lg">
                    {periodLabel(run.period_year, run.period_month)}
                  </h2>
                  <p className="text-xs text-muted">{entries.length} موظف · {formatCurrency(calcRunTotal(entries))}</p>
                </div>
                {isAdmin && run.status === PAYROLL_STATUS.DRAFT && (
                  <button
                    onClick={approveRun}
                    disabled={isSubmitting}
                    className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-50 transition"
                  >
                    اعتماد
                  </button>
                )}
                {isAdmin && run.status === PAYROLL_STATUS.APPROVED && (
                  <button
                    onClick={markRunPaid}
                    disabled={isSubmitting}
                    className="px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs font-semibold hover:bg-green-700 disabled:opacity-50 transition"
                  >
                    تسجيل دفع
                  </button>
                )}
              </div>

              {/* Entries table */}
              {loadingEntries ? (
                <div className="text-center py-10 text-muted text-sm">جار التحميل…</div>
              ) : entries.length === 0 ? (
                <div className="text-center py-10 text-muted text-sm">
                  لا توجد إدخالات. {isAdmin && run.status === PAYROLL_STATUS.DRAFT && 'أضف موظفين لهذه الدورة.'}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-cream text-muted text-xs">
                        <th className="py-2 px-4 text-right">الموظف</th>
                        <th className="py-2 px-4 text-center">أيام العمل</th>
                        <th className="py-2 px-4 text-center">غياب</th>
                        <th className="py-2 px-4 text-center">الراتب الأساسي</th>
                        <th className="py-2 px-4 text-center">مكافأة</th>
                        <th className="py-2 px-4 text-center">خصومات</th>
                        <th className="py-2 px-4 text-center">الصافي</th>
                        {isAdmin && run.status === PAYROLL_STATUS.DRAFT && (
                          <th className="py-2 px-4 text-center">إجراء</th>
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
                      <tr className="bg-cream font-bold">
                        <td className="py-2 px-4 text-right text-xs text-muted" colSpan={6}>الإجمالي</td>
                        <td className="py-2 px-4 text-center text-teal">
                          {formatCurrency(calcRunTotal(entries))}
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

      {/* New Run Modal */}
      {showNewRun && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowNewRun(false)}>
          <div className="bg-surface rounded-2xl p-6 w-full max-w-sm shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-lg text-text mb-4">دورة رواتب جديدة</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted mb-1 block">السنة</label>
                <input
                  type="number"
                  value={newRunForm.period_year}
                  onChange={e => setNewRunForm(f => ({ ...f, period_year: Number(e.target.value) }))}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-cream text-text"
                />
              </div>
              <div>
                <label className="text-xs text-muted mb-1 block">الشهر</label>
                <select
                  value={newRunForm.period_month}
                  onChange={e => setNewRunForm(f => ({ ...f, period_month: Number(e.target.value) }))}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-cream text-text"
                >
                  {MONTHS_AR.map((m, i) => (
                    <option key={i + 1} value={i + 1}>{m}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button
                onClick={handleCreateRun}
                disabled={loading.action}
                className="flex-1 py-2 rounded-xl bg-teal text-white text-sm font-semibold hover:bg-teal/90 disabled:opacity-50 transition"
              >
                إنشاء
              </button>
              <button
                onClick={() => setShowNewRun(false)}
                className="flex-1 py-2 rounded-xl border border-border text-sm text-text hover:bg-cream transition"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Entry Modal */}
      {editEntry && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setEditEntry(null)}>
          <div className="bg-surface rounded-2xl p-6 w-full max-w-md shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-lg text-text mb-4">تعديل راتب — {editEntry.employee_name}</h3>
            <div className="grid grid-cols-2 gap-3">
              {[
                { key: 'base_salary_usd', label: 'الراتب الأساسي ($)' },
                { key: 'bonus_usd', label: 'مكافأة ($)' },
                { key: 'deductions_usd', label: 'خصومات ($)' },
                { key: 'advance_deduction_usd', label: 'سلفة ($)' },
                { key: 'absent_days', label: 'أيام غياب' },
                { key: 'working_days', label: 'أيام عمل' },
              ].map(({ key, label }) => (
                <div key={key}>
                  <label className="text-xs text-muted mb-1 block">{label}</label>
                  <input
                    type="number"
                    value={entryForm[key] ?? 0}
                    onChange={e => setEntryForm(f => ({ ...f, [key]: Number(e.target.value) }))}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-cream text-text"
                  />
                </div>
              ))}
            </div>
            <div className="mt-3">
              <label className="text-xs text-muted mb-1 block">ملاحظات</label>
              <input
                type="text"
                value={entryForm.notes ?? ''}
                onChange={e => setEntryForm(f => ({ ...f, notes: e.target.value }))}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-cream text-text"
                placeholder="اختياري"
              />
            </div>
            <div className="flex gap-2 mt-5">
              <button
                onClick={handleSaveEntry}
                disabled={isSubmitting}
                className="flex-1 py-2 rounded-xl bg-teal text-white text-sm font-semibold hover:bg-teal/90 disabled:opacity-50 transition"
              >
                حفظ
              </button>
              <button
                onClick={() => setEditEntry(null)}
                className="flex-1 py-2 rounded-xl border border-border text-sm text-text hover:bg-cream transition"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default PayrollDashboard;
