// =============================================================
// BalanceReconciliation — «من وين إجا هذا الرقم؟»
//   تفكيك الرصيد سطراً سطراً + كشف الخلل الفعلي بالدفتر.
//   سبب وجودها: التيم كان يشوف رقمين مختلفين بصفحتين وما في طريقة يتحقق
//   من أيّهما صحيح إلا بالتخمين. هلق التفكيك معروض، ومجموعه = الرصيد حرفياً.
// =============================================================
import { useMemo } from 'react';
import { CCY } from './sourceBreakdown.logic.js';
import { explainBalance, findLedgerIssues } from '../logic/entrySign.js';
import { BOOK_LABELS } from '../types/accounting.types.js';

const fmt = (v, c) =>
  `${c.sym}${Math.abs(Number(v) || 0).toLocaleString('en-US', { maximumFractionDigits: c.maxFrac })}`;

export default function BalanceReconciliation({
  open, onClose,
  entries = [],       // نطاق البطاقة — منه يُبنى التفكيك
  allEntries,         // الدفتر كامل — منه يُكشف الخلل
  scopeLabel = '',
}) {
  const { rows, total } = useMemo(() => explainBalance(entries), [entries]);
  // ⚠️ كشف الخلل لازم يشتغل على **الدفتر كامل**: التحويل بساقين موزّعتين على
  // كتابين، فلو فحصنا كتاباً واحداً بس، كل تحويل سليم بيبيّن «يتيم» (ساقه
  // التانية بالكتاب التاني). إصلاح 10 آب 2026 بعد ما اللوحة عرضت 12 يتيمة
  // بدل 3 الحقيقيات.
  const ledger = Array.isArray(allEntries) ? allEntries : entries;
  const issues = useMemo(() => findLedgerIssues(ledger), [ledger]);

  if (!open) return null;

  // العملات يلي فيها حركة فعلياً فقط — لا نعرض أعمدة فاضية.
  const cols = CCY.filter(c => rows.some(r => r.amounts[c.key] !== 0) || (Number(total[c.key]) || 0) !== 0);
  const issueCount = issues.orphanTransfers.length + issues.unknownTransfers.length + issues.missingBook.length;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4" dir="rtl">
      <div className="bg-surface w-full sm:max-w-2xl max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl border border-border">

        <div className="sticky top-0 bg-surface border-b border-border px-4 py-3 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-text">🧮 من وين إجا هذا الرقم؟</h3>
            <p className="text-[11px] text-muted mt-0.5">
              {scopeLabel ? `${scopeLabel} · ` : ''}{entries.length} قيد · كل الفترات (تراكمي)
            </p>
          </div>
          <button onClick={onClose} className="text-muted hover:text-text text-lg px-2" aria-label="إغلاق">✕</button>
        </div>

        <div className="p-4 space-y-4">
          {/* التفكيك */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] text-muted border-b border-border">
                  <th className="text-right font-medium py-2">البند</th>
                  <th className="text-center font-medium">عدد</th>
                  {cols.map(c => <th key={c.key} className="text-left font-medium px-2">{c.sym}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.key} className="border-b border-border/40">
                    <td className="py-2 text-text">
                      <span className={r.sign > 0 ? 'text-green-600' : 'text-red-500'}>
                        {r.sign > 0 ? '+' : '−'}
                      </span>{' '}
                      {r.label}
                    </td>
                    <td className="text-center text-[11px] text-muted">{r.count}</td>
                    {cols.map(c => (
                      <td key={c.key} className={`text-left px-2 tabular-nums ${r.sign > 0 ? 'text-green-600' : 'text-red-500'}`}>
                        {r.amounts[c.key] ? fmt(r.amounts[c.key], c) : <span className="text-muted/40">—</span>}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr className="border-t-2 border-border font-extrabold">
                  <td className="py-2.5 text-text">الرصيد</td>
                  <td />
                  {cols.map(c => {
                    const v = Number(total[c.key]) || 0;
                    return (
                      <td key={c.key} className={`text-left px-2 tabular-nums ${v >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                        {v < 0 ? '−' : ''}{fmt(v, c)}
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
            <p className="text-[11px] text-muted mt-2">
              ✅ هذا المجموع يساوي لوحة الخزائن لنفس النطاق بالضبط — نفس قاعدة الإشارة للاثنين.
            </p>
            {ledger !== entries && (
              <p className="text-[11px] text-muted/70 mt-1">
                فحص الخلل أدناه يشمل الدفتر كامل ({ledger.length} قيد) — سيقان التحويل موزّعة على الكتابين.
              </p>
            )}
          </div>

          {/* الخلل */}
          {issueCount === 0 ? (
            <div className="rounded-xl border border-green-600/30 bg-green-50 p-3 text-xs text-green-800">
              ✅ ما في خلل بالدفتر: كل تحويل بساقين مكتملتين، وكل قيد له كتاب محدّد.
            </div>
          ) : (
            <div className="rounded-xl border border-red-500/30 bg-red-50 p-3 space-y-3">
              <div className="text-xs font-bold text-red-800">⚠️ خلل بالدفتر يخلّي الأرقام ما تضبط ({issueCount})</div>

              {issues.orphanTransfers.length > 0 && (
                <div className="text-[11px] text-red-800 space-y-1">
                  <div className="font-bold">
                    سيقان تحويل يتيمة: {issues.orphanTransfers.length} — مبلغ طلع من كتاب وما وصل للتاني
                  </div>
                  {issues.orphanTransfers.map(({ group, legs }) => (
                    <div key={group} className="ps-3 border-s-2 border-red-300">
                      {legs.map(l => (
                        <div key={l.id} className="tabular-nums">
                          {l.entry_date} · {BOOK_LABELS[l.book] || l.book} ·{' '}
                          {l.category === 'transfer_in' ? 'وارد' : 'صادر'} ·{' '}
                          {CCY.filter(c => Number(l[c.key])).map(c => fmt(l[c.key], c)).join(' / ') || '—'}
                        </div>
                      ))}
                    </div>
                  ))}
                  <div className="text-red-700/80 pt-1">
                    لازم قرار المالك: إمّا تُكمَّل الساق الناقصة أو تُلغى الساق الموجودة. لا تُصحَّح تلقائياً.
                  </div>
                </div>
              )}

              {issues.unknownTransfers.length > 0 && (
                <div className="text-[11px] text-red-800">
                  تحويلات باتجاه مجهول: {issues.unknownTransfers.length} — لا تُحتسب بأي رصيد.
                </div>
              )}

              {issues.missingBook.length > 0 && (
                <div className="text-[11px] text-red-800">
                  قيود بلا كتاب محدّد: {issues.missingBook.length} — تُحتسب على «الإدارة المالية» افتراضاً،
                  فلو كانت أصلاً لفادي/وسيم بتكون ناقصة من رصيدهم.
                </div>
              )}
            </div>
          )}

          {issues.voided.length > 0 && (
            <p className="text-[11px] text-muted">
              ℹ️ {issues.voided.length} قيد معلَّم «إدخال خاطئ» — مستثنى من كل الأرقام أعلاه.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
