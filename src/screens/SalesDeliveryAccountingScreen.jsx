// =============================================================
// SalesDeliveryAccountingScreen — محاسبة المبيعات والتسليمات حسب السوق
// الطلب يدخل الحساب بتاريخ انتقاله إلى delivered (لا order_date). غير المسلَّم يُعرض منفصلاً ولا يؤثر على أي رقم.
// الحساب كله في @utils/deliveryAccounting (دوال صرفة مُختبَرة) — الشاشة عرض فقط.
// =============================================================
import { useState, useEffect, useMemo, useCallback } from 'react';
import { loadDeliveryData, loadStoredCommissions } from '@services/deliveryAccountingService';
import { fetchExchangeRateMap } from '@modules/payroll/services/payrollEngine';
import { periodBounds, buildReport, buildProductLines, exportSheets, MARKET_LABELS } from '@utils/deliveryAccounting';
import { normName } from '@utils/profitabilityCalc';
import { STATUSES } from '@data/orderStatus';
import { useToast } from '@hooks/useToast';

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

const TABS = [['sales', '✅ المبيعات المسلَّمة'], ['undelivered', '🚚 غير المسلَّمة'], ['products', '📦 المنتجات'], ['sellers', '👤 الموظفون والعمولات']];

export default function SalesDeliveryAccountingScreen() {
  const toast = useToast();
  const [mode, setMode] = useState('month');
  const [month, setMonth] = useState(thisMonth());
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [includeLegacy, setIncludeLegacy] = useState(true);
  const [f, setF] = useState({ market: 'all', brand: 'all', seller: 'all', status: 'all', carrier: 'all', product: '', currency: 'all' });
  const [tab, setTab] = useState('sales');
  const [data, setData] = useState(null);
  const [rateMap, setRateMap] = useState({ USD: 1 });
  const [commissions, setCommissions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [openSeller, setOpenSeller] = useState(null);

  const period = useMemo(() => {
    if (mode === 'range' && fromDate && toDate && fromDate <= toDate) return periodBounds({ fromDate, toDate });
    if (mode === 'month' && /^\d{4}-\d{2}$/.test(month)) return periodBounds({ month });
    return null;
  }, [mode, month, fromDate, toDate]);

  const load = useCallback(async () => {
    if (!period) return;
    setLoading(true);
    try {
      const [d, rates] = await Promise.all([loadDeliveryData({ period, includeLegacy }), fetchExchangeRateMap().catch(() => ({ USD: 1 }))]);
      setData(d); setRateMap(rates);
      if (mode === 'month') loadStoredCommissions(Number(month.slice(0, 4)), Number(month.slice(5, 7))).then(setCommissions).catch(() => setCommissions([]));
      else setCommissions([]);
    } catch (e) {
      toast?.error?.(e?.message || 'تعذّر تحميل التقرير');
      setData(null);
    } finally { setLoading(false); }
  }, [period, includeLegacy, mode, month, toast]);
  useEffect(() => { load(); }, [load]);

  const base = useMemo(() => (data && period ? buildReport({ rows: data.rows, period, rateMap, includeLegacy, refs: data.refs }) : null), [data, period, rateMap, includeLegacy]);
  const filters = useMemo(() => ({ ...f, product: f.product.trim() }), [f]);
  const report = useMemo(() => (data && period ? buildReport({ rows: data.rows, period, rateMap, includeLegacy, refs: data.refs, filters }) : null), [data, period, rateMap, includeLegacy, filters]);

  const opts = useMemo(() => {
    const all = [...(base?.delivered || []), ...(base?.undelivered || []), ...(base?.returns || [])];
    const uniq = (k) => [...new Set(all.map((o) => o[k]).filter(Boolean))].sort();
    return { sellers: uniq('handler_name'), carriers: uniq('shipping_company'), currencies: uniq('currency'), markets: uniq('market') };
  }, [base]);

  const sellerDetail = useMemo(() => {
    if (!openSeller || !report) return null;
    const mine = (arr) => arr.filter((o) => normName(o.handler_name) === normName(openSeller));
    const delivered = mine(report.delivered), returns = mine(report.returns);
    const monthStart = period?.monthStart || null;
    return { delivered, returns, products: buildProductLines(delivered, returns, { ...data.refs, monthStart }) };
  }, [openSeller, report, data, period]);

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
        <Sel label="العملة" value={f.currency} onChange={set('currency')} options={opts.currencies.map((c) => [c, c])} />
        <label className="text-[11px] text-muted font-semibold flex flex-col gap-1">المنتج<input value={f.product} onChange={(e) => set('product')(e.target.value)} placeholder="اسم المنتج" className="bg-surface border border-border rounded-xl px-2 py-1.5 text-sm text-text" /></label>
        <label className="text-[11px] text-muted font-semibold flex items-center gap-2 col-span-2"><input type="checkbox" checked={includeLegacy} onChange={(e) => setIncludeLegacy(e.target.checked)} />تضمين الطلبات القديمة بلا سجل تسليم (بتاريخ الطلب — تقديري)</label>
        <div className="flex gap-2 items-end col-span-2 md:col-span-1">
          <button onClick={exportExcel} disabled={!report} className="px-3 py-1.5 rounded-xl bg-teal text-white text-sm font-bold disabled:opacity-40">Excel</button>
          <button onClick={exportCsv} disabled={!report} className="px-3 py-1.5 rounded-xl border border-border text-sm font-bold disabled:opacity-40">CSV</button>
        </div>
      </section>

      {!period ? <p className="text-sm text-muted">اختر فترة صحيحة.</p> : loading ? <p className="text-sm text-muted">جارٍ التحميل…</p> : !report ? <p className="text-sm text-red-600">لا بيانات (تحتاج جلسة مدير أو مدير مبيعات).</p> : (
        <>
          <section className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <Stat label="طلبات مسلَّمة بالفترة" value={fmt(report.totals.count)} sub={report.legacyCount ? `منها ${report.legacyCount} بتاريخ تقديري` : null} tone="text-green-600" />
            <Stat label="القيمة الفعلية" value={curText(report.totals.byCurrency)} />
            <Stat label="الموحّدة بالدولار" value={`$${fmt(report.totals.usd)}`} sub={missingFx ? `${missingFx} طلب بلا سعر صرف` : 'بأسعار الصرف المعتمدة الحالية'} tone={missingFx ? 'text-orange-600' : 'text-text'} />
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

          {tab === 'products' && (
            <div className="overflow-x-auto border border-border rounded-2xl">
              <table className="w-full text-xs">
                <thead className="bg-surface-alt text-muted"><tr>{['السوق', 'المنتج', 'الكمية', 'القيمة $', 'التكلفة $', 'ربح الوحدة $', 'الربح $', 'مرتجع', 'تنبيه'].map((h) => <th key={h} className="p-2 text-right whitespace-nowrap">{h}</th>)}</tr></thead>
                <tbody>
                  {report.products.map((p) => (
                    <tr key={`${p.market}|${p.key}`} className="border-t border-border">
                      <td className="p-2">{MARKET_LABELS[p.market] || p.market}</td><td className="p-2">{p.name}{p.mapped ? '' : ' •'}</td>
                      <td className="p-2 font-bold">{fmt(p.qty)}</td><td className="p-2">{fmt(p.value)}</td><td className="p-2">{fmt(p.cost)}</td>
                      <td className="p-2">{fmt(p.unitProfit)}</td><td className="p-2">{fmt(p.profit)}</td><td className="p-2">{fmt(p.returnedQty)}</td>
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
