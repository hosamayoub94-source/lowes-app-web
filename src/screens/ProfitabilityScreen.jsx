// =============================================================
// ProfitabilityScreen (#1) — ربحية المنتج الحقيقية
// يعرض الوحدات المباعة + المرتجعات + الربح الصافي لكل صنف،
// مع إدخال السعر/التكلفة/الإعلان/الشحن (يُحفظ ويُحسب فوراً).
// =============================================================
import { useState, useEffect, useCallback } from 'react';
import { loadProfitability, saveEconomics, saveExpense, deleteExpense, setProductActive } from '@services/profitabilityService';
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
  const toast = useToast();
  const [f, setF] = useState({
    sale_price_usd: p.price || '', cost_usd: p.cost || '',
    ad_cost_usd: p.adRaw || '', shipping_cost_usd: p.shipRaw || '',
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
    } catch (e) { toast.error(e.message || 'تعذّر الحفظ'); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-4 bg-black/50" onClick={e=>e.target===e.currentTarget&&onClose()} dir="rtl">
      <div className="w-full max-w-sm bg-surface rounded-3xl shadow-2xl border border-border overflow-hidden">
        <div className="px-4 py-3 bg-navy text-white">
          <p className="font-bold text-sm">اقتصاديات: {p.name}</p>
          <p className="text-[11px] text-white/70">بالدولار لكل وحدة · يسري من الشهر الحالي فقط، والأشهر السابقة لا تتغيّر</p>
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
            <button onClick={save} disabled={busy} className="flex-1 py-2.5 rounded-xl bg-teal text-navy font-bold hover:bg-teal/90 disabled:opacity-50">{busy?'جارٍ…':'حفظ'}</button>
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
      ad_cost_usd: p.adRaw || '', shipping_cost_usd: p.shipRaw || '',
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
        <div className="px-4 py-3 bg-navy text-white shrink-0">
          <p className="font-bold text-sm">✏️ تعديل التكاليف للكل — كل القيم بالدولار/وحدة</p>
          <p className="text-[11px] text-white/70">يسري التغيير من الشهر الحالي فقط — الأشهر السابقة تبقى كما كانت. الإعلان/الشحن تقدير اختياري يُهمَل عند وجود مصروف فعلي.</p>
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
          <button onClick={saveAll} disabled={busy} className="flex-1 py-2.5 rounded-xl bg-teal text-navy font-bold hover:bg-teal/90 disabled:opacity-50">
            {busy ? 'جارٍ الحفظ…' : `حفظ ${dirty.size || ''} ${dirty.size ? 'منتج' : 'الكل'}`}
          </button>
        </div>
      </div>
    </div>
  );
}

const BRANDS = [
  { key: 'lowes',  label: "🌿 LOWE'S" },
  { key: 'strong', label: '💊 سترونغ' },
  { key: 'all',    label: 'الكل' },
];

const EXPENSE_CATEGORIES = ['حملات إعلانية', 'سوشل ميديا', 'أجور الشحن', 'تغليف + أجور التغليف', 'تخزين + نقل', 'رواتب', 'محاسبة + الضرائب الشهرية', 'ضرائب الربح', 'مصاريف إضافية', 'بلوغرات + هدايا'];
const MARKET_LABELS = { syria: '🇸🇾 سوريا', turkey: '🇹🇷 تركيا', uae: '🇦🇪 الإمارات', unknown: 'غير محدد' };

