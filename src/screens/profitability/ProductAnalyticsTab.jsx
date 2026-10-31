// =============================================================
// ProductAnalyticsTab — تحليل مبيعات وتكلفة المنتجات حسب السوق (تبويب داخل صفحة الربحية)
// الأرقام كلها من نفس محرك الربحية (computeMonthly) عبر @utils/productAnalytics — لا حساب موازٍ.
// النطاق: الربح الإجمالي = قيمة المبيعات − تكلفة المنتجات (بلا مصاريف تشغيلية).
// =============================================================
import { useState, useEffect, useCallback, useMemo, lazy, Suspense } from 'react';
import { loadProductAnalytics } from '@services/profitabilityService';
import {
  MARKET_LABELS, STATUS_BUCKET_LABELS, buildMarketProductReport, combineReports, compareMonths, filterRows, rankProducts, exportSheets,
} from '@utils/productAnalytics';
import { useToast } from '@hooks/useToast';

const fmt = (n, d = 1) => new Intl.NumberFormat('en-US', { maximumFractionDigits: d }).format(Number(n) || 0);
const usd = (n) => `${fmt(n, 2)}$`;
const native = (o) => Object.entries(o || {}).filter(([, v]) => v).map(([k, v]) => `${fmt(v, 0)} ${k}`).join(' + ') || '—';
const thisMonth = () => new Date().toISOString().slice(0, 7);
const MARKETS = ['all', 'syria', 'turkey', 'uae'];
const BRANDS = [{ key: 'lowes', label: "🌿 LOWE'S" }, { key: 'strong', label: '💊 سترونغ' }, { key: 'all', label: 'الكل' }];
const VIEWS = { sold: 'المباع (مسلَّم)', returned: 'المرتجع المكتمل', ...STATUS_BUCKET_LABELS };
const KIND_LABEL = { sale: 'بيع', free: 'مجاني', no_value: 'بلا قيمة', no_fx: 'بلا سعر صرف', return: 'مرتجع' };

const TrendChart = lazy(() => import('recharts').then((m) => ({
  default: function ProductTrend({ data }) {
    const { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } = m;
    return (
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--color-border) / 0.15)" />
          <XAxis dataKey="label" tick={{ fill: 'rgb(var(--color-muted))', fontSize: 11 }} />
          <YAxis tick={{ fill: 'rgb(var(--color-muted))', fontSize: 11 }} width={44} />
          <Tooltip contentStyle={{ background: 'rgb(var(--color-surface))', border: '1px solid rgb(var(--color-border) / 0.15)', borderRadius: 8, color: 'rgb(var(--color-text))' }} formatter={(v) => `${fmt(v, 2)}$`} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Line type="monotone" dataKey="salesUsd" name="المبيعات" stroke="#0f766e" strokeWidth={2} />
          <Line type="monotone" dataKey="cogs" name="تكلفة المنتجات" stroke="#ea580c" strokeWidth={2} />
          <Line type="monotone" dataKey="grossProfit" name="الربح الإجمالي" stroke="#1e3a8a" strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    );
  },
})));

function Kpi({ icon, label, value, sub, tone = 'text-text', onClick }) {
  return (
    <button type="button" onClick={onClick} className="text-start bg-surface border border-border rounded-2xl p-3.5 hover:border-navy/40 transition">
      <div className="flex items-center gap-1.5 mb-1"><span>{icon}</span><span className="text-[11px] text-muted font-semibold">{label}</span></div>
      <p className={`text-xl font-black ${tone}`}>{value}</p>
      {sub && <p className="text-[10px] text-muted mt-0.5">{sub}</p>}
    </button>
  );
}

function Sheet({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center" onClick={onClose} dir="rtl">
      <div className="bg-surface w-full sm:max-w-2xl max-h-[85vh] rounded-t-2xl sm:rounded-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-3 border-b border-border">
          <h3 className="text-sm font-extrabold text-text">{title}</h3>
          <button onClick={onClose} className="text-muted text-lg px-2" aria-label="إغلاق">✕</button>
        </div>
        <div className="overflow-y-auto p-3 text-xs space-y-2">{children}</div>
      </div>
    </div>
  );
}

