// =============================================================
// SalesDeliveryAccountingScreen — محاسبة المبيعات والتسليمات حسب السوق
// الطلب يدخل الحساب بتاريخ انتقاله إلى delivered (لا order_date). غير المسلَّم يُعرض منفصلاً ولا يؤثر على أي رقم.
// الحساب كله في @utils/deliveryAccounting (دوال صرفة مُختبَرة) — الشاشة عرض فقط.
// =============================================================
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { loadDeliveryData, loadStoredCommissions, loadCarrierRates, saveCarrierRate } from '@services/deliveryAccountingService';
import { fetchExchangeRateMap } from '@modules/payroll/services/payrollEngine';
import { periodBounds, buildReport, buildProductLines, exportSheets, describeLoadError, MARKET_LABELS } from '@utils/deliveryAccounting';
import { normName } from '@utils/profitabilityCalc';
import { carrierKey, hasDocumentedCost, PAYER_LABELS, RETURN_KIND_LABELS } from '@utils/returnsShipping';
import { rateOverview, RATE_MARKETS, RATE_CURRENCIES, RETURN_POLICY_LABELS } from '@utils/shippingRates';
import { STATUSES } from '@data/orderStatus';
import { useToast } from '@hooks/useToast';
import { useAuth } from '@hooks/useAuth';

const fmt = (n) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(Number(n) || 0);
const curText = (by) => Object.entries(by || {}).map(([c, v]) => `${fmt(v)} ${c}`).join(' + ') || '—';
const thisMonth = () => new Date().toISOString().slice(0, 7);
const WARN = { no_price: '⚠️ بلا سعر', no_cost: '⚠️ بلا تكلفة' };
const SOURCE = { history: 'سجل التسليم', substitute: 'تاريخ بديل', legacy_order_date: 'تقديري (تاريخ الطلب)' };

function Stat({ label, value, sub, tone = 'text-text' }) {
  return (
    <div className="bg-surface border border-border rounded-2xl p-3.5">
      <p className="text-[11px] text-muted font-semibold mb-1">{label}</p>
      <p className={`text-xl font-black ${tone}`}>{value}</p>
      {sub ? <p className="text-[11px] text-muted mt-0.5">{sub}</p> : null}
    </div>
  );
}

function Sel({ label, value, onChange, options }) {
  return (
    <label className="text-[11px] text-muted font-semibold flex flex-col gap-1">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)} className="bg-surface border border-border rounded-xl px-2 py-1.5 text-sm text-text">
        <option value="all">الكل</option>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}

