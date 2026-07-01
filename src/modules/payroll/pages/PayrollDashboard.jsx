// =============================================================
// PayrollDashboard — Payroll Hub (theme-aware v2)
// =============================================================
import { useState, useCallback } from 'react';
import { useAuth } from '@hooks/useAuth';
import { fetchMonthlyAttendanceSummary, calcAbsenceDeduction } from '../services/attendanceLink.js';
import { runPayrollForMonth, fetchEmployeeSalesStatement } from '../services/payrollEngine.js';
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
  calcNetSalary,
  periodLabel,
} from '../types/payroll.types.js';
import { ROLES } from '@data/teams';
import { printRunReport } from '../utils/printPayslip.js';

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
  const { selectRun, createRun, deleteEntry, upsertEntry, loadEntries } = usePayrollActions();
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

  // ── Attendance import
  const [attLoading, setAttLoading] = useState(false);
  const [attResult,  setAttResult]  = useState(null);

  // ── Status / result message
  const [commMsg, setCommMsg] = useState(null);

  // ── One-click payroll engine
  const [engineRunning, setEngineRunning] = useState(false);
  const [engineProgress, setEngineProgress] = useState(null); // { done, total }

  // ── Sales statement modal (كشف حركة المبيعات)
  const [statementFor, setStatementFor] = useState(null);   // entry
  const [statementData, setStatementData] = useState(null); // { orders, total, count }
  const [statementLoading, setStatementLoading] = useState(false);

  /**
   * ⚡ One-click: compute the whole run automatically for every active
   * employee — base + allowances + sales commission − absence − advances.
   * Manually-edited entries are preserved (not overwritten).
   */
  const handleRunEngine = useCallback(async () => {
    if (!run) return;
    setEngineRunning(true);
    setEngineProgress({ done: 0, total: 0 });
    setCommMsg(null);
    try {
      const skip = new Set(entries.filter(e => e.source === 'manual').map(e => e.employee_id));
      const res = await runPayrollForMonth({
        runId: run.id,
        year: run.period_year,
        month: run.period_month,
        skipEmployeeIds: skip,
        onProgress: (done, total) => setEngineProgress({ done, total }),
      });
      await loadEntries(run.id); // refresh from DB
      const errNote = res.errors.length ? ` · ⚠️ ${res.errors.length} تنبيه` : '';
      setCommMsg(`✅ تم حساب ${res.count} موظف تلقائياً${skip.size ? ` (${skip.size} يدوي محفوظ)` : ''}${errNote}`);
      if (res.errors.length) console.warn('Payroll engine notes:', res.errors);
    } catch (e) {
      setCommMsg('⚠️ ' + (e?.message || e));
    } finally {
      setEngineRunning(false);
      setEngineProgress(null);
    }
  }, [run, entries, loadEntries]);

  const openStatement = useCallback(async (entry) => {
    setStatementFor(entry);
    setStatementData(null);
    setStatementLoading(true);
    try {
      const data = await fetchEmployeeSalesStatement(
        { id: entry.employee_id, employee_name: entry.employee_name },
        run.period_year, run.period_month,
      );
      setStatementData(data);
    } catch (e) {
      setStatementData({ orders: [], totalUsd: 0, count: 0, error: e?.message || String(e) });
    } finally {
      setStatementLoading(false);
    }
  }, [run]);

  /** Pull attendance data for the selected run's period and auto-fill the entry form */
  const handleImportAttendance = useCallback(async () => {
    if (!run || !entryForm.employee_id) return;
    setAttLoading(true);
    setAttResult(null);
    try {
      const summary = await fetchMonthlyAttendanceSummary(
        entryForm.employee_id,
        run.period_year,
        run.period_month,
      );
      setAttResult(summary);
      if (!summary.error) {
        const deduction = calcAbsenceDeduction(
          entryForm.base_salary_usd,
          summary.workingDays,
          summary.absentDays,
        );
        setEntryForm((f) => ({
          ...f,
          absent_days:   summary.absentDays,
          working_days:  summary.workingDays,
          absence_deduction_usd: deduction,
        }));
      }
    } finally {
      setAttLoading(false);
    }
  }, [run, entryForm.employee_id, entryForm.base_salary_usd]);

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
    setAttResult(null);
    setEntryForm({
      id: entry.id,
      employee_id: entry.employee_id,
      employee_name: entry.employee_name,
      currency: entry.currency || run?.currency || 'USD',
      base_salary_usd: entry.base_salary_usd,
      allowances_usd: entry.allowances_usd ?? 0,
      commission_usd: entry.commission_usd ?? 0,
      bonus_usd: entry.bonus_usd,
      deductions_usd: entry.deductions_usd,
      absence_deduction_usd: entry.absence_deduction_usd ?? 0,
      advance_deduction_usd: entry.advance_deduction_usd,
      absent_days: entry.absent_days,
      working_days: entry.working_days,
      notes: entry.notes ?? '',
    });
  };

  const handleSaveEntry = async () => {
    // Merge over the original entry so engine fields (allowances, commission,
    // absence, currency…) are preserved, then recompute net from all parts.
    const merged = { ...editEntry, ...entryForm, source: 'manual' };
    merged.net_salary_usd = calcNetSalary(merged);
    await upsertEntry(merged);
    setEditEntry(null);
    setEntryForm({});
  };

  const runTotal = calcRunTotal(entries);
  // Net totals grouped by currency (employees may be paid in TRY/SYP/USD)
  const totalsByCurrency = entries.reduce((acc, e) => {
    const c = e.currency || run?.currency || 'USD';
    acc[c] = (acc[c] || 0) + calcNetSalary(e);
    return acc;
  }, {});

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
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-teal text-navy text-sm font-bold hover:bg-teal/90 active:scale-95 transition shadow-sm"
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
                  {commMsg && <p className={`text-xs mt-1 font-semibold ${commMsg.startsWith('✅') ? 'text-green-fg' : 'text-amber-fg'}`}>{commMsg}</p>}
                </div>
                <div className="flex gap-2 flex-wrap">
                  {isAdmin && run.status === PAYROLL_STATUS.DRAFT && (
                    <ActionBtn onClick={handleRunEngine} disabled={engineRunning} variant="green">
                      {engineRunning
                        ? `⏳ ${engineProgress ? `${engineProgress.done}/${engineProgress.total}` : '…'}`
                        : '⚡ تشغيل الدورة (حساب شامل)'}
                    </ActionBtn>
                  )}
                  {entries.length > 0 && (
                    <ActionBtn onClick={() => printRunReport(entries, run)} variant="blue">
                      🖨️ طباعة التقرير
                    </ActionBtn>
                  )}
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
                    <button onClick={handleRunEngine} disabled={engineRunning}
                      className="mt-2 px-4 py-2 rounded-xl bg-teal text-navy text-sm font-bold hover:bg-teal/90 disabled:opacity-50 transition">
                      {engineRunning
                        ? `⏳ ${engineProgress ? `${engineProgress.done}/${engineProgress.total}` : 'جارٍ الحساب…'}`
                        : '⚡ تشغيل الدورة — حساب كل الموظفين تلقائياً'}
                    </button>
                  )}
                  {isAdmin && run.status === PAYROLL_STATUS.DRAFT && (
                    <p className="text-[11px] text-muted mt-1">
                      يحسب الأساسي + البدلات + عمولة المبيعات − الغياب − السلف لكل موظف بعملته.
                      عيّن الرواتب والعمولة من «المستخدمون».
                    </p>
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
                        <th className="py-2.5 px-4 text-center font-semibold">البدلات</th>
                        <th className="py-2.5 px-4 text-center font-semibold">العمولة</th>
                        <th className="py-2.5 px-4 text-center font-semibold">خصومات</th>
                        <th className="py-2.5 px-4 text-center font-semibold">الصافي</th>
                        <th className="py-2.5 px-4 text-center font-semibold">إجراء</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entries.map(e => (
                        <EntryRow
                          key={e.id}
                          entry={e}
                          run={run}
                          canEdit={isAdmin && run.status === PAYROLL_STATUS.DRAFT}
                          onEdit={openEditEntry}
                          onDelete={deleteEntry}
                          onStatement={openStatement}
                        />
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-surface-alt/60 border-t border-border/40 font-bold">
                        <td className="py-3 px-4 text-right text-xs text-muted" colSpan={7}>الإجمالي (لكل عملة)</td>
                        <td className="py-3 px-4 text-center text-teal font-extrabold text-sm tabular-nums whitespace-nowrap">
                          {Object.keys(totalsByCurrency).length === 0
                            ? formatCurrency(0)
                            : Object.entries(totalsByCurrency).map(([c, v]) => (
                                <div key={c}>{formatCurrency(v, c)}</div>
                              ))}
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
                className="flex-1 py-2.5 rounded-xl bg-teal text-navy text-sm font-bold hover:bg-teal/90 disabled:opacity-50 transition"
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
                className="flex-1 py-2.5 rounded-xl bg-teal text-navy text-sm font-bold hover:bg-teal/90 disabled:opacity-50 transition"
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
          {/* ── Attendance Import button ── */}
          <div className="rounded-xl border border-border bg-surface-alt p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-xs font-bold text-text">استيراد من الحضور</p>
                <p className="text-[11px] text-muted">
                  يملأ أيام الغياب والعمل تلقائياً من سجلات الحضور لـ
                  <span className="font-semibold text-teal"> {run ? `${MONTHS_AR[run.period_month - 1]} ${run.period_year}` : '—'}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={handleImportAttendance}
                disabled={attLoading || !entryForm.employee_id}
                className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-teal/10 text-teal text-xs font-bold border border-teal/20 hover:bg-teal/20 disabled:opacity-50 transition"
              >
                {attLoading ? (
                  <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                )}
                {attLoading ? 'جار الاستيراد…' : '🔗 استيراد'}
              </button>
            </div>

            {/* Result summary */}
            {attResult && !attResult.error && (
              <div className="grid grid-cols-3 gap-2 pt-1 border-t border-border/60">
                {[
                  { label: 'أيام العمل', value: attResult.workingDays, color: 'text-text' },
                  { label: 'أيام الحضور', value: attResult.presentDays, color: 'text-green-fg' },
                  { label: 'أيام الغياب', value: attResult.absentDays, color: attResult.absentDays > 0 ? 'text-red-500' : 'text-muted' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="text-center">
                    <div className={`text-lg font-extrabold tabular-nums ${color}`}>{value}</div>
                    <div className="text-[10px] text-muted">{label}</div>
                  </div>
                ))}
              </div>
            )}
            {attResult?.error && (
              <p className="text-[11px] text-red-500 border-t border-border/60 pt-1">{attResult.error}</p>
            )}
            {!entryForm.employee_id && (
              <p className="text-[11px] text-amber-fg">لا يوجد معرف موظف مرتبط — الاستيراد غير متاح</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            {[
              { key: 'base_salary_usd',       label: 'الراتب الأساسي' },
              { key: 'allowances_usd',         label: 'البدلات' },
              { key: 'commission_usd',         label: 'عمولة المبيعات' },
              { key: 'bonus_usd',              label: 'مكافأة يدوية' },
              { key: 'absence_deduction_usd',  label: 'خصم الغياب' },
              { key: 'deductions_usd',         label: 'خصومات أخرى' },
              { key: 'advance_deduction_usd',  label: 'خصم السلفة' },
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
              {formatCurrency(calcNetSalary(entryForm), entryForm.currency || 'USD')}
            </span>
          </div>
        </Modal>
      )}
      {/* ── Sales Statement Modal (كشف حركة المبيعات) ────────── */}
      {statementFor && (
        <Modal
          title={`كشف حركة المبيعات — ${statementFor.employee_name}`}
          onClose={() => setStatementFor(null)}
        >
          <div className="space-y-3">
            <p className="text-xs text-muted">
              الطلبات المحصّلة لـ<span className="font-semibold text-teal"> {run ? periodLabel(run.period_year, run.period_month) : ''}</span> —
              محوّلة للدولار، الأساس الذي حُسبت عليه العمولة ({Number(statementFor.commission_pct ?? 0)}%).
            </p>

            {statementLoading ? (
              <div className="py-8 text-center text-muted text-sm">جار التحميل…</div>
            ) : statementData?.error ? (
              <p className="text-sm text-red-500">{statementData.error}</p>
            ) : (statementData?.orders?.length ?? 0) === 0 ? (
              <div className="py-8 text-center text-muted text-sm">
                لا توجد طلبات محصّلة مطابقة لهذا الموظف في هذا الشهر.
                <p className="text-[11px] mt-1">تأكّد أن «اسم البائع» في الطلبات يطابق اسم الموظف — أو عيّن «اسم بديل» له.</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: 'عدد الطلبات', value: statementData.count },
                    { label: 'المبيعات ($)', value: formatCurrency(statementData.totalUsd, 'USD') },
                    { label: 'العمولة ($)', value: formatCurrency((statementData.totalUsd * Number(statementFor.commission_pct ?? 0)) / 100, 'USD') },
                  ].map(({ label, value }) => (
                    <div key={label} className="text-center bg-surface-alt rounded-xl py-2">
                      <div className="text-sm font-extrabold text-text tabular-nums">{value}</div>
                      <div className="text-[10px] text-muted">{label}</div>
                    </div>
                  ))}
                </div>
                <div className="overflow-x-auto max-h-64 overflow-y-auto border border-border/40 rounded-xl">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-surface-alt text-muted">
                      <tr>
                        <th className="py-2 px-2 text-right font-semibold">الكود</th>
                        <th className="py-2 px-2 text-right font-semibold">التاريخ</th>
                        <th className="py-2 px-2 text-right font-semibold">العميل</th>
                        <th className="py-2 px-2 text-center font-semibold">المبلغ</th>
                        <th className="py-2 px-2 text-center font-semibold">≈ $</th>
                      </tr>
                    </thead>
                    <tbody>
                      {statementData.orders.map((o, i) => (
                        <tr key={o.order_id || i} className="border-t border-border/30">
                          <td className="py-1.5 px-2 text-right font-mono text-[11px]">{o.order_id || '—'}</td>
                          <td className="py-1.5 px-2 text-right text-muted">{String(o.order_date || '').slice(0, 10)}</td>
                          <td className="py-1.5 px-2 text-right truncate max-w-[110px]">{o.customer_name || '—'}</td>
                          <td className="py-1.5 px-2 text-center tabular-nums">{formatCurrency(o.amount, o.currency || 'USD')}</td>
                          <td className="py-1.5 px-2 text-center tabular-nums text-muted">{formatCurrency(o.usd_value, 'USD')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </Modal>
      )}

    </div>
  );
}

export default PayrollDashboard;
