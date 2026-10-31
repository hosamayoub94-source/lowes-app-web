// =============================================================
// productAnalytics — كشف مبيعات وتكلفة المنتجات حسب السوق (دوال صرفة فوق computeMonthly)
// اختبار مستقل: node test-product-analytics.mjs
//
// لا يعيد حساب المبيعات: كل رقم مأخوذ من ناتج computeMonthly (profitabilityCalc.js) بنفس قواعده:
//  • المباع = مُسلَّم بتاريخ تسليم موثّق داخل الشهر. الملغى/قيد الشحن/المعلّق/التسوية ليست مبيعات (تُعرض كأعداد منفصلة).
//  • المرتجع المكتمل يُخصم في شهر الإرجاع. صافي الكمية = المسلَّم − المرتجع المكتمل بالشهر.
//  • تكلفة الوحدة = «تكلفة معيارية شهرية مؤرَّخة»: تكلفة السوق ثم الموحّدة السارية بتاريخ ≤ شهر البيع
//    (product_market_prices ← product_economics_history). تعديل التكلفة الحالية لا يغيّر شهراً سابقاً.
//    لا FIFO ولا متوسط مرجّح: لا تكلفة شراء/دفعات مسجّلة بالمخزون (wh_movements بلا سعر).
//  • تكلفة مفقودة ≠ صفر: الصنف «بلا تكلفة» ولا يُحسب له ربح إجمالي.
//  • الطلب المجاني (قيمة = 0 صراحةً) منفصل عن المدفوع: قيمة مبيعاته 0 وتكلفته تُعرض بعمود مستقل خارج الربح الإجمالي.
//    لا علامة هدية على مستوى السطر في orders.items — غير متاح ويُعرض كذلك.
//  • العملات: قيمة المبيعات تُعرض بعملتها الأصلية لكل عملة على حدة + معادل دولار فقط بسعر صرف شهري معتمد.
//  • رسوم الشحن ليست ضمن قيمة المنتجات (orders.amount يستثنيها) وتُعرض مستقلة.
//  • المؤرشف (orders.archived) علامة على نفس الصف ⇒ يُحسب مرة واحدة ولا يُستبعد.
// =============================================================
import { MARKET_KEYS, normName, buildResolver, monthBounds } from './profitabilityCalc.js';

export const MARKET_LABELS = { syria: 'سوريا', turkey: 'تركيا', uae: 'الإمارات', all: 'كل الأسواق' };
export const UNCATEGORIZED = 'غير مصنّف';

/** فئات الحالة غير البيعية (بتاريخ الطلب داخل الشهر). */
export const STATUS_BUCKETS = {
  in_transit: ['pending', 'preparing', 'ready', 'motor_prep', 'motor', 'at_center', 'shipped', 'on_way', 'special_delivery', 'prepaid', 'waiting'],
  pending_return: ['returning', 'not_received'],
  cancelled: ['cancelled'],
  settled: ['settled'],
};
export const STATUS_BUCKET_LABELS = { in_transit: 'قيد التوصيل', pending_return: 'مرتجع معلّق', cancelled: 'ملغى', settled: 'تسوية' };
const bucketOf = (status) => Object.keys(STATUS_BUCKETS).find((b) => STATUS_BUCKETS[b].includes(status)) || null;

const num = (v) => Number(v) || 0;
const r2 = (x) => Math.round(num(x) * 100) / 100;
const addMap = (into, from) => { for (const [k, v] of Object.entries(from || {})) into[k] = (into[k] || 0) + num(v); return into; };

/** تصنيف لكل اسم موحّد: من products.category عبر نفس موحِّد الأسماء. */
export function buildCategoryIndex(productRows = [], nameMapRows = []) {
  const resolve = buildResolver(nameMapRows);
  const idx = new Map();
  for (const p of productRows) {
    const cat = String(p.category || '').trim(); if (!cat) continue;
    for (const n of [p.name, p.name_en, p.name_ar]) { if (!n) continue; const k = resolve(n).key; if (!idx.has(k)) idx.set(k, cat); }
  }
  return idx;
}