const Line2 = ({ k, v }) => <div className="flex justify-between gap-3 border-b border-border/40 py-1"><span className="text-muted">{k}</span><span className="font-bold text-text text-end">{v}</span></div>;

function periodOf(mode, month, year, from, to) {
  if (mode === 'year') { const now = thisMonth(); const end = `${year}-12` > now ? now : `${year}-12`; return { fromMonth: `${year}-01`, toMonth: end, label: `سنة ${year}` }; }
  if (mode === 'range') { const [a, b] = from <= to ? [from, to] : [to, from]; return { fromMonth: a, toMonth: b, label: `${a} ← ${b}` }; }
  return { fromMonth: month, toMonth: month, label: month };
}

export default function ProductAnalyticsTab() {
  const toast = useToast();
  const [mode, setMode] = useState('month');
  const [month, setMonth] = useState(thisMonth);
  const [year, setYear] = useState(() => thisMonth().slice(0, 4));
  const [from, setFrom] = useState(() => `${thisMonth().slice(0, 4)}-01`);
  const [to, setTo] = useState(thisMonth);
  const [brand, setBrand] = useState('lowes');
  const [market, setMarket] = useState('syria');
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [view, setView] = useState('sold');
  const [onlyWithSales, setOnlyWithSales] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState(null);   // {type:'kpi'|'product', ...}

  const period = useMemo(() => periodOf(mode, month, year, from, to), [mode, month, year, from, to]);
  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await loadProductAnalytics({ fromMonth: period.fromMonth, toMonth: period.toMonth, brand })); }
    catch (e) { toast.error(e.message || 'تعذّر تحميل التحليل'); }
    finally { setLoading(false); }
  }, [period.fromMonth, period.toMonth, brand, toast]);
  useEffect(() => { load(); }, [load]);

  const view$ = useMemo(() => {
    if (!data) return null;
    const opts = (m) => ({ market: m, categoryIndex: data.categoryIndex });
    const perMonth = data.months.map((x) => buildMarketProductReport(x.result, { ...opts(market), statusBreakdown: x.statusBreakdown }));
    const combined = combineReports(perMonth);
    const series = compareMonths(perMonth).map((s) => ({ ...s, label: s.month.slice(0, 7) }));
    const markets = ['syria', 'turkey', 'uae'].map((m) => ({ market: m, ...combineReports(data.months.map((x) => buildMarketProductReport(x.result, { ...opts(m), statusBreakdown: x.statusBreakdown }))).totals }));
    const rows = filterRows(combined.rows, { q, category, aliasIndex: data.aliasIndex, onlyWithSales: onlyWithSales && view === 'sold' })
      .filter((r) => view === 'sold' || (view === 'returned' ? r.returnedUnits > 0 : (r.statusUnits[view] || 0) > 0));
    const fx = data.months.flatMap((x) => x.fxRates);
    return { combined, series, markets, rows, rank: rankProducts(combined.rows), fx };
  }, [data, market, q, category, onlyWithSales, view]);

  const title = `${MARKET_LABELS[market]} — ${period.label}${brand === 'all' ? '' : brand === 'lowes' ? " · LOWE'S" : ' · سترونغ'}`;
  const exportExcel = async () => {
    if (!view$) return;
    try {
      const XLSX = await import('xlsx');
      const sheets = exportSheets({ ...view$.combined, rows: view$.rows }, { title, fxRates: view$.fx, monthSeries: view$.series.length > 1 ? view$.series : null, fetchedAt: data.fetchedAt });
      const wb = XLSX.utils.book_new();
      Object.entries(sheets).forEach(([n, aoa]) => { const ws = XLSX.utils.aoa_to_sheet(aoa); ws['!views'] = [{ RTL: true }]; XLSX.utils.book_append_sheet(wb, ws, n.slice(0, 31)); });
      XLSX.writeFile(wb, `product-analytics-${market}-${period.fromMonth}${period.toMonth !== period.fromMonth ? `_${period.toMonth}` : ''}.xlsx`);
    } catch (e) { toast.error(e?.message || 'فشل التصدير'); }
  };
  const print = async () => {
    if (!view$) return;
    const { exportReport } = await import('@modules/analytics/services/exportService');
    const t = view$.combined.totals;
    const columns = [['name', 'المنتج'], ['qty', 'الكمية'], ['unitCost', 'تكلفة الوحدة $'], ['cost', 'إجمالي التكلفة $'], ['sales', 'قيمة المبيعات $'], ['native', 'بالعملة الأصلية'], ['profit', 'الربح $']].map(([key, label]) => ({ key, label }));
    const rows = view$.rows.map((r) => ({ name: r.name, qty: fmt(r.netUnits), unitCost: r.unitCost === 'mixed' ? 'متعدد' : r.unitCost === null ? 'بلا تكلفة' : fmt(r.unitCost, 2), cost: fmt(r.totalCost, 2), sales: fmt(r.salesUsd, 2), native: native(r.salesNative), profit: r.grossProfit === null ? 'غير محسوب' : fmt(r.grossProfit, 2) }));
    const res = await exportReport({ format: 'pdf', columns, rows, title: `كشف المنتجات — ${title}`, meta: [`المبيعات ${usd(t.salesUsd)}`, `التكلفة ${usd(t.cogs)}`, `الربح الإجمالي ${usd(t.grossProfit)}`, `آخر تحديث ${new Date(data.fetchedAt).toLocaleString('ar')}`] });
    if (!res.ok) toast.error(res.reason);
  };

  const t = view$?.combined.totals;
  const single = data?.months.length === 1 ? data.months[0] : null;
  const pill = (on) => `px-3 py-1.5 rounded-xl text-xs font-bold border transition ${on ? 'bg-navy text-white border-navy' : 'bg-surface text-muted border-border hover:border-navy/40'}`;

  return (
    <div className="space-y-4" dir="rtl">
      {/* ── الفلاتر ── */}
      <div className="bg-surface border border-border rounded-2xl p-3 space-y-2.5">
        <div className="flex flex-wrap gap-1.5">{MARKETS.map((m) => <button key={m} onClick={() => setMarket(m)} className={pill(market === m)}>{MARKET_LABELS[m]}</button>)}</div>
        <div className="flex flex-wrap gap-1.5 items-center">
          {[['month', 'شهر'], ['year', 'سنة'], ['range', 'مدى أشهر']].map(([k, l]) => <button key={k} onClick={() => setMode(k)} className={pill(mode === k)}>{l}</button>)}
          {mode === 'month' && <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="border border-border rounded-xl px-3 py-1.5 text-sm bg-surface-alt text-text" />}
          {mode === 'year' && <input type="number" min="2024" max="2100" value={year} onChange={(e) => setYear(e.target.value)} className="w-24 border border-border rounded-xl px-3 py-1.5 text-sm bg-surface-alt text-text" />}
          {mode === 'range' && <><input type="month" value={from} onChange={(e) => setFrom(e.target.value)} className="border border-border rounded-xl px-2 py-1.5 text-sm bg-surface-alt text-text" /><span className="text-muted text-xs">←</span><input type="month" value={to} onChange={(e) => setTo(e.target.value)} className="border border-border rounded-xl px-2 py-1.5 text-sm bg-surface-alt text-text" /><span className="text-[10px] text-muted">حتى 12 شهراً</span></>}
        </div>
        <div className="flex flex-wrap gap-1.5">{BRANDS.map((b) => <button key={b.key} onClick={() => setBrand(b.key)} className={pill(brand === b.key)}>{b.label}</button>)}<span className="text-[10px] text-muted self-center">نوع البيع = العلامة (كل الطلبات «تجزئة»)</span></div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 ابحث عن منتج… (مثلاً روزماري)" className="border border-border rounded-xl px-3 py-2 text-sm bg-surface-alt text-text" />
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="border border-border rounded-xl px-3 py-2 text-sm bg-surface-alt text-text">
            <option value="">كل التصنيفات</option>{(data?.categories || []).map((c) => <option key={c} value={c}>{c}</option>)}<option value="غير مصنّف">غير مصنّف</option>
          </select>
          <select value={view} onChange={(e) => setView(e.target.value)} className="border border-border rounded-xl px-3 py-2 text-sm bg-surface-alt text-text">
            {Object.entries(VIEWS).map(([k, l]) => <option key={k} value={k}>حالة الطلب: {l}</option>)}
          </select>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <label className="text-xs text-muted flex items-center gap-1"><input type="checkbox" checked={onlyWithSales} onChange={(e) => setOnlyWithSales(e.target.checked)} /> إخفاء المنتجات بلا مبيعات</label>
          <span className="flex-1" />
          <button onClick={load} disabled={loading} className="px-3 py-1.5 rounded-xl bg-navy text-white text-xs font-bold disabled:opacity-50">{loading ? '…جارٍ التحميل' : 'تحديث'}</button>
          <button onClick={exportExcel} disabled={!view$} className="px-3 py-1.5 rounded-xl border border-border text-xs font-bold text-text">📊 Excel</button>
          <button onClick={print} disabled={!view$} className="px-3 py-1.5 rounded-xl border border-border text-xs font-bold text-text">🖨️ طباعة</button>
        </div>
      </div>

      {loading && !data && <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-16 rounded-2xl bg-surface-alt animate-pulse" />)}</div>}

      {view$ && (<>
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted">
          <span className="font-extrabold text-text text-sm">{title}</span>
          <span>آخر تحديث: {new Date(data.fetchedAt).toLocaleString('ar')}{data.dataAsOf ? ` · آخر حدث تسليم/إرجاع بالبيانات: ${new Date(data.dataAsOf).toLocaleString('ar')}` : ''}</span>
        </div>
        {single?.closure && (
          <div className={`text-[11px] rounded-xl border px-3 py-2 ${single.closureDiff.length ? 'border-orange-500/30 bg-orange-500/10 text-orange-700' : 'border-green-500/30 bg-green-500/10 text-green-700'}`}>
            🔒 نسخة معتمدة لهذا الشهر ({single.closure.closed_by_name || '—'} · {new Date(single.closure.closed_at).toLocaleDateString('ar')}){single.closure.snapshot?.detail ? ' — تشمل أسطر المنتجات وأسعار الصرف' : ' — إجماليات فقط (أُقفلت قبل التفصيل)'}
            {single.closureDiff.length > 0 && ` · تغيّرت البيانات منذ الإقفال: ${single.closureDiff.map((d) => `${d.field} ${d.before}→${d.after}`).join('، ')}`}
          </div>
        )}
        {t.quality.length > 0 && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-3 py-2 text-[11px] space-y-0.5">
            <p className="font-bold text-red-600">⚠️ الكشف ناقص — لا أرقام مخترعة:</p>
            {t.quality.slice(0, 8).map((x, i) => <p key={i} className="text-text">• {x.text}</p>)}
            {t.quality.length > 8 && <p className="text-muted">و{t.quality.length - 8} ملاحظة أخرى (بالـExcel)</p>}
          </div>
        )}

        {/* ── المؤشرات ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Kpi icon="💵" label="إجمالي المبيعات" value={usd(t.salesUsd)} sub={`${native(t.salesNative)}${t.unallocatedRevenue ? ` · + ${usd(t.unallocatedRevenue)} طلبات بلا أصناف (غير موزّعة)` : ""}`} tone="text-teal" onClick={() => setDetail({ type: 'kpi', k: 'sales' })} />
          <Kpi icon="📦" label="القطع المباعة (صافي)" value={fmt(t.netUnits)} sub={`${fmt(t.units)} مسلَّمة − ${fmt(t.returnedUnits)} مرتجعة · ${fmt(t.orders)} طلب`} onClick={() => setDetail({ type: 'kpi', k: 'units' })} />
          <Kpi icon="🏭" label="تكلفة المنتجات" value={usd(t.cogs)} sub={t.revenueWithoutCost ? `${usd(t.revenueWithoutCost)} مبيعات بلا تكلفة` : 'كل المبيعات بتكلفة معتمدة'} tone="text-orange-600" onClick={() => setDetail({ type: 'kpi', k: 'cogs' })} />
          <Kpi icon="📈" label="الربح الإجمالي" value={usd(t.grossProfit)} sub={t.margin !== null ? `هامش ${t.margin}%` : '—'} tone={t.grossProfit >= 0 ? 'text-green-600' : 'text-red-600'} onClick={() => setDetail({ type: 'kpi', k: 'profit' })} />
        </div>

        {/* ── مقارنة الأسواق ── */}
        <div className="bg-surface border border-border rounded-2xl p-3">
          <h3 className="text-sm font-extrabold text-text mb-2">🌍 مقارنة الأسواق</h3>
          <div className="overflow-x-auto"><table className="w-full text-[11px]"><thead><tr className="text-muted">{['السوق', 'طلبات', 'صافي القطع', 'المبيعات $', 'بالعملة الأصلية', 'التكلفة $', 'الربح الإجمالي $', 'ملاحظات'].map((h) => <th key={h} className="text-start font-semibold pe-2 py-1">{h}</th>)}</tr></thead>
            <tbody>{view$.markets.map((m) => (
              <tr key={m.market} onClick={() => setMarket(m.market)} className={`border-t border-border/40 cursor-pointer hover:bg-surface-alt ${market === m.market ? 'font-bold' : ''}`}>
                <td className="pe-2 py-1">{MARKET_LABELS[m.market]}</td><td className="pe-2">{fmt(m.orders)}</td><td className="pe-2">{fmt(m.netUnits)}</td><td className="pe-2">{fmt(m.salesUsd, 2)}</td>
                <td className="pe-2">{native(m.salesNative)}</td><td className="pe-2">{fmt(m.cogs, 2)}</td><td className="pe-2">{fmt(m.grossProfit, 2)}</td><td className="pe-2 text-red-600">{m.quality.length ? `⚠️ ${m.quality.length}` : '✓'}</td>
              </tr>))}</tbody></table></div>
        </div>

        {/* ── الأفضل والأضعف ── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {[['🏆 الأكثر مبيعاً', view$.rank.topSelling, (r) => `${fmt(r.netUnits)} قطعة`], ['💎 الأعلى ربحاً', view$.rank.topProfit, (r) => usd(r.grossProfit)], ['🔻 الأقل أداءً (هامش)', view$.rank.lowPerformers, (r) => `${r.margin}%`]].map(([h, list, val]) => (
            <div key={h} className="bg-surface border border-border rounded-2xl p-3">
              <h4 className="text-xs font-extrabold text-text mb-1.5">{h}</h4>
              {list.length === 0 ? <p className="text-[11px] text-muted">لا بيانات</p> : list.map((r) => (
                <button key={`${r.key}|${r.market}`} onClick={() => setDetail({ type: 'product', row: r })} className="w-full flex justify-between text-[11px] py-0.5 hover:text-navy"><span className="truncate">{r.name}</span><span className="font-bold">{val(r)}</span></button>
              ))}
            </div>
          ))}
        </div>

        {/* ── مقارنة الأشهر ── */}
        {view$.series.length > 1 && (
          <div className="bg-surface border border-border rounded-2xl p-3 space-y-2">
            <h3 className="text-sm font-extrabold text-text">📅 تطوّر المبيعات والتكاليف</h3>
            <Suspense fallback={<div className="h-[220px] rounded-xl bg-surface-alt animate-pulse" />}><TrendChart data={view$.series} /></Suspense>
            <div className="overflow-x-auto"><table className="w-full text-[11px]"><thead><tr className="text-muted">{['الشهر', 'طلبات', 'صافي القطع', 'المبيعات $', 'التكلفة $', 'الربح $', 'تغيّر المبيعات', 'الحالة'].map((h) => <th key={h} className="text-start font-semibold pe-2 py-1">{h}</th>)}</tr></thead>
              <tbody>{view$.series.map((s) => (
                <tr key={s.month} className="border-t border-border/40 cursor-pointer hover:bg-surface-alt" onClick={() => { setMode('month'); setMonth(s.month.slice(0, 7)); }}>
                  <td className="pe-2 py-1">{s.label}</td><td className="pe-2">{fmt(s.orders)}</td><td className="pe-2">{fmt(s.netUnits)}</td><td className="pe-2">{fmt(s.salesUsd, 2)}</td><td className="pe-2">{fmt(s.cogs, 2)}</td><td className="pe-2">{fmt(s.grossProfit, 2)}</td>
                  <td className={`pe-2 ${s.change.salesUsd > 0 ? 'text-green-600' : s.change.salesUsd < 0 ? 'text-red-600' : ''}`}>{s.change.salesUsd === null ? '—' : `${s.change.salesUsd > 0 ? '+' : ''}${s.change.salesUsd}%`}</td>
                  <td className="pe-2">{s.status === 'final' ? '✓' : <span className="text-red-600" title={s.noFxOrders ? `${s.noFxOrders} طلب بلا سعر صرف` : ''}>ناقص</span>}</td>
                </tr>))}</tbody></table></div>
            <p className="text-[10px] text-muted">الشهر «الناقص» غالباً بلا سعر صرف شهري معتمد بصفحة الربحية — قيمته بعملته الأصلية ظاهرة ولا تُحوَّل تقديرياً.</p>
          </div>
        )}

        {/* ── الكشف التفصيلي ── */}
        <div className="bg-surface border border-border rounded-2xl p-3">
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-sm font-extrabold text-text">🧾 كشف المنتجات — {VIEWS[view]}</h3>
            <span className="text-[10px] text-muted">{fmt(view$.rows.length)} منتج · {fmt(t.productsWithoutSales)} بلا مبيعات بالكتالوج</span>
          </div>
          <div className="overflow-x-auto"><table className="w-full text-[11px]">
            <thead><tr className="text-muted">{(view === 'sold' ? ['المنتج', 'الكمية', 'مرتجع', 'صافي', 'تكلفة الوحدة', 'إجمالي التكلفة', 'قيمة المبيعات $', 'بالعملة الأصلية', 'الربح $'] : ['المنتج', 'التصنيف', `قطع (${VIEWS[view]})`]).map((h) => <th key={h} className="text-start font-semibold pe-2 py-1 whitespace-nowrap">{h}</th>)}</tr></thead>
            <tbody>{view$.rows.map((r) => (
              <tr key={`${r.key}|${r.market}`} onClick={() => setDetail({ type: 'product', row: r })} className={`border-t border-border/40 cursor-pointer hover:bg-surface-alt ${r.soldUnits === 0 && r.returnedUnits === 0 ? 'text-muted' : ''}`}>
                <td className="pe-2 py-1"><span className="font-bold">{r.name}</span>{r.freeUnits > 0 && <span className="ms-1 text-[9px] text-teal">🎁{fmt(r.freeUnits)}</span>}<div className="text-[9px] text-muted">{r.category}</div></td>
                {view === 'sold' ? (<>
                  <td className="pe-2">{fmt(r.soldUnits)}</td><td className="pe-2">{fmt(r.returnedUnits)}</td><td className="pe-2 font-bold">{fmt(r.netUnits)}</td>
                  <td className="pe-2">{r.unitCost === 'mixed' ? 'متعدد' : r.unitCost === null ? <span className="text-red-600">بلا تكلفة</span> : fmt(r.unitCost, 2)}</td>
                  <td className="pe-2">{fmt(r.totalCost, 2)}</td><td className="pe-2">{fmt(r.salesUsd, 2)}</td><td className="pe-2 whitespace-nowrap">{native(r.salesNative)}{Object.keys(r.salesNativeNoFx).length > 0 && <span className="text-red-600"> · بلا صرف: {native(r.salesNativeNoFx)}</span>}</td>
                  <td className={`pe-2 font-bold ${r.grossProfit === null ? 'text-red-600' : r.grossProfit < 0 ? 'text-red-600' : 'text-green-600'}`}>{r.grossProfit === null ? 'غير محسوب' : fmt(r.grossProfit, 2)}</td>
                </>) : (<><td className="pe-2">{r.category}</td><td className="pe-2 font-bold">{fmt(view === 'returned' ? r.returnedUnits : r.statusUnits[view] || 0)}</td></>)}
              </tr>))}
              {view$.rows.length === 0 && <tr><td colSpan={9} className="py-4 text-center text-muted">لا منتجات مطابقة للفلاتر</td></tr>}
            </tbody>
          </table></div>
          <p className="text-[10px] text-muted mt-2">المبيعات بتاريخ التسليم الموثّق · تكلفة الوحدة = التكلفة المعيارية الشهرية السارية (لا FIFO: لا تكلفة شراء مسجّلة) · 🎁 = قطع من طلبات بقيمة 0 (تكلفتها خارج الربح، مستقلة) · رسوم الشحن خارج قيمة المنتجات · لا جمع لعملات مختلفة.</p>
        </div>
      </>)}

      {detail?.type === 'kpi' && t && (
        <Sheet title={{ sales: 'تفصيل المبيعات', units: 'تفصيل القطع', cogs: 'تفصيل تكلفة المنتجات', profit: 'تفصيل الربح الإجمالي' }[detail.k]} onClose={() => setDetail(null)}>
          {detail.k === 'sales' && (<>
            <Line2 k="قيمة مبيعات المنتجات (دولار)" v={usd(t.salesUsd)} />
            <Line2 k="بالعملة الأصلية (كل عملة على حدة)" v={native(t.salesNative)} />
            <Line2 k="مبيعات بلا سعر صرف شهري (غير محوَّلة)" v={`${native(t.salesNativeNoFx)} · ${fmt(t.noFxOrders)} طلب`} />
            <Line2 k="طلبات بلا أصناف (قيمة غير موزّعة)" v={`${fmt(t.ordersNoItems)} طلب · ${usd(t.unallocatedRevenue)}`} />
            <Line2 k="تخفيض بسبب مرتجعات مكتملة بالفترة" v={`${usd(t.returnRevenueReduction)} · ${fmt(t.returnOrders)} طلب`} />
            <Line2 k="رسوم توصيل على الزبون (خارج قيمة المنتجات)" v={native(t.customerDeliveryFees)} />
            <Line2 k="طلبات تسوية (ليست مبيعات)" v={`${fmt(t.settledOrders)} · ${native(t.settledCollected)}`} />
            <p className="text-muted">أسعار الصرف المستخدمة: {view$.fx.length ? view$.fx.map((r) => `${r.currency}=${r.units_per_usd} (${String(r.month).slice(0, 7)})`).join(' · ') : 'لا أسعار مدخلة للفترة'}</p>
          </>)}
          {detail.k === 'units' && (<>
            <Line2 k="مسلَّمة بالفترة" v={fmt(t.units)} /><Line2 k="منها مجانية (طلب بقيمة 0)" v={`${fmt(t.freeUnits)} · ${fmt(t.freeOrders)} طلب`} />
            <Line2 k="مرتجعة مكتملة" v={fmt(t.returnedUnits)} /><Line2 k="الصافي" v={fmt(t.netUnits)} />
            {Object.entries(STATUS_BUCKET_LABELS).map(([b, l]) => <Line2 key={b} k={`${l} (طلبات بتاريخ الطلب — ليست مبيعات)`} v={fmt(t.statusOrders?.[b] || 0)} />)}
            <Line2 k="مسلَّمة بتاريخ تسليم غير معروف (غير مُسنَدة)" v={`${fmt(t.unknownDelivery.orders)} طلب · ${fmt(t.unknownDelivery.units)} قطعة`} />
            <p className="text-muted">الهدايا على مستوى السطر غير متاحة: بنود الطلب لا تحمل علامة هدية.</p>
          </>)}
          {detail.k === 'cogs' && (<>
            <Line2 k="تكلفة القطع المدفوعة" v={usd(t.cogs)} /><Line2 k="تكلفة القطع المجانية (منفصلة)" v={usd(t.freeCost)} />
            <Line2 k="قطع بلا تكلفة معتمدة" v={`${fmt(t.unitsWithoutCost)} قطعة · ${usd(t.revenueWithoutCost)} مبيعات`} />
            <p className="text-muted">لإكمال التكلفة: صفحة الربحية ← «النتائج الشهرية» ← محرّر الأسعار والتكاليف (يسري من الشهر الحالي، لا يغيّر الأشهر السابقة).</p>
          </>)}
          {detail.k === 'profit' && (<>
            <Line2 k="المبيعات (للأصناف ذات التكلفة)" v={usd(t.salesUsd - t.revenueWithoutCost)} /><Line2 k="− تكلفة المنتجات" v={usd(t.cogs)} />
            <Line2 k="= الربح الإجمالي" v={usd(t.grossProfit)} /><Line2 k="أثر المرتجعات المؤكَّد (غير مخصوم أعلاه)" v={usd(t.returnEffect)} />
            <Line2 k="تكلفة القطع المجانية (غير مخصومة أعلاه)" v={usd(t.freeCost)} />
            <p className="text-muted">الربح الإجمالي لا يشمل الإعلان والشحن والرواتب — الصافي في تبويب «النتائج الشهرية».</p>
          </>)}
        </Sheet>
      )}
      {detail?.type === 'product' && (
        <Sheet title={`${detail.row.name} — ${MARKET_LABELS[detail.row.market] || ''}`} onClose={() => setDetail(null)}>
          <Line2 k="مسلَّم / مرتجع / صافي" v={`${fmt(detail.row.soldUnits)} / ${fmt(detail.row.returnedUnits)} / ${fmt(detail.row.netUnits)}`} />
          <Line2 k="مدفوع · مجاني · بلا قيمة · بلا صرف" v={`${fmt(detail.row.paidUnits)} · ${fmt(detail.row.freeUnits)} · ${fmt(detail.row.noValueUnits)} · ${fmt(detail.row.noFxUnits)}`} />
          <Line2 k="تكلفة الوحدة (أساسها · سارية من)" v={`${detail.row.unitCost === 'mixed' ? 'متعدد بين الأشهر/الأسواق' : detail.row.unitCost ?? 'بلا تكلفة'} · ${detail.row.costBasis === 'market' ? 'تكلفة السوق' : detail.row.costBasis ? 'موحّدة' : '—'} · ${detail.row.costFrom || '—'}`} />
          <Line2 k="إجمالي التكلفة · تكلفة المجاني" v={`${usd(detail.row.totalCost)} · ${usd(detail.row.freeCost)}`} />
          <Line2 k="المبيعات" v={`${usd(detail.row.salesUsd)} (${native(detail.row.salesNative)})`} />
          <Line2 k="الربح الإجمالي · الهامش" v={`${detail.row.grossProfit === null ? 'غير محسوب' : usd(detail.row.grossProfit)} · ${detail.row.margin ?? '—'}%`} />
          {Object.keys(detail.row.statusUnits).length > 0 && <Line2 k="خارج المبيعات" v={Object.entries(detail.row.statusUnits).map(([b, n]) => `${STATUS_BUCKET_LABELS[b]}: ${fmt(n)}`).join(' · ')} />}
          <h4 className="font-extrabold text-text pt-2">الطلبات ({fmt(detail.row.orderRefs.length + detail.row.returnRefs.length)})</h4>
          <div className="overflow-x-auto"><table className="w-full text-[11px]"><thead><tr className="text-muted">{['الطلب', 'التاريخ', 'النوع', 'الكمية', 'حصة المنتج $', 'بالعملة'].map((h) => <th key={h} className="text-start pe-2 py-1">{h}</th>)}</tr></thead>
            <tbody>{[...detail.row.orderRefs, ...detail.row.returnRefs].sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 300).map((x, i) => (
              <tr key={`${x.id}-${x.kind}-${i}`} className="border-t border-border/40"><td className="pe-2 py-0.5 font-mono">{x.code || '—'}</td><td className="pe-2">{x.at ? new Date(x.at).toLocaleDateString('ar') : '—'}</td>
                <td className={`pe-2 ${x.kind === 'sale' ? '' : 'text-orange-600'}`}>{KIND_LABEL[x.kind] || x.kind}</td><td className="pe-2">{fmt(x.qty)}</td><td className="pe-2">{x.kind === 'return' ? '—' : fmt(x.usd, 2)}</td><td className="pe-2">{x.native ? `${fmt(x.native, 0)} ${x.currency || ''}` : '—'}</td></tr>))}</tbody></table></div>
        </Sheet>
      )}
    </div>
  );
}