function ExpenseEditor({ month, expenses, onSaved }) {
  const toast = useToast();
  const blank = { category: EXPENSE_CATEGORIES[0], market: 'all', amount_usd: '', notes: '' };
  const [form, setForm] = useState(blank);
  const [editId, setEditId] = useState(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!(Number(form.amount_usd) > 0)) return toast.error('أدخل قيمة المصروف');
    setBusy(true);
    try {
      await saveExpense({ id: editId, month, ...form });
      setForm(blank); setEditId(null);
      toast.success(editId ? 'تم تعديل المصروف' : 'تم حفظ المصروف للشهر'); onSaved();
    } catch (e) { toast.error(e.message || 'تعذّر حفظ المصروف'); }
    finally { setBusy(false); }
  };
  const startEdit = (e) => { setEditId(e.id); setForm({ category: e.category, market: e.market, amount_usd: String(e.amount_usd), notes: e.notes || '' }); };
  const cancelEdit = () => { setEditId(null); setForm(blank); };
  const remove = async (e) => {
    if (!window.confirm(`حذف «${e.category}» ($${fmt(e.amount_usd)})؟`)) return;
    try { await deleteExpense(e.id); if (editId === e.id) cancelEdit(); onSaved(); toast.success('تم الحذف'); }
    catch (err) { toast.error(err.message || 'تعذّر حذف المصروف'); }
  };
  const total = expenses.reduce((s, e) => s + (Number(e.amount_usd) || 0), 0);
  const categories = EXPENSE_CATEGORIES.includes(form.category) ? EXPENSE_CATEGORIES : [form.category, ...EXPENSE_CATEGORIES];
  return <div className="bg-surface border border-border rounded-2xl p-3" dir="rtl">
    <div className="flex items-center justify-between mb-2">
      <h2 className="font-bold text-sm">🧾 مصاريف الشهر اليدوية {editId && <span className="text-orange-600">· وضع التعديل</span>}</h2>
      <span className="text-[11px] text-muted">المجموع <b className="text-text">${fmt(total)}</b></span>
    </div>
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
      <select value={form.category} onChange={e=>setForm({...form,category:e.target.value})} className="border border-border rounded-xl px-2 py-2 text-xs bg-surface-alt text-text">{categories.map(x=><option key={x}>{x}</option>)}</select>
      <select value={form.market} onChange={e=>setForm({...form,market:e.target.value})} className="border border-border rounded-xl px-2 py-2 text-xs bg-surface-alt text-text"><option value="all">مشترك على الشركة</option><option value="syria">سوريا</option><option value="turkey">تركيا</option><option value="uae">الإمارات</option></select>
      <input type="number" min="0" step="0.01" value={form.amount_usd} onChange={e=>setForm({...form,amount_usd:e.target.value})} placeholder="القيمة USD" className="border border-border rounded-xl px-2 py-2 text-xs bg-surface-alt text-text" />
      <input value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} placeholder="ملاحظة اختيارية" className="border border-border rounded-xl px-2 py-2 text-xs bg-surface-alt text-text" />
      <div className="flex gap-1">
        <button onClick={save} disabled={busy} className="flex-1 rounded-xl bg-teal text-navy font-bold text-xs py-2 disabled:opacity-50">{busy?'جارٍ…':editId?'حفظ التعديل':'إضافة'}</button>
        {editId && <button onClick={cancelEdit} className="rounded-xl border border-border text-xs px-2">إلغاء</button>}
      </div>
    </div>
    <p className="text-[10px] text-muted mt-2">«حملات إعلانية» و«أجور الشحن» الفعلية تُلغي تقدير الإعلان/الشحن لكل وحدة بنفس الشهر (منعاً للعدّ المزدوج). المصاريف المشتركة لا تُوزَّع على الأسواق.</p>
    {expenses.length > 0 && <div className="mt-3 space-y-1">{expenses.map(e=><div key={e.id} className="flex items-center justify-between gap-2 text-xs border-t border-border/50 pt-1.5"><span className="min-w-0 truncate">{e.category} · {e.market==='all'?'مشترك':MARKET_LABELS[e.market]} {e.notes && `· ${e.notes}`}</span><span className="flex items-center gap-2 shrink-0"><b>${fmt(e.amount_usd)}</b><button onClick={()=>startEdit(e)} className="text-teal">تعديل</button><button onClick={()=>remove(e)} className="text-red-500">حذف</button></span></div>)}</div>}
  </div>;
}