/** كل الأسماء البديلة لكل اسم موحّد (للبحث: «روزماري» يجد Rosemary إن كان اسماً بديلاً مسجّلاً). */
export function buildAliasIndex(nameMapRows = []) {
  const idx = new Map();
  for (const m of nameMapRows) {
    if (!m.canonical_name) continue;
    const k = normName(m.canonical_name);
    const arr = idx.get(k) || []; if (m.alias_name) arr.push(normName(m.alias_name)); idx.set(k, arr);
  }
  return idx;
}

/**
 * توزيع الطلبات غير المباعة بالشهر على المنتجات (حسب تاريخ الطلب): قيد التوصيل/مرتجع معلّق/ملغى/تسوية.
 * orders: صفوف خفيفة {id, market, status, order_date, items, brand}. يُزال التكرار بالمعرّف.
 */
export function buildStatusBreakdown(orders = [], { nameMapRows = [], month, brand = 'lowes' } = {}) {
  const { from, to } = monthBounds(month);
  const t0 = Date.parse(from), t1 = Date.parse(to);
  const resolve = buildResolver(nameMapRows);
  const seen = new Set();
  const byProduct = new Map();   // key|market → {bucket: units}
  const byMarket = {};           // market → {bucket: {orders, units}}
  for (const o of orders) {
    if (!o || seen.has(o.id)) continue; seen.add(o.id);
    const b = bucketOf(o.status); if (!b) continue;
    const t = Date.parse(o.order_date); if (!(Number.isFinite(t) && t >= t0 && t < t1)) continue;
    if (o.brand && brand !== 'all' && o.brand !== brand) continue;
    const m = MARKET_KEYS.includes(o.market) ? o.market : 'unknown';
    const M = (byMarket[m] ||= {}); const B = (M[b] ||= { orders: 0, units: 0 }); B.orders++;
    for (const it of Array.isArray(o.items) ? o.items : []) {
      const raw = String(it?.name ?? '').trim(); if (!raw) continue;
      const r = resolve(raw); if (!r.active || (!o.brand && brand !== 'all' && r.brand !== brand)) continue;
      const q = Number(it.qty); const qty = Number.isFinite(q) && q > 0 && q <= 500 ? q : 1;
      B.units += qty;
      const id = `${r.key}|${m}`; const P = byProduct.get(id) || {}; P[b] = (P[b] || 0) + qty; byProduct.set(id, P);
    }
  }
  return { byProduct, byMarket };
}

const emptyRow = (key, name, market) => ({
  key, name, market, category: UNCATEGORIZED,
  soldUnits: 0, paidUnits: 0, freeUnits: 0, noValueUnits: 0, noFxUnits: 0, returnedUnits: 0, netUnits: 0,
  unitCost: null, costBasis: null, costFrom: null, totalCost: 0, freeCost: 0,
  salesUsd: 0, salesNative: {}, salesNativeNoFx: {}, grossProfit: null, margin: null,
  orders: 0, freeOrders: 0, costMissingUnits: 0, hasCost: false,
  statusUnits: {}, orderRefs: [], returnRefs: [], markets: [],
});

function rowFromProduct(p) {
  const d = p.detail || {};
  const r = emptyRow(d.key || normName(p.name), p.name, p.market);
  r.soldUnits = num(p.units); r.freeUnits = num(d.freeUnits); r.noValueUnits = num(d.noValueUnits); r.noFxUnits = num(d.noFxUnits);
  r.paidUnits = r.soldUnits - r.freeUnits - r.noValueUnits - r.noFxUnits;
  r.returnedUnits = num(p.returns);
  r.unitCost = num(p.cost) > 0 ? num(p.cost) : null; r.costBasis = d.costBasis || null; r.costFrom = d.costFrom || null;
  r.totalCost = num(p.productCost); r.freeCost = num(d.freeCost); r.salesUsd = num(p.revenue);
  r.salesNative = { ...(d.native || {}) }; r.salesNativeNoFx = { ...(d.nativeNoFx || {}) };
  r.orders = num(d.orders); r.freeOrders = num(d.freeOrders); r.costMissingUnits = num(d.costMissingUnits);
  r.orderRefs = d.orderRefs || []; r.returnRefs = d.returnRefs || []; r.markets = [p.market];
  return r;
}