function OrdersTable({ orders, showDelivery = true }) {
  if (!orders.length) return <p className="text-sm text-muted py-4 text-center">لا طلبات</p>;
  return (
    <div className="overflow-x-auto border border-border rounded-2xl">
      <table className="w-full text-xs">
        <thead className="bg-surface-alt text-muted"><tr>
          {['الطلب', 'السوق', 'الحالة', 'البائع', 'العميل', 'الشحن', 'القيمة', showDelivery ? 'تاريخ التسليم' : 'تاريخ الطلب'].map((h) => <th key={h} className="p-2 text-right whitespace-nowrap">{h}</th>)}
        </tr></thead>
        <tbody>
          {orders.slice(0, 500).map((o) => (
            <tr key={o.id} className="border-t border-border">
              <td className="p-2 font-mono">{o.order_code || String(o.id).slice(0, 8)}</td>
              <td className="p-2">{MARKET_LABELS[o.market] || o.market}</td>
              <td className="p-2">{STATUSES[o.status]?.label || o.status}</td>
              <td className="p-2">{o.handler_name || '—'}</td>
              <td className="p-2">{o.customer_name || '—'}</td>
              <td className="p-2">{o.shipping_company || '—'}</td>
              <td className="p-2 whitespace-nowrap">{fmt(o.amount)} {o.currency}</td>
              <td className="p-2 whitespace-nowrap">
                {String(showDelivery ? o.delivery_at : o.order_date).slice(0, 10)}
                {showDelivery && o.delivery_source === 'legacy_order_date' ? <span className="mr-1 text-orange-600" title={SOURCE.legacy_order_date}>~</span> : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {orders.length > 500 ? <p className="text-[11px] text-muted p-2">يُعرض أول 500 من {orders.length} — التصدير يشمل الكل.</p> : null}
    </div>
  );
}

function SimpleTable({ head, rows, empty = 'لا بيانات' }) {
  if (!rows.length) return <p className="text-sm text-muted py-4 text-center">{empty}</p>;
  return (
    <div className="overflow-x-auto border border-border rounded-2xl">
      <table className="w-full text-xs">
        <thead className="bg-surface-alt text-muted"><tr>{head.map((h) => <th key={h} className="p-2 text-right whitespace-nowrap">{h}</th>)}</tr></thead>
        <tbody>{rows.slice(0, 500).map((r, i) => <tr key={i} className="border-t border-border">{r.map((c, j) => <td key={j} className={`p-2 ${c === 'غير موثّق' ? 'text-orange-600' : ''}`}>{c}</td>)}</tr>)}</tbody>
      </table>
      {rows.length > 500 ? <p className="text-[11px] text-muted p-2">يُعرض أول 500 من {rows.length} — التصدير يشمل الكل.</p> : null}
    </div>
  );
}

const EMPTY_FORM = { carrier: '', market: 'syria', currency: 'SYP', outbound: '', returnPolicy: 'unknown', returnFee: '', effectiveFrom: '', note: '' };

function RatesPanel({ rates, knownCarriers, canEdit, missingTable, name, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const overview = useMemo(() => rateOverview(rates), [rates]);
  const setF2 = (k) => (v) => setForm((p) => ({ ...p, [k]: v }));
  const carriers = useMemo(() => [...new Set([...knownCarriers, ...rates.map((r) => carrierKey(r.carrier))])].sort(), [knownCarriers, rates]);
  const submit = async () => {
    if (!form.carrier.trim()) { toast?.error?.('اختر شركة الشحن'); return; }
    if (!(Number(form.outbound) >= 0) || form.outbound === '') { toast?.error?.('أدخل أجرة الذهاب'); return; }
    if (form.returnPolicy === 'fixed' && form.returnFee === '') { toast?.error?.('أدخل مبلغ المرتجع الثابت'); return; }
    setSaving(true);
    try {
      await saveCarrierRate({ carrier: carrierKey(form.carrier), market: form.market, currency: form.currency, outbound: form.outbound, returnPolicy: form.returnPolicy, returnFee: form.returnFee, effectiveFrom: form.effectiveFrom || null, note: form.note, name });
      toast?.success?.('حُفظت التعرفة');
      setForm(EMPTY_FORM);
      await onSaved();
    } catch (e) { toast?.error?.(e?.message || 'تعذّر الحفظ'); } finally { setSaving(false); }
  };
  const inputCls = 'bg-surface border border-border rounded-xl px-2 py-1.5 text-sm text-text';
  return (
    <section className="space-y-3 border border-border rounded-2xl p-3">
      <h3 className="text-sm font-black">⚙️ تعرفة الشحن التقديرية لكل شركة</h3>
      <p className="text-xs text-muted">تُدخَل مرة لكل شركة. التعديل يُضاف بتاريخ سريان جديد ولا يغيّر الأشهر السابقة. هذه تقديرات منفصلة عن الفعلي (delivery_cost) ولا تدخل الرواتب ولا العمولات. الأول لشركة جديدة يجوز بتاريخ قديم ليغطي الأشهر السابقة.</p>
      {missingTable ? <p className="text-xs text-orange-600 bg-orange-500/10 border border-orange-500/20 rounded-xl p-2">جدول التعرفة غير مُطبَّق على القاعدة بعد — لن تظهر تقديرات حتى تُطبَّق الهجرة.</p> : null}
      <SimpleTable
        head={['الشركة', 'السوق', 'أجرة الذهاب الحالية', 'المرتجع', 'يسري من', 'قادم', 'عدد الصفوف']}
        rows={overview.map((g) => [g.carrier, RATE_MARKETS[g.market] || g.market, g.current ? `${fmt(g.current.outbound_fee)} ${g.current.currency}` : 'لا تعرفة سارية', g.current ? `${RETURN_POLICY_LABELS[g.current.return_policy]}${g.current.return_policy === 'fixed' ? ` ${fmt(g.current.return_fee)} ${g.current.currency}` : ''}` : '—', g.current ? String(g.current.effective_from).slice(0, 10) : '—', g.upcoming.length ? g.upcoming.map((r) => `${fmt(r.outbound_fee)} ${r.currency} من ${String(r.effective_from).slice(0, 10)}`).join(' · ') : '—', String(g.history.length)])}
        empty="لا تعرفة مُدخلة بعد"
      />
      {canEdit ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 items-end">
          <label className="text-[11px] text-muted font-semibold flex flex-col gap-1">الشركة
            <input list="carrier-list" value={form.carrier} onChange={(e) => setF2('carrier')(e.target.value)} placeholder="مثل: بابل" className={inputCls} />
            <datalist id="carrier-list">{carriers.map((c) => <option key={c} value={c} />)}</datalist>
          </label>
          <label className="text-[11px] text-muted font-semibold flex flex-col gap-1">السوق
            <select value={form.market} onChange={(e) => setF2('market')(e.target.value)} className={inputCls}>{Object.entries(RATE_MARKETS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          </label>
          <label className="text-[11px] text-muted font-semibold flex flex-col gap-1">العملة
            <select value={form.currency} onChange={(e) => setF2('currency')(e.target.value)} className={inputCls}>{RATE_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}</select>
          </label>
          <label className="text-[11px] text-muted font-semibold flex flex-col gap-1">أجرة الذهاب (للشحنة)
            <input type="number" min="0" step="any" value={form.outbound} onChange={(e) => setF2('outbound')(e.target.value)} className={inputCls} />
          </label>
          <label className="text-[11px] text-muted font-semibold flex flex-col gap-1">سياسة المرتجع
            <select value={form.returnPolicy} onChange={(e) => setF2('returnPolicy')(e.target.value)} className={inputCls}>{Object.entries(RETURN_POLICY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          </label>
          {form.returnPolicy === 'fixed' ? (
            <label className="text-[11px] text-muted font-semibold flex flex-col gap-1">مبلغ المرتجع
              <input type="number" min="0" step="any" value={form.returnFee} onChange={(e) => setF2('returnFee')(e.target.value)} className={inputCls} />
            </label>
          ) : null}
          <label className="text-[11px] text-muted font-semibold flex flex-col gap-1">يسري من (اتركه فارغاً = اليوم)
            <input type="date" value={form.effectiveFrom} onChange={(e) => setF2('effectiveFrom')(e.target.value)} className={inputCls} />
          </label>
          <label className="text-[11px] text-muted font-semibold flex flex-col gap-1">ملاحظة
            <input value={form.note} onChange={(e) => setF2('note')(e.target.value)} className={inputCls} />
          </label>
          <button onClick={submit} disabled={saving} className="px-3 py-1.5 rounded-xl bg-teal text-white text-sm font-bold disabled:opacity-40">{saving ? 'جارٍ الحفظ…' : 'حفظ التعرفة'}</button>
        </div>
      ) : <p className="text-xs text-muted">تعديل التعرفة لمدير الحسابات أو الأدمن فقط.</p>}
    </section>
  );
}

const TABS = [['sales', '✅ المبيعات المسلَّمة'], ['undelivered', '🚚 غير المسلَّمة'], ['returns', '↩️ المرتجعات'], ['shipping', '💳 الشحن والتسويات'], ['products', '📦 المنتجات'], ['sellers', '👤 الموظفون والعمولات']];

export default function SalesDeliveryAccountingScreen() {
  const toast = useToast();
  const { role, name: actorName } = useAuth();
  const [mode, setMode] = useState('month');
  const [month, setMonth] = useState(thisMonth());
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [includeLegacy, setIncludeLegacy] = useState(true);
  const [f, setF] = useState({ market: 'all', brand: 'all', seller: 'all', status: 'all', carrier: 'all', payer: 'all', returnKind: 'all', product: '', currency: 'all' });
  const [tab, setTab] = useState('sales');
  const [data, setData] = useState(null);
  const [rateMap, setRateMap] = useState({ USD: 1 });
  const [commissions, setCommissions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [openSeller, setOpenSeller] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [retryTick, setRetryTick] = useState(0);
  const abortRef = useRef(null);
  const cacheRef = useRef(new Map()); // فترة محمّلة حديثاً لا تُعاد (التبديل للخلف فوري ولا يحمّل القاعدة)
  const reqId = useRef(0); // آخر طلب فقط يُعتمد: ردّ شهر قديم متأخر لا يكتب فوق الشهر الحالي

  const period = useMemo(() => {
    if (mode === 'range' && fromDate && toDate && fromDate <= toDate) return periodBounds({ fromDate, toDate });
    if (mode === 'month' && /^\d{4}-\d{2}$/.test(month)) return periodBounds({ month });
    return null;
  }, [mode, month, fromDate, toDate]);

  const load = useCallback(async () => {
    if (!period) return;
    const id = ++reqId.current;
    abortRef.current?.abort(); // يلغي طلب الفترة السابقة فلا يتراكم حمل على القاعدة
    const ac = new AbortController(); abortRef.current = ac;
    setLoadError(null); setLoading(true); setData(null); setCommissions([]); setOpenSeller(null); // لا أرقام شهر سابق تحت عنوان الشهر الجديد
    const key = `${period.from}|${period.to}|${includeLegacy}`;
    try {
      const hit = cacheRef.current.get(key);
      const fresh = hit && Date.now() - hit.at < 5 * 60 * 1000;
      const [d, rates] = fresh ? [hit.d, hit.rates] : await Promise.all([loadDeliveryData({ period, includeLegacy, signal: ac.signal }), fetchExchangeRateMap().catch(() => ({ USD: 1 }))]);
      if (id !== reqId.current) return; // وصل ردّ متأخر لفترة لم تعد المختارة
      if (!fresh) cacheRef.current.set(key, { d, rates, at: Date.now() });
      setData({ ...d, period }); setRateMap(rates);
      if (mode === 'month') {
        loadStoredCommissions(Number(month.slice(0, 4)), Number(month.slice(5, 7)))
          .then((c) => { if (id === reqId.current) setCommissions(c); })
          .catch(() => { if (id === reqId.current) setCommissions([]); });
      }
    } catch (e) {
      if (id !== reqId.current) return;
      const err = describeLoadError(e);
      if (err.kind === 'aborted') return;
      setLoadError(err.message); setData(null);
      toast?.error?.(err.message);
    } finally { if (id === reqId.current) setLoading(false); }
  }, [period, includeLegacy, mode, month, toast]);
  // تأخير قصير: تبديل الأشهر بسرعة لا يطلق جلباً لكل نقرة
  useEffect(() => { const h = setTimeout(load, 350); return () => clearTimeout(h); }, [load, retryTick]);
  useEffect(() => () => abortRef.current?.abort(), []);

  const base = useMemo(() => (data ? buildReport({ rows: data.rows, period: data.period, rateMap, includeLegacy, refs: data.refs }) : null), [data, rateMap, includeLegacy]);
  const filters = useMemo(() => ({ ...f, product: f.product.trim() }), [f]);
  const report = useMemo(() => (data ? buildReport({ rows: data.rows, period: data.period, rateMap, includeLegacy, refs: data.refs, filters }) : null), [data, rateMap, includeLegacy, filters]);

  const opts = useMemo(() => {
    const all = [...(base?.delivered || []), ...(base?.undelivered || []), ...(base?.returns || [])];
    const uniq = (k) => [...new Set(all.map((o) => o[k]).filter(Boolean))].sort();
    return { sellers: uniq('handler_name'), carriers: [...new Set(all.map((o) => carrierKey(o.shipping_company)))].sort(), currencies: uniq('currency'), markets: uniq('market') };
  }, [base]);

  const reloadRates = useCallback(async () => {
    const { rates, missingTable } = await loadCarrierRates();
    setData((d) => (d ? { ...d, refs: { ...d.refs, carrierRates: rates, ratesMissingTable: missingTable } } : d));
    const k = Array.from(cacheRef.current.keys());
    k.forEach((key) => { const hit = cacheRef.current.get(key); if (hit?.d) cacheRef.current.set(key, { ...hit, d: { ...hit.d, refs: { ...hit.d.refs, carrierRates: rates, ratesMissingTable: missingTable } } }); });
  }, []);

  const sellerDetail = useMemo(() => {
    if (!openSeller || !report) return null;
    const mine = (arr) => arr.filter((o) => normName(o.handler_name) === normName(openSeller));
    const delivered = mine(report.delivered), returns = mine(report.returns);
    const monthStart = data?.period?.monthStart || null;
    return { delivered, returns, products: buildProductLines(delivered, returns, { ...data.refs, monthStart }) };
  }, [openSeller, report, data]);

  const exportExcel = async () => {
    if (!report) return;
    try {
      const XLSX = await import('xlsx');
      const sheets = exportSheets(report, { sellerCommissions: commissions });
      const wb = XLSX.utils.book_new();
      Object.entries(sheets).forEach(([name, aoa]) => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), name.slice(0, 31)));
      XLSX.writeFile(wb, `sales-delivery-${report.period.label.replace(/\s|→/g, '_')}.xlsx`);
    } catch (e) { toast?.error?.(e?.message || 'فشل التصدير'); }
  };
  const exportCsv = () => {
    if (!report) return;
    const sheets = exportSheets(report, { sellerCommissions: commissions });
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const text = Object.entries(sheets).map(([n, aoa]) => `# ${n}\n${aoa.map((r) => r.map(esc).join(',')).join('\n')}`).join('\n\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' }));
    a.download = `sales-delivery-${report.period.label.replace(/\s|→/g, '_')}.csv`;
    a.click(); URL.revokeObjectURL(a.href);
  };

  const set = (k) => (v) => setF((p) => ({ ...p, [k]: v }));
  const missingFx = report?.totals?.usdMissing || 0;

  return (
    <div className="p-4 space-y-4 max-w-6xl mx-auto" dir="rtl">
      <header>
        <h1 className="text-xl font-black text-text">🧮 محاسبة المبيعات والتسليمات حسب السوق</h1>
        <p className="text-xs text-muted mt-1">معيار الإدخال: <b>تاريخ انتقال الطلب إلى «تم التسليم»</b> — الطلبات قيد التجهيز/الشحن تظهر بقيمها لكنها لا تدخل المبيعات ولا العمولات ولا الرواتب.</p>
      </header>

      <section className="bg-surface border border-border rounded-2xl p-3 grid grid-cols-2 md:grid-cols-4 gap-2">
        <label className="text-[11px] text-muted font-semibold flex flex-col gap-1">الفترة
          <select value={mode} onChange={(e) => setMode(e.target.value)} className="bg-surface border border-border rounded-xl px-2 py-1.5 text-sm text-text">
            <option value="month">شهر</option><option value="range">مدى مخصص</option>
          </select>
        </label>
        {mode === 'month'
          ? <label className="text-[11px] text-muted font-semibold flex flex-col gap-1">الشهر<input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="bg-surface border border-border rounded-xl px-2 py-1.5 text-sm text-text" /></label>
          : <>
            <label className="text-[11px] text-muted font-semibold flex flex-col gap-1">من<input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="bg-surface border border-border rounded-xl px-2 py-1.5 text-sm text-text" /></label>
            <label className="text-[11px] text-muted font-semibold flex flex-col gap-1">إلى<input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="bg-surface border border-border rounded-xl px-2 py-1.5 text-sm text-text" /></label>
          </>}
        <Sel label="السوق" value={f.market} onChange={set('market')} options={opts.markets.map((m) => [m, MARKET_LABELS[m] || m])} />
        <Sel label="البراند" value={f.brand} onChange={set('brand')} options={[['lowes', 'lowe\'s'], ['strong', 'Strong']]} />
        <Sel label="الموظف / البائع" value={f.seller} onChange={set('seller')} options={opts.sellers.map((s) => [s, s])} />
        <Sel label="الحالة" value={f.status} onChange={set('status')} options={Object.entries(STATUSES).map(([k, v]) => [k, v.label])} />
        <Sel label="شركة الشحن" value={f.carrier} onChange={set('carrier')} options={opts.carriers.map((c) => [c, c])} />
        <Sel label="دافع الشحن" value={f.payer} onChange={set('payer')} options={Object.entries(PAYER_LABELS)} />
        <Sel label="نوع المرتجع / عدم الاستلام" value={f.returnKind} onChange={set('returnKind')} options={Object.entries(RETURN_KIND_LABELS)} />
        <Sel label="العملة" value={f.currency} onChange={set('currency')} options={opts.currencies.map((c) => [c, c])} />
        <label className="text-[11px] text-muted font-semibold flex flex-col gap-1">المنتج<input value={f.product} onChange={(e) => set('product')(e.target.value)} placeholder="اسم المنتج" className="bg-surface border border-border rounded-xl px-2 py-1.5 text-sm text-text" /></label>
        <label className="text-[11px] text-muted font-semibold flex items-center gap-2 col-span-2"><input type="checkbox" checked={includeLegacy} onChange={(e) => setIncludeLegacy(e.target.checked)} />تضمين الطلبات القديمة بلا سجل تسليم (بتاريخ الطلب — تقديري)</label>
        <div className="flex gap-2 items-end col-span-2 md:col-span-1">
          <button onClick={exportExcel} disabled={!report} className="px-3 py-1.5 rounded-xl bg-teal text-white text-sm font-bold disabled:opacity-40">Excel</button>
          <button onClick={exportCsv} disabled={!report} className="px-3 py-1.5 rounded-xl border border-border text-sm font-bold disabled:opacity-40">CSV</button>
        </div>
      </section>

      {!period ? <p className="text-sm text-muted">اختر فترة صحيحة.</p> : loading ? <p className="text-sm text-muted">جارٍ التحميل…</p> : !report ? (
        <div className="text-sm text-red-600 bg-red-500/10 border border-red-500/20 rounded-xl p-3 space-y-2">
          <p>{loadError || 'لا بيانات.'}</p>
          <button onClick={() => { cacheRef.current.clear(); setRetryTick((t) => t + 1); }} className="px-3 py-1.5 rounded-xl bg-teal text-white font-bold">إعادة المحاولة</button>
        </div>
      ) : (
        <>
          <p className="text-xs text-muted">الفترة المعروضة: <b className="text-text">{report.period.label}</b></p>
          <section className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <Stat label="طلبات مسلَّمة بالفترة" value={fmt(report.totals.count)} sub={report.legacyCount ? `منها ${report.legacyCount} بتاريخ تقديري` : null} tone="text-green-600" />
            <Stat label="القيمة الفعلية" value={curText(report.totals.byCurrency)} />
            <Stat label="الموحّدة بالدولار" value={`$${fmt(report.totals.usd)}`} sub={missingFx ? `${missingFx} طلب بلا سعر صرف` : 'بأسعار الصرف المعتمدة الحالية'} tone={missingFx ? 'text-orange-600' : 'text-text'} />
            <Stat label="الوضع الحالي — حالياً (لا يُنسب للشهر)" value={`${fmt(report.currentPending.returning.length)} راجع للمركز · ${fmt(report.currentPending.not_received.length)} لم يُستلم`} sub="orders.status الآن بلا نافذة زمنية؛ لا يدخل مبيعات ولا عمولات ولا رواتب" tone="text-orange-600" />
            <Stat label="حالات حدثت بالفترة" value={`${fmt(report.returnsInfo.byKind.reliable.orders)} مرتجع موثوق · ${fmt(report.periodPending.returning.length)} راجع · ${fmt(report.periodPending.not_received.length)} لم يُستلم`} sub={`توقيت غير معروف (خارج أي شهر): ${fmt(report.unknownTiming.length)}`} />
            <Stat label="خارج الحساب (غير مسلَّمة)" value={fmt(report.undelivered.length)} sub={`مرتجعات بالفترة: ${report.returns.length}`} tone="text-orange-600" />
          </section>
          {(report.settledNoDelivery.length || report.legacyExcluded.length) ? (
            <p className="text-xs text-orange-600 bg-orange-500/10 border border-orange-500/20 rounded-xl p-2">
              {report.settledNoDelivery.length ? `⚠️ ${report.settledNoDelivery.length} طلب «تمت التسوية» بلا تسليم سابق — لم يُحتسب بيعاً (للمراجعة). ` : ''}
              {report.legacyExcluded.length ? `ℹ️ ${report.legacyExcluded.length} طلب مسلَّم بلا سجل تسليم مُستبعَد من الأرقام.` : ''}
            </p>
          ) : null}

          <nav className="flex gap-1 overflow-x-auto">
            {TABS.map(([k, l]) => <button key={k} onClick={() => setTab(k)} className={`px-3 py-1.5 rounded-xl text-sm font-bold whitespace-nowrap ${tab === k ? 'bg-teal text-white' : 'bg-surface border border-border text-muted'}`}>{l}</button>)}
          </nav>

          {tab === 'sales' && (
            <div className="space-y-3">
              <div className="grid md:grid-cols-3 gap-2">
                {report.byMarket.map((m) => <Stat key={m.key} label={MARKET_LABELS[m.key] || m.key} value={`${fmt(m.count)} طلب`} sub={`${curText(m.byCurrency)} · $${fmt(m.usd)}${m.usdMissing ? ' (+ بلا سعر صرف)' : ''}`} />)}
              </div>
              <OrdersTable orders={report.delivered} />
            </div>
          )}

          {tab === 'undelivered' && (
            <div className="space-y-3">
              <p className="text-xs text-muted">كل ما في هذا القسم خارج المبيعات والعمولات والرواتب. يُعرض كما هو الآن (قبل نهاية الفترة).</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {report.undeliveredByGroup.map((g) => <Stat key={g.group} label={g.label} value={`${fmt(g.count)} طلب`} sub={`${curText(g.byCurrency)}${g.usd ? ` · $${fmt(g.usd)}` : ''}`} />)}
              </div>
              <OrdersTable orders={report.undelivered} showDelivery={false} />
              {report.returns.length ? <><h3 className="text-sm font-black">مرتجعات الفترة (لا تُحتسب بيعاً)</h3><OrdersTable orders={report.returns.map((o) => ({ ...o, delivery_at: o.return_at || o.order_date }))} /></> : null}
            </div>
          )}

          {tab === 'returns' && (
            <div className="space-y-4">
              <p className="text-xs text-muted">القيمة = orders.amount الفعلية. ما لا تثبته البيانات يظهر «غير موثّق» لا صفراً. الأقسام الثلاثة منفصلة: لا يُجمع الوضع الحالي مع ما حدث بالفترة، ولا يدخل أي منها مبيعات أو عمولات أو رواتب.</p>

              <section className="space-y-2 border border-teal/30 rounded-2xl p-3">
                <h3 className="text-sm font-black">① الوضع الحالي — حالياً (orders.status الآن، بلا نافذة زمنية، لا يُنسب للشهر المختار)</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {['returning', 'not_received'].map((k) => {
                    const g = report.currentInfo.byKind[k];
                    return <Stat key={k} label={`${RETURN_KIND_LABELS[k]} — حالياً`} value={`${fmt(g.orders)} طلب · ${fmt(g.pieces)} قطعة`} sub={`${curText(g.byCurrency)}${g.usd ? ` · $${fmt(g.usd)}` : ''}${g.usdMissing ? ` · ${g.usdMissing} بلا سعر صرف` : ''}`} />;
                  })}
                </div>
                <SimpleTable
                  head={['الطلب', 'السوق', 'الحالة الحالية', 'منذ', 'تاريخ الطلب', 'البائع', 'الشحن', 'القيمة', 'القطع', 'تكلفة الشحن']}
                  rows={[...report.currentPending.returning, ...report.currentPending.not_received].map((o) => [o.order_code || o.order_id || String(o.id).slice(0, 8), MARKET_LABELS[o.market] || o.market, RETURN_KIND_LABELS[o.status], o.status_since ? String(o.status_since).slice(0, 10) : 'غير معروف', String(o.order_date || '').slice(0, 10), o.handler_name || '—', carrierKey(o.shipping_company), `${fmt(o.amount)} ${o.currency}`, fmt(o.pieces), hasDocumentedCost(o) ? `${fmt(o.delivery_cost)} ${o.currency}` : 'غير موثّق'])}
                  empty="لا طلبات راجعة أو غير مستلمة حالياً"
                />
              </section>

              <section className="space-y-2 border border-border rounded-2xl p-3">
                <h3 className="text-sm font-black">② حالات حدثت خلال الفترة (order_status_history.changed_at داخل الفترة)</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {[['مرتجع موثوق (إرجاع نهائي بالفترة)', report.returnsInfo.byKind.reliable], ['راجع للمركز — حدث بالفترة', report.returnsInfo.byKind.returning], ['لم يُستلم — حدث بالفترة', report.returnsInfo.byKind.not_received]].map(([label, g]) => (
                    <Stat key={label} label={label} value={`${fmt(g.orders)} طلب · ${fmt(g.pieces)} قطعة`} sub={`${curText(g.byCurrency)}${g.usd ? ` · $${fmt(g.usd)}` : ''}${g.usdMissing ? ` · ${g.usdMissing} بلا سعر صرف` : ''}`} />
                  ))}
                </div>
                <p className="text-xs text-muted">
                  خرجت ثم رجعت (بالسجل، للمرتجع الموثوق): <b>{fmt(report.returnsInfo.deliveredBeforeReturn)}</b> · استرداد للمخزون موثّق: <b>{fmt(report.returnsInfo.restockDocumented)}</b> / غير موثّق: <b>{fmt(report.returnsInfo.restockUndocumented)}</b>
                  {report.returnsInfo.historyConflict ? <> · <span className="text-orange-600">سجل حالات متناقض: {fmt(report.returnsInfo.historyConflict)}</span></> : null}
                  . أحداث راجع/لم يُستلم قد تعود لطلبات تغيّرت حالتها لاحقاً (تظهر بعمود «الحالة الآن»).
                </p>
                <SimpleTable
                  head={['الطلب', 'السوق', 'النوع', 'تاريخ الحدث', 'الحالة الآن', 'البائع', 'الشحن', 'القيمة', 'القطع', 'تكلفة الشحن']}
                  rows={[...report.returns.map((o) => ({ ...o, event_at: o.return_at, current_status: o.status })), ...report.periodPending.returning, ...report.periodPending.not_received].map((o) => [o.order_code || o.order_id || String(o.id).slice(0, 8), MARKET_LABELS[o.market] || o.market, RETURN_KIND_LABELS[o.return_kind || o.status], String(o.event_at || '').slice(0, 10), STATUSES[o.current_status || o.status]?.label || o.status, o.handler_name || '—', carrierKey(o.shipping_company), `${fmt(o.amount)} ${o.currency}`, fmt(o.pieces ?? 0), hasDocumentedCost(o) ? `${fmt(o.delivery_cost)} ${o.currency}` : 'غير موثّق'])}
                  empty="لا أحداث بالفترة"
                />
              </section>

              <section className="space-y-2 border border-orange-500/30 rounded-2xl p-3">
                <h3 className="text-sm font-black">③ توقيت غير معروف — لا يُنسب لأي شهر</h3>
                <Stat label={RETURN_KIND_LABELS.unknown_timing} value={`${fmt(report.returnsInfo.byKind.unknown_timing.orders)} طلب · ${fmt(report.returnsInfo.byKind.unknown_timing.pieces)} قطعة`} sub={`${curText(report.returnsInfo.byKind.unknown_timing.byCurrency)}${report.returnsInfo.byKind.unknown_timing.usd ? ` · $${fmt(report.returnsInfo.byKind.unknown_timing.usd)}` : ''}`} tone="text-orange-600" />
                <SimpleTable
                  head={['الطلب', 'السوق', 'الحالة الآن', 'السبب', 'تاريخ الطلب', 'البائع', 'الشحن', 'القيمة', 'القطع']}
                  rows={report.unknownTiming.map((o) => [o.order_code || o.order_id || String(o.id).slice(0, 8), MARKET_LABELS[o.market] || o.market, STATUSES[o.status]?.label || o.status, o.unknown_reason === 'bulk_event' ? 'تحديث جماعي' : o.unknown_reason === 'no_history' ? 'بلا سجل' : 'بلا تاريخ إرجاع', String(o.order_date || '').slice(0, 10), o.handler_name || '—', carrierKey(o.shipping_company), `${fmt(o.amount)} ${o.currency}`, fmt(o.pieces ?? 0)])}
                  empty="لا حالات بتوقيت غير معروف"
                />
              </section>
            </div>
          )}

          {tab === 'shipping' && (
            <div className="space-y-3">
              <p className="text-xs text-muted">تكلفة الشحن «موثّقة» فقط حين delivery_cost &gt; 0. الدافع الافتراضي «علينا» لا يُعدّ دليلاً. تكلفة العميل لا تدخل إيراداً ولا مصروفاً علينا ولا تُخلط بقيمة الطلب.</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <Stat label="تكلفة شحن على العميل (موثّقة)" value={curText(report.shipping.totals.customer.byCurrency)} sub={`${fmt(report.shipping.totals.customer.orders)} طلب${report.shipping.totals.customer.usd ? ` · $${fmt(report.shipping.totals.customer.usd)}` : ''}`} />
                <Stat label="تكلفة شحن علينا (موثّقة)" value={curText(report.shipping.totals.company.byCurrency)} sub={`${fmt(report.shipping.totals.company.orders)} طلب${report.shipping.totals.company.usd ? ` · $${fmt(report.shipping.totals.company.usd)}` : ''}`} />
                <Stat label="تكلفة شحن غير موثّقة" value={`${fmt(report.shipping.totals.unknownOrders)} طلب`} sub={`من ${fmt(report.shipping.totals.orders)} (مسلَّم + مرتجع + عدم استلام)`} tone="text-orange-600" />
              </div>
              <SimpleTable
                head={['شركة الشحن', 'الدافع', 'الطلبات', 'التكلفة الموثّقة', 'بالدولار']}
                rows={report.shipping.rows.map((g) => [g.carrier, PAYER_LABELS[g.payer], fmt(g.orders), g.payer === 'unknown' ? 'غير موثّق' : curText(g.byCurrency), g.payer === 'unknown' ? 'غير موثّق' : (g.usdMissing ? `$${fmt(g.usd)} (+ بلا سعر صرف)` : `$${fmt(g.usd)}`)])}
              />
              <section className="space-y-2 border border-border rounded-2xl p-3">
                <h3 className="text-sm font-black">💡 تكلفة الشحن التقديرية (من تعرفة الشركات) — منفصلة عن الفعلي</h3>
                <p className="text-xs text-muted">يُحسب: أجرة الذهاب لكل شحنة بلا تكلفة موثّقة دافعها «علينا» أو غير مؤكد، + أجرة المرتجع للمرتجع النهائي حسب سياسة الشركة. «على العميل» لا يُقدَّر. الفعلي الموثّق يغلب التقدير. طلب بلا تعرفة لشركته يظهر «بلا تعرفة» لا صفراً.</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <Stat label="ذهاب تقديري علينا" value={curText(report.shippingEstimate.totals.outbound)} sub={`${fmt(report.shippingEstimate.totals.estimated)} شحنة${report.shippingEstimate.totals.usdOutbound ? ` · $${fmt(report.shippingEstimate.totals.usdOutbound)}` : ''} · منها الدافع غير مؤكد ${fmt(report.shippingEstimate.totals.payerUnconfirmed)}`} />
                  <Stat label="مرتجع تقديري علينا" value={curText(report.shippingEstimate.totals.returnFee)} sub={`${report.shippingEstimate.totals.usdReturn ? `$${fmt(report.shippingEstimate.totals.usdReturn)} · ` : ''}سياسة غير معروفة: ${fmt(report.shippingEstimate.totals.returnUnknown)} · معلّق: ${fmt(report.shippingEstimate.totals.returnPending)}`} />
                  <Stat label="فعلي موثّق (علينا)" value={curText(report.shippingEstimate.totals.actualByCurrency)} sub={`${fmt(report.shippingEstimate.totals.actual)} طلب`} />
                  <Stat label="بلا تعرفة / على العميل" value={`${fmt(report.shippingEstimate.totals.noRate)} بلا تعرفة · ${fmt(report.shippingEstimate.totals.customerPaid)} على العميل`} sub="لا تدخل التقدير" tone={report.shippingEstimate.totals.noRate ? 'text-orange-600' : 'text-text'} />
                </div>
                <SimpleTable
                  head={['الشركة', 'طلبات', 'مُقدَّرة', 'فعلية', 'على العميل', 'بلا تعرفة', 'ذهاب تقديري', 'مرتجع تقديري', 'مرتجع بسياسة مجهولة']}
                  rows={report.shippingEstimate.rows.map((g) => [g.carrier, fmt(g.orders), fmt(g.estimated), fmt(g.actual), fmt(g.customerPaid), g.noRate ? `${fmt(g.noRate)}` : '0', g.estimated ? curText(g.outbound) : 'غير موثّق', g.estimated ? curText(g.returnFee) : 'غير موثّق', fmt(g.returnUnknown)])}
                  empty="لا بيانات"
                />
              </section>
              <RatesPanel rates={data.refs.carrierRates || []} knownCarriers={opts.carriers} canEdit={['admin', 'manager'].includes(role)} missingTable={!!data.refs.ratesMissingTable} name={actorName} onSaved={reloadRates} />
              <h3 className="text-sm font-black">التسويات (settled) — بتاريخ التسوية (order_status_history) داخل الفترة؛ لا تدخل المبيعات ولا العمولات ولا الرواتب</h3>
              <SimpleTable
                head={['الطلب', 'السوق', 'تاريخ التسوية', 'تاريخ الطلب', 'مسار الحالات', 'سبق التسوية تسليم؟', 'القيمة', 'المحصّل', 'تكلفة الشحن']}
                rows={report.settlements.map((o) => [o.order_code || o.order_id || String(o.id).slice(0, 8), MARKET_LABELS[o.market] || o.market, String(o.settled_at || '').slice(0, 10), String(o.order_date || '').slice(0, 10), o.path, o.delivered_before ? 'نعم' : 'لا', `${fmt(o.amount)} ${o.currency}`, o.collected_known ? `${fmt(o.paid_amount)} ${o.currency}` : 'غير موثّق', o.shipping_documented ? `${fmt(o.delivery_cost)} ${o.currency}` : 'غير موثّق'])}
                empty="لا تسويات بتاريخ تسوية داخل هذه الفترة"
              />
              {report.settlementsUnknown.length ? (
                <>
                  <h3 className="text-sm font-black text-orange-600">تسويات بتاريخ غير معروف (لا حدث تسوية بالسجل) — لا تُنسب لشهر</h3>
                  <SimpleTable
                    head={['الطلب', 'السوق', 'تاريخ الطلب', 'مسار الحالات', 'القيمة', 'المحصّل']}
                    rows={report.settlementsUnknown.map((o) => [o.order_code || o.order_id || String(o.id).slice(0, 8), MARKET_LABELS[o.market] || o.market, String(o.order_date || '').slice(0, 10), o.path, `${fmt(o.amount)} ${o.currency}`, o.collected_known ? `${fmt(o.paid_amount)} ${o.currency}` : 'غير موثّق'])}
                  />
                </>
              ) : null}
            </div>
          )}

          {tab === 'products' && (
            <div className="overflow-x-auto border border-border rounded-2xl">
              <table className="w-full text-xs">
                <thead className="bg-surface-alt text-muted"><tr>{['السوق', 'المنتج', 'الكمية', 'القيمة $', 'التكلفة $', 'ربح الوحدة $', 'الربح $', 'مرتجع موثوق', 'مرتجع غير موثوق', 'تنبيه'].map((h) => <th key={h} className="p-2 text-right whitespace-nowrap">{h}</th>)}</tr></thead>
                <tbody>
                  {report.products.map((p) => (
                    <tr key={`${p.market}|${p.key}`} className="border-t border-border">
                      <td className="p-2">{MARKET_LABELS[p.market] || p.market}</td><td className="p-2">{p.name}{p.mapped ? '' : ' •'}</td>
                      <td className="p-2 font-bold">{fmt(p.qty)}</td><td className="p-2">{fmt(p.value)}</td><td className="p-2">{fmt(p.cost)}</td>
                      <td className="p-2">{fmt(p.unitProfit)}</td><td className="p-2">{fmt(p.profit)}</td><td className="p-2">{fmt(p.returnedQty)}</td><td className="p-2 text-orange-600">{p.returnedUnknownQty ? fmt(p.returnedUnknownQty) : '—'}</td>
                      <td className="p-2 text-orange-600">{WARN[p.warning] || ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-[11px] text-muted p-2">القيمة هنا تحليلية = الكمية × سعر المنتج بنسخة الشهر. إجمالي الطلب الفعلي يبقى من orders.amount. «•» = اسم غير موحَّد.</p>
            </div>
          )}

          {tab === 'sellers' && (
            <div className="space-y-3">
              <div className="overflow-x-auto border border-border rounded-2xl">
                <table className="w-full text-xs">
                  <thead className="bg-surface-alt text-muted"><tr>{['الموظف', 'طلبات مسلَّمة', 'إجمالي المبيعات', 'بالدولار', 'عمولة الرواتب $', ''].map((h) => <th key={h} className="p-2 text-right">{h}</th>)}</tr></thead>
                  <tbody>
                    {report.bySeller.map((s) => {
                      const c = commissions.find((x) => normName(x.name) === normName(s.key));
                      return (
                        <tr key={s.key} className="border-t border-border">
                          <td className="p-2 font-bold">{s.key}</td><td className="p-2">{fmt(s.count)}</td><td className="p-2">{curText(s.byCurrency)}</td><td className="p-2">${fmt(s.usd)}</td>
                          <td className="p-2">{c ? `$${fmt(c.commission)}` : '—'}</td>
                          <td className="p-2"><button className="text-teal font-bold" onClick={() => setOpenSeller(openSeller === s.key ? null : s.key)}>{openSeller === s.key ? 'إخفاء' : 'تفاصيل الطلبات'}</button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <p className="text-[11px] text-muted p-2">العمولة تُقرأ من مسيّر الرواتب المحسوب لهذا الشهر (إن وُجد). المصدر الحسابي واحد: الطلبات المسلَّمة في الفترة.</p>
              </div>
              {sellerDetail ? (
                <div className="bg-surface border border-border rounded-2xl p-3 space-y-2">
                  <h3 className="font-black text-sm">{openSeller}: {sellerDetail.delivered.length} طلب مسلَّم · {sellerDetail.returns.length} مرتجع</h3>
                  <p className="text-xs text-muted">المنتجات: {sellerDetail.products.map((p) => `${p.name} ×${p.qty}`).join(' · ') || '—'}</p>
                  <OrdersTable orders={sellerDetail.delivered} />
                </div>
              ) : null}
            </div>
          )}
        </>
      )}
    </div>
  );
}
