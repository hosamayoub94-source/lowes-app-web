// =============================================================
// ProfitabilityScreen (#1) — ربحية المنتج الحقيقية
// يعرض الوحدات المباعة + المرتجعات + الربح الصافي لكل صنف،
// مع إدخال السعر/التكلفة/الإعلان/الشحن (يُحفظ ويُحسب فوراً).
// =============================================================
import { useState, useEffect, useCallback } from 'react';
import { loadProfitability, saveEconomics } from '@services/profitabilityService';
import { useToast } from '@hooks/useToast';

const fmt = (n) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(n || 0);

const FLAG = {
  star:  { label: '💎 نجم',    cls: 'bg-green-500/10 text-green-600 border-green-500/20' },
  ok:    { label: '✅ رابح',   cls: 'bg-teal/10 text-teal border-teal/20' },
  risky: { label: '⚠️ مرتجعات',cls: 'bg-orange-500/10 text-orange-600 border-orange-500/20' },
  loss:  { label: '🔻 خاسر',   cls: 'bg-red-500/10 text-red-600 border-red-500/20' },
  unset: { label: '➕ حدّد',    cls: 'bg-surface-alt text-muted border-border' },
};

function StatCard({ icon, label, value, tone='navy' }) {
  const tones = { navy:'text-text', green:'text-green-600', red:'text-red-600', orange:'text-orange-600', teal:'text-teal' };
  return (
    <div className="bg-surface border border-border rounded-2xl p-3.5">
      <div className="flex items-center gap-1.5 mb-1"><span>{icon}</span><span className="text-[11px] text-muted font-semibold">{label}</span></div>
      <p className={`text-xl font-black ${tones[tone]}`}>{value}</p>
    </div>
  );
}

