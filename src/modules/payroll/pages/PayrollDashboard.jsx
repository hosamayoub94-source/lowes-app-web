// =============================================================
// PayrollDashboard — Payroll Hub (theme-aware v2)
// =============================================================
import { useState, useCallback } from 'react';
import { supabase } from '@services/supabase';
import { useAuth } from '@hooks/useAuth';
import { fetchMonthlyAttendanceSummary, calcAbsenceDeduction } from '../services/attendanceLink.js';
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
import { printRunReport } from '../utils/printPayslip.js';

// ── Commission levels from SALES_RULES.md ──────────────────────
const COMMISSION_LEVELS = {
  junior:       { base: 8  },
  active:       { base: 5  },
  professional: { base: 10 },
  agent:        { base: 20 },
};
function calcVolumeBonus(level, achievePct) {
  if (achievePct >= 150) return { junior:7, active:7, professional:10, agent:12 }[level] ?? 0;
  if (achievePct >= 120) return { junior:0, active:5, professional:7,  agent:9  }[level] ?? 0;
  if (achievePct >= 100) return { junior:0, active:3, professional:5,  agent:6  }[level] ?? 0;
  if (achievePct >= 80)  return { junior:0, active:1, professional:2,  agent:3  }[level] ?? 0;
  return 0;
}

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

  // ── Attendance import
  const [attLoading, setAttLoading] = useState(false);
  const [attResult,  setAttResult]  = useState(null);

  // ── Commission auto-calc
  const [commLoading, setCommLoading] = useState(false);
  const [commMsg,     setCommMsg]     = useState(null);

  const handleAutoCommission = useCallback(async () => {
    if (!run || entries.length === 0) return;
    setCommLoading(true); setCommMsg(null);
    try {
      const rows = [];
      for (const e of entries) {
        const kpiRes = await supabase.from('employee_kpis').select('level,sales_score,sales_target')
          .eq('employee_id', e.employee_id).eq('year', run.period_year).eq('month', run.period_month).maybeSingle();
        const kpi = kpiRes.data;
        const level = kpi?.level ?? 'junior';
        const salesTarget = kpi?.sales_target ?? 0;
        const salesActual = kpi?.sales_score ?? Number(e.net_salary_usd ?? 0);
        const achievePct  = salesTarget > 0 ? Math.round((salesActual / salesTarget) * 100) : 0;
        const basePct     = COMMISSION_LEVELS[level]?.base ?? 8;
        const bonusPct    = calcVolumeBonus(level, achievePct);
        const totalPct    = basePct + bonusPct;
        const commUsd     = (salesActual * totalPct) / 100;
        rows.push({
          employee_id: e.employee_id, year: run.period_year, month: run.period_month,
          level, base_commission_pct: basePct, volume_bonus_pct: bonusPct,
          total_sales_usd: salesActual, total_commission_usd: commUsd,
          status: 'pending', updated_at: new Date().toISOString(),
        });
      }
      for (const r of rows) {
        await supabase.from('commissions').upsert(r, { onConflict: 'employee_id,year,month' });
      }
      setCommMsg(`✅ تم احتساب عمولات ${rows.length} موظف — إجمالي: $${rows.reduce((s,r)=>s+r.total_commission_usd,0).toFixed(2)}`);
    } catch (err) {
      setCommMsg('⚠️ ' + err.message);
    } finally { setCommLoading(false); }
  }, [run, entries]);

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
          deductions_usd: deduction,
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

  // ── Auto-fill all active employees with their stored base salaries ──
  // Removes the "re-enter everyone every month" pain.
  const [fillLoading, setFillLoading] = useState(false);
  const handleAutoFillEmployees = useCallback(async () => {
    if (!run) return;
    setFillLoading(true); setCommMsg(null);
    try {
      const { data: emps } = await supabase.from('profiles')
        .select('id, employee_name, role_type, base_salary_usd, housing_allowance_usd, transport_allowance_usd')
        .eq('is_active', true)
        .order('employee_name');
      const already = new Set(entries.map(e => e.employee_id));
      let added = 0;
      for (const emp of (emps ?? [])) {
        if (already.has(emp.id)) continue; // skip employees already in this run
        const base  = Number(emp.base_salary_usd) || 0;
        const allow = (Number(emp.housing_allowance_usd) || 0) + (Number(emp.transport_allowance_usd) || 0);
        await upsertEntry({
          run_id:                run.id,
          employee_id:           emp.id,
          employee_name:         emp.employee_name,
          role_type:             emp.role_type,
          base_salary_usd:       base,
          bonus_usd:             allow,
          deductions_usd:        0,
          advance_deduction_usd: 0,
          working_days:          30,
          absent_days:           0,
          net_salary_usd:        base + allow,
          notes:                 null,
        });
        added++;
      }
      setCommMsg(added > 0
        ? `✅ تمت إضافة ${added} موظف برواتبهم الأساسية. عدّل الحوافز/الخصومات عند الحاجة.`
        : 'ℹ️ كل الموظفين مضافون مسبقاً لهذه الدورة.');
    } catch (e) {
      setCommMsg('⚠️ ' + e.message);
    } finally { setFillLoading(false); }
  }, [run, entries, upsertEntry]);

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
                    <ActionBtn onClick={handleAutoFillEmployees} disabled={fillLoading} variant="teal">
                      {fillLoading ? '⏳…' : '👥 ملء الموظفين تلقائياً'}
                    </ActionBtn>
                  )}
                  {entries.length > 0 && (
                    <ActionBtn onClick={() => printRunReport(entries, run)} variant="blue">
                      🖨️ طباعة التقرير
                    </ActionBtn>
                  )}
                  {isAdmin && entries.length > 0 && (
                    <ActionBtn onClick={handleAutoCommission} disabled={commLoading} variant="green">
                      {commLoading ? '⏳…' : '💰 احتساب العمولات'}
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
                    <button onClick={handleAutoFillEmployees} disabled={fillLoading}
                      className="mt-2 px-4 py-2 rounded-xl bg-teal text-navy text-sm font-bold hover:bg-teal/90 disabled:opacity-50 transition">
                      {fillLoading ? '⏳ جارٍ الملء…' : '👥 ملء كل الموظفين برواتبهم'}
                    </button>
                  )}
                  {isAdmin && run.status === PAYROLL_STATUS.DRAFT && (
                    <p className="text-[11px] text-muted mt-1">يحضر رواتبهم الأساسية من ملفاتهم — عيّنها من «المستخدمون»</p>
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
