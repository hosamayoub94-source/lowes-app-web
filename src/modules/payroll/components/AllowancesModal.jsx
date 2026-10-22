// =============================================================
// AllowancesModal — "🍽️ البدلات": إدارة البدلات الدورية بعملتها الأصلية
// (مثلاً بدل طعام 7500 ل.س جديد لموظفي الصالة). إضافة / تعديل / إيقاف / إلغاء.
// القيمة بالدولار تُعرض حسب سعر صرف الدورة المثبَّت؛ التعديل يسري عند إعادة
// «تشغيل الدورة» (المحرك يقرأ الجدول في كل حسبة).
// =============================================================
import { useCallback, useEffect, useState } from 'react';
import {
  ALLOWANCE_KIND_LABELS, ALLOWANCE_CURRENCIES,
  listAllowances, listPayrollEmployees, saveAllowance, deleteAllowance, allowanceUsd,
} from '../services/allowanceService.js';
import { formatCurrency } from '../types/payroll.types.js';

const CUR_LABEL = { SYP: 'ل.س', USD: '$', TRY: '₺' };

export function AllowancesModal({ run, onClose }) {
  const [rows, setRows] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ employeeId: '', amount: '7500', currency: 'SYP' });
  const [draft, setDraft] = useState({}); // id → مبلغ قيد التعديل

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [a, e] = await Promise.all([listAllowances(), listPayrollEmployees()]);
      setRows(a); setEmployees(e);
    } catch (err) {
      setError('تعذّر تحميل البدلات: ' + (err?.message || err));
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const run_ = async (fn) => {
    setBusy(true); setError('');
    try { await fn(); await load(); } catch (err) { setError(err?.message || String(err)); } finally { setBusy(false); }
  };

  const add = () => run_(async () => {
    await saveAllowance({ employeeId: form.employeeId, kind: 'food', amount: form.amount, currency: form.currency });
    setForm(f => ({ ...f, employeeId: '' }));
  });
  const saveAmount = (r) => run_(async () => {
    const v = draft[r.id];
    if (v === undefined || Number(v) === Number(r.amount)) return;
    await saveAllowance({ employeeId: r.employee_id, kind: r.kind, amount: v, currency: r.currency, isActive: r.is_active, note: r.note });
    setDraft(d => { const n = { ...d }; delete n[r.id]; return n; });
  });
  const toggle = (r) => run_(() => saveAllowance({ employeeId: r.employee_id, kind: r.kind, amount: r.amount, currency: r.currency, isActive: !r.is_active, note: r.note }));
  const remove = (r) => {
    if (!window.confirm(`إلغاء ${ALLOWANCE_KIND_LABELS[r.kind] || 'البدل'} لـ ${r.employee_name} نهائياً؟`)) return;
    run_(() => deleteAllowance(r.id));
  };

  const usedIds = new Set(rows.filter(r => r.kind === 'food').map(r => r.employee_id));
  const freeEmployees = employees.filter(e => !usedIds.has(e.id));
  const totalUsd = rows.filter(r => r.is_active).reduce((s, r) => s + (allowanceUsd(r, run) || 0), 0);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4" onClick={onClose} dir="rtl">
      <div className="bg-surface rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/40 shrink-0">
          <div>
            <h3 className="font-bold text-base text-text">🍽️ البدلات الدورية</h3>
            <p className="text-[11px] text-muted mt-0.5">
              تُحفَظ بعملتها (ل.س) وتُحوَّل للدولار بسعر الدورة{run?.rate_usd_syp > 0 ? ` (1$ = ${run.rate_usd_syp} ل.س)` : ' — لا سعر مثبَّت بعد'} · التعديل يسري عند إعادة «تشغيل الدورة»
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-surface-alt text-muted hover:text-text transition shrink-0" aria-label="إغلاق">✕</button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

          <div className="border border-border/40 rounded-xl p-3 space-y-2">
            <p className="text-xs font-bold text-text">➕ إضافة بدل طعام لموظف</p>
            <div className="flex flex-wrap gap-2 items-center">
              <select value={form.employeeId} onChange={e => setForm(f => ({ ...f, employeeId: e.target.value }))}
                className="border border-border rounded-lg px-2 py-1.5 text-xs bg-surface flex-1 min-w-[160px]">
                <option value="">اختر الموظف…</option>
                {freeEmployees.map(e => <option key={e.id} value={e.id}>{e.employee_name}</option>)}
              </select>
              <input type="number" min="0" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                className="border border-border rounded-lg px-2 py-1.5 text-xs bg-surface w-28 tabular-nums" />
              <select value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}
                className="border border-border rounded-lg px-2 py-1.5 text-xs bg-surface">
                {ALLOWANCE_CURRENCIES.map(c => <option key={c} value={c}>{CUR_LABEL[c]}</option>)}
              </select>
              <button onClick={add} disabled={busy || !form.employeeId}
                className="px-3 py-1.5 rounded-lg bg-teal text-navy text-xs font-bold disabled:opacity-50">إضافة</button>
            </div>
          </div>

          {loading ? (
            <p className="text-sm text-muted text-center py-6">جارٍ التحميل…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted text-center py-6">لا توجد بدلات مضافة.</p>
          ) : (
            <div className="border border-border/40 rounded-xl overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-surface-alt text-muted">
                  <tr>
                    <th className="py-2 px-3 text-right font-semibold">الموظف</th>
                    <th className="py-2 px-2 text-center font-semibold">المبلغ</th>
                    <th className="py-2 px-2 text-center font-semibold">≈ بالدولار</th>
                    <th className="py-2 px-2 text-center font-semibold">فعّال</th>
                    <th className="py-2 px-3 text-center font-semibold">إلغاء</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => {
                    const usd = allowanceUsd(r, run);
                    return (
                      <tr key={r.id} className={`border-t border-border/30 ${r.is_active ? '' : 'opacity-50'}`}>
                        <td className="py-2 px-3 text-right font-semibold text-text">
                          {r.employee_name}<span className="block text-[10px] text-muted font-normal">{ALLOWANCE_KIND_LABELS[r.kind] || r.kind}</span>
                        </td>
                        <td className="py-2 px-2 text-center">
                          <input type="number" min="0" value={draft[r.id] ?? r.amount}
                            onChange={e => setDraft(d => ({ ...d, [r.id]: e.target.value }))}
                            onBlur={() => saveAmount(r)}
                            className="border border-border rounded-lg px-2 py-1 w-24 text-center tabular-nums bg-surface" />
                          <span className="mr-1 text-muted">{CUR_LABEL[r.currency]}</span>
                        </td>
                        <td className="py-2 px-2 text-center tabular-nums text-text">{usd == null ? '—' : formatCurrency(usd, 'USD')}</td>
                        <td className="py-2 px-2 text-center">
                          <input type="checkbox" checked={!!r.is_active} onChange={() => toggle(r)} disabled={busy} className="w-4 h-4 accent-teal cursor-pointer" />
                        </td>
                        <td className="py-2 px-3 text-center">
                          <button onClick={() => remove(r)} disabled={busy} className="text-red-600 hover:underline disabled:opacity-50">🗑️</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border/40 bg-surface-alt/60">
                    <td className="py-2 px-3 text-right font-bold text-text" colSpan={2}>المجموع الشهري (الفعّال)</td>
                    <td className="py-2 px-2 text-center font-extrabold tabular-nums text-teal">{formatCurrency(totalUsd, 'USD')}</td>
                    <td colSpan={2}></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default AllowancesModal;