/** تكلفتا وحدة لسطر مجمَّع: متساويتان ← نفسها؛ مختلفتان ← 'mixed'؛ إحداهما مفقودة ← الموجودة (والنقص يظهر بـcostMissingUnits). */
const mergeCost = (a, b) => (a === b ? a : a === null ? b : b === null ? a : 'mixed');

function finalizeRow(r) {
  r.netUnits = r.soldUnits - r.returnedUnits;
  r.hasCost = r.unitCost === 'mixed' || (r.unitCost !== null && r.unitCost > 0);
  // الربح الإجمالي = قيمة المبيعات المدفوعة المحوَّلة − تكلفتها. يُحجب إن كان أي جزء مدفوع بلا تكلفة.
  r.grossProfit = r.costMissingUnits > 0 || (r.paidUnits > 0 && !r.hasCost) ? null : r2(r2(r.salesUsd) - r2(r.totalCost));
  r.margin = r.grossProfit !== null && r.salesUsd > 0 ? Math.round((r.grossProfit * 100) / r.salesUsd) : null;
  return r;
}

/**
 * كشف سوق (أو كل الأسواق) لشهر واحد: كل منتجات الكتالوج حتى بلا مبيعات.
 * @param {object} result ناتج computeMonthly (مع priceTable)
 * @param {object} o {market:'syria'|'turkey'|'uae'|'all', categoryIndex, statusBreakdown}
 */
export function buildMarketProductReport(result, { market = 'all', categoryIndex = new Map(), statusBreakdown = null } = {}) {
  const markets = market === 'all' ? MARKET_KEYS : [market];
  const rows = new Map();
  const keyOf = (k, m) => (market === 'all' ? k : `${k}|${m}`);
  // 1) المنتجات بمبيعات/مرتجعات فعلية
  for (const p of result.products || []) {
    if (!markets.includes(p.market)) continue;
    const r = rowFromProduct(p); const id = keyOf(r.key, p.market);
    const cur = rows.get(id);
    if (!cur) { rows.set(id, r); continue; }
    // تجميع عدة أسواق في سطر واحد (كل الأسواق): الكميات والدولار تُجمع، العملات الأصلية كلٌّ على حدة
    for (const f of ['soldUnits', 'paidUnits', 'freeUnits', 'noValueUnits', 'noFxUnits', 'returnedUnits', 'totalCost', 'freeCost', 'salesUsd', 'orders', 'freeOrders', 'costMissingUnits']) cur[f] += r[f];
    addMap(cur.salesNative, r.salesNative); addMap(cur.salesNativeNoFx, r.salesNativeNoFx);
    cur.orderRefs = cur.orderRefs.concat(r.orderRefs); cur.returnRefs = cur.returnRefs.concat(r.returnRefs); cur.markets.push(p.market);
    cur.unitCost = mergeCost(cur.unitCost, r.unitCost);
  }
  // 2) منتجات الكتالوج بلا مبيعات (تظهر بصفر مع تكلفة الوحدة السارية)
  for (const t of result.priceTable || []) {
    for (const m of markets) {
      const id = keyOf(t.key, m);
      const e = t.markets?.[m];
      if (rows.has(id)) { const r = rows.get(id); if (r.unitCost === null && e?.cost > 0 && market !== 'all') { r.unitCost = e.cost; r.costBasis = e.costBasis; r.costFrom = e.costFrom ?? null; } continue; }
      const r = emptyRow(t.key, t.name, market === 'all' ? 'all' : m);
      if (e?.cost > 0) { r.unitCost = e.cost; r.costBasis = e.costBasis; r.costFrom = e.costFrom ?? null; }
      if (market === 'all') {
        const costs = markets.map((mm) => t.markets?.[mm]?.cost).filter((c) => c > 0);
        r.unitCost = costs.length === 0 ? null : costs.every((c) => c === costs[0]) ? costs[0] : 'mixed';
      }
      rows.set(id, r);
    }
  }
  // 3) التصنيف + فئات الحالة
  for (const r of rows.values()) {
    r.category = categoryIndex.get(r.key) || UNCATEGORIZED;
    if (statusBreakdown) for (const m of markets) addMap(r.statusUnits, statusBreakdown.byProduct.get(`${r.key}|${m}`));
    finalizeRow(r);
    if (market === 'all' && r.markets.length) r.market = r.markets.length === 1 ? r.markets[0] : 'all';
  }
  const list = [...rows.values()].sort((a, b) => b.salesUsd - a.salesUsd || b.soldUnits - a.soldUnits || a.name.localeCompare(b.name, 'ar'));
  const base = marketBase(result, markets, statusBreakdown);
  return { month: result.month, market, rows: list, base, totals: finalizeTotals(list, base) };
}