function EconEditor({ p, onSave, onClose }) {
  const [f, setF] = useState({
    sale_price_usd: p.price || '', cost_usd: p.cost || '',
    ad_cost_usd: p.ad || '', shipping_cost_usd: p.ship || '',
  });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF(s => ({ ...s, [k]: v.replace(/[^\d.]/g, '') }));

  const fields = [
    ['sale_price_usd', '💵 سعر البيع'],
    ['cost_usd',       '📦 تكلفة المنتج'],
    ['ad_cost_usd',    '📣 إعلان/وحدة'],
    ['shipping_cost_usd','🚚 شحن/وحدة'],
  ];
  const unitProfit = (Number(f.sale_price_usd)||0) - (Number(f.cost_usd)||0) - (Number(f.ad_cost_usd)||0) - (Number(f.shipping_cost_usd)||0);

  const save = async () => {
    setBusy(true);
    try {
      await saveEconomics(p.name, {
        sale_price_usd: Number(f.sale_price_usd)||0, cost_usd: Number(f.cost_usd)||0,
        ad_cost_usd: Number(f.ad_cost_usd)||0, shipping_cost_usd: Number(f.shipping_cost_usd)||0,
      });
      onSave();
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-4 bg-black/50" onClick={e=>e.target===e.currentTarget&&onClose()} dir="rtl">
      <div className="w-full max-w-sm bg-surface rounded-3xl shadow-2xl border border-border overflow-hidden">
        <div className="px-4 py-3 bg-gradient-to-l from-navy to-teal text-white">
          <p className="font-bold text-sm">اقتصاديات: {p.name}</p>
          <p className="text-[11px] text-white/70">كل القيم بالدولار (USD) لكل وحدة</p>
        </div>
        <div className="p-4 space-y-2.5">
          {fields.map(([k, label]) => (
            <div key={k} className="flex items-center gap-2">
              <label className="text-xs text-text flex-1">{label}</label>
              <input value={f[k]} onChange={e=>set(k, e.target.value)} inputMode="decimal" placeholder="0"
                className="w-24 border border-border rounded-xl px-3 py-2 text-sm bg-surface-alt text-text text-center focus:outline-none focus:ring-2 focus:ring-teal/30" />
            </div>
          ))}
          <div className={`text-center rounded-xl py-2 text-sm font-bold ${unitProfit>0?'bg-green-500/10 text-green-600':unitProfit<0?'bg-red-500/10 text-red-600':'bg-surface-alt text-muted'}`}>
            ربح الوحدة: ${fmt(unitProfit)}
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-border font-semibold hover:bg-surface-alt">إلغاء</button>
            <button onClick={save} disabled={busy} className="flex-1 py-2.5 rounded-xl bg-teal text-white font-bold hover:bg-teal/90 disabled:opacity-50">{busy?'جارٍ…':'حفظ'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// محرّر جماعي سريع — كل المنتجات بجدول واحد (يحلّ بطء الإدخال منتج-منتج)
function BulkEconEditor({ products, onClose, onSaved }) {
  const toast = useToast();
  const [rows, setRows] = useState(() => {
    const m = {};
    products.forEach(p => { m[p.name] = {
      sale_price_usd: p.price || '', cost_usd: p.cost || '',
      ad_cost_usd: p.ad || '', shipping_cost_usd: p.ship || '',
    }; });
    return m;
  });
  const [dirty, setDirty] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');

  const set = (name, k, v) => {
    setRows(s => ({ ...s, [name]: { ...s[name], [k]: v.replace(/[^\d.]/g, '') } }));
    setDirty(d => new Set(d).add(name));
  };
  const unit = (r) => (Number(r.sale_price_usd)||0) - (Number(r.cost_usd)||0) - (Number(r.ad_cost_usd)||0) - (Number(r.shipping_cost_usd)||0);

  const saveAll = async () => {
    if (!dirty.size) { onClose(); return; }
    setBusy(true);
    let done = 0, fail = 0;
    for (const name of dirty) {
      const r = rows[name];
      try {
        await saveEconomics(name, {
          sale_price_usd: Number(r.sale_price_usd)||0, cost_usd: Number(r.cost_usd)||0,
          ad_cost_usd: Number(r.ad_cost_usd)||0, shipping_cost_usd: Number(r.shipping_cost_usd)||0,
        });
        done++;
      } catch { fail++; }
    }
    setBusy(false);
    toast[fail ? 'error' : 'success'](`حُفظ ${done}${fail ? ` · فشل ${fail}` : ''}`);
    onSaved();
  };

  const list = products.filter(p => !q || p.name.toLowerCase().includes(q.trim().toLowerCase()));
  const INP = 'w-16 border border-border rounded-lg px-1.5 py-1 text-xs bg-surface-alt text-text text-center focus:outline-none focus:ring-2 focus:ring-teal/30';

  return (
    <div className="fixed inset-0 z-[80] flex items-stretch sm:items-center justify-center sm:p-4 bg-black/50" onClick={e=>e.target===e.currentTarget&&onClose()} dir="rtl">
      <div className="w-full sm:max-w-2xl bg-surface sm:rounded-3xl shadow-2xl border border-border flex flex-col max-h-screen sm:max-h-[92vh]">
        <div className="px-4 py-3 bg-gradient-to-l from-navy to-teal text-white shrink-0">
          <p className="font-bold text-sm">✏️ تعديل التكاليف للكل — كل القيم بالدولار/وحدة</p>
          <p className="text-[11px] text-white/70">عبّي التكلفة (والإعلان/الشحن إن وُجد) → احفظ مرّة واحدة. الربح يظهر فوراً.</p>
        </div>
        <div className="p-3 shrink-0">
          <input value={q} onChange={e=>setQ(e.target.value)} placeholder="ابحث عن منتج…"
            className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-surface-alt text-text" />
        </div>
        <div className="overflow-y-auto flex-1 px-3">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-surface">
              <tr className="text-muted text-[10px]">
                <th className="text-start py-1.5 font-semibold">المنتج</th>
                <th className="font-semibold">💵 سعر</th>
                <th className="font-semibold">📦 تكلفة</th>
                <th className="font-semibold">📣 إعلان</th>
                <th className="font-semibold">🚚 شحن</th>
                <th className="font-semibold">ربح/وحدة</th>
              </tr>
            </thead>
            <tbody>
              {list.map((p) => {
                const r = rows[p.name]; const u = unit(r);
                return (
                  <tr key={p.name} className="border-t border-border/40">
                    <td className="py-1.5 pe-2 text-text font-medium">{p.name}<span className="text-muted text-[10px] mr-1">· {p.units}u</span></td>
                    <td className="text-center"><input value={r.sale_price_usd} onChange={e=>set(p.name,'sale_price_usd',e.target.value)} inputMode="decimal" className={INP} placeholder="0" /></td>
                    <td className="text-center"><input value={r.cost_usd} onChange={e=>set(p.name,'cost_usd',e.target.value)} inputMode="decimal" className={INP} placeholder="0" /></td>
                    <td className="text-center"><input value={r.ad_cost_usd} onChange={e=>set(p.name,'ad_cost_usd',e.target.value)} inputMode="decimal" className={INP} placeholder="0" /></td>
                    <td className="text-center"><input value={r.shipping_cost_usd} onChange={e=>set(p.name,'shipping_cost_usd',e.target.value)} inputMode="decimal" className={INP} placeholder="0" /></td>
                    <td className={`text-center font-bold ${u>0?'text-green-600':u<0?'text-red-600':'text-muted'}`}>${fmt(u)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex gap-2 p-3 border-t border-border shrink-0">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-border font-semibold hover:bg-surface-alt">إغلاق</button>
          <button onClick={saveAll} disabled={busy} className="flex-1 py-2.5 rounded-xl bg-teal text-white font-bold hover:bg-teal/90 disabled:opacity-50">
            {busy ? 'جارٍ الحفظ…' : `حفظ ${dirty.size || ''} ${dirty.size ? 'منتج' : 'الكل'}`}
          </button>
        </div>
      </div>
    </div>
  );
}

const PERIODS = [
  { key: '90d',   label: 'آخر 3 شهور' },
  { key: 'month', label: 'هذا الشهر' },
  { key: 'all',   label: 'الكل' },
];
function sinceFor(period) {
  const d = new Date();
  if (period === 'month') return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`;
  if (period === 'all')   return '2020-01-01';
  d.setDate(d.getDate() - 90);
  return d.toISOString().slice(0, 10);
}

export default function ProfitabilityScreen() {
  const toast = useToast();
  const [data, setData]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [bulk, setBulk]       = useState(false);
  const [period, setPeriod]   = useState('90d');

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await loadProfitability({ since: sinceFor(period) })); }
    catch (e) { toast.error(e.message || 'تعذّر التحميل'); }
    finally { setLoading(false); }
  }, [toast, period]);
  useEffect(() => { load(); }, [load]);

  if (loading && !data) return (
    <div className="max-w-3xl mx-auto pb-24 space-y-3" dir="rtl">
      <div className="h-24 rounded-2xl bg-surface-alt animate-pulse" />
      {[1,2,3,4].map(i=><div key={i} className="h-16 rounded-2xl bg-surface-alt animate-pulse" />)}
    </div>
  );

  const { products, totals } = data;

  return (
    <div className="max-w-3xl mx-auto pb-24 space-y-4" dir="rtl">
      <div className="bg-gradient-to-l from-navy to-teal rounded-2xl p-5 text-white">
        <h1 className="text-xl font-extrabold flex items-center gap-2">💎 ربحية المنتج</h1>
        <p className="text-white/70 text-xs mt-1">الربح الصافي الحقيقي لكل صنف — حدّد التكلفة لكشف الرابح من الخاسر</p>
      </div>

      {/* Period toggle */}
      <div className="flex gap-1.5">
        {PERIODS.map(p => (
          <button key={p.key} onClick={()=>setPeriod(p.key)}
            className={`flex-1 py-2 rounded-xl text-xs font-bold border transition ${period===p.key?'bg-teal text-white border-teal':'bg-surface text-muted border-border hover:border-teal/40'}`}>
            {p.label}
          </button>
        ))}
      </div>

      {/* Totals */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <StatCard icon="💰" label="صافي الربح (المحدَّد)" value={`$${fmt(totals.netProfit)}`} tone={totals.netProfit>=0?'green':'red'} />
        <StatCard icon="💎" label="منتجات نجوم" value={totals.stars} tone="green" />
        <StatCard icon="🔻" label="خاسرة" value={totals.losers} tone="red" />
        <StatCard icon="⚠️" label="مرتجعات عالية" value={totals.risky} tone="orange" />
      </div>

      {/* Bulk cost entry CTA */}
      <button onClick={()=>setBulk(true)}
        className="w-full py-2.5 rounded-xl bg-teal text-white text-sm font-bold hover:bg-teal/90 transition flex items-center justify-center gap-2">
        ✏️ تعديل التكاليف للكل دفعة واحدة
      </button>

      {totals.unset > 0 && (
        <div className="text-xs text-muted bg-surface-alt rounded-xl px-3 py-2.5">
          💡 {totals.unset} صنف بدون تكلفة محدّدة — اضغط «✏️ تعديل التكاليف للكل» لإدخالها دفعة واحدة وتظهر الأرباح فوراً.
        </div>
      )}

      {/* Product rows */}
      <div className="space-y-2">
        {products.map((p, i) => {
          const flag = FLAG[p.flag];
          return (
            <div key={i} className="bg-surface border border-border rounded-2xl p-3.5">
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-bold text-text truncate">{p.name}</p>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${flag.cls}`}>{flag.label}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-[11px] text-muted flex-wrap">
                    <span>📦 {p.units} وحدة</span>
                    {p.returns > 0 && <span className={p.returnRate>25?'text-orange-600 font-semibold':''}>↩️ {p.returns} مرتجع ({p.returnRate}%)</span>}
                    {p.hasEcon && <span>ربح الوحدة: <b className={p.unitProfit>0?'text-green-600':'text-red-600'}>${fmt(p.unitProfit)}</b></span>}
                  </div>
                </div>
                <div className="text-end shrink-0">
                  {p.hasEcon ? (
                    <>
                      <p className={`text-base font-black ${p.netProfit>=0?'text-green-600':'text-red-600'}`}>${fmt(p.netProfit)}</p>
                      {p.margin!==null && <p className="text-[10px] text-muted">هامش {p.margin}%</p>}
                    </>
                  ) : null}
                  <button onClick={()=>setEditing(p)} className="mt-1 text-[11px] font-semibold text-teal hover:bg-teal/10 px-2.5 py-1 rounded-lg transition">
                    {p.hasEcon ? 'تعديل' : '➕ حدّد'}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
        {products.length === 0 && (
          <div className="text-center py-10 text-muted text-sm">لا مبيعات هذا الشهر بعد.</div>
        )}
      </div>

      {editing && <EconEditor p={editing} onClose={()=>setEditing(null)} onSave={()=>{ setEditing(null); toast.success('تم الحفظ'); load(); }} />}
      {bulk && <BulkEconEditor products={products} onClose={()=>setBulk(false)} onSaved={()=>{ setBulk(false); load(); }} />}
    </div>
  );
}