function MarketCard({ k, x }) {
  const row = (label, v, neg) => v ? <div className="flex justify-between"><span>{label}</span><span className={neg ? 'text-red-600' : ''}>{neg ? '−' : ''}${fmt(v)}</span></div> : null;
  return <div className="rounded-xl bg-surface-alt p-3 border border-border/60">
    <p className="text-xs font-bold">{MARKET_LABELS[k]}</p>
    <p className={`text-lg font-black mt-1 ${Number(x.netProfit)>=0?'text-green-600':'text-red-600'}`}>${fmt(x.netProfit)}</p>
    <div className="text-[10px] text-muted mt-1">{x.orders||0} طلب مسلَّم · {x.units||0} قطعة{x.returns?` · ↩️ ${x.returns} مرتجع`:''}</div>
    <div className="text-[10px] text-muted mt-1.5 space-y-0.5">
      {row('المبيعات', x.revenue)}{row('تكلفة المنتجات', x.productCost, true)}{row('خسارة المرتجعات', x.returnLoss, true)}
      {row('إعلان (تقدير)', x.estAds, true)}{row('شحن (تقدير)', x.estShipping, true)}
      {Object.entries(x.expensesByCategory || {}).map(([c, v]) => <div key={c} className="flex justify-between"><span>{c}</span><span className="text-red-600">−${fmt(v)}</span></div>)}
    </div>
    {Object.keys(x.collected || {}).length > 0 && <div className="text-[10px] text-muted mt-1.5 border-t border-border/50 pt-1">المحصَّل الفعلي: {Object.entries(x.collected).map(([c, v]) => `${fmt(v)} ${c}`).join(' · ')}</div>}
    {x.unpricedUnits > 0 && <div className="text-[10px] text-orange-600 mt-1">⚠️ {x.unpricedUnits} قطعة بلا سعر/تكلفة — الربح أقل من الحقيقي</div>}
    {x.ordersNoItems > 0 && <div className="text-[10px] text-orange-600">⚠️ {x.ordersNoItems} طلب مسلَّم بلا أصناف — لا يدخل القطع/المبيعات</div>}
  </div>;
}