/** أساس إجماليات سوق/أسواق من ملخص المحرك (قيم خام بلا تقريب، تُجمع بين الأشهر). */
function marketBase(result, markets, statusBreakdown) {
  const S = result.marketSummary || {};
  const b = {
    orders: 0, units: 0, freeOrders: 0, noValueOrders: 0, returnOrders: 0, returnRevenueReduction: 0, returnEffect: 0,
    unallocatedRevenue: 0, ordersNoItems: 0, noFxOrders: 0, settledOrders: 0,
    salesNative: {}, salesNativeNoFx: {}, customerDeliveryFees: {}, settledCollected: {}, statusOrders: {},
    pendingReturns: { orders: 0, units: 0 }, unknownDeliveryList: [],
  };
  for (const m of markets) {
    const M = S[m]; if (!M) continue;
    b.orders += num(M.orders); b.units += num(M.units); b.freeOrders += num(M.freeOrders);
    b.noValueOrders += Math.max(0, num(M.revenueMissing?.orders) - num(M.freeOrders));
    b.returnOrders += num(M.returns?.orders); b.returnRevenueReduction += num(M.returns?.revenueReduction); b.returnEffect += num(M.returnEffect);
    b.unallocatedRevenue += num(M.unallocatedRevenue); b.ordersNoItems += num(M.ordersNoItems);
    addMap(b.salesNative, M.revenueByCurrency); addMap(b.salesNativeNoFx, M.revenueNoFx?.byCurrency); b.noFxOrders += num(M.revenueNoFx?.orders);
    addMap(b.customerDeliveryFees, M.customerDeliveryFees);
    b.settledOrders += num(M.settledOrders); addMap(b.settledCollected, M.settledCollected);
    b.pendingReturns.orders += num(M.pendingReturns?.orders); b.pendingReturns.units += num(M.pendingReturns?.units);
    for (const [k, v] of Object.entries(statusBreakdown?.byMarket?.[m] || {})) b.statusOrders[k] = (b.statusOrders[k] || 0) + v.orders;
  }
  // «مُسلَّم بلا تاريخ تسليم موثّق»: المحرك يجمعها من كل نافذة الطلبات (لا من الشهر) ← قائمة بالمعرّف تُزال تكراراتها عند تجميع أشهر
  b.unknownDeliveryList = (result.unknownDeliveryOrders || []).filter((o) => markets.includes(o.market))
    .map((o) => ({ id: o.id, code: o.code, market: o.market, order_date: o.order_date, units: num(o.units), reason: o.reason }));
  return b;
}

function mergeBases(bases) {
  const out = marketBase({}, [], null);
  const seen = new Set();
  for (const b of bases) {
    for (const k of ['orders', 'units', 'freeOrders', 'noValueOrders', 'returnOrders', 'returnRevenueReduction', 'returnEffect', 'unallocatedRevenue', 'ordersNoItems', 'noFxOrders', 'settledOrders']) out[k] += num(b[k]);
    for (const k of ['salesNative', 'salesNativeNoFx', 'customerDeliveryFees', 'settledCollected', 'statusOrders']) addMap(out[k], b[k]);
    out.pendingReturns.orders += b.pendingReturns.orders; out.pendingReturns.units += b.pendingReturns.units;
    for (const o of b.unknownDeliveryList) if (!seen.has(o.id)) { seen.add(o.id); out.unknownDeliveryList.push(o); }
  }
  return out;
}

