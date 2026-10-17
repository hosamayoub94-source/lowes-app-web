// =============================================================
// profitabilityCalc — منطق الربحية الشهرية كدوال صرفة (بلا Supabase)
// حتى يُختبر باستقلال: node test-profitability-calc.mjs
//
// القواعد (قرار 17 تشرين الأول 2026):
//  • المبيعات = طلبات delivered/settled فقط، حسب order_date داخل الشهر (توقيت إسطنبول).
//    المعلّق/الملغي/قيد الشحن لا يُحسب مبيعاً.
//  • المرتجع = not_received/returning/returned → يخسر تكلفة الصنف (يُعامَل كمفقود).
//  • السعر/التكلفة تُؤخذ من «النسخة السارية» في الشهر: أحدث صف
//    effective_from <= أول الشهر. تغيير شهر لاحق لا يمسّ شهراً سابقاً.
//  • الإعلان/الشحن لكل وحدة تقديرات: تُستخدم فقط إن لم يُدخَل مصروف فعلي من
//    نفس النوع للشهر (منعاً للعدّ المزدوج مع المصاريف اليدوية).
//  • صافي السوق = أرباح الأصناف − مصاريف السوق اليدوية.
//    صافي الشركة = مجموع الأسواق − المصاريف المشتركة (market='all').
// =============================================================

export const SALE_STATUSES = ['delivered', 'settled'];
export const RETURN_STATUSES = ['not_received', 'returning', 'returned'];
export const MARKET_KEYS = ['syria', 'turkey', 'uae'];
export const ADS_CATEGORIES = ['حملات إعلانية'];
export const SHIPPING_CATEGORIES = ['أجور الشحن'];
export const BASELINE_DATE = '2000-01-01';
export const ISTANBUL_OFFSET = '+03:00';

