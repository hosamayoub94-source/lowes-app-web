// =============================================================
// profitabilityCalc — منطق الربحية الشهرية كدوال صرفة (بلا Supabase)
// حتى يُختبر باستقلال: node test-profitability-calc.mjs
//
// القواعد (قرار 17 تشرين الأول 2026، مراجعة ثانية):
//  • المبيعات = طلبات delivered فقط، حسب order_date داخل الشهر (توقيت إسطنبول).
//    settled (تسوية: عادةً أجور فقط، الطلب غير مدفوع) ليس بيع منتجات: يُعرض منفصلاً للمراجعة.
//    المعلّق/الملغي/قيد الشحن لا يُحسب مبيعاً.
//  • المرتجع = not_received/returning/returned: يُعرض منفصلاً ويخسر تكلفة الصنف (افتراض قائم).
//  • السعر/التكلفة من «النسخة السارية» (أحدث effective_from <= أول الشهر). لا نسخة = ناقص.
//    صنف بلا سعر أو بلا تكلفة يُستبعد من الأرقام كلها ويُعدّ ناقصاً — التكلفة المفقودة ليست صفراً.
//  • الإعلان/الشحن لكل وحدة تقدير يُلغى **لكل سوق على حدة** عند وجود مصروف فعلي موجب:
//      إعلان: حملات إعلانية | سوشل ميديا  — شحن: أجور الشحن
//    بسوق السوق نفسه أو بالمشترك (all) فقط. مصروف فئة أخرى لا يُلغي شيئاً.
//  • صافي السوق = أرباح الأصناف − مصاريف السوق اليدوية.
//    صافي الشركة = مجموع الأسواق − المصاريف المشتركة (market='all'، غير مُوزَّعة).
//  • الإيراد هنا «محسوب من سعر المنتج بالدولار × الكمية»، وليس تحصيلاً نقدياً. المحصَّل الفعلي
//    يُعرض بعملة الطلب الأصلية ولا يُجمع ولا يُحوَّل (لا أسعار صرف معتمدة).
// =============================================================

export const SALE_STATUSES = ['delivered'];
export const SETTLED_STATUSES = ['settled'];
export const RETURN_STATUSES = ['not_received', 'returning', 'returned'];
export const MARKET_KEYS = ['syria', 'turkey', 'uae'];
export const ADS_CATEGORIES = ['حملات إعلانية', 'سوشل ميديا'];
export const SHIPPING_CATEGORIES = ['أجور الشحن'];
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