/**
 * الإجماليات المعروضة — كل رقم مركّب يُحسب من الأرقام المقرَّبة المعروضة نفسها (لا فرق سنت بين «المبيعات − التكلفة» و«الربح»):
 *  إجمالي الإيرادات = مبيعات المنتجات + الإيراد غير الموزّع (طلبات بلا أصناف) — يظهر منفصلاً ولا يختفي.
 *  الربح الإجمالي = مبيعات الأصناف ذات التكلفة − تكلفتها فقط؛ الصنف بلا تكلفة لا يُحسب بتكلفة صفر.
 */
function finalizeTotals(rows, b) {
  const sum = (f) => rows.reduce((s, r) => s + num(f(r)), 0);
  const costed = rows.filter((r) => r.grossProfit !== null), uncosted = rows.filter((r) => r.grossProfit === null);
  const t = { ...b, pendingReturns: { ...b.pendingReturns }, unknownDeliveryList: [...b.unknownDeliveryList] };
  t.productSalesUsd = r2(sum((r) => r.salesUsd));
  t.unallocatedRevenue = r2(b.unallocatedRevenue);
  t.salesUsd = r2(t.productSalesUsd + t.unallocatedRevenue);
  t.revenueWithoutCost = r2(uncosted.reduce((s, r) => s + r.salesUsd, 0));
  t.unitsWithoutCost = uncosted.reduce((s, r) => s + (r.costMissingUnits || r.paidUnits), 0);
  t.cogs = r2(sum((r) => r.totalCost));
  t.cogsCosted = r2(costed.reduce((s, r) => s + r.totalCost, 0));
  t.salesCosted = r2(t.productSalesUsd - t.revenueWithoutCost);
  t.grossProfit = r2(t.salesCosted - t.cogsCosted);
  t.margin = t.salesCosted > 0 ? Math.round((t.grossProfit * 100) / t.salesCosted) : null;
  t.freeUnits = sum((r) => r.freeUnits); t.freeCost = r2(sum((r) => r.freeCost));
  t.returnedUnits = sum((r) => r.returnedUnits); t.netUnits = t.units - t.returnedUnits;
  t.productsWithSales = rows.filter((r) => r.soldUnits > 0 || r.returnedUnits > 0).length; t.productsWithoutSales = rows.length - t.productsWithSales;
  for (const k of ['returnRevenueReduction', 'returnEffect']) t[k] = r2(t[k]);
  t.unknownDelivery = { orders: t.unknownDeliveryList.length, units: t.unknownDeliveryList.reduce((s, o) => s + o.units, 0) };
  // جودة الكشف (ما يجعل الرقم ناقصاً) — بلا تقدير
  t.quality = [];
  if (t.unknownDelivery.orders > 0) t.quality.push({ code: 'unknown_delivery', level: 'partial', text: `${t.unknownDelivery.orders} طلباً (${t.unknownDelivery.units} قطعة) حالتها «مُسلَّم» بلا تاريخ تسليم موثّق — لم تُحسب في هذه الفترة ولا في أي شهر (طلبات بتاريخ طلب حتى 120 يوماً قبل الفترة)` });
  if (t.unitsWithoutCost > 0) t.quality.push({ code: 'no_cost', level: 'partial', text: `${t.unitsWithoutCost} قطعة بلا تكلفة معتمدة — مبيعاتها (${t.revenueWithoutCost}$) خارج الربح الإجمالي، لا بتكلفة صفر` });
  if (t.ordersNoItems > 0) t.quality.push({ code: 'no_items', level: 'partial', text: `${t.ordersNoItems} طلباً مسلّماً بلا أصناف — ${t.unallocatedRevenue}$ ضمن إجمالي الإيرادات، غير موزّعة على منتج وخارج الربح الإجمالي` });
  if (t.noFxOrders > 0) t.quality.push({ code: 'no_fx', level: 'partial', text: `${t.noFxOrders} طلب بعملة بلا سعر صرف شهري معتمد — قيمتها معروضة بعملتها فقط` });
  if (t.noValueOrders > 0) t.quality.push({ code: 'no_value', level: 'partial', text: `${t.noValueOrders} طلب مسلَّم بلا قيمة مسجّلة` });
  t.status = t.quality.length ? 'partial' : 'final';
  return t;
}

