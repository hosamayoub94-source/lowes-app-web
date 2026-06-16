// =============================================================
// SourceBreakdown — الوارد والصادر لكل «جهة / مصدر» (شركة شحن، إيجار…)
//   • يجمّع القيود حسب الحقل `category` (الجهة)، ويفصل:
//     وارد (دخل) · صادر (مصروف/راتب/سلفة) · صافي — بكل عملة.
//   • يتجاهل التحويلات الداخلية (transfer) لأنها ليست دخلاً/مصروفاً.
//   • مشترك بين «المصاريف والشحن» و«المالية العامة».
// =============================================================
import { useMemo } from 'react';
import { computeSourceBreakdown, CCY } from './sourceBreakdown.logic.js';

function fmt(n, c) {
  if (!n) return null;
  return `${c.sym}${Number(n).toLocaleString('ar-SA-u-nu-latn', { maximumFractionDigits: c.maxFrac })}`;
}

// خلية أموال متعددة العملات — تعرض غير الصفري فقط
function MoneyCell({ amounts, tone }) {
  const lines = CCY.map(c => ({ c, txt: fmt(amounts[c.key], c) })).filter(x => x.txt);
  if (lines.length === 0) return <span className="text-muted">—</span>;
  return (
    <div className="space-y-0.5">
      {lines.map(({ c, txt }) => (
        <div key={c.key} className={`font-mono text-xs font-semibold ${tone}`}>{txt}</div>
      ))}
    </div>
  );
}

function NetCell({ inAmt, outAmt }) {
  const lines = CCY.map(c => {
    const net = (inAmt[c.key] || 0) - (outAmt[c.key] || 0);
    if (!net) return null;
    const tone = net >= 0 ? 'text-green-600' : 'text-red-500';
    const txt = `${net >= 0 ? '+' : ''}${fmt(Math.abs(net), c)?.replace(c.sym, '') ?? ''}`;
    return { key: c.key, sym: c.sym, tone, txt: `${net >= 0 ? '+' : '−'}${c.sym}${Number(Math.abs(net)).toLocaleString('ar-SA-u-nu-latn', { maximumFractionDigits: c.maxFrac })}` };
  }).filter(Boolean);
  if (lines.length === 0) return <span className="text-muted">—</span>;
  return (
    <div className="space-y-0.5">
      {lines.map(l => <div key={l.key} className={`font-mono text-xs font-bold ${l.tone}`}>{l.txt}</div>)}
    </div>
  );
}

export default function SourceBreakdown({
  entries = [],
  title = '📊 الوارد والصادر لكل جهة',
  subtitle = 'شركات الشحن، الإعلانات، الإيجار… — لكل مصدر على حدة',
  emptyHint = 'لا توجد حركة في هذه الفترة',
}) {
  const { rows, totals } = useMemo(() => computeSourceBreakdown(entries), [entries]);

  return (
    <div className="bg-surface border border-border rounded-2xl overflow-hidden" dir="rtl">
      <div className="px-4 py-3 border-b border-border bg-cream/60">
        <h3 className="text-sm font-bold text-text">{title}</h3>
        {subtitle && <p className="text-[11px] text-muted mt-0.5">{subtitle}</p>}
      </div>

      {rows.length === 0 ? (
        <div className="text-center py-10 text-muted text-sm">{emptyHint}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-cream text-xs text-muted">
                <th className="py-2 px-3 text-right">الجهة / المصدر</th>
                <th className="py-2 px-3 text-center">⬇️ وارد</th>
                <th className="py-2 px-3 text-center">⬆️ صادر</th>
                <th className="py-2 px-3 text-center">صافي</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.source} className="border-t border-border hover:bg-cream/50 transition align-top">
                  <td className="py-2.5 px-3">
                    <div className="font-semibold text-text">{r.source}</div>
                    <div className="text-[10px] text-muted mt-0.5">{r.count} حركة</div>
                  </td>
                  <td className="py-2.5 px-3 text-center"><MoneyCell amounts={r.in}  tone="text-green-600" /></td>
                  <td className="py-2.5 px-3 text-center"><MoneyCell amounts={r.out} tone="text-red-500" /></td>
                  <td className="py-2.5 px-3 text-center"><NetCell inAmt={r.in} outAmt={r.out} /></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border bg-cream text-xs font-bold align-top">
                <td className="py-2 px-3 text-muted">الإجمالي ({rows.length} جهة)</td>
                <td className="py-2 px-3 text-center"><MoneyCell amounts={totals.in}  tone="text-green-600" /></td>
                <td className="py-2 px-3 text-center"><MoneyCell amounts={totals.out} tone="text-red-500" /></td>
                <td className="py-2 px-3 text-center"><NetCell inAmt={totals.in} outAmt={totals.out} /></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