/** مفتاح مقارنة للأسماء: يوحّد الحالة/المسافات/التشكيل/الألف/الياء/التاء المربوطة. */
export function normName(s) {
  return String(s ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 'YYYY-MM' أو 'YYYY-MM-DD' → 'YYYY-MM-01' */
export function monthStartOf(input) {
  return `${String(input).slice(0, 7)}-01`;
}

/** حدود الشهر بتوقيت إسطنبول كنص ISO مع الإزاحة. */
export function monthBounds(input) {
  const start = monthStartOf(input);
  const y = Number(start.slice(0, 4)), m = Number(start.slice(5, 7));
  const ny = m === 12 ? y + 1 : y, nm = m === 12 ? 1 : m + 1;
  const next = `${ny}-${String(nm).padStart(2, '0')}-01`;
  return { monthStart: start, from: `${start}T00:00:00${ISTANBUL_OFFSET}`, to: `${next}T00:00:00${ISTANBUL_OFFSET}` };
}

/** يبني محلّل الأسماء من product_name_map. alias → canonical، وبدون مطابقة يبقى الاسم الخام. */
export function buildResolver(nameMapRows = []) {
  const byAlias = new Map(), byCanon = new Map();
  for (const m of nameMapRows) {
    if (m.alias_name) byAlias.set(normName(m.alias_name), m);
    if (m.canonical_name && !byCanon.has(normName(m.canonical_name))) byCanon.set(normName(m.canonical_name), m);
  }
  return (raw) => {
    const k = normName(raw);
    const m = byAlias.get(k) || byCanon.get(k);
    const display = (m?.canonical_name || String(raw).trim());
    return { name: display, key: normName(display), brand: m?.brand || 'lowes', active: m ? m.is_active !== false : true, mapped: !!m };
  };
}

/** يبني فهرس النسخ: key → صفوف مرتّبة تنازلياً بـeffective_from. */
export function buildVersionIndex(historyRows = [], currentRows = []) {
  const idx = new Map();
  const push = (row) => {
    const k = normName(row.item_name);
    if (!idx.has(k)) idx.set(k, []);
    idx.get(k).push(row);
  };
  historyRows.forEach(push);
  // أصناف بلا أي تاريخ (قبل الهجرة/فشل جلب التاريخ) → القيمة الحالية كخط أساس
  const has = new Set(idx.keys());
  currentRows.forEach((r) => { if (!has.has(normName(r.item_name))) push({ ...r, effective_from: BASELINE_DATE }); });
  for (const arr of idx.values()) arr.sort((a, b) => (a.effective_from < b.effective_from ? 1 : -1));
  return idx;
}

/** النسخة السارية للصنف في الشهر (أحدث effective_from <= أول الشهر) أو null. */
export function pickVersion(index, key, monthStart) {
  const arr = index.get(key);
  if (!arr) return null;
  return arr.find((r) => String(r.effective_from).slice(0, 10) <= monthStart) || null;
}

const num = (v) => Number(v) || 0;
const emptyMarket = () => ({
  orders: 0, returnedOrders: 0, ordersNoItems: 0, units: 0, returns: 0,
  revenue: 0, productCost: 0, returnLoss: 0, estAds: 0, estShipping: 0, productProfit: 0,
  expenses: 0, expensesByCategory: {}, netProfit: 0, unpricedUnits: 0, collected: {},
});

/**
 * @param {object} p
 * @param {Array} p.orders        صفوف orders: status, items, order_date, market, amount, currency
 * @param {Array} p.nameMapRows   product_name_map
 * @param {Array} p.historyRows   product_economics_history
 * @param {Array} [p.currentRows] product_economics (احتياط لأصناف بلا تاريخ)
 * @param {Array} p.expenses      profitability_expenses لهذا الشهر
 * @param {string} p.month        'YYYY-MM' أو 'YYYY-MM-DD'
 * @param {string} [p.brand]      'lowes' | 'strong' | 'all'
 */
export function computeMonthly({ orders = [], nameMapRows = [], historyRows = [], currentRows = [], expenses = [], month, brand = 'lowes' }) {
  const { monthStart, from, to } = monthBounds(month);
  const t0 = Date.parse(from), t1 = Date.parse(to);
  const resolve = buildResolver(nameMapRows);
  const versions = buildVersionIndex(historyRows, currentRows);
  const monthExpenses = expenses.filter((e) => String(e.month).slice(0, 10) === monthStart);

  const sumCat = (cats) => monthExpenses.filter((e) => cats.includes(e.category)).reduce((s, e) => s + num(e.amount_usd), 0);
  const useEstAds = sumCat(ADS_CATEGORIES) === 0;
  const useEstShip = sumCat(SHIPPING_CATEGORIES) === 0;

  const agg = new Map();           // key|market → {name, brand, market, units, returns}
  const unmapped = new Map();      // key → {name, units}
  const summary = { syria: emptyMarket(), turkey: emptyMarket(), uae: emptyMarket() };
  const market = (m) => (summary[m] ||= emptyMarket());

  for (const o of orders) {
    const isSale = SALE_STATUSES.includes(o.status), isReturn = RETURN_STATUSES.includes(o.status);
    if (!isSale && !isReturn) continue;                       // معلّق/ملغي/قيد الشحن: ليس مبيعاً
    if (o.deleted_at) continue;
    const t = Date.parse(o.order_date);
    if (!Number.isFinite(t) || t < t0 || t >= t1) continue;   // خارج الشهر
    const mk = MARKET_KEYS.includes(o.market) ? o.market : 'unknown';
    const items = Array.isArray(o.items) ? o.items : [];
    let counted = 0;
    for (const it of items) {
      const raw = String(it?.name ?? '').trim();
      if (!raw) continue;
      const r = resolve(raw);
      if (!r.active) continue;                                 // صنف مجمَّد
      if (brand !== 'all' && r.brand !== brand) continue;
      const qty = Number(it.qty);
      const q = Number.isFinite(qty) && qty > 0 ? qty : 1;
      const id = `${r.key}|${mk}`;
      const row = agg.get(id) || { name: r.name, brand: r.brand, market: mk, key: r.key, units: 0, returns: 0 };
      if (isSale) row.units += q; else row.returns += q;
      agg.set(id, row);
      counted += q;
      if (!r.mapped && isSale) { const u = unmapped.get(r.key) || { name: raw, units: 0 }; u.units += q; unmapped.set(r.key, u); }
    }
    const m = market(mk);
    if (counted > 0) { if (isSale) m.orders++; else m.returnedOrders++; }
    else if (isSale && items.length === 0 && (brand === 'all' || brand === 'lowes')) m.ordersNoItems++;
    if (isSale && counted > 0 && o.currency) m.collected[o.currency] = (m.collected[o.currency] || 0) + num(o.amount);
  }

  const products = [];
  for (const row of agg.values()) {
    const v = pickVersion(versions, row.key, monthStart);
    const price = num(v?.sale_price_usd), cost = num(v?.cost_usd);
    const ad = useEstAds ? num(v?.ad_cost_usd) : 0, ship = useEstShip ? num(v?.shipping_cost_usd) : 0;
    const hasEcon = price > 0 && cost > 0;
    const revenue = price * row.units, productCost = cost * row.units, returnLoss = cost * row.returns;
    const estAds = ad * row.units, estShipping = ship * (row.units + row.returns);
    const netProfit = revenue - productCost - returnLoss - estAds - estShipping;
    const totalUnits = row.units + row.returns;
    const unitProfit = price - cost - ad - ship;
    const returnRate = totalUnits ? Math.round((row.returns * 100) / totalUnits) : 0;
    const p = {
      name: row.name, brand: row.brand, market: row.market, units: row.units, returns: row.returns,
      price, cost, ad, ship, adRaw: num(v?.ad_cost_usd), shipRaw: num(v?.shipping_cost_usd), unitProfit, revenue, productCost, returnLoss, estAds, estShipping, netProfit,
      totalUnits, hasEcon, returnRate, versionFrom: v ? String(v.effective_from).slice(0, 10) : null,
    };
    p.margin = revenue ? Math.round((netProfit * 100) / revenue) : null;
    p.flag = !hasEcon ? 'unset' : unitProfit <= 0 ? 'loss' : returnRate > 25 ? 'risky' : netProfit > 0 && row.units >= 2 ? 'star' : 'ok';
    products.push(p);
    const m = market(row.market);
    m.units += row.units; m.returns += row.returns;
    m.revenue += revenue; m.productCost += productCost; m.returnLoss += returnLoss;
    m.estAds += estAds; m.estShipping += estShipping; m.productProfit += netProfit;
    if (!hasEcon) m.unpricedUnits += row.units;
  }
  products.sort((a, b) => b.netProfit - a.netProfit);

  let shared = 0;
  const sharedByCategory = {};
  for (const e of monthExpenses) {
    const v = num(e.amount_usd);
    if (e.market === 'all' || !e.market) { shared += v; sharedByCategory[e.category] = (sharedByCategory[e.category] || 0) + v; }
    else { const m = market(e.market); m.expenses += v; m.expensesByCategory[e.category] = (m.expensesByCategory[e.category] || 0) + v; }
  }
  for (const m of Object.values(summary)) m.netProfit = m.productProfit - m.expenses;

  const markets = Object.values(summary);
  const sum = (f) => markets.reduce((s, m) => s + f(m), 0);
  const company = {
    orders: sum((m) => m.orders), units: sum((m) => m.units), returns: sum((m) => m.returns),
    revenue: sum((m) => m.revenue), productCost: sum((m) => m.productCost), returnLoss: sum((m) => m.returnLoss),
    estAds: sum((m) => m.estAds), estShipping: sum((m) => m.estShipping), productProfit: sum((m) => m.productProfit),
    marketExpenses: sum((m) => m.expenses), sharedExpenses: shared,
    expenses: sum((m) => m.expenses) + shared,
    unpricedUnits: sum((m) => m.unpricedUnits), ordersNoItems: sum((m) => m.ordersNoItems),
  };
  company.netProfit = company.productProfit - company.expenses;

  const flagCount = (f) => products.filter((p) => p.flag === f).length;
  return {
    month: monthStart, products, marketSummary: summary, company,
    sharedExpenses: shared, sharedByCategory,
    unmapped: [...unmapped.values()].sort((a, b) => b.units - a.units),
    estimates: { ads: useEstAds, shipping: useEstShip },
    totals: { netProfit: company.netProfit, revenue: company.revenue, stars: flagCount('star'), losers: flagCount('loss'), risky: flagCount('risky'), unset: flagCount('unset') },
  };
}