/** فلترة أسطر الكشف: بحث (الاسم + الأسماء البديلة)، تصنيف، إخفاء بلا مبيعات. */
export function filterRows(rows, { q = '', category = '', aliasIndex = null, onlyWithSales = false } = {}) {
  const nq = normName(q);
  return rows.filter((r) => {
    if (category && r.category !== category) return false;
    if (onlyWithSales && !(r.soldUnits > 0 || r.returnedUnits > 0)) return false;
    if (!nq) return true;
    if (normName(r.name).includes(nq) || r.key.includes(nq)) return true;
    return (aliasIndex?.get(r.key) || []).some((a) => a.includes(nq));
  });
}

/** الأكثر مبيعاً (صافي الكمية) · الأعلى ربحاً · الأقل أداءً (أدنى هامش بين ما بيع، ثم المنتجات بلا مبيعات). */
export function rankProducts(rows, n = 5) {
  const sold = rows.filter((r) => r.soldUnits > 0);
  return {
    topSelling: [...sold].sort((a, b) => b.netUnits - a.netUnits || b.salesUsd - a.salesUsd).slice(0, n),
    topProfit: sold.filter((r) => r.grossProfit !== null).sort((a, b) => b.grossProfit - a.grossProfit).slice(0, n),
    lowPerformers: sold.filter((r) => r.margin !== null).sort((a, b) => a.margin - b.margin || a.netUnits - b.netUnits).slice(0, n),
    noSales: rows.filter((r) => r.soldUnits === 0 && r.returnedUnits === 0),
  };
}

/** مقارنة أسواق لشهر: سطر لكل سوق من نفس الناتج. */
export function compareMarkets(result, opts = {}) {
  return MARKET_KEYS.map((m) => ({ market: m, label: MARKET_LABELS[m], ...buildMarketProductReport(result, { ...opts, market: m }).totals }));
}

/** سلسلة شهرية + فرق عن الشهر السابق. reports: [{month, totals}] مرتّبة تصاعدياً. */
export function compareMonths(reports = []) {
  const series = reports.map((r) => ({
    month: r.month, salesUsd: r.totals.salesUsd, cogs: r.totals.cogs, grossProfit: r.totals.grossProfit,
    units: r.totals.units, netUnits: r.totals.netUnits, orders: r.totals.orders, status: r.totals.status,
    revenueWithoutCost: r.totals.revenueWithoutCost, unallocatedRevenue: r.totals.unallocatedRevenue, noFxOrders: r.totals.noFxOrders, salesNative: r.totals.salesNative,
  }));
  return series.map((s, i) => {
    const p = series[i - 1];
    const delta = (k) => (p && p[k] ? Math.round(((s[k] - p[k]) * 100) / Math.abs(p[k])) : null);
    return { ...s, change: { salesUsd: delta('salesUsd'), units: delta('units'), grossProfit: delta('grossProfit') } };
  });
}

