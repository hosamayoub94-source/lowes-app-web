// FxShadowPanel — S2 Shadow Mode (أدمن فقط): مقارنة التحويل الحالي بالتحويل الشهري الجديد. للمراجعة؛ لا يغيّر أي رقم معروض.
import { useEffect, useMemo, useState } from 'react';
import { buildFxShadow } from '@utils/fxShadow';
import { loadFxRates } from '@services/fxRatesService';

const fmt = (n) => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
const MONTHS_AR = (m) => (m && m !== '—' ? m.slice(0, 7) : '—');

export default function FxShadowPanel({ delivered, rateMap, displayedUsd }) {
  const [fx, setFx] = useState(null); // {rows, units, error}
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open || fx) return undefined;
    let alive = true;
    loadFxRates().then((r) => { if (alive) setFx(r); }).catch((e) => { if (alive) setFx({ rows: [], units: [], error: e?.message || 'تعذّر التحميل' }); });
    return () => { alive = false; };
  }, [open, fx]);

  const sh = useMemo(() => (fx && !fx.error ? buildFxShadow(delivered, rateMap, fx, displayedUsd) : null), [fx, delivered, rateMap, displayedUsd]);

  return (
    <section className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-3 space-y-2" dir="rtl">
      <button type="button" onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between text-sm font-black text-amber-700">
        <span>🧪 مقارنة الصرف (S2 — للأدمن فقط، للمراجعة، لا تغيّر الأرقام المعروضة)</span>
        <span>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="space-y-2 text-xs">
          {!fx && <p className="text-muted">جارٍ تحميل الأسعار الشهرية…</p>}
          {fx?.error && <p className="text-red-600 bg-red-500/10 rounded-xl p-2">تعذّر تحميل أسعار الصرف الشهرية ({fx.error}) — لا مقارنة. الأرقام المعروضة لم تتأثر.</p>}
          {sh && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <div className="rounded-xl bg-surface p-2"><p className="text-muted">القديم (سعر اليوم)</p><p className="font-black text-sm">${fmt(sh.total.oldUsd)}</p>{sh.displayedOldUsd != null && <p className="text-[10px] text-muted">المعروض بالشاشة ${fmt(sh.displayedOldUsd)}</p>}</div>
                <div className="rounded-xl bg-surface p-2"><p className="text-muted">الجديد — مؤكَّد</p><p className="font-black text-sm text-emerald-600">${fmt(sh.total.confirmed)}</p><p className="text-[10px] text-muted">{sh.total.confirmedN} طلب</p></div>
                <div className="rounded-xl bg-surface p-2"><p className="text-muted">الجديد — تقديري</p><p className="font-black text-sm text-amber-600">${fmt(sh.total.estimated)}</p><p className="text-[10px] text-muted">تقريبي {sh.total.approximateN} · مُرحَّل {sh.total.carriedN}</p></div>
                <div className="rounded-xl bg-surface p-2"><p className="text-muted">غير محوَّل</p><p className="font-black text-sm text-red-600">{sh.total.notConvertedN} طلب</p><p className="text-[10px] text-muted">بلا سعر {sh.total.missingN} · وحدة قديمة {sh.total.legacyN} · مشبوه {sh.total.suspectN}</p></div>
              </div>
              <p>الفرق (الجديد − القديم): <b className={sh.diff >= 0 ? 'text-emerald-600' : 'text-red-600'}>{sh.diff >= 0 ? '+' : ''}${fmt(sh.diff)}</b> <span className="text-muted">— الجديد لا يشمل غير المحوَّل، لذلك جزء من الفرق نقص لا فرق سعر.</span></p>
              <p className={sh.final ? 'text-emerald-700' : 'text-amber-700'}>{sh.final ? '✅ هذه الفترة كلها بأسعار مؤكَّدة — تصلح للإغلاق.' : '⚠️ الفترة تحوي أسعاراً تقديرية أو طلبات غير محوَّلة — لا تُغلَق مالياً دون اعتماد صريح.'}</p>
              <div className="overflow-x-auto">
                <table className="w-full text-right">
                  <thead><tr className="text-muted"><th className="p-1">العملة</th><th>طلبات</th><th>القيمة</th><th>القديم $</th><th>مؤكَّد $</th><th>تقديري $</th><th>غير محوَّل</th></tr></thead>
                  <tbody>{sh.byCurrency.map((r) => (
                    <tr key={r.cur} className="border-t border-border"><td className="p-1 font-bold">{r.cur}</td><td>{r.count}</td><td>{fmt(r.native)}</td><td>{fmt(r.oldUsd)}</td><td>{fmt(r.confirmed)}</td><td>{fmt(r.estimated)}</td><td>{r.notConvertedN}</td></tr>
                  ))}</tbody>
                </table>
              </div>
              {sh.byMonth.length > 1 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-right">
                    <thead><tr className="text-muted"><th className="p-1">الشهر</th><th>طلبات</th><th>القديم $</th><th>مؤكَّد $</th><th>تقديري $</th><th>غير محوَّل</th></tr></thead>
                    <tbody>{sh.byMonth.map((r) => (
                      <tr key={r.month} className="border-t border-border"><td className="p-1 font-bold">{MONTHS_AR(r.month)}</td><td>{r.count}</td><td>{fmt(r.oldUsd)}</td><td>{fmt(r.confirmed)}</td><td>{fmt(r.estimated)}</td><td>{r.notConvertedN}</td></tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
              {sh.approximate.length > 0 && <p className="text-amber-700">🔸 أسعار تقريبية معتمدة من المالك مُستعملة: {sh.approximate.map((a) => `${a.currency} ${MONTHS_AR(a.month)}`).join('، ')}.</p>}
              {sh.carried.length > 0 && <p className="text-amber-700">🔸 سعر تقديري مُرحَّل: {sh.carried.map((c) => `${c.currency} ${MONTHS_AR(c.month)} ← من ${MONTHS_AR(c.carriedFrom)} (${c.orders} طلب)`).join('، ')}.</p>}
            </>
          )}
        </div>
      )}
    </section>
  );
}
