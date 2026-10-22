// =============================================================
// PayrollBatchModal — "💵 دفعة الرواتب"
// تصنيف أونلاين/مكتب + تحديد "نصف الراتب" لكل موظف، ثم ملخص منفصل
// لكل مجموعة وإجمالي عام. طبقة عرض بحتة فوق calcNetSalary الموجود —
// لا تُعدّل الراتب المستحق ولا العمولات ولا التارجت ولا الخصومات ولا
// المسمى الوظيفي ولا القسم الفعلي لأي موظف.
// =============================================================
import { useState, useEffect, useMemo } from 'react';
import { calcNetSalary, formatCurrency, periodLabel } from '../types/payroll.types.js';
import { fetchEntries } from '@modules/accounting/services/accountingService.js';
import { WALLETS, walletDelta } from '@modules/accounting/types/accounting.types.js';
import { buildRateToUsd } from '../services/payrollEngine.js';
import {
  loadOfficeIds, saveOfficeIds,
  loadHalfSalaryIds, saveHalfSalaryIds,
  calcPaidAmount, buildPayBatchSummary,
} from '../utils/payBatch.js';

function SummaryBox({ title, icon, count, byCurrency }) {
  const currencies = Object.keys(byCurrency);
  return (
    <div className="bg-surface-alt/60 border border-border/40 rounded-2xl p-4 space-y-2">
      <p className="text-xs font-bold text-text flex items-center gap-1.5">
        <span>{icon}</span>{title}
        <span className="text-[11px] font-semibold text-muted mr-1">({count} موظف)</span>
      </p>
      {currencies.length === 0 ? (
        <p className="text-xs text-muted">لا يوجد موظفون بهذه المجموعة</p>
      ) : (
        <div className="space-y-1.5">
          {currencies.map(cur => {
            const v = byCurrency[cur];
            return (
              <div key={cur} className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="text-sm font-extrabold text-text tabular-nums">{formatCurrency(v.due, cur)}</div>
                  <div className="text-[10px] text-muted">مستحق</div>
                </div>
                <div>
                  <div className="text-sm font-extrabold text-green-fg tabular-nums">{formatCurrency(v.paid, cur)}</div>
                  <div className="text-[10px] text-muted">مدفوع</div>
                </div>
                <div>
                  <div className="text-sm font-extrabold text-amber-fg tabular-nums">{formatCurrency(v.remaining, cur)}</div>
                  <div className="text-[10px] text-muted">متبقي</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function PayrollBatchModal({ run, entries, onClose }) {
  const [officeIds, setOfficeIds] = useState(() => loadOfficeIds());
  const [halfIds, setHalfIds] = useState(() => loadHalfSalaryIds(run.id));
  const [cashBalances, setCashBalances] = useState({ USD: 0, TRY: 0, SYP: 0 });
  const [rates, setRates] = useState({ USD: 1 });
  const [cashLoading, setCashLoading] = useState(true);
  const [payCurrency, setPayCurrency] = useState('USD');

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [ledger, rateRows] = await Promise.all([
          fetchEntries(),
          (await import('@services/supabase')).supabase.from('exchange_rates').select('from_cur,to_cur,rate').order('created_at', { ascending: false }),
        ]);
        const balances = { USD: 0, TRY: 0, SYP: 0 };
        for (const wallet of WALLETS.filter(w => w.type === 'cash')) {
          balances[wallet.currency] += (ledger || []).filter(e => (e.book ?? 'central') === 'central').reduce((sum, e) => sum + walletDelta(e, wallet), 0);
        }
        if (active) {
          setCashBalances(balances);
          setRates(buildRateToUsd(rateRows?.data || []));
        }
      } catch (e) {
        console.error('[PayrollBatchCash]', e);
      } finally {
        if (active) setCashLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  // مزامنة تحديد "نصف الراتب" مع الشهر الحالي إن تغيّرت الدورة المعروضة
  useEffect(() => {
    setHalfIds(loadHalfSalaryIds(run.id));
  }, [run.id]);

  const toggleOffice = (employeeId) => {
    setOfficeIds(prev => {
      const next = new Set(prev);
      next.has(employeeId) ? next.delete(employeeId) : next.add(employeeId);
      saveOfficeIds(next);
      return next;
    });
  };

  const toggleHalf = (employeeId) => {
    setHalfIds(prev => {
      const next = new Set(prev);
      next.has(employeeId) ? next.delete(employeeId) : next.add(employeeId);
      saveHalfSalaryIds(run.id, next);
      return next;
    });
  };

  const summary = useMemo(
    () => buildPayBatchSummary(entries, officeIds, halfIds),
    [entries, officeIds, halfIds],
  );
  const dueUsd = useMemo(() => entries.reduce((sum, e) => sum + calcNetSalary(e), 0), [entries]);
  const paidUsd = useMemo(() => entries.reduce((sum, e) => sum + calcPaidAmount(calcNetSalary(e), halfIds.has(e.employee_id)), 0), [entries, halfIds]);
  const cashUsd = Object.entries(cashBalances).reduce((sum, [cur, amount]) => sum + (amount * (rates[cur] || 0)), 0);
  const paymentRate = payCurrency === 'USD' ? 1 : rates[payCurrency];
  const paidInSelectedCurrency = paymentRate > 0 ? paidUsd / paymentRate : null;

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4"
      onClick={onClose}
      dir="rtl"
    >
      <div
        className="bg-surface rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/40 shrink-0">
          <div>
            <h3 className="font-bold text-base text-text">💵 دفعة الرواتب</h3>
            <p className="text-[11px] text-muted mt-0.5">{periodLabel(run.period_year, run.period_month)} · التصنيف والاختيار هنا لا يُغيّر الراتب المستحق ولا طريقة احتسابه</p>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 rounded-full bg-surface-alt flex items-center justify-center text-muted hover:text-text transition shrink-0">
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z"/></svg>
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          <div className="border border-teal/30 bg-teal/5 rounded-xl p-3 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-bold text-teal">💰 تخطيط الدفع حسب الكاش المتوفر</p>
              <label className="text-xs text-text flex items-center gap-2">عملة الدفع
                <select value={payCurrency} onChange={e => setPayCurrency(e.target.value)} className="border border-border rounded-lg px-2 py-1 bg-surface text-xs">
                  <option value="USD">USD $</option><option value="TRY">TRY ₺</option><option value="SYP">SYP ل.س</option>
                </select>
              </label>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-[11px]">
              <div><b className="block text-text">{cashLoading ? '…' : formatCurrency(cashBalances.USD, 'USD')}</b><span className="text-muted">كاش $</span></div>
              <div><b className="block text-text">{cashLoading ? '…' : formatCurrency(cashBalances.TRY, 'TRY')}</b><span className="text-muted">كاش ₺</span></div>
              <div><b className="block text-text">{cashLoading ? '…' : formatCurrency(cashBalances.SYP, 'SYP')}</b><span className="text-muted">كاش ل.س</span></div>
              <div><b className="block text-text">{cashLoading ? '…' : formatCurrency(cashUsd, 'USD')}</b><span className="text-muted">يعادل بالدولار</span></div>
            </div>
            <p className={`text-xs font-semibold ${cashUsd >= paidUsd ? 'text-green-fg' : 'text-red-600'}`}>
              {cashUsd >= paidUsd ? '✅ الكاش يغطي الدفعة المحددة' : '⚠️ الكاش الحالي لا يغطي كامل الدفعة المحددة'} · المدفوع: {paymentRate > 0 && paidInSelectedCurrency != null ? formatCurrency(paidInSelectedCurrency, payCurrency) : 'لا يوجد سعر صرف'} · المستحق الكلي بالدولار: {formatCurrency(dueUsd, 'USD')}
            </p>
          </div>
          {/* ── جدول الموظفين: مكتب + نصف الراتب ───────────────── */}
          <div className="border border-border/40 rounded-xl overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-surface-alt text-muted">
                <tr>
                  <th className="py-2 px-3 text-right font-semibold">الموظف</th>
                  <th className="py-2 px-2 text-center font-semibold">🏢 مكتب</th>
                  <th className="py-2 px-2 text-center font-semibold">½ نصف الراتب</th>
                  <th className="py-2 px-2 text-center font-semibold">مستحق</th>
                  <th className="py-2 px-3 text-center font-semibold">مدفوع</th>
                </tr>
              </thead>
              <tbody>
                {entries.length === 0 ? (
                  <tr><td colSpan={5} className="py-6 text-center text-muted">لا يوجد موظفون بهذه الدورة</td></tr>
                ) : entries.map(e => {
                  const due = calcNetSalary(e);
                  const isHalf = halfIds.has(e.employee_id);
                  const isOffice = officeIds.has(e.employee_id);
                  const paid = calcPaidAmount(due, isHalf);
                  return (
                    <tr key={e.id} className="border-t border-border/30">
                      <td className="py-2 px-3 text-right font-semibold text-text">{e.employee_name}</td>
                      <td className="py-2 px-2 text-center">
                        <input
                          type="checkbox"
                          checked={isOffice}
                          onChange={() => toggleOffice(e.employee_id)}
                          className="w-4 h-4 accent-teal cursor-pointer"
                          title="تصنيف مكتب — طريقة دفع فقط، لا يغيّر المسمى/القسم"
                        />
                      </td>
                      <td className="py-2 px-2 text-center">
                        <input
                          type="checkbox"
                          checked={isHalf}
                          onChange={() => toggleHalf(e.employee_id)}
                          className="w-4 h-4 accent-amber-500 cursor-pointer"
                        />
                      </td>
                      <td className="py-2 px-2 text-center tabular-nums text-text">{formatCurrency(due, e.currency || 'USD')}</td>
                      <td className={`py-2 px-3 text-center tabular-nums font-bold ${isHalf ? 'text-amber-fg' : 'text-green-fg'}`}>
                        {formatCurrency(paid, e.currency || 'USD')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ── ملخص منفصل لكل مجموعة ─────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <SummaryBox title="الأونلاين" icon="🌐" count={summary.groups.online.count} byCurrency={summary.groups.online.byCurrency} />
            <SummaryBox title="المكتب"    icon="🏢" count={summary.groups.office.count} byCurrency={summary.groups.office.byCurrency} />
          </div>

          {/* ── الإجمالي النهائي ───────────────────────────────── */}
          <div className="bg-teal/10 border border-teal/20 rounded-2xl p-4 space-y-2">
            <p className="text-xs font-bold text-teal">الإجمالي النهائي — كل الموظفين ({summary.grandCount})</p>
            {Object.keys(summary.grandByCurrency).length === 0 ? (
              <p className="text-xs text-muted">لا بيانات</p>
            ) : (
              <div className="space-y-1.5">
                {Object.entries(summary.grandByCurrency).map(([cur, v]) => (
                  <div key={cur} className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <div className="text-sm font-extrabold text-text tabular-nums">{formatCurrency(v.due, cur)}</div>
                      <div className="text-[10px] text-muted">مستحق</div>
                    </div>
                    <div>
                      <div className="text-sm font-extrabold text-green-fg tabular-nums">{formatCurrency(v.paid, cur)}</div>
                      <div className="text-[10px] text-muted">مدفوع</div>
                    </div>
                    <div>
                      <div className="text-sm font-extrabold text-amber-fg tabular-nums">{formatCurrency(v.remaining, cur)}</div>
                      <div className="text-[10px] text-muted">متبقي</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default PayrollBatchModal;