export default function ProfitabilityScreen() {
  const toast = useToast();
  const [data, setData]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [bulk, setBulk]       = useState(false);
  const [month, setMonth]     = useState(() => new Date().toISOString().slice(0, 7));
  const [brand, setBrand]     = useState('lowes');
  const [freezing, setFreezing] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await loadProfitability({ since: `${month}-01`, brand })); }
    catch (e) { toast.error(e.message || 'تعذّر التحميل'); }
    finally { setLoading(false); }
  }, [toast, month, brand]);
  useEffect(() => { load(); }, [load]);

  const toggleFreeze = async (p) => {
    setFreezing(p.name);
    try {
      await setProductActive(p.name, false);
      toast.success(`🚫 "${p.name}" صار مجمَّداً — اختفى من التقرير`);
      load();
    } catch (e) { toast.error(e.message || 'تعذّر التجميد'); }
    finally { setFreezing(null); }
  };

  if (!data && !loading) return (
    <div className="max-w-3xl mx-auto p-6 text-center space-y-3" dir="rtl">
      <p className="text-sm text-muted">تعذّر تحميل الربحية.</p>
      <button onClick={load} className="px-4 py-2 rounded-xl bg-navy text-white text-xs font-bold">إعادة المحاولة</button>
    </div>
  );

  if (loading && !data) return (
    <div className="max-w-3xl mx-auto pb-24 space-y-3" dir="rtl">
      <div className="h-24 rounded-2xl bg-surface-alt animate-pulse" />
      {[1,2,3,4].map(i=><div key={i} className="h-16 rounded-2xl bg-surface-alt animate-pulse" />)}
    </div>
  );

  const { products, totals, marketSummary = {}, expenses = [], company = {}, unmapped = [] } = data;

  return (
    <div className="max-w-3xl mx-auto pb-24 space-y-4" dir="rtl">
      <div className="bg-navy rounded-2xl p-5 text-white">
        <h1 className="text-xl font-extrabold flex items-center gap-2">💎 ربحية المنتج</h1>
        <p className="text-white/70 text-xs mt-1">الربح الصافي الحقيقي لكل صنف — حدّد التكلفة لكشف الرابح من الخاسر</p>
      </div>

      {/* Brand toggle */}
      <div className="flex gap-1.5">
        {BRANDS.map(b => (
          <button key={b.key} onClick={()=>setBrand(b.key)}
            className={`flex-1 py-2 rounded-xl text-xs font-bold border transition ${brand===b.key?'bg-navy text-white border-navy':'bg-surface text-muted border-border hover:border-navy/40'}`}>
            {b.label}
          </button>
        ))}
      </div>

      <div className="bg-surface border border-border rounded-2xl p-3 flex items-center gap-3">
        <label className="text-xs font-bold text-text whitespace-nowrap">📅 شهر التقرير</label>
        <input type="month" value={month} onChange={e=>setMonth(e.target.value)} className="flex-1 border border-border rounded-xl px-3 py-2 text-sm bg-surface-alt text-text" />
        <button onClick={load} className="px-3 py-2 rounded-xl bg-navy text-white text-xs font-bold">تحديث</button>
      </div>

      <div className="bg-surface border border-border rounded-2xl p-3" dir="rtl">
        <div className="flex items-center justify-between mb-2"><h2 className="font-bold text-sm">📊 ملخص الأسواق — بالدولار</h2><span className="text-[10px] text-muted">المبيعات = الطلبات المسلّمة/المسوّاة فقط</span></div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {['syria','turkey','uae'].map(k => <MarketCard key={k} k={k} x={marketSummary[k] || {}} />)}
        </div>
        <div className="rounded-xl bg-navy text-white p-3 mt-2">
          <div className="flex items-center justify-between"><span className="text-xs font-bold">🏢 الشركة كاملة</span><span className={`text-xl font-black ${company.netProfit>=0?'text-green-300':'text-red-300'}`}>${fmt(company.netProfit)}</span></div>
          <div className="text-[10px] text-white/70 mt-1">{company.orders||0} طلب · {company.units||0} قطعة · مبيعات ${fmt(company.revenue)} · تكلفة ${fmt(company.productCost)} · مرتجعات ${fmt(company.returnLoss)} · مصاريف الأسواق ${fmt(company.marketExpenses)}</div>
          <div className="text-[10px] text-white/70">مصاريف مشتركة غير موزعة: ${fmt(data.sharedExpenses)} (تدخل في صافي الشركة فقط){Object.entries(data.sharedByCategory||{}).length>0 && ' — '+Object.entries(data.sharedByCategory).map(([c,v])=>c+' $'+fmt(v)).join(' · ')}</div>
        </div>
        {(data.estimates?.ads || data.estimates?.shipping) && <p className="text-[10px] text-muted mt-2">ℹ️ {data.estimates.ads && 'الإعلان '}{data.estimates.ads && data.estimates.shipping && 'و'}{data.estimates.shipping && 'الشحن '}محسوبان بتقدير الوحدة (إن وُجد) لأن لا مصروف فعلي مُدخل لهما هذا الشهر.</p>}
      </div>

      <ExpenseEditor month={month} expenses={expenses} onSaved={load} />

      {/* Totals */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <StatCard icon="💰" label="صافي الشركة (بعد المصاريف)" value={`$${fmt(totals.netProfit)}`} tone={totals.netProfit>=0?'green':'red'} />
        <StatCard icon="💎" label="منتجات نجوم" value={totals.stars} tone="green" />
        <StatCard icon="🔻" label="خاسرة" value={totals.losers} tone="red" />
        <StatCard icon="⚠️" label="مرتجعات عالية" value={totals.risky} tone="orange" />
      </div>

      {/* Bulk cost entry CTA */}
      <button onClick={()=>setBulk(true)}
        className="w-full py-2.5 rounded-xl bg-teal text-navy text-sm font-bold hover:bg-teal/90 transition flex items-center justify-center gap-2">
        ✏️ تعديل التكاليف للكل دفعة واحدة
      </button>

      {totals.unset > 0 && (
        <div className="text-xs text-muted bg-surface-alt rounded-xl px-3 py-2.5">
          💡 {totals.unset} صنف بدون تكلفة محدّدة — اضغط «✏️ تعديل التكاليف للكل» لإدخالها دفعة واحدة وتظهر الأرباح فوراً.
        </div>
      )}

      {unmapped.length > 0 && (
        <div className="text-xs bg-orange-500/5 border border-orange-500/20 rounded-xl px-3 py-2.5 text-text">
          🔗 {unmapped.length} اسم منتج مباع غير مربوط بالأسماء الموحّدة (يظهر باسمه الخام): {unmapped.slice(0, 6).map(u => `${u.name} (${u.units})`).join('، ')}{unmapped.length > 6 ? '…' : ''}
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
                  <div className="flex items-center gap-1 mt-1 justify-end">
                    <button onClick={()=>setEditing(p)} className="text-[11px] font-semibold text-teal hover:bg-teal/10 px-2.5 py-1 rounded-lg transition">
                      {p.hasEcon ? 'تعديل' : '➕ حدّد'}
                    </button>
                    {p.brand === 'strong' && (
                      <button onClick={()=>toggleFreeze(p)} disabled={freezing===p.name}
                        title="تجميد — إخفاء دائم من التقرير (منتج مُلغى)"
                        className="text-[11px] font-semibold text-orange-600 hover:bg-orange-50 px-2.5 py-1 rounded-lg transition disabled:opacity-50">
                        {freezing===p.name ? '…' : '🚫 تجميد'}
                      </button>
                    )}
                  </div>
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
