// =============================================================
// ChannelPnL — الربح/الخسارة لكل قناة (مصدر/جهة) لفترة.
//   وارد/صادر/صافي بكل عملة + صافي موحّد بالدولار (تقريبي) — يجيب على
//   «من أي مصدر وصلني، لأي جهة دفعت، ووين أربح ووين أخسر».
//   فلترة بالنوع/المسكّرة + فرز. يستثني التحويلات الداخلية.
// =============================================================
import { useEffect, useMemo, useState } from 'react';
import { computeChannelPnL } from './channelPnL.logic.js';
import { CCY, blank } from './sourceBreakdown.logic.js';
import { fetchExchangeRates } from '../services/accountingService.js';

const KIND_LABEL = {
  shipping: '🚚 شحن', distributor: '🤝 موزّع', marketer: '📣 مسوّق', online: '🛒 أونلاين',
  supplier: '🏭 مورّد', recurring: '🔁 متكرر', expense: '💸 مصروف', other: '📌 أخرى',
};

function fmt(n, c) {
  if (!n) return null;
  return `${c.sym}${Number(n).toLocaleString('ar-SA-u-nu-latn', { maximumFractionDigits: c.maxFrac })}`;
}
function MoneyCell({ amounts, tone }) {
  const lines = CCY.map(c => ({ c, txt: fmt(amounts[c.key], c) })).filter(x => x.txt);
  if (!lines.length) return <span className="text-muted">—</span>;
  return <div className="space-y-0.5">{lines.map(({ c, txt }) => <div key={c.key} className={`font-mono text-xs font-semibold ${tone}`}>{txt}</div>)}</div>;
}
function NetCell({ net }) {
  const lines = CCY.map(c => {
    const v = net[c.key] || 0;
    if (!v) return null;
    const tone = v >= 0 ? 'text-green-600' : 'text-red-500';
    return { key: c.key, tone, txt: `${v >= 0 ? '+' : '−'}${c.sym}${Number(Math.abs(v)).toLocaleString('ar-SA-u-nu-latn', { maximumFractionDigits: c.maxFrac })}` };
  }).filter(Boolean);
  if (!lines.length) return <span className="text-muted">—</span>;
  return <div className="space-y-0.5">{lines.map(l => <div key={l.key} className={`font-mono text-xs font-bold ${l.tone}`}>{l.txt}</div>)}</div>;
}
const usdFmt = (n) => `${n >= 0 ? '+' : '−'}$${Math.abs(Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

export default function ChannelPnL({
  entries = [],
  channels = [],
  title = '📈 الربح/الخسارة لكل قناة',
  subtitle = 'لكل مصدر: وارد − صادر = صافي (وين نربح وين نخسر)',
}) {
  const [rateMap, setRateMap] = useState({});
  const [kind, setKind] = useState('all');
  const [showClosed, setShowClosed] = useState(true);
  const [sort, setSort] = useState('usd');

  useEffect(() => {
    let alive = true;
    fetchExchangeRates().then(rows => {
      if (!alive) return;
      const m = {};
      for (const r of rows || []) {
        const from = r.from_currency ?? r.from_cur;
        const to   = r.to_currency ?? r.to_cur;
        if (from === 'USD' && to && m[to] === undefined) m[to] = Number(r.rate) || 0;
      }
      setRateMap(m);
    }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const { rows } = useMemo(
    () => computeChannelPnL(entries, { channels, rates: rateMap }),
    [entries, channels, rateMap],
  );

  const kindsPresent = useMemo(() => {
    const s = new Set();
    rows.forEach(r => { if (r.channel?.kind) s.add(r.channel.kind); });
    return Array.from(s);
  }, [rows]);

  const view = useMemo(() => {
    let list = rows;
    if (kind !== 'all') list = list.filter(r => r.channel?.kind === kind);
    if (!showClosed) list = list.filter(r => !r.channel || r.channel.is_active);
    const sorted = [...list];
    if (sort === 'usd') sorted.sort((a, b) => b.usdNet - a.usdNet);
    else if (sort === 'count') sorted.sort((a, b) => b.count - a.count);
    else if (sort === 'name') sorted.sort((a, b) => a.name.localeCompare(b.name, 'ar'));
    return sorted;
  }, [rows, kind, showClosed, sort]);

  const viewTotals = useMemo(() => {
    const t = { in: blank(), out: blank(), usdNet: 0 };
    for (const r of view) {
      for (const c of CCY) { t.in[c.key] += r.in[c.key]; t.out[c.key] += r.out[c.key]; }
      t.usdNet += r.usdNet;
    }
    return t;
  }, [view]);

  const SEL = 'border border-border rounded-lg px-2 py-1 text-xs bg-cream text-text';

  return (
    <div className="bg-surface border border-border rounded-2xl overflow-hidden" dir="rtl">
      <div className="px-4 py-3 border-b border-border bg-cream/60 flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h3 className="text-sm font-bold text-text">{title}</h3>
          {subtitle && <p className="text-[11px] text-muted mt-0.5">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select value={kind} onChange={e => setKind(e.target.value)} className={SEL}>
            <option value="all">كل الأنواع</option>
            {kindsPresent.map(k => <option key={k} value={k}>{KIND_LABEL[k] || k}</option>)}
          </select>
          <select value={sort} onChange={e => setSort(e.target.value)} className={SEL}>
            <option value="usd">الأعلى ربحاً ($)</option>
            <option value="count">الأكثر حركة</option>
            <option value="name">الاسم</option>
          </select>
          <label className="flex items-center gap-1 text-[11px] text-muted">
            <input type="checkbox" checked={showClosed} onChange={e => setShowClosed(e.target.checked)} /> المسكّرة
          </label>
        </div>
      </div>

      {view.length === 0 ? (
        <div className="text-center py-10 text-muted text-sm">لا توجد حركة في هذه الفترة</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-cream text-xs text-muted">
                <th className="py-2 px-3 text-right">القناة / المصدر</th>
                <th className="py-2 px-3 text-center">⬇️ وارد</th>
                <th className="py-2 px-3 text-center">⬆️ صادر</th>
                <th className="py-2 px-3 text-center">صافي</th>
                <th className="py-2 px-3 text-center">≈ بالدولار</th>
              </tr>
            </thead>
            <tbody>
              {view.map(r => (
                <tr key={r.key} className="border-t border-border hover:bg-cream/50 transition align-top">
                  <td className="py-2.5 px-3">
                    <div className="font-semibold text-text">
                      {r.channel?.icon ? r.channel.icon + ' ' : ''}{r.name}
                      {r.channel && !r.channel.is_active && <span className="text-[10px] text-amber-600"> ⏸</span>}
                    </div>
                    <div className="text-[10px] text-muted mt-0.5">
                      {r.channel ? (KIND_LABEL[r.channel.kind] || r.channel.kind) + ' · ' : ''}{r.count} حركة
                    </div>
                  </td>
                  <td className="py-2.5 px-3 text-center"><MoneyCell amounts={r.in}  tone="text-green-600" /></td>
                  <td className="py-2.5 px-3 text-center"><MoneyCell amounts={r.out} tone="text-red-500" /></td>
                  <td className="py-2.5 px-3 text-center"><NetCell net={r.net} /></td>
                  <td className={`py-2.5 px-3 text-center font-mono text-xs font-bold ${r.usdNet >= 0 ? 'text-green-600' : 'text-red-500'}`}>{usdFmt(r.usdNet)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border bg-cream text-xs font-bold align-top">
                <td className="py-2 px-3 text-muted">الإجمالي ({view.length} قناة)</td>
                <td className="py-2 px-3 text-center"><MoneyCell amounts={viewTotals.in}  tone="text-green-600" /></td>
                <td className="py-2 px-3 text-center"><MoneyCell amounts={viewTotals.out} tone="text-red-500" /></td>
                <td className="py-2 px-3 text-center text-muted">—</td>
                <td className={`py-2 px-3 text-center font-mono ${viewTotals.usdNet >= 0 ? 'text-green-600' : 'text-red-500'}`}>{usdFmt(viewTotals.usdNet)}</td>
              </tr>
            </tfoot>
          </table>
          <div className="px-4 py-2 text-[10px] text-muted border-t border-border/40">
            ≈ بالدولار تقريبي حسب أحدث سعر صرف — الأعمدة بكل عملة هي المرجع الدقيق.
          </div>
        </div>
      )}
    </div>
  );
}