/** أول شهر (إسطنبول) للحظة زمنية. */
export function istanbulMonthStart(ts) {
  const t = Date.parse(ts);
  if (!Number.isFinite(t)) return null;
  return `${new Date(t + 3 * 3600 * 1000).toISOString().slice(0, 7)}-01`;
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

/**
 * فهرس النسخ: key → صفوف مرتّبة تنازلياً بـeffective_from.
 * صنف بلا أي تاريخ لكن له قيمة حالية: تُعتمد القيمة من شهر آخر تحديث لها (الدليل الوحيد على متى عُرفت)،
 * لا من بداية الزمن — الأشهر الأسبق تبقى ناقصة.
 */
export function buildVersionIndex(historyRows = [], currentRows = []) {
  const idx = new Map();
  const push = (row) => {
    const k = normName(row.item_name);
    if (!idx.has(k)) idx.set(k, []);
    idx.get(k).push(row);
  };
  historyRows.forEach(push);
  const has = new Set(idx.keys());
  currentRows.forEach((r) => {
    if (has.has(normName(r.item_name))) return;
    const from = istanbulMonthStart(r.updated_at);
    if (from) push({ ...r, effective_from: from });
  });
  for (const arr of idx.values()) arr.sort((a, b) => (a.effective_from < b.effective_from ? 1 : -1));
  return idx;
}

/** النسخة السارية للصنف في الشهر (أحدث effective_from <= أول الشهر) أو null. */
export function pickVersion(index, key, monthStart) {
  const arr = index.get(key);
  if (!arr) return null;
  return arr.find((r) => String(r.effective_from).slice(0, 10) <= monthStart) || null;
}

/** هل يوجد مصروف فعلي موجب من هذه الفئات ينطبق على هذا السوق (سوقه أو المشترك)؟ */
export function hasActualExpense(expenses, categories, market) {
  const cats = new Set(categories.map(normName));
  return expenses.some((e) => cats.has(normName(e.category)) && (Number(e.amount_usd) || 0) > 0
    && (!e.market || e.market === 'all' || e.market === market));
}

const num = (v) => Number(v) || 0;
const emptyMarket = () => ({
  orders: 0, returnedOrders: 0, ordersNoItems: 0, units: 0, returns: 0,
  revenue: 0, productCost: 0, returnLoss: 0, estAds: 0, estShipping: 0, productProfit: 0,
  expenses: 0, expensesByCategory: {}, netProfit: 0,
  unpricedUnits: 0, unpricedReturnUnits: 0, unmappedUnits: 0,
  settledOrders: 0, settledCollected: {}, collected: {},
  returnsNoHistory: { orders: 0, units: 0 }, returnsAfterDelivery: { orders: 0, units: 0 },
  adsEstimated: false, shippingEstimated: false,
});

const ISSUE_LABELS = {
  missing_econ: 'قطع بلا سعر/تكلفة (مستبعدة من الأرقام)',
  no_items: 'طلبات مسلَّمة بلا أصناف (غير مكتملة)',
  estimates: 'إعلان/شحن بتقدير الوحدة (لا مصروف فعلي)',
  unmapped: 'قطع بأسماء غير موحَّدة (تحتاج مراجعة)',
  settled_review: 'طلبات «تمت التسوية» ليست بيع منتجات (للمراجعة)',
  returns_no_history: 'مرتجعات بلا سجل حالات (توقيت غير مثبت)',
  returns_after_delivery: 'مرتجعات بعد تسليم سابق (مبيعات شهر سابق قد تكون تغيّرت)',
};

function assess(m) {
  const issues = [];
  const add = (code, orders, units) => issues.push({ code, label: ISSUE_LABELS[code], orders, units });
  if (m.unpricedUnits + m.unpricedReturnUnits > 0) add('missing_econ', null, m.unpricedUnits + m.unpricedReturnUnits);
  if (m.ordersNoItems > 0) add('no_items', m.ordersNoItems, 0);
  const core = issues.length > 0;
  if (m.estAds > 0 || m.estShipping > 0) add('estimates', null, null);
  if (m.unmappedUnits > 0) add('unmapped', null, m.unmappedUnits);
  if (m.settledOrders > 0) add('settled_review', m.settledOrders, null);
  if (m.returnsNoHistory.orders > 0) add('returns_no_history', m.returnsNoHistory.orders, m.returnsNoHistory.units);
  if (m.returnsAfterDelivery.orders > 0) add('returns_after_delivery', m.returnsAfterDelivery.orders, m.returnsAfterDelivery.units);
  return { status: core ? 'partial' : issues.length ? 'estimated' : 'final', issues };
}

/**
 * @param {object} p
 * @param {Array} p.orders        صفوف orders: id, status, items, order_date, market, amount, currency
 * @param {Array} p.nameMapRows   product_name_map
 * @param {Array} p.historyRows   product_economics_history
 * @param {Array} [p.currentRows] product_economics (احتياط لأصناف بلا تاريخ)
 * @param {Array} p.expenses      profitability_expenses
 * @param {object} [p.statusHistory] orderId → [{to_status, changed_at}] للمرتجعات (undefined = لم يُجلب)
 * @param {string} p.month        'YYYY-MM' أو 'YYYY-MM-DD'
 * @param {string} [p.brand]      'lowes' | 'strong' | 'all'
 */
export function computeMonthly({ orders = [], nameMapRows = [], historyRows = [], currentRows = [], expenses = [], statusHistory, month, brand = 'lowes' }) {
  const { monthStart, from, to } = monthBounds(month);
  const t0 = Date.parse(from), t1 = Date.parse(to);
  const resolve = buildResolver(nameMapRows);
  const versions = buildVersionIndex(historyRows, currentRows);
  const monthExpenses = expenses.filter((e) => String(e.month).slice(0, 10) === monthStart);

  const agg = new Map();           // key|market → {name, brand, market, units, returns}
  const unmapped = new Map();      // key → {name, units}
  const summary = { syria: emptyMarket(), turkey: emptyMarket(), uae: emptyMarket() };
  const market = (m) => (summary[m] ||= emptyMarket());
  for (const k of MARKET_KEYS) {
    summary[k].adsEstimated = !hasActualExpense(monthExpenses, ADS_CATEGORIES, k);
    summary[k].shippingEstimated = !hasActualExpense(monthExpenses, SHIPPING_CATEGORIES, k);
  }

  for (const o of orders) {
    const isSale = SALE_STATUSES.includes(o.status), isReturn = RETURN_STATUSES.includes(o.status), isSettled = SETTLED_STATUSES.includes(o.status);
    if (!isSale && !isReturn && !isSettled) continue;          // معلّق/ملغي/قيد الشحن: ليس مبيعاً
    if (o.deleted_at) continue;
    const t = Date.parse(o.order_date);
    if (!Number.isFinite(t) || t < t0 || t >= t1) continue;    // خارج الشهر
    const mk = MARKET_KEYS.includes(o.market) ? o.market : 'unknown';
    const m = market(mk);
    if (isSettled) {                                           // ليس بيع منتجات — للمراجعة فقط
      m.settledOrders++;
      if (o.currency) m.settledCollected[o.currency] = (m.settledCollected[o.currency] || 0) + num(o.amount);
      continue;
    }
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
      if (!r.mapped && isSale) { const u = unmapped.get(r.key) || { name: raw, units: 0 }; u.units += q; unmapped.set(r.key, u); m.unmappedUnits += q; }
    }
    if (counted > 0) { if (isSale) m.orders++; else m.returnedOrders++; }
    else if (isSale && items.length === 0 && (brand === 'all' || brand === 'lowes')) m.ordersNoItems++;
    if (isSale && counted > 0 && o.currency) m.collected[o.currency] = (m.collected[o.currency] || 0) + num(o.amount);
    if (isReturn && counted > 0 && statusHistory) {
      const h = statusHistory[o.id];
      if (!Array.isArray(h) || h.length === 0) { m.returnsNoHistory.orders++; m.returnsNoHistory.units += counted; }
      else if (h.some((x) => x.to_status === 'delivered')) { m.returnsAfterDelivery.orders++; m.returnsAfterDelivery.units += counted; }
    }
  }

  const products = [];
  for (const row of agg.values()) {
    const v = pickVersion(versions, row.key, monthStart);
    const price = num(v?.sale_price_usd), cost = num(v?.cost_usd);
    const mk = summary[row.market] || { adsEstimated: true, shippingEstimated: true };
    const ad = mk.adsEstimated ? num(v?.ad_cost_usd) : 0, ship = mk.shippingEstimated ? num(v?.shipping_cost_usd) : 0;
    const hasEcon = price > 0 && cost > 0;
    // بلا سعر أو تكلفة: لا إيراد ولا تكلفة ولا ربح — النقص ظاهر ولا يُعامَل كصفر
    const revenue = hasEcon ? price * row.units : 0, productCost = hasEcon ? cost * row.units : 0, returnLoss = hasEcon ? cost * row.returns : 0;
    const estAds = hasEcon ? ad * row.units : 0, estShipping = hasEcon ? ship * (row.units + row.returns) : 0;
    const netProfit = revenue - productCost - returnLoss - estAds - estShipping;
    const totalUnits = row.units + row.returns;
    const unitProfit = hasEcon ? price - cost - ad - ship : null;
    const returnRate = totalUnits ? Math.round((row.returns * 100) / totalUnits) : 0;
    const p = {
      name: row.name, brand: row.brand, market: row.market, units: row.units, returns: row.returns,
      price, cost, ad, ship, adRaw: num(v?.ad_cost_usd), shipRaw: num(v?.shipping_cost_usd), unitProfit,
      revenue, productCost, returnLoss, estAds, estShipping, netProfit,
      totalUnits, hasEcon, returnRate, versionFrom: v ? String(v.effective_from).slice(0, 10) : null,
    };
    p.margin = hasEcon && revenue ? Math.round((netProfit * 100) / revenue) : null;
    p.flag = !hasEcon ? 'unset' : unitProfit <= 0 ? 'loss' : returnRate > 25 ? 'risky' : netProfit > 0 && row.units >= 2 ? 'star' : 'ok';
    products.push(p);
    const m = market(row.market);
    m.units += row.units; m.returns += row.returns;
    m.revenue += revenue; m.productCost += productCost; m.returnLoss += returnLoss;
    m.estAds += estAds; m.estShipping += estShipping; m.productProfit += netProfit;
    if (!hasEcon) { m.unpricedUnits += row.units; m.unpricedReturnUnits += row.returns; }
  }
  products.sort((a, b) => b.netProfit - a.netProfit);

  let shared = 0;
  const sharedByCategory = {};
  for (const e of monthExpenses) {
    const v = num(e.amount_usd);
    if (e.market === 'all' || !e.market) { shared += v; sharedByCategory[e.category] = (sharedByCategory[e.category] || 0) + v; }
    else { const m = market(e.market); m.expenses += v; m.expensesByCategory[e.category] = (m.expensesByCategory[e.category] || 0) + v; }
  }
  for (const m of Object.values(summary)) { m.netProfit = m.productProfit - m.expenses; m.quality = assess(m); }

  const markets = Object.values(summary);
  const sum = (f) => markets.reduce((s, m) => s + f(m), 0);
  const company = {
    orders: sum((m) => m.orders), units: sum((m) => m.units), returns: sum((m) => m.returns),
    revenue: sum((m) => m.revenue), productCost: sum((m) => m.productCost), returnLoss: sum((m) => m.returnLoss),
    estAds: sum((m) => m.estAds), estShipping: sum((m) => m.estShipping), productProfit: sum((m) => m.productProfit),
    marketExpenses: sum((m) => m.expenses), sharedExpenses: shared,
    expenses: sum((m) => m.expenses) + shared,
    unpricedUnits: sum((m) => m.unpricedUnits), unpricedReturnUnits: sum((m) => m.unpricedReturnUnits),
    unmappedUnits: sum((m) => m.unmappedUnits), ordersNoItems: sum((m) => m.ordersNoItems), settledOrders: sum((m) => m.settledOrders),
    returnsNoHistory: { orders: sum((m) => m.returnsNoHistory.orders), units: sum((m) => m.returnsNoHistory.units) },
    returnsAfterDelivery: { orders: sum((m) => m.returnsAfterDelivery.orders), units: sum((m) => m.returnsAfterDelivery.units) },
  };
  company.netProfit = company.productProfit - company.expenses;
  company.quality = assess(company);

  const flagCount = (f) => products.filter((p) => p.flag === f).length;
  return {
    month: monthStart, products, marketSummary: summary, company,
    sharedExpenses: shared, sharedByCategory,
    unmapped: [...unmapped.values()].sort((a, b) => b.units - a.units),
    totals: { netProfit: company.netProfit, revenue: company.revenue, stars: flagCount('star'), losers: flagCount('loss'), risky: flagCount('risky'), unset: flagCount('unset') },
  };
}