/** تجميع عدة أشهر (عرض سنة/مدى) في كشف واحد: يجمع الأسطر بالمفتاح والكميات والدولار، والعملات كلٌّ على حدة. */
export function combineReports(reports = []) {
  if (reports.length === 1) return reports[0];
  const rows = new Map();
  for (const rep of reports) for (const r of rep.rows) {
    const id = `${r.key}|${rep.market === 'all' ? 'all' : r.market}`; const c = rows.get(id);
    if (!c) { rows.set(id, { ...r, salesNative: { ...r.salesNative }, salesNativeNoFx: { ...r.salesNativeNoFx }, statusUnits: { ...r.statusUnits }, orderRefs: [...r.orderRefs], returnRefs: [...r.returnRefs] }); continue; }
    for (const f of ['soldUnits', 'paidUnits', 'freeUnits', 'noValueUnits', 'noFxUnits', 'returnedUnits', 'totalCost', 'freeCost', 'salesUsd', 'orders', 'freeOrders', 'costMissingUnits']) c[f] += r[f];
    addMap(c.salesNative, r.salesNative); addMap(c.salesNativeNoFx, r.salesNativeNoFx); addMap(c.statusUnits, r.statusUnits);
    c.orderRefs.push(...r.orderRefs); c.returnRefs.push(...r.returnRefs);
    c.unitCost = mergeCost(c.unitCost, r.unitCost);
  }
  const list = [...rows.values()].map(finalizeRow)
    .sort((a, b) => b.salesUsd - a.salesUsd || b.soldUnits - a.soldUnits || a.name.localeCompare(b.name, 'ar'));
  const totals = finalizeTotals(list, mergeBases(reports.map((r) => r.base)));
  return { month: reports.map((r) => r.month).join(','), market: reports[0]?.market, rows: list, totals, months: reports.map((r) => r.month) };
}

/** النسخة المعتمدة التفصيلية للإقفال: نفس المفاتيح الرقمية + detail (أسطر المنتجات لكل سوق + أسعار الصرف المستخدمة). */
export function detailedSnapshotOf(base, result, { fxRates = [], brand = 'lowes' } = {}) {
  const month = String(result.month).slice(0, 10);
  return {
    ...base,
    detail: {
      version: 1, brand, generated_at: new Date().toISOString(),
      fx: fxRates.filter((r) => String(r.month).slice(0, 10) === month).map((r) => ({ currency: r.currency, scope: r.scope, units_per_usd: Number(r.units_per_usd), entered_at: r.entered_at })),
      markets: Object.fromEntries(MARKET_KEYS.map((m) => { const M = result.marketSummary?.[m] || {}; return [m, { orders: num(M.orders), units: num(M.units), revenue: r2(M.revenue), productCost: r2(M.productCost), returnEffect: r2(M.returnEffect), revenueByCurrency: M.revenueByCurrency || {}, freeOrders: num(M.freeOrders) }]; })),
      products: (result.products || []).map((p) => ({ name: p.name, market: p.market, units: p.units, returns: p.returns, revenue: r2(p.revenue), productCost: r2(p.productCost), unitCost: p.cost, costFrom: p.versionFrom, native: p.detail?.native || {}, freeUnits: p.detail?.freeUnits || 0 })),
    },
  };
}

const fmtNative = (o) => Object.entries(o || {}).filter(([, v]) => v).map(([k, v]) => `${Math.round(v).toLocaleString('en-US')} ${k}`).join(' + ');
const guard = (v) => (typeof v === 'string' && /^[=+\-@]/.test(v) ? `'${v}` : v);

