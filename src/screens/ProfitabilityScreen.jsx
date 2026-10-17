// =============================================================
// ProfitabilityScreen (#1) — الربحية والنتائج الشهرية (الإيراد من قيمة الطلب الفعلية بعد التحويل بسعر صرف شهري معتمد)
// يعرض الوحدات المباعة + المرتجعات + الربح الصافي لكل صنف،
// مع إدخال السعر/التكلفة/الإعلان/الشحن (يُحفظ ويُحسب فوراً).
// =============================================================
import { useState, useEffect, useCallback } from 'react';
import { loadProfitability, saveEconomics, saveMarketPrice, saveExpense, deleteExpense, saveFxRate, closeMonth, acknowledgeRetroDrift, setProductActive } from '@services/profitabilityService';
import { DELIVERY_BASIS_LABELS, snapshotOf } from '@utils/profitabilityCalc';
import { useAuth } from '@hooks/useAuth';
import { useToast } from '@hooks/useToast';

const fmt = (n) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(n || 0);

const FLAG = {
  star:  { label: '💎 نجم',    cls: 'bg-green-500/10 text-green-600 border-green-500/20' },
  ok:    { label: '✅ رابح',   cls: 'bg-teal/10 text-teal border-teal/20' },
  risky: { label: '⚠️ مرتجعات',cls: 'bg-orange-500/10 text-orange-600 border-orange-500/20' },
  loss:  { label: '🔻 خاسر',   cls: 'bg-red-500/10 text-red-600 border-red-500/20' },
  unset: { label: '➕ حدّد',    cls: 'bg-surface-alt text-muted border-border' },
  nofx:  { label: '💱 بلا إيراد محوَّل', cls: 'bg-red-500/10 text-red-600 border-red-500/20' },
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

// ───── محرّر الأسعار حسب السوق ─────
// السعر مرتبط بالمنتج × السوق × شهر البدء. الماضي لا يُعاد كتابته، وسوق بلا سعر لا يستعير سعر سوق آخر.
const MKTS = [['syria', '🇸🇾 سوريا'], ['turkey', '🇹🇷 تركيا'], ['uae', '🇦🇪 الإمارات']];
const PRICE_STATUS = {
  current:        ['🟢 حالي', 'text-green-600'],
  historical:     ['✅ موثّق', 'text-teal'],
  legacy_unified: ['🟡 موحّد قديم', 'text-orange-600'],
  missing:        ['🔴 ناقص', 'text-red-600'],
};
const thisMonth = () => new Date(Date.now() + 3 * 3600 * 1000).toISOString().slice(0, 7);

function MarketPriceEditor({ table, focus, viewMonth, actor, onClose, onSaved }) {
  const toast = useToast();
  const cur = thisMonth();
  const [startMonth, setStartMonth] = useState(cur);
  const [q, setQ] = useState(focus || '');
  const [showCost, setShowCost] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState(() => {
    const m = {};
    for (const t of table) {
      for (const [mk] of MKTS) { const e = t.markets[mk]; m[`${t.key}|${mk}`] = { price: e.price > 0 ? String(e.price) : '', cost: e.costBasis === 'market' ? String(e.cost) : '' }; }
      const anyCost = MKTS.map(([mk]) => t.markets[mk].cost).find((c) => c > 0);
      m[`${t.key}|unified`] = { cost: anyCost ? String(anyCost) : '' };
    }
    return m;
  });
  const [dirty, setDirty] = useState(() => new Set());
  const set = (id, k, v) => { setRows((s) => ({ ...s, [id]: { ...s[id], [k]: v.replace(/[^\d.]/g, '') } })); setDirty((d) => new Set(d).add(id)); };

  const saveAll = async () => {
    if (!dirty.size) { onClose(); return; }
    if (startMonth < cur) { toast.error('شهر البدء لا يمكن أن يكون ماضياً — الأشهر السابقة لا تُعاد كتابتها'); return; }
    setBusy(true);
    let done = 0, fail = 0, firstErr = '';
    const byKey = new Map(table.map((t) => [t.key, t]));
    for (const id of dirty) {
      const [key, mk] = id.split('|'); const t = byKey.get(key); const r = rows[id];
      try {
        if (mk === 'unified') {
          if (r.cost !== '') await saveEconomics(t.name, { cost_usd: Number(r.cost), month: `${startMonth}-01` });
        } else {
          const price = r.price === '' ? null : Number(r.price), cost = r.cost === '' ? null : Number(r.cost);
          if (price !== null || cost !== null) await saveMarketPrice({ item: t.name, market: mk, price, cost, month: `${startMonth}-01`, name: actor });
        }
        done++;
      } catch (e) { fail++; firstErr = firstErr || e.message; }
    }
    setBusy(false);
    toast[fail ? 'error' : 'success'](`حُفظ ${done}${fail ? ` · فشل ${fail} (${firstErr})` : ''}`);
    onSaved();
  };

  const list = table.filter((t) => !q || t.name.toLowerCase().includes(q.trim().toLowerCase()));
  const INP = 'w-16 border border-border rounded-lg px-1.5 py-1 text-xs bg-surface-alt text-text text-center focus:outline-none focus:ring-2 focus:ring-teal/30';

  return (
    <div className="fixed inset-0 z-[80] flex items-stretch sm:items-center justify-center sm:p-4 bg-black/50" onClick={(e) => e.target === e.currentTarget && onClose()} dir="rtl">
      <div className="w-full sm:max-w-3xl bg-surface sm:rounded-3xl shadow-2xl border border-border flex flex-col max-h-screen sm:max-h-[92vh]">
        <div className="px-4 py-3 bg-navy text-white shrink-0">
          <p className="font-bold text-sm">💵 أسعار المنتجات حسب السوق — بالدولار للوحدة</p>
          <p className="text-[11px] text-white/70">السعر الجديد يسري من شهر البدء فقط؛ الأشهر السابقة لا تتغيّر ولا يُنسخ إليها شيء. سوق بلا سعر لا يستعير سعر سوق آخر. القيم المعروضة هي المعتمدة لشهر {viewMonth}.</p>
        </div>
        <div className="p-3 shrink-0 flex flex-wrap gap-2 items-center">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث عن منتج…" className="flex-1 min-w-[10rem] border border-border rounded-xl px-3 py-2 text-sm bg-surface-alt text-text" />
          <label className="text-xs text-text flex items-center gap-1.5">يبدأ من شهر
            <input type="month" value={startMonth} min={cur} onChange={(e) => setStartMonth(e.target.value || cur)} className="border border-border rounded-lg px-2 py-1 text-xs bg-surface-alt text-text" />
          </label>
          <label className="text-xs text-muted flex items-center gap-1"><input type="checkbox" checked={showCost} onChange={(e) => setShowCost(e.target.checked)} /> تكلفة خاصة بالسوق</label>
        </div>
        <div className="overflow-y-auto flex-1 px-3">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-surface">
              <tr className="text-muted text-[10px]">
                <th className="text-start py-1.5 font-semibold">المنتج</th>
                {MKTS.map(([k, l]) => <th key={k} className="font-semibold">{l}</th>)}
                <th className="font-semibold">📦 تكلفة التصنيع (موحّدة)</th>
              </tr>
            </thead>
            <tbody>
              {list.map((t) => (
                <tr key={t.key} className="border-t border-border/40 align-top">
                  <td className="py-1.5 pe-2 text-text font-medium">{t.name}</td>
                  {MKTS.map(([mk]) => {
                    const e = t.markets[mk], id = `${t.key}|${mk}`, [lab, cls] = PRICE_STATUS[e.status] || PRICE_STATUS.missing;
                    return (
                      <td key={mk} className="text-center py-1">
                        <input value={rows[id].price} onChange={(ev) => set(id, 'price', ev.target.value)} inputMode="decimal" className={INP} placeholder="—" />
                        <div className={`text-[9px] ${cls}`}>{lab}{e.from && e.status !== 'missing' ? ` · ${String(e.from).slice(0, 7)}` : ''}</div>
                        {showCost && <input value={rows[id].cost} onChange={(ev) => set(id, 'cost', ev.target.value)} inputMode="decimal" className={`${INP} mt-1`} placeholder="تكلفة" />}
                      </td>
                    );
                  })}
                  <td className="text-center py-1"><input value={rows[`${t.key}|unified`].cost} onChange={(ev) => set(`${t.key}|unified`, 'cost', ev.target.value)} inputMode="decimal" className={INP} placeholder="—" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex gap-2 p-3 border-t border-border shrink-0">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-border font-semibold hover:bg-surface-alt">إغلاق</button>
          <button onClick={saveAll} disabled={busy} className="flex-1 py-2.5 rounded-xl bg-teal text-navy font-bold hover:bg-teal/90 disabled:opacity-50">
            {busy ? 'جارٍ الحفظ…' : `حفظ ${dirty.size || ''} ${dirty.size ? 'خانة' : ''}`}
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

// تصنيفات إضافية فقط: ما له قيد في المحاسبة يُقرأ من دفتر المحاسبة ولا يُعاد إدخاله هنا.
const EXPENSE_CATEGORIES = ['حملات إعلانية', 'سوشل ميديا', 'أجور الشحن', 'تغليف + أجور التغليف', 'تخزين + نقل', 'رواتب', 'محاسبة + الضرائب الشهرية', 'ضرائب الربح', 'مصاريف إضافية', 'بلوغرات + هدايا'];
const MARKET_LABELS = { syria: '🇸🇾 سوريا', turkey: '🇹🇷 تركيا', uae: '🇦🇪 الإمارات', unknown: 'غير محدد', all: 'مشترك' };
const BASIS_LABELS = DELIVERY_BASIS_LABELS;
const REASON_LABELS = { no_history: 'لا سجل حالات', no_delivered_event: 'سجل بلا حدث تسليم', bulk_import_event: 'حدث تسليم من استيراد جماعي' };
const DATE_FMT = (d) => (d ? String(d).slice(0, 10) : '—');

const QUALITY = {
  final:     { label: '✅ نهائي',  cls: 'bg-green-500/10 text-green-600 border-green-500/30', hint: 'لا نواقص ولا تقديرات' },
  estimated: { label: '🟡 تقديري', cls: 'bg-orange-500/10 text-orange-600 border-orange-500/30', hint: 'يحتوي تقديرات أو بنوداً تحتاج مراجعة' },
  partial:   { label: '🔴 جزئي',   cls: 'bg-red-500/10 text-red-600 border-red-500/30', hint: 'بيانات جوهرية ناقصة — ليس رقماً نهائياً' },
};
const CUR = (o) => Object.entries(o || {}).map(([c, v]) => `${fmt(v)} ${c}`).join(' · ');

function QualityBadge({ q }) {
  const m = QUALITY[q?.status] || QUALITY.estimated;
  return <span title={m.hint} className={`text-[10px] px-2 py-0.5 rounded-full border font-bold ${m.cls}`}>{m.label}</span>;
}

function IssueList({ q, dark }) {
  if (!q?.issues?.length) return null;
  return <ul className={`text-[10px] mt-1.5 space-y-0.5 ${dark ? 'text-white/80' : 'text-orange-600'}`}>
    {q.issues.map(i => <li key={i.code}>{i.level === 'partial' ? '🔴' : '⚠️'} {i.label}{i.orders ? ` — ${fmt(i.orders)} طلب` : ''}{i.units ? ` · ${fmt(i.units)} قطعة` : ''}{i.amount ? ` · $${fmt(i.amount)}` : ''}{i.count ? ` · ${fmt(i.count)}` : ''}</li>)}
  </ul>;
}

function MarketCard({ k, x }) {
  const R = x.returns || {};
  const row = (label, v, neg, tag, plus) => (v ? <div className="flex justify-between"><span>{label}{tag && <i className="not-italic text-orange-600"> ({tag})</i>}</span><span className={neg ? 'text-red-600' : plus ? 'text-green-700' : ''}>{neg ? '−' : plus ? '+' : ''}${fmt(v)}</span></div> : null);
  const basis = Object.entries(x.deliveryBasis || {}).map(([b, n]) => `${BASIS_LABELS[b] || b}: ${n}`).join(' · ');
  return <div className="rounded-xl bg-surface-alt p-3 border border-border/60">
    <div className="flex items-center justify-between gap-1"><p className="text-xs font-bold">{MARKET_LABELS[k]}</p><QualityBadge q={x.quality} /></div>
    {x.revenue === 0 && x.revenueNoFx?.orders > 0 ? <p className="text-sm font-black mt-1 text-orange-600" title="كل إيراد هذا السوق بعملة بلا سعر صرف شهري">— بانتظار سعر الصرف</p> : <p className={`text-lg font-black mt-1 ${Number(x.netProfit)>=0?'text-green-600':'text-red-600'}`}>${fmt(x.netProfit)}</p>}
    <div className="text-[10px] text-muted">صافي الربح بالدولار — حساب {QUALITY[x.quality?.status]?.label.replace(/^\S+ /, '') || ''}</div>
    <div className="text-[10px] text-muted mt-1">{x.orders||0} طلب سُلِّم بالشهر · {x.units||0} قطعة</div>
    {basis && <div className="text-[10px] text-muted">مصدر تاريخ التسليم — {basis}</div>}
    <div className="text-[10px] text-muted mt-1.5 space-y-0.5">
      {row('إيراد المبيعات الفعلي (قيمة الطلبات بالدولار بعد التحويل)', x.revenue)}
      {x.unallocatedRevenue > 0 && <div className="text-[10px] text-orange-600">منه غير موزَّع على المنتجات: ${fmt(x.unallocatedRevenue)} ({x.unallocatedOrders} طلب)</div>}
      {x.referenceRevenue > 0 && <div className="text-[10px] text-muted">مرجع تحليلي فقط (سعر المنتج × الكمية): ${fmt(x.referenceRevenue)} — لا يدخل الربح</div>}
      {row('تخفيض الإيراد بسبب مرتجع (شهر الإرجاع)', R.revenueReduction, true)}
      {row('تكلفة المنتجات المُسلَّمة', x.productCost, true)}
      {row('تكلفة مخزون مُسترَد (حركة موثَّقة + مفترض بقاعدة المالك)', R.restockedCost, false, null, true)}
      {R.assumedRestockCost > 0 && <div className="text-[10px] text-muted">منها مفترض (بلا حركة مخزون): ${fmt(R.assumedRestockCost)}</div>}
      {row('خسارة منتجات تالفة (سجل إتلاف)', R.damagedLoss, true)}
      {row('شحن فعلي (محاسبة/إضافي)', x.actualShipping, true)}
      {row('شحن', x.estShipping, true, 'تقدير')}
      {row('إعلان', x.estAds, true, 'تقدير')}
      {Object.entries(x.expensesByCategory || {}).map(([c, v]) => <div key={c} className="flex justify-between"><span>{c} <i className="not-italic text-green-700">(فعلي)</i></span><span className="text-red-600">−${fmt(v)}</span></div>)}
    </div>
    {(R.orders > 0) && <div className="text-[10px] text-muted mt-1.5 border-t border-border/50 pt-1">↩️ مرتجعات مكتملة بالشهر: {R.orders} طلب · {R.units} قطعة · تكلفة خرجت ${fmt(R.costOut)}{R.unresolvedCost > 0 ? <b className="text-orange-600"> · تسوية غير محسومة ${fmt(R.unresolvedCost)}</b> : null}</div>}
    {x.pendingReturns?.orders > 0 && <div className="text-[10px] text-muted">⏳ معلّقة (راجع للمركز/لم يُستلم): {x.pendingReturns.orders} طلب · تعرّض ${fmt(x.pendingReturns.cost)} — لا أثر مالي قبل ثبوت الحالة</div>}
    {x.returnTimingUnknown?.orders > 0 && <div className="text-[10px] text-orange-600">⚠️ {x.returnTimingUnknown.orders} مرتجع بتوقيت غير موثوق · إيراد معلّق ${fmt(x.returnTimingUnknown.revenue)} / تكلفة ${fmt(x.returnTimingUnknown.cost)} لم تُخصم</div>}
    {Object.keys(x.revenueByCurrency || {}).length > 0 && <div className="text-[10px] text-muted mt-1.5 border-t border-border/50 pt-1">💵 قيمة الطلبات المحوَّلة (بعملتها الأصلية): {CUR(x.revenueByCurrency)}</div>}
    {x.revenueNoFx?.orders > 0 && <div className="text-[10px] text-red-600 font-semibold">💱 {x.revenueNoFx.orders} طلب بلا سعر صرف شهري: {CUR(x.revenueNoFx.byCurrency)} — لا إيراد ولا تكلفة لها بالأرقام حتى يُدخَل السعر</div>}
    {x.revenueMissing?.orders > 0 && <div className="text-[10px] text-red-600">🔴 {x.revenueMissing.orders} طلب مسلَّم بقيمة صفرية أو بلا عملة — لا إيراد لها</div>}
    {x.returns?.fxMissingOrders > 0 && <div className="text-[10px] text-red-600">🔴 {x.returns.fxMissingOrders} مرتجع بعد تسليم تعذّر تحويل قيمته (بلا سعر صرف لشهر التسليم) — لم يُحسب أثره</div>}
    {x.settledOrders > 0 && <div className="text-[10px] text-muted mt-1">🤝 تسويات (ليست مبيعات منتجات): {x.settledOrders} طلب{Object.keys(x.settledCollected || {}).length ? ` · ${CUR(x.settledCollected)}` : ''}</div>}
    {Object.keys(x.unconverted || {}).length > 0 && <div className="text-[10px] text-red-600">💱 بلا سعر صرف: {CUR(x.unconverted)} (أثره بالدولار غير محسوب)</div>}
    <IssueList q={x.quality} />
  </div>;
}

function Panel({ icon, title, count, tone = 'orange', children, open = false }) {
  const cls = tone === 'info' ? 'bg-surface border-border' : 'bg-orange-500/5 border-orange-500/20';
  return <details open={open} className={`text-xs border rounded-xl px-3 py-2.5 text-text ${cls}`}>
    <summary className="cursor-pointer font-semibold">{icon} {title}{count !== undefined && <span className="text-muted font-normal"> — {count}</span>}</summary>
    <div className="mt-2">{children}</div>
  </details>;
}

function Table({ head, rows }) {
  return <div className="overflow-x-auto"><table className="w-full text-[11px]"><thead><tr className="text-muted text-start">{head.map(h => <th key={h} className="text-start font-semibold pe-2 py-1">{h}</th>)}</tr></thead>
    <tbody>{rows.map((r, i) => <tr key={i} className="border-t border-border/40">{r.map((c, j) => <td key={j} className="pe-2 py-1">{c}</td>)}</tr>)}</tbody></table></div>;
}

function ExpenseEditor({ month, expenses, onSaved, closed, actor }) {
  const toast = useToast();
  const blank = { category: EXPENSE_CATEGORIES[0], market: 'all', amount_usd: '', notes: '', retro_reason: '' };
  const [form, setForm] = useState(blank);
  const [editId, setEditId] = useState(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!(Number(form.amount_usd) > 0)) return toast.error('أدخل قيمة المصروف');
    if (closed && !form.retro_reason.trim()) return toast.error('الشهر مغلق: اكتب سبب التعديل الرجعي');
    setBusy(true);
    try {
      await saveExpense({ id: editId, month, ...form });
      setForm(blank); setEditId(null);
      toast.success(editId ? 'تم تعديل المصروف' : 'تم حفظ المصروف للشهر'); onSaved();
    } catch (e) { toast.error(e.message || 'تعذّر حفظ المصروف'); }
    finally { setBusy(false); }
  };
  const startEdit = (e) => { setEditId(e.id); setForm({ category: e.category, market: e.market, amount_usd: String(e.amount_usd), notes: e.notes || '', retro_reason: '' }); };
  const cancelEdit = () => { setEditId(null); setForm(blank); };
  const remove = async (e) => {
    let reason = '';
    if (closed) { reason = window.prompt('الشهر مغلق — اكتب سبب الحذف الرجعي (يُسجَّل مع القيم قبل الحذف):') || ''; if (!reason.trim()) return; }
    else if (!window.confirm(`حذف «${e.category}» ($${fmt(e.amount_usd)})؟`)) return;
    try { await deleteExpense(e.id, { reason, actor }); if (editId === e.id) cancelEdit(); onSaved(); toast.success('تم الحذف'); }
    catch (err) { toast.error(err.message || 'تعذّر حذف المصروف'); }
  };
  const total = expenses.reduce((s, e) => s + (Number(e.amount_usd) || 0), 0);
  const categories = EXPENSE_CATEGORIES.includes(form.category) ? EXPENSE_CATEGORIES : [form.category, ...EXPENSE_CATEGORIES];
  return <div className="bg-surface border border-border rounded-2xl p-3" dir="rtl">
    <div className="flex items-center justify-between mb-2">
      <h2 className="font-bold text-sm">🧾 مصاريف إضافية (بلا قيد محاسبي مقابل) {editId && <span className="text-orange-600">· وضع التعديل</span>}</h2>
      <span className="text-[11px] text-muted">المجموع <b className="text-text">${fmt(total)}</b></span>
    </div>
    <p className="text-[10px] text-orange-600 mb-2">⚠️ مصاريف الدفتر المحاسبي (شحن، إعلانات، رواتب…) تُقرأ تلقائياً من المحاسبة — لا تُدخلها هنا حتى لا تتكرر. هنا فقط: تقديرات/مستحقات/بنود بلا قيد.</p>
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
    {closed && <input value={form.retro_reason} onChange={e=>setForm({...form,retro_reason:e.target.value})} placeholder="سبب التعديل الرجعي (إلزامي — الشهر مغلق)" className="mt-2 w-full border border-orange-400 rounded-xl px-2 py-2 text-xs bg-surface-alt text-text" />}
    <p className="text-[10px] text-muted mt-2">«حملات إعلانية/سوشل ميديا» و«أجور الشحن» الفعلية تُلغي تقدير الوحدة لنفس السوق والشهر فقط (والمشترك يُلغيها للثلاثة).</p>
    {expenses.length > 0 && <div className="mt-3 space-y-1">{expenses.map(e=><div key={e.id} className="flex items-center justify-between gap-2 text-xs border-t border-border/50 pt-1.5"><span className="min-w-0 truncate">{e.category} · {e.market==='all'?'مشترك':MARKET_LABELS[e.market]} {e.notes && `· ${e.notes}`}{e.accounting_entry_id ? ' · 🔗 مربوط بقيد محاسبي' : ''}</span><span className="flex items-center gap-2 shrink-0"><b>${fmt(e.amount_usd)}</b><button onClick={()=>startEdit(e)} className="text-teal">تعديل</button><button onClick={()=>remove(e)} className="text-red-500">حذف</button></span></div>)}</div>}
  </div>;
}

function FxPanel({ month, rates, closed, actor, onSaved }) {
  const toast = useToast();
  const [f, setF] = useState({ scope: 'all', currency: 'SYP', units_per_usd: '', note: '', retro_reason: '' });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try { await saveFxRate({ month, ...f, name: actor }); setF({ ...f, units_per_usd: '', note: '', retro_reason: '' }); toast.success('سُجّل سعر الصرف الشهري'); onSaved(); }
    catch (e) { toast.error(e.message || 'تعذّر الحفظ'); } finally { setBusy(false); }
  };
  return <div>
    <p className="text-[10px] text-muted mb-2">أسعار الصرف تُدخَل يدوياً لكل شهر فقط (وحدات العملة مقابل 1 دولار). لا يوجد سعر افتراضي ولا يُسحَب من جدول exchange_rates القديم. السجل إلحاقي: لا تعديل ولا حذف، والأحدث إدخالاً هو المعتمد.</p>
    <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
      <select value={f.currency} onChange={e=>setF({...f,currency:e.target.value})} className="border border-border rounded-xl px-2 py-2 text-xs bg-surface-alt"><option>SYP</option><option>TRY</option><option>AED</option></select>
      <select value={f.scope} onChange={e=>setF({...f,scope:e.target.value})} className="border border-border rounded-xl px-2 py-2 text-xs bg-surface-alt"><option value="all">كل الأسواق</option><option value="syria">سوريا</option><option value="turkey">تركيا</option><option value="uae">الإمارات</option></select>
      <input type="number" min="0" step="0.0001" value={f.units_per_usd} onChange={e=>setF({...f,units_per_usd:e.target.value})} placeholder={`${f.currency} لكل 1$`} className="border border-border rounded-xl px-2 py-2 text-xs bg-surface-alt" />
      <input value={f.note} onChange={e=>setF({...f,note:e.target.value})} placeholder="ملاحظة/مرجع السعر" className="border border-border rounded-xl px-2 py-2 text-xs bg-surface-alt sm:col-span-2" />
      <button onClick={save} disabled={busy} className="rounded-xl bg-teal text-navy font-bold text-xs py-2 disabled:opacity-50">{busy ? '…' : 'تسجيل السعر'}</button>
    </div>
    {closed && <input value={f.retro_reason} onChange={e=>setF({...f,retro_reason:e.target.value})} placeholder="سبب التعديل الرجعي (الشهر مغلق)" className="mt-2 w-full border border-orange-400 rounded-xl px-2 py-2 text-xs bg-surface-alt" />}
    {rates.length > 0 && <div className="mt-2"><Table head={['العملة', 'النطاق', 'لكل 1$', 'أدخله', 'تاريخ الإدخال', 'ملاحظة']} rows={rates.map(r => [r.currency, r.scope === 'all' ? 'الكل' : MARKET_LABELS[r.scope], fmt(r.units_per_usd), r.entered_by_name, DATE_FMT(r.entered_at), r.note || '—'])} /></div>}
  </div>;
}

function ClosureBar({ month, data, actor, onChanged }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState('');
  const closure = data.closure;
  const doClose = async () => {
    if (!window.confirm(`إغلاق ${month}؟ بعد الإغلاق أي تعديل بمصاريفه أو أسعار صرفه يتطلّب سبباً ويُسجَّل قبل/بعد.${data.company.quality.status !== 'final' ? '\nتنبيه: الصافي ليس «نهائياً» (' + QUALITY[data.company.quality.status].label + ') — تُحفَظ حالته كما هي.' : ''}`)) return;
    setBusy(true);
    try { await closeMonth({ month, result: data, name: actor }); toast.success('أُغلق الشهر وحُفظت لقطته'); onChanged(); }
    catch (e) { toast.error(e.message || 'تعذّر الإغلاق'); } finally { setBusy(false); }
  };
  const ack = async () => {
    setBusy(true);
    try { await acknowledgeRetroDrift({ month, reason, before: closure.snapshot, after: snapshotOf(data), name: actor }); setReason(''); toast.success('سُجّل التغيّر الرجعي'); onChanged(); }
    catch (e) { toast.error(e.message || 'تعذّر التسجيل'); } finally { setBusy(false); }
  };
  if (!closure) return <div className="flex items-center justify-between bg-surface border border-border rounded-2xl px-3 py-2"><span className="text-[11px] text-muted">🔓 الشهر مفتوح — يمكن إغلاقه لحفظ لقطة رسمية بأرقامه.</span><button onClick={doClose} disabled={busy} className="text-[11px] font-bold px-3 py-1.5 rounded-lg bg-navy text-white disabled:opacity-50">🔒 إغلاق الشهر</button></div>;
  return <div className="bg-surface border border-navy/30 rounded-2xl px-3 py-2 text-[11px]">
    <p>🔒 مُغلق بتاريخ {DATE_FMT(closure.closed_at)} بواسطة {closure.closed_by_name} — لقطة الإغلاق: صافي ${fmt(closure.snapshot.netProfit)} · مصاريف ${fmt(closure.snapshot.expenses)} · حالة {QUALITY[closure.snapshot.status]?.label}</p>
    {data.closureDiff.length > 0 ? <div className="mt-1.5 text-orange-600">
      <p className="font-bold">⚠️ تغيّر رجعي: الأرقام الحالية تختلف عن لقطة الإغلاق (بيانات وصلت بعد الإغلاق):</p>
      <ul>{data.closureDiff.map(d => <li key={d.field}>{d.field}: قبل {String(d.before)} ← بعد {String(d.after)}</li>)}</ul>
      <div className="flex gap-2 mt-1"><input value={reason} onChange={e=>setReason(e.target.value)} placeholder="سبب التغيّر الرجعي (يُسجَّل بالتاريخ والقيم قبل/بعد)" className="flex-1 border border-orange-400 rounded-lg px-2 py-1 text-[11px] bg-surface-alt" /><button onClick={ack} disabled={busy || !reason.trim()} className="px-2 rounded-lg bg-orange-500 text-white font-bold disabled:opacity-50">تسجيل</button></div>
    </div> : <p className="text-green-700 mt-1">✅ الأرقام الحالية تطابق لقطة الإغلاق.</p>}
  </div>;
}

export default function ProfitabilityScreen() {
  const toast = useToast();
  const { name: actor } = useAuth();
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

  const { products, totals, marketSummary = {}, expenses = [], company = {}, unmapped = [], unknownDeliveryOrders = [], returnLists = {}, reviewList = [], unallocated = {}, skippedAccounting = {}, fxRates = [] } = data;
  const closed = !!data.closure;
  const U = company.unknownDelivery || {};

  return (
    <div className="max-w-3xl mx-auto pb-24 space-y-4" dir="rtl">
      <div className="bg-navy rounded-2xl p-5 text-white">
        <h1 className="text-xl font-extrabold flex items-center gap-2">💎 الربحية والنتائج الشهرية</h1>
        <p className="text-white/70 text-xs mt-1">الإيراد = قيمة الطلب الفعلية بعد التسليم محوَّلة للدولار بسعر صرف شهري معتمد لكل سوق · في شهر التسليم الفعلي · وما لا يُعرف يُعرض ولا يُخمَّن</p>
      </div>

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

      <ClosureBar month={month} data={data} actor={actor} onChanged={load} />

      {data.historyFailures30d > 0 && <div className="text-[11px] text-red-600 bg-red-500/5 border border-red-500/20 rounded-xl px-3 py-2">🔴 {data.historyFailures30d} محاولة تسجيل حالة طلب فشلت خلال 30 يوماً (جدول order_status_history_failures) — تواريخ التسليم/الإرجاع الناتجة غير مكتملة.</div>}

      <div className="bg-surface border border-border rounded-2xl p-3" dir="rtl">
        <div className="flex items-center justify-between mb-2"><h2 className="font-bold text-sm">📊 ملخص الأسواق — بالدولار</h2><span className="text-[10px] text-muted">المبيعات = «تم التسليم» بتاريخ تسليم معروف · التسويات والمرتجعات منفصلة</span></div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {['syria','turkey','uae'].map(k => <MarketCard key={k} k={k} x={marketSummary[k] || {}} />)}
        </div>
        <div className="rounded-xl bg-navy text-white p-3 mt-2">
          <div className="flex items-center justify-between"><span className="text-xs font-bold flex items-center gap-2">🏢 الشركة كاملة <QualityBadge q={company.quality} /></span><span className={`text-xl font-black ${company.netProfit>=0?'text-green-300':'text-red-300'}`}>${fmt(company.netProfit)}</span></div>
          <div className="text-[10px] text-white/70 mt-1">{company.orders||0} طلب · {company.units||0} قطعة · إيراد فعلي ${fmt(company.revenue)} (مرجع تحليلي بسعر المنتج ${fmt(company.referenceRevenue)}) · تكلفة ${fmt(company.productCost)} · مصاريف الأسواق ${fmt(company.marketExpenses)}</div>
          <div className="text-[10px] text-white/70">مصاريف مشتركة غير موزعة على الأسواق: ${fmt(data.sharedExpenses)} · مصروف غير موزّع على سوق (سوق غير معروف): ${fmt(unallocated.usd)} — يدخلان بصافي الشركة فقط</div>
          {company.returns?.unresolvedCost > 0 && <div className="text-[10px] text-orange-200">تسوية مرتجعات غير محسومة: ${fmt(company.returns.unresolvedCost)} (لا تالفة ولا قابلة للبيع حتى يثبت مصيرها)</div>}
          {Object.keys(company.unconverted || {}).length > 0 && <div className="text-[10px] text-red-200">💱 مصاريف بلا سعر صرف شهري: {CUR(company.unconverted)} — غير داخلة بالدولار</div>}
          <div className="text-[10px] text-white/60 mt-1">الإيراد = قيمة الطلب الفعلية (amount) المسلَّم، محوَّلة بسعر الصرف الشهري المعتمد لكل سوق؛ وسعر المنتج × الكمية مرجع تحليلي لا يدخل الربح. {company.revenueNoFx?.orders > 0 ? `💱 ${company.revenueNoFx.orders} طلب بلا سعر صرف: ${CUR(company.revenueNoFx.byCurrency)} — أدخل أسعار الصرف من لوحة «أسعار الصرف الشهرية» أدناه.` : ''}</div>
          <IssueList q={company.quality} dark />
        </div>
      </div>

      {unknownDeliveryOrders.length > 0 && (
        <Panel icon="📭" title="طلبات مسلّمة بتاريخ تسليم غير معروف (غير مُسنَدة لأي شهر)" count={`${unknownDeliveryOrders.length} طلب · ${fmt(U.units)} قطعة`}>
          <p className="text-[10px] text-muted mb-1">لا تاريخ تسليم موثوقاً لها (لا حدث تسليم بالسجل أو الحدث من استيراد جماعي أو المصدر الأصلي لا يحمل تاريخ تسليم). لا تُنسَب لشهر إنشاء ولا غيره.</p>
          <Table head={['الطلب', 'السوق', 'أُنشئ', 'قطع', 'السبب']} rows={unknownDeliveryOrders.slice(0, 80).map(u => [u.code, MARKET_LABELS[u.market] || u.market, DATE_FMT(u.order_date), u.units, REASON_LABELS[u.reason] || u.reason])} />
          {unknownDeliveryOrders.length > 80 && <p className="text-[10px] text-muted mt-1">… و{unknownDeliveryOrders.length - 80} غيرها</p>}
        </Panel>
      )}

      {(returnLists.unresolved?.length > 0 || returnLists.timingUnknown?.length > 0 || returnLists.pending?.length > 0) && (
        <Panel icon="↩️" title="مرتجعات غير محسومة" count={`${returnLists.unresolved?.length || 0} مصير مخزون · ${returnLists.timingUnknown?.length || 0} توقيت · ${returnLists.pending?.length || 0} معلّقة`}>
          <p className="text-[10px] text-muted mb-1">المرتجع الذي لا حركة مخزون موثَّقة له لا يُعدّ تالفاً ولا قابلاً للبيع. «راجع للمركز»/«لم يُستلم» لا يُعاملان مرتجعاً مكتملاً.</p>
          {returnLists.unresolved?.length > 0 && <><p className="font-semibold mt-1">مصير المخزون غير موثَّق (إرجاع بهذا الشهر)</p><Table head={['الطلب', 'السوق', 'قطع', 'تكلفة غير محسومة', 'بعد تسليم؟']} rows={returnLists.unresolved.slice(0, 40).map(u => [u.code, MARKET_LABELS[u.market], u.units, `$${fmt(u.cost)}`, u.afterDelivery ? 'نعم' : 'لا'])} /></>}
          {returnLists.timingUnknown?.length > 0 && <><p className="font-semibold mt-2">توقيت الإرجاع غير موثوق (تحويل جماعي/بلا حدث) — لم يُخصم أثرها</p><Table head={['الطلب', 'السوق', 'قطع', 'إيراد معلّق', 'تكلفة', 'بعد تسليم؟']} rows={returnLists.timingUnknown.slice(0, 60).map(u => [u.code, MARKET_LABELS[u.market], u.units, `$${fmt(u.revenue)}`, `$${fmt(u.cost)}`, u.afterDelivery ? 'نعم' : 'لا'])} /></>}
          {returnLists.pending?.length > 0 && <><p className="font-semibold mt-2">معلّقة (حالتها النهائية غير مثبتة)</p><Table head={['الطلب', 'السوق', 'الحالة', 'قطع', 'تعرّض']} rows={returnLists.pending.slice(0, 40).map(u => [u.code, MARKET_LABELS[u.market], u.status === 'returning' ? 'راجع للمركز' : 'لم يُستلم', u.units, `$${fmt(u.cost)}`])} /></>}
        </Panel>
      )}

      <Panel icon="📒" title="مصاريف المحاسبة (المصدر الرسمي) وما لا يدخل" tone="info"
        count={`غير موزّع $${fmt(unallocated.usd)} · مستبعد: ${skippedAccounting.transfer || 0} تحويل · ${skippedAccounting.void || 0} ملغى · ${skippedAccounting.suspected_transfer?.length || 0} يُشتبه بتحويل`}>
        <p className="text-[10px] text-muted mb-1">كل قيد مصروف نقدي غير ملغى يدخل مرة واحدة. السوق من قناة القيد فقط (لا من اسم شركة الشحن). القيود بلا سوق = «غير موزّع». التحويلات بين المحافظ مستبعدة.</p>
        {Object.keys(unallocated.byCategory || {}).length > 0 && <Table head={['تصنيف غير موزّع على سوق', 'بالدولار']} rows={Object.entries(unallocated.byCategory).map(([c, v]) => [c, `$${fmt(v)}`])} />}
        {unallocated.unconverted?.length > 0 && <div className="mt-2"><p className="font-semibold text-red-600">قيود بعملة بلا سعر صرف ({unallocated.unconverted.length})</p><Table head={['التصنيف', 'السوق', 'المبلغ']} rows={Object.values(unallocated.unconverted.reduce((o, u) => { const k = `${u.category}|${u.market}|${u.currency}`; (o[k] ||= [u.category, u.market === 'unallocated' ? 'غير معروف' : MARKET_LABELS[u.market], 0, u.currency]); o[k][2] += u.amount; return o; }, {})).map(([c, m, a, cur]) => [c, m, `${fmt(a)} ${cur}`])} /></div>}
        {skippedAccounting.suspected_transfer?.length > 0 && <div className="mt-2"><p className="font-semibold text-orange-600">مستبعد بالاشتباه بتحويل داخلي — راجعه</p><Table head={['التصنيف', 'المبلغ']} rows={skippedAccounting.suspected_transfer.map(s => [s.category, CUR(Object.fromEntries(Object.entries(s.amounts).filter(([, v]) => v)))])} /></div>}
        <p className="text-[10px] text-muted mt-2">orders.delivery_cost معلومة عن الطلب ولا يُجمع مع مصاريف الشحن. campaigns.spend تحليلي فقط (لا تاريخ إنفاق يومياً موثوقاً).</p>
      </Panel>

      {(data.revenueGaps || []).length > 0 && (
        <Panel icon="🔴" title="طلبات مسلَّمة بلا إيراد محوَّل (لا إيراد ولا تكلفة لها بالأرقام)" count={`${data.revenueGaps.length} طلب`}>
          <p className="text-[10px] text-muted mb-1">إما عملة بلا سعر صرف شهري معتمد لهذا السوق/الشهر، أو قيمة الطلب صفر/غير مسجَّلة. تظهر بعملتها الأصلية ولا تُحوَّل بسعر مفترض.</p>
          <Table head={['الطلب', 'السوق', 'القيمة', 'السبب']} rows={data.revenueGaps.slice(0, 80).map(g => [g.code, MARKET_LABELS[g.market] || g.market, g.currency ? `${fmt(g.amount)} ${g.currency}` : fmt(g.amount), g.why === 'no_fx' ? 'بلا سعر صرف' : g.why === 'no_currency' ? 'بلا عملة' : 'قيمة صفرية'])} />
          {data.revenueGaps.length > 80 && <p className="text-[10px] text-muted mt-1">… و{data.revenueGaps.length - 80} غيرها</p>}
        </Panel>
      )}

      <Panel icon="💱" title="أسعار الصرف الشهرية (إدخال يدوي)" tone="info" count={`${fxRates.length} سجل لهذا الشهر`}>
        <FxPanel month={month} rates={fxRates} closed={closed} actor={actor} onSaved={load} />
      </Panel>

      <ExpenseEditor month={month} expenses={expenses} onSaved={load} closed={closed} actor={actor} />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <StatCard icon="💰" label="صافي الشركة (بعد المصاريف)" value={`$${fmt(totals.netProfit)}`} tone={totals.netProfit>=0?'green':'red'} />
        <StatCard icon="💎" label="منتجات نجوم" value={totals.stars} tone="green" />
        <StatCard icon="🔻" label="خاسرة" value={totals.losers} tone="red" />
        <StatCard icon="⚠️" label="مرتجعات عالية" value={totals.risky} tone="orange" />
      </div>

      <button onClick={()=>setBulk(true)}
        className="w-full py-2.5 rounded-xl bg-teal text-navy text-sm font-bold hover:bg-teal/90 transition flex items-center justify-center gap-2">
        ✏️ أسعار وتكاليف المنتجات حسب السوق
      </button>

      {totals.unset > 0 && (
        <div className="text-xs text-muted bg-surface-alt rounded-xl px-3 py-2.5">
          💡 {totals.unset} صنف بلا تكلفة مؤكدة لهذا الشهر (التكلفة المفقودة ليست صفراً)، وأصناف أخرى بلا إيراد محوَّل لغياب سعر الصرف. أدخل التكاليف من «✏️ أسعار وتكاليف المنتجات حسب السوق»؛ تسري من الشهر المحدّد فقط ولا تُغيّر الأشهر السابقة.
        </div>
      )}

      {reviewList.length > 0 && (
        <Panel icon="🔎" title="قائمة مراجعة الأسعار/التكاليف" count={`${reviewList.length} صنف`}>
          <p className="text-[10px] text-muted mb-1">قيم تاريخها مستنتج من updated_at (ليس من سجل أصلي) أو بنمط متكرر/مشتبه. لا تُعتبر تكلفة فعلية تلقائياً — القرار لك، ولا يُغيَّر أي رقم هنا.</p>
          <Table head={['الصنف', 'قطع', 'سعر/تكلفة', 'تسري من', 'الدليل']} rows={reviewList.slice(0, 60).map(x => [x.name, x.units, `${fmt(x.price)}/${fmt(x.cost)}`, x.versionFrom, x.reasons.join(' · ')])} />
        </Panel>
      )}

      {unmapped.length > 0 && (
        <Panel icon="🔗" title="أسماء منتجات مباعة غير موحَّدة (تظهر باسمها الخام — لا تُدمج تلقائياً)" count={`${unmapped.length} اسم · ${fmt(unmapped.reduce((s, u) => s + u.units, 0))} قطعة`}>
          <ul className="space-y-0.5">{unmapped.map(u => <li key={u.name}>{u.name} <b>({u.units})</b></li>)}</ul>
        </Panel>
      )}

      <div className="flex items-center justify-between pt-1"><h2 className="font-bold text-sm">🏷️ أسعار وتكاليف المنتجات — حسب السوق</h2><span className="text-[10px] text-muted">الإيراد الموزَّع = قيمة الطلب موزَّعة بنسبة الأسعار المرجعية</span></div>
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
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface-alt border border-border text-muted">{MARKET_LABELS[p.market] || p.market}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${flag.cls}`}>{flag.label}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-[11px] text-muted flex-wrap">
                    <span>📦 {p.units} وحدة</span>
                    {p.returns > 0 && <span className={p.returnRate>25?'text-orange-600 font-semibold':''}>↩️ {p.returns} مرتجع مكتمل ({p.returnRate}%)</span>}
                    {p.hasEcon && p.unitProfit !== null && <span>ربح الوحدة: <b className={p.unitProfit>0?'text-green-600':'text-red-600'}>${fmt(p.unitProfit)}</b></span>}
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
                      {p.hasEcon ? 'تعديل' : (p.flag === 'nofx' ? 'الأسعار' : '➕ حدّد')}
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
          <div className="text-center py-10 text-muted text-sm">لا مبيعات بتاريخ تسليم معروف هذا الشهر.</div>
        )}
      </div>

      {editing && <MarketPriceEditor table={data.priceTable || []} focus={editing.name} viewMonth={month} actor={actor} onClose={()=>setEditing(null)} onSaved={()=>{ setEditing(null); load(); }} />}
      {bulk && <MarketPriceEditor table={data.priceTable || []} focus="" viewMonth={month} actor={actor} onClose={()=>setBulk(false)} onSaved={()=>{ setBulk(false); load(); }} />}
    </div>
  );
}