/** أوراق Excel (aoa) لكشف: الكشف، الملخص والافتراضات، المقارنة الشهرية (اختيارية). */
export function exportSheets(report, { title = '', fxRates = [], monthSeries = null, fetchedAt = null } = {}) {
  const head = ['المنتج', 'التصنيف', 'السوق', 'الكمية المسلّمة', 'منها مجانية', 'المرتجع', 'صافي الكمية', 'تكلفة الوحدة $', 'إجمالي التكلفة $', 'تكلفة المجاني $', 'قيمة المبيعات $', 'قيمة المبيعات بالعملة الأصلية', 'بلا سعر صرف (بعملتها)', 'الربح الإجمالي $', 'الهامش %', 'عدد الطلبات'];
  const body = report.rows.map((r) => [r.name, r.category, MARKET_LABELS[r.market] || r.market, r.soldUnits, r.freeUnits, r.returnedUnits, r.netUnits,
    r.unitCost === 'mixed' ? 'متعدد' : r.unitCost ?? 'بلا تكلفة', r2(r.totalCost), r2(r.freeCost), r2(r.salesUsd), fmtNative(r.salesNative), fmtNative(r.salesNativeNoFx),
    r.grossProfit ?? 'غير محسوب', r.margin ?? '', r.orders].map(guard));
  const t = report.totals;
  if (t.unallocatedRevenue) body.push(['طلبات بلا أصناف (غير موزّعة على منتج)', '', '', '', '', '', '', '', '', '', t.unallocatedRevenue, '', '', 'غير محسوب', '', t.ordersNoItems]);
  body.push(['الإجمالي', '', '', t.units, t.freeUnits, t.returnedUnits, t.netUnits, '', t.cogs, t.freeCost, t.salesUsd, fmtNative(t.salesNative), fmtNative(t.salesNativeNoFx), t.grossProfit, t.margin ?? '', t.orders]);
  const summary = [
    ['البند', 'القيمة'], ['التقرير', title], ['آخر تحديث للبيانات', fetchedAt || ''],
    ['عدد الطلبات المسلّمة', t.orders], ['القطع المسلّمة', t.units], ['المرتجع (قطع)', t.returnedUnits], ['صافي القطع', t.netUnits],
    ['إجمالي الإيرادات $', t.salesUsd], ['  منها مبيعات منتجات $', t.productSalesUsd], ['  منها غير موزّعة (طلبات بلا أصناف) $', t.unallocatedRevenue], ['قيمة المبيعات بالعملة الأصلية', fmtNative(t.salesNative)], ['تكلفة المنتجات المباعة $', t.cogs],
    ['مبيعات الأصناف ذات التكلفة $', t.salesCosted], ['تكلفتها $', t.cogsCosted], ['الربح الإجمالي $ (= السطرين السابقين)', t.grossProfit], ['مبيعات بلا تكلفة معتمدة $', t.revenueWithoutCost],
    ['طلبات مجانية', t.freeOrders], ['تكلفة القطع المجانية $', t.freeCost], ['أثر المرتجعات المؤكَّد $', t.returnEffect],
    ['رسوم توصيل على الزبون (خارج قيمة المنتجات)', fmtNative(t.customerDeliveryFees)], ['طلبات تسوية (ليست مبيعات)', t.settledOrders],
    ...Object.entries(STATUS_BUCKET_LABELS).map(([b, l]) => [`${l} (طلبات بتاريخ الطلب)`, t.statusOrders?.[b] || 0]),
    [], ['أسعار الصرف المستخدمة (وحدة لكل 1$)', ''],
    ...fxRates.map((r) => [`${r.currency} · ${r.scope} · ${String(r.month).slice(0, 7)}`, Number(r.units_per_usd)]),
    [], ['طلبات «مُسلَّم» بلا تاريخ تسليم (غير محسوبة)', t.unknownDelivery.orders], ...t.unknownDeliveryList.slice(0, 500).map((o) => [`  ${o.code || o.id}`, `${MARKET_LABELS[o.market] || o.market} · ${String(o.order_date || '').slice(0, 10)} · ${o.units} قطعة`]),
    [], ['ملاحظات الجودة', ''], ...t.quality.map((q) => [q.level === 'partial' ? 'ناقص' : 'تقديري', q.text]),
    [], ['السياسة', 'المبيعات بتاريخ التسليم الموثّق؛ التكلفة = التكلفة المعيارية الشهرية السارية؛ لا جمع لعملات مختلفة؛ الشحن خارج قيمة المنتجات'],
  ];
  const sheets = { 'كشف المنتجات': [head, ...body], 'الملخص والافتراضات': summary.map((r) => r.map(guard)) };
  if (monthSeries?.length) sheets['مقارنة الأشهر'] = [['الشهر', 'الطلبات', 'القطع', 'صافي القطع', 'المبيعات $', 'التكلفة $', 'الربح الإجمالي $', 'تغيّر المبيعات %', 'الحالة'],
    ...monthSeries.map((s) => [s.month.slice(0, 7), s.orders, s.units, s.netUnits, s.salesUsd, s.cogs, s.grossProfit, s.change?.salesUsd ?? '', s.status === 'final' ? 'نهائي' : 'ناقص'])];
  return sheets;
}

/** إزالة التكرار بالمعرّف (طلب يصل من مصدرين/صفحتين يُحسب مرة واحدة). */
export function dedupeById(rows = []) {
  const seen = new Set();
  return rows.filter((r) => (r && !seen.has(r.id) ? (seen.add(r.id), true) : false));
}
