// =============================================================
// profitabilityCalc — منطق الربحية الشهرية كدوال صرفة (بلا Supabase)
// اختبار مستقل: node test-profitability-calc.mjs
//
// قواعد (قرارات المالك 18 تشرين الأول 2026):
//  • البيع يُسجَّل في شهر التسليم الفعلي. كل طلب يحمل «أساس» تاريخ التسليم:
//      carrier (مصدر الشحن) | external (الشيت/النجوم) | substitute_* (بديل متحقَّق منه) | unknown.
//    unknown لا يُسنَد لأي شهر ويُعرض في قائمة «مسلَّمة بتاريخ غير معروف» (حالة الربح جزئي).
//  • settled ليس بيع منتجات. المعلّق/الملغي/قيد الشحن ليسوا مبيعات.
//  • المرتجع المكتمل = status 'returned' فقط. returning/not_received معلّقان (تعرُّض يُعرض، لا أثر مالي).
//    أثر المرتجع يُسجَّل في شهر الإرجاع (إن عُرف توقيته الموثوق) مع مرجع الطلب الأصلي:
//      - تخفيض إيراد البيع (فقط إن سُلِّم الطلب قبل إرجاعه، بسعر شهر التسليم).
//      - استرداد التكلفة للمخزون: فقط بمقدار حركة «استرداد للمخزون» الموثَّقة.
//      - خسارة التلف: فقط بمقدار حركة «إتلاف» موثَّقة مربوطة بالطلب.
//      - الباقي «تسوية غير محسومة» تُعرض ولا تُحسب لا تالفاً ولا قابلاً للبيع.
//  • الصنف بلا سعر أو بلا تكلفة يُستبعد من كل الأرقام ويُعدّ ناقصاً (التكلفة المفقودة ليست صفراً).
//  • الإعلان/الشحن لكل وحدة تقدير يُلغى لكل سوق عند وجود مصروف فعلي موجب **محوَّل للدولار** للسوق نفسه أو المشترك.
//  • المصاريف: accounting_entries مصدر رسمي (مصروف فعلي، غير ملغى، بلا تحويلات داخلية)؛
//    profitability_expenses للبنود الإضافية فقط؛ campaigns.spend و orders.delivery_cost لا يدخلان.
//    السوق غير المعروف = «مصروف غير موزّع» (لا تخمين). العملة غير الدولارية تُحوَّل بسعر شهري مُدخَل يدوياً فقط.
//  • الإيراد «محسوب من سعر المنتج بالدولار»، والمحصَّل الفعلي يبقى بعملته ولا يُجمع.
// =============================================================

export const MARKET_KEYS = ['syria', 'turkey', 'uae'];
export const ISTANBUL_OFFSET = '+03:00';
export const ADS_CATEGORIES = ['حملات إعلانية', 'سوشل ميديا', 'إعلانات'];
export const SHIPPING_CATEGORIES = ['أجور الشحن', 'شحن'];
export const PAYROLL_CATEGORIES = ['رواتب', 'رواتب + سلف', 'مصروف موظفين', 'أجور'];
export const FX_CURRENCIES = ['SYP', 'TRY', 'AED'];
export const DELIVERY_BASIS_LABELS = {
  carrier: 'مصدر الشحن',
  external: 'مصدر خارجي (شيت/نجوم)',
  substitute_staff_event: 'بديل: وقت تسجيل الموظف',
  substitute_tracker: 'بديل: وقت تحديث المتتبّع الآلي',
  unknown: 'غير معروف',
};

/** مفتاح مقارنة للأسماء. */
export function normName(s) {
  return String(s ?? '')
    .normalize('NFKC').toLowerCase()
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ').trim();
}
export const monthStartOf = (input) => `${String(input).slice(0, 7)}-01`;
export function istanbulMonthStart(ts) {
  const t = Date.parse(ts);
  return Number.isFinite(t) ? `${new Date(t + 3 * 3600 * 1000).toISOString().slice(0, 7)}-01` : null;
}
export function monthBounds(input) {
  const start = monthStartOf(input);
  const y = Number(start.slice(0, 4)), m = Number(start.slice(5, 7));
  const next = `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}-01`;
  return { monthStart: start, from: `${start}T00:00:00${ISTANBUL_OFFSET}`, to: `${next}T00:00:00${ISTANBUL_OFFSET}` };
}

export function buildResolver(nameMapRows = []) {
  const byAlias = new Map(), byCanon = new Map();
  for (const m of nameMapRows) {
    if (m.alias_name) byAlias.set(normName(m.alias_name), m);
    if (m.canonical_name && !byCanon.has(normName(m.canonical_name))) byCanon.set(normName(m.canonical_name), m);
  }
  return (raw) => {
    const m = byAlias.get(normName(raw)) || byCanon.get(normName(raw));
    const display = m?.canonical_name || String(raw).trim();
    return { name: display, key: normName(display), brand: m?.brand || 'lowes', active: m ? m.is_active !== false : true, mapped: !!m };
  };
}

/** فهرس النسخ. صنف بلا تاريخ: القيمة الحالية تُعتمد من شهر آخر تحديث لها فقط (مستنتج، يُوسَم legacy). */
export function buildVersionIndex(historyRows = [], currentRows = []) {
  const idx = new Map();
  const push = (row) => { const k = normName(row.item_name); (idx.get(k) || idx.set(k, []).get(k)).push(row); };
  historyRows.forEach(push);
  const has = new Set(idx.keys());
  currentRows.forEach((r) => {
    if (has.has(normName(r.item_name))) return;
    const from = istanbulMonthStart(r.updated_at);
    if (from) push({ ...r, effective_from: from, source: 'legacy_backfill' });
  });
  for (const arr of idx.values()) arr.sort((a, b) => (a.effective_from < b.effective_from ? 1 : -1));
  return idx;
}
export function pickVersion(index, key, monthStart) {
  const arr = index.get(key);
  return arr ? (arr.find((r) => String(r.effective_from).slice(0, 10) <= monthStart) || null) : null;
}

// ───────────────────────── المصاريف ─────────────────────────
const SET = (a) => new Set(a.map(normName));
const ADS = SET(ADS_CATEGORIES), SHIP = SET(SHIPPING_CATEGORIES), PAY = SET(PAYROLL_CATEGORIES);
export function expenseGroup(category, channelKind) {
  const k = normName(category);
  if (ADS.has(k)) return 'ads';
  if (SHIP.has(k) || channelKind === 'shipping') return 'shipping';
  if (PAY.has(k)) return 'payroll';
  return 'other';
}

/** يصنّف قيد محاسبة: {skip} أو {group, market, category, amounts}. السوق من قناة القيد فقط (لا من اسم الشركة). */
export function classifyAccountingEntry(e, channelsById = {}) {
  if (e.is_void) return { skip: 'void' };
  if (e.entry_type === 'transfer' || e.transfer_group || /^transfer_(in|out)$/.test(String(e.category || ''))) return { skip: 'transfer' };
  if (e.entry_type !== 'expense') return { skip: 'not_expense' };
  if (/^تحويل/.test(String(e.category || '').trim())) return { skip: 'suspected_transfer' };
  const ch = e.channel_id ? channelsById[e.channel_id] : null;
  const market = MARKET_KEYS.includes(ch?.market) ? ch.market : 'unallocated';
  return {
    id: e.id, group: expenseGroup(e.category, ch?.kind), market, category: e.category || '—', channel: ch?.name_ar || null,
    amounts: { USD: Number(e.amount_usd) || 0, TRY: Number(e.amount_try) || 0, SYP: Number(e.amount_syp) || 0 },
  };
}

/** سعر التحويل المعتمد (units_per_usd): الأحدث لنفس الشهر، نطاق السوق ثم 'all'. null = لا سعر. */
export function buildFxLookup(rows = [], monthStart) {
  const m = new Map();
  [...rows].filter((r) => String(r.month).slice(0, 10) === monthStart)
    .sort((a, b) => (String(a.entered_at) < String(b.entered_at) ? 1 : -1))
    .forEach((r) => { const k = `${r.currency}|${r.scope}`; if (!m.has(k)) m.set(k, Number(r.units_per_usd)); });
  return (currency, market) => m.get(`${currency}|${market}`) ?? m.get(`${currency}|all`) ?? null;
}

// ───────────────────────── الحساب ─────────────────────────
const num = (v) => Number(v) || 0;
const emptyReturns = () => ({ orders: 0, units: 0, revenueReduction: 0, costOut: 0, restockedCost: 0, damagedLoss: 0, unresolvedCost: 0, unresolvedOrders: 0, unpricedUnits: 0 });
const emptyMarket = () => ({
  orders: 0, ordersNoItems: 0, units: 0, revenue: 0, productCost: 0, estAds: 0, estShipping: 0, productProfit: 0,
  returns: emptyReturns(),
  expenses: 0, expensesByCategory: {}, actualShipping: 0, netProfit: 0,
  unpricedUnits: 0, unmappedUnits: 0, collected: {}, settledOrders: 0, settledCollected: {},
  deliveryBasis: {}, substituteOrders: 0, substituteUnits: 0,
  unknownDelivery: { orders: 0, units: 0 }, returnTimingUnknown: { orders: 0, units: 0, revenue: 0, cost: 0 },
  pendingReturns: { orders: 0, units: 0, cost: 0 }, historyConflict: 0,
  unconverted: {}, adsEstimated: true, shippingEstimated: true,
});

const ISSUES = {
  missing_econ: ['partial', 'قطع بلا سعر/تكلفة (مستبعدة من الأرقام)'],
  no_items: ['partial', 'طلبات مسلَّمة بلا أصناف'],
  unknown_delivery: ['partial', 'طلبات مسلَّمة بتاريخ تسليم غير معروف (غير مُسنَدة لأي شهر)'],
  fx_missing: ['partial', 'مصاريف بعملة بلا سعر صرف شهري معتمد (غير محسوبة بالدولار)'],
  estimates: ['estimated', 'إعلان/شحن بتقدير الوحدة (لا مصروف فعلي محوَّل)'],
  estimate_with_unallocated: ['estimated', 'تقدير مستخدم بينما يوجد مصروف فعلي غير موزّع على سوق (قد يتكرر)'],
  unallocated_expenses: ['estimated', 'مصاريف غير موزّعة على سوق'],
  substitute_dates: ['estimated', 'مبيعات بتاريخ تسليم بديل (وقت تسجيل/تحديث وليس وقت تسليم مؤكد)'],
  legacy_prices: ['estimated', 'أسعار/تكاليف تاريخها مستنتج من updated_at وليس من سجل أصلي'],
  unmapped: ['estimated', 'قطع بأسماء غير موحَّدة (تحتاج مراجعة)'],
  settled_review: ['estimated', 'طلبات «تمت التسوية» ليست بيع منتجات (للمراجعة)'],
  return_unresolved: ['estimated', 'مرتجعات مكتملة بمصير مخزون غير موثَّق (تسوية غير محسومة)'],
  return_timing_unknown: ['estimated', 'مرتجعات مكتملة بتوقيت إرجاع غير موثوق (لم يُخصم أثرها من أي شهر)'],
  pending_returns: ['estimated', 'مرتجعات معلّقة (راجع للمركز/لم يُستلم) — حالة نهائية غير مثبتة'],
  history_conflict: ['estimated', 'سجل حالات متناقض لطلبات مرتجعة'],
  manual_duplicate: ['estimated', 'مصروف يدوي مربوط بقيد محاسبي محسوب (تجاهلتُه منعاً للتكرار)'],
};
function assess(flags) {
  const issues = Object.entries(flags).filter(([, v]) => v && (v.orders > 0 || v.units > 0 || v.amount > 0 || v.count > 0))
    .map(([code, v]) => ({ code, level: ISSUES[code][0], label: ISSUES[code][1], ...v }));
  const status = issues.some((i) => i.level === 'partial') ? 'partial' : issues.length ? 'estimated' : 'final';
  return { status, issues };
}

/**
 * @param {object} p
 * @param {Array} p.orders          صفوف profitability_orders (انظر migration 20261018110000)
 * @param {Array} p.nameMapRows
 * @param {Array} p.historyRows     product_economics_history (≤ نهاية الشهر)
 * @param {Array} [p.currentRows]
 * @param {Array} [p.expenses]      profitability_expenses (إضافية)
 * @param {Array} [p.accountingEntries] accounting_entries لنفس الشهر
 * @param {Array|Object} [p.channels]   accounting_channels
 * @param {Array} [p.fxRates]       profitability_fx_rates
 * @param {string} p.month
 */
export function computeMonthly({ orders = [], nameMapRows = [], historyRows = [], currentRows = [], expenses = [], accountingEntries = [], channels = [], fxRates = [], month, brand = 'lowes' }) {
  const { monthStart, from, to } = monthBounds(month);
  const t0 = Date.parse(from), t1 = Date.parse(to);
  const inM = (ts) => { const t = Date.parse(ts); return Number.isFinite(t) && t >= t0 && t < t1; };
  const resolve = buildResolver(nameMapRows);
  const versions = buildVersionIndex(historyRows, currentRows);
  const fx = buildFxLookup(fxRates, monthStart);
  const chById = Array.isArray(channels) ? Object.fromEntries(channels.map((c) => [c.id, c])) : channels;
  const summary = { syria: emptyMarket(), turkey: emptyMarket(), uae: emptyMarket() };
  const mk = (m) => (summary[m] ||= emptyMarket());

  // ── المصاريف: محاسبة (مصدر رسمي) + إضافية ──
  const records = [];                 // {market:'syria'|…|'shared'|'unallocated', group, category, usd, source}
  const skipped = { void: 0, transfer: 0, suspected_transfer: [], not_expense: 0 };
  const unconvertedList = [];
  const countedAccIds = new Set();
  for (const e of accountingEntries) {
    const c = classifyAccountingEntry(e, chById);
    if (c.skip) { if (c.skip === 'suspected_transfer') skipped.suspected_transfer.push({ id: e.id, category: e.category, amounts: { USD: num(e.amount_usd), TRY: num(e.amount_try), SYP: num(e.amount_syp) } }); else skipped[c.skip] += 1; continue; }
    countedAccIds.add(c.id);
    let usd = c.amounts.USD, any = false;
    for (const cur of ['TRY', 'SYP']) {
      const a = c.amounts[cur]; if (!a) continue;
      const rate = fx(cur, c.market === 'unallocated' ? 'all' : c.market);
      if (rate) usd += a / rate;
      else { any = true; (mk(c.market).unconverted[cur] = (mk(c.market).unconverted[cur] || 0) + a); unconvertedList.push({ id: c.id, market: c.market, group: c.group, category: c.category, currency: cur, amount: a }); }
    }
    const hasUsd = usd > 0;
    records.push({ market: c.market, group: c.group, category: c.category, usd, source: 'accounting', hasUnconverted: any && !hasUsd, id: c.id, channel: c.channel });
  }
  let manualDup = 0;
  for (const e of expenses.filter((x) => String(x.month).slice(0, 10) === monthStart)) {
    if (e.accounting_entry_id && countedAccIds.has(e.accounting_entry_id)) { manualDup++; continue; }
    const v = num(e.amount_usd);
    records.push({ market: e.market === 'all' || !e.market ? 'shared' : e.market, group: expenseGroup(e.category), category: e.category, usd: v, source: 'manual', id: e.id });
  }
  const actual = (group, m) => records.some((r) => r.group === group && r.usd > 0 && (r.market === m || r.market === 'shared'));
  for (const k of MARKET_KEYS) { summary[k].adsEstimated = !actual('ads', k); summary[k].shippingEstimated = !actual('shipping', k); }

  // ── الطلبات ──
  const agg = new Map(), unmapped = new Map(), usedVersions = new Map(), unknownList = [], returnLists = { unresolved: [], timingUnknown: [], pending: [] };
  const itemsOf = (o) => {
    const out = [];
    for (const it of Array.isArray(o.items) ? o.items : []) {
      const raw = String(it?.name ?? '').trim(); if (!raw) continue;
      const r = resolve(raw); const qty = Number(it.qty);
      out.push({ ...r, raw, q: Number.isFinite(qty) && qty > 0 ? qty : 1 });
    }
    return out;
  };
  const versionFor = (it, ref) => {
    const v = pickVersion(versions, it.key, ref);
    const price = num(v?.sale_price_usd), cost = num(v?.cost_usd);
    const rec = usedVersions.get(it.key) || { name: it.name, units: 0, v };
    rec.units += it.q; rec.v = rec.v || v; usedVersions.set(it.key, rec);
    return { v, price, cost, ship: num(v?.shipping_cost_usd), ad: num(v?.ad_cost_usd), complete: price > 0 && cost > 0 };
  };
  const filt = (arr) => arr.filter((it) => it.active && (brand === 'all' || it.brand === brand));
  const row = (it, m) => { const id = `${it.key}|${m}`; const r = agg.get(id) || { name: it.name, brand: it.brand, market: m, key: it.key, units: 0, returns: 0, revenue: 0, productCost: 0, estAds: 0, estShipping: 0, netProfit: 0, complete: true }; agg.set(id, r); return r; };

  // كل فرع بدالة صغيرة (يُبقي مسارات التحليل قليلة — ESLint react-hooks كان ينفد ذاكرته على الدالة الواحدة الضخمة)
  const countedItems = (c) => c.items.length > 0;
  const handleSettled = (c) => {
    if (!inM(c.o.order_date)) return;
    c.M.settledOrders++;
    if (c.o.currency) c.M.settledCollected[c.o.currency] = (c.M.settledCollected[c.o.currency] || 0) + num(c.o.amount);
  };
  const handleUnknownDelivery = (c) => {
    const { o, M, m } = c;
    if (!(countedItems(c) || (c.all.length === 0 && (brand === 'all' || brand === 'lowes')))) return;
    M.unknownDelivery.orders++; M.unknownDelivery.units += c.units;
    unknownList.push({ id: o.id, code: o.order_code, market: m, order_date: o.order_date, units: c.units, reason: o.delivery_bulk_suspect ? 'bulk_import_event' : (o.hist_rows ? 'no_delivered_event' : 'no_history') });
  };
  const handleDelivery = (c) => {
    const { o, M, m } = c;
    if (countedItems(c)) {
      M.orders++;
      M.deliveryBasis[o.delivery_basis] = (M.deliveryBasis[o.delivery_basis] || 0) + 1;
      if (String(o.delivery_basis).startsWith('substitute')) { M.substituteOrders++; M.substituteUnits += c.units; }
      if (o.status === 'delivered' && o.currency) M.collected[o.currency] = (M.collected[o.currency] || 0) + num(o.amount);
    } else if (c.all.length === 0 && (brand === 'all' || brand === 'lowes')) M.ordersNoItems++;
    for (const it of c.items) {
      const r = row(it, m); const pv = versionFor(it, monthStart);
      r.units += it.q; M.units += it.q;
      if (!it.mapped) { const u = unmapped.get(it.key) || { name: it.raw, units: 0 }; u.units += it.q; unmapped.set(it.key, u); M.unmappedUnits += it.q; }
      if (!pv.complete) { r.complete = false; M.unpricedUnits += it.q; continue; }
      r.revenue += pv.price * it.q; r.productCost += pv.cost * it.q; r.estAds += (M.adsEstimated ? pv.ad : 0) * it.q; r.estShipping += (M.shippingEstimated ? pv.ship : 0) * it.q;
    }
  };
  const handleCompletedReturn = (c) => {
    const { o, M, m } = c;
    const R = M.returns; R.orders++; R.units += c.units;
    const afterDelivery = !!o.delivered_before_return && !!o.delivered_at;
    const dMonth = afterDelivery ? istanbulMonthStart(o.delivered_at) : istanbulMonthStart(o.order_date);
    let costOut = 0, revRed = 0, incomplete = 0;
    for (const it of c.items) {
      const pv = versionFor(it, dMonth);
      if (!pv.complete) { incomplete += it.q; continue; }
      costOut += pv.cost * it.q; if (afterDelivery) revRed += pv.price * it.q;
      const r = row(it, m); r.returns += it.q; r.estShipping += (M.shippingEstimated ? pv.ship : 0) * it.q;
    }
    R.unpricedUnits += incomplete;
    const denom = num(o.reserve_qty) > 0 ? num(o.reserve_qty) : c.allUnits;
    const rr = denom > 0 ? Math.min(1, num(o.restock_qty) / denom) : 0;
    const rw = denom > 0 ? Math.min(1 - rr, num(o.waste_qty) / denom) : 0;
    const restocked = costOut * rr, damaged = costOut * rw, unresolved = costOut - restocked - damaged;
    R.revenueReduction += revRed; R.costOut += costOut; R.restockedCost += restocked; R.damagedLoss += damaged; R.unresolvedCost += unresolved;
    if (unresolved > 1e-9 || incomplete) { R.unresolvedOrders++; returnLists.unresolved.push({ id: o.id, code: o.order_code, market: m, units: c.units, cost: unresolved, afterDelivery, return_at: o.return_at }); }
    // أثر P&L المؤكَّد فقط: − تخفيض الإيراد + التكلفة المستردة (إن سُلِّم سابقاً)؛ − التالف الموثَّق (إن لم يُسلَّم سابقاً: التكلفة لم تُسجَّل أصلاً فنخصم التالف فقط)
    M.__returnEffect = (M.__returnEffect || 0) + (afterDelivery ? -revRed + restocked : -damaged);
  };
  const handleReturnTimingUnknown = (c) => {
    const { o, M, m } = c;
    let rev = 0, cost = 0;
    const ref = o.delivered_at ? istanbulMonthStart(o.delivered_at) : istanbulMonthStart(o.order_date);
    for (const it of c.items) { const pv = versionFor(it, ref); if (pv.complete) { cost += pv.cost * it.q; if (o.delivered_before_return) rev += pv.price * it.q; } }
    M.returnTimingUnknown.orders++; M.returnTimingUnknown.units += c.units; M.returnTimingUnknown.revenue += rev; M.returnTimingUnknown.cost += cost;
    returnLists.timingUnknown.push({ id: o.id, code: o.order_code, market: m, units: c.units, revenue: rev, cost, afterDelivery: !!o.delivered_before_return });
  };
  const handlePending = (c) => {
    const { o, M, m } = c;
    let cost = 0; for (const it of c.items) { const pv = versionFor(it, istanbulMonthStart(o.order_date)); if (pv.complete) cost += pv.cost * it.q; }
    M.pendingReturns.orders++; M.pendingReturns.units += c.units; M.pendingReturns.cost += cost;
    returnLists.pending.push({ id: o.id, code: o.order_code, market: m, status: o.status, units: c.units, cost });
  };
  const handleOrder = (o) => {
    const m = MARKET_KEYS.includes(o.market) ? o.market : 'unknown';
    const all = itemsOf(o), items = filt(all);
    const c = { o, m, M: mk(m), all, items, units: items.reduce((s, i) => s + i.q, 0), allUnits: all.reduce((s, i) => s + i.q, 0) };
    if (o.status === 'settled') return handleSettled(c);
    if (o.status === 'delivered' && (!o.delivered_at || o.delivery_basis === 'unknown')) return handleUnknownDelivery(c);
    const delivered = (o.status === 'delivered' || o.delivered_before_return) && o.delivered_at && inM(o.delivered_at) && o.delivery_basis !== 'unknown';
    const retKnown = o.status === 'returned' && o.return_at && !o.return_bulk_suspect;
    if (o.status === 'returned' && o.history_conflict) c.M.historyConflict++;
    if (delivered) handleDelivery(c);
    if (retKnown && inM(o.return_at)) handleCompletedReturn(c);
    if (o.status === 'returned' && !retKnown && (delivered || (!o.delivered_before_return && inM(o.order_date)))) handleReturnTimingUnknown(c);
    if ((o.status === 'returning' || o.status === 'not_received') && inM(o.order_date)) handlePending(c);
    return undefined;
  };
  for (const o of orders) handleOrder(o);

  // ── تجميع الأصناف ──
  const products = [];
  for (const r of agg.values()) {
    const m = mk(r.market);
    const p = { name: r.name, brand: r.brand, market: r.market, units: r.units, returns: r.returns, revenue: r.revenue, productCost: r.productCost, estAds: r.estAds, estShipping: r.estShipping, hasEcon: r.complete };
    p.netProfit = r.revenue - r.productCost - r.estAds - r.estShipping;
    p.unitProfit = r.units && r.complete ? p.netProfit / r.units : null;
    p.margin = r.revenue ? Math.round((p.netProfit * 100) / r.revenue) : null;
    const ret = r.units + r.returns ? Math.round((r.returns * 100) / (r.units + r.returns)) : 0; p.returnRate = ret;
    p.flag = !r.complete ? 'unset' : p.unitProfit <= 0 ? 'loss' : ret > 25 ? 'risky' : p.netProfit > 0 && r.units >= 2 ? 'star' : 'ok';
    const v = usedVersions.get(r.key)?.v; p.versionFrom = v ? String(v.effective_from).slice(0, 10) : null;
    const rk = usedVersions.get(r.key); const vv = rk?.v || pickVersion(versions, r.key, monthStart);
    p.price = num(vv?.sale_price_usd); p.cost = num(vv?.cost_usd); p.adRaw = num(vv?.ad_cost_usd); p.shipRaw = num(vv?.shipping_cost_usd); p.ad = m.adsEstimated ? p.adRaw : 0; p.ship = m.shippingEstimated ? p.shipRaw : 0;
    products.push(p);
    m.revenue += r.revenue; m.productCost += r.productCost; m.estAds += r.estAds; m.estShipping += r.estShipping;
  }
  products.sort((a, b) => b.netProfit - a.netProfit);

  // ── المصاريف إلى الأسواق ──
  const company = { shared: 0, unallocated: 0, unallocatedByCategory: {}, sharedByCategory: {} };
  for (const r of records) {
    if (r.market === 'shared') { company.shared += r.usd; company.sharedByCategory[r.category] = (company.sharedByCategory[r.category] || 0) + r.usd; }
    else if (r.market === 'unallocated') { company.unallocated += r.usd; company.unallocatedByCategory[r.category] = (company.unallocatedByCategory[r.category] || 0) + r.usd; }
    else { const m = mk(r.market); m.expenses += r.usd; m.expensesByCategory[r.category] = (m.expensesByCategory[r.category] || 0) + r.usd; if (r.group === 'shipping') m.actualShipping += r.usd; }
  }
  for (const m of Object.values(summary)) {
    m.productProfit = m.revenue - m.productCost - m.estAds - m.estShipping + (m.__returnEffect || 0);
    m.netProfit = m.productProfit - m.expenses; delete m.__returnEffect;
  }

  // ── مراجعة الأسعار التاريخية ──
  const effNow = [...versions.keys()].map((k) => ({ key: k, v: pickVersion(versions, k, monthStart) })).filter((x) => x.v && num(x.v.sale_price_usd) > 0 && num(x.v.cost_usd) > 0);
  const pairCount = new Map(); effNow.forEach((x) => { const k = `${num(x.v.sale_price_usd)}/${num(x.v.cost_usd)}`; pairCount.set(k, (pairCount.get(k) || 0) + 1); });
  const reviewList = [];
  for (const [key, rec] of usedVersions) {
    const v = rec.v; if (!v) continue;
    const price = num(v.sale_price_usd), cost = num(v.cost_usd), reasons = [];
    const pk = `${price}/${cost}`;
    if (price > 0 && cost > 0 && pairCount.get(pk) >= 5) reasons.push(`نمط متكرر: ${pairCount.get(pk)} صنفاً بنفس السعر/التكلفة ${pk}`);
    if (price > 0 && cost > 0 && (price <= 1 || cost >= price)) reasons.push(`قيمة مشتبهة: سعر ${price} وتكلفة ${cost} (هامش صفر/سالب أو مبلغ 1$)`);
    if (v.source === 'legacy_backfill') reasons.push('تاريخ البدء مستنتج من updated_at وليس من سجل أصلي');
    if (reasons.length) reviewList.push({ key, name: rec.name, units: rec.units, price, cost, versionFrom: String(v.effective_from).slice(0, 10), source: v.source || 'entered', reasons });
  }
  reviewList.sort((a, b) => b.units - a.units);
  const legacyUnits = [...usedVersions.values()].filter((r) => r.v?.source === 'legacy_backfill').reduce((s, r) => s + r.units, 0);

  // ── جودة الصافي ──
  const sumM = (f) => Object.values(summary).reduce((s, m) => s + f(m), 0);
  const estUsedAds = Object.values(summary).some((m) => m.adsEstimated && m.estAds > 0), estUsedShip = Object.values(summary).some((m) => m.shippingEstimated && m.estShipping > 0);
  const unallocActual = (g) => records.some((r) => r.market === 'unallocated' && r.group === g && r.usd > 0);
  const unconvertedCount = unconvertedList.length;
  const qualityFor = (m, scope) => assess({
    missing_econ: { units: m.unpricedUnits + m.returns.unpricedUnits },
    no_items: { orders: m.ordersNoItems },
    unknown_delivery: { orders: m.unknownDelivery.orders, units: m.unknownDelivery.units },
    fx_missing: scope === 'company' ? { count: unconvertedCount } : { count: Object.keys(m.unconverted).length },
    estimates: { amount: m.estAds + m.estShipping },
    estimate_with_unallocated: scope === 'company' && ((estUsedAds && unallocActual('ads')) || (estUsedShip && unallocActual('shipping'))) ? { count: 1 } : null,
    unallocated_expenses: scope === 'company' ? { amount: company.unallocated } : null,
    substitute_dates: { orders: m.substituteOrders, units: m.substituteUnits },
    legacy_prices: scope === 'company' ? { units: legacyUnits } : null,
    unmapped: { units: m.unmappedUnits },
    settled_review: { orders: m.settledOrders },
    return_unresolved: { orders: m.returns.unresolvedOrders, amount: m.returns.unresolvedCost },
    return_timing_unknown: { orders: m.returnTimingUnknown.orders, units: m.returnTimingUnknown.units },
    pending_returns: { orders: m.pendingReturns.orders, units: m.pendingReturns.units },
    history_conflict: { count: m.historyConflict },
    manual_duplicate: scope === 'company' ? { count: manualDup } : null,
  });
  for (const m of Object.values(summary)) m.quality = qualityFor(m, 'market');

  const total = {
    orders: sumM((m) => m.orders), units: sumM((m) => m.units), revenue: sumM((m) => m.revenue), productCost: sumM((m) => m.productCost),
    estAds: sumM((m) => m.estAds), estShipping: sumM((m) => m.estShipping), productProfit: sumM((m) => m.productProfit),
    marketExpenses: sumM((m) => m.expenses), sharedExpenses: company.shared, unallocatedExpenses: company.unallocated,
    returns: ['orders', 'units', 'revenueReduction', 'costOut', 'restockedCost', 'damagedLoss', 'unresolvedCost', 'unresolvedOrders', 'unpricedUnits'].reduce((o, k) => (o[k] = sumM((m) => m.returns[k]), o), {}),
    unpricedUnits: sumM((m) => m.unpricedUnits), unmappedUnits: sumM((m) => m.unmappedUnits), ordersNoItems: sumM((m) => m.ordersNoItems), settledOrders: sumM((m) => m.settledOrders),
    unknownDelivery: { orders: sumM((m) => m.unknownDelivery.orders), units: sumM((m) => m.unknownDelivery.units) },
    returnTimingUnknown: { orders: sumM((m) => m.returnTimingUnknown.orders), units: sumM((m) => m.returnTimingUnknown.units), revenue: sumM((m) => m.returnTimingUnknown.revenue), cost: sumM((m) => m.returnTimingUnknown.cost) },
    pendingReturns: { orders: sumM((m) => m.pendingReturns.orders), units: sumM((m) => m.pendingReturns.units), cost: sumM((m) => m.pendingReturns.cost) },
    substituteOrders: sumM((m) => m.substituteOrders), substituteUnits: sumM((m) => m.substituteUnits), historyConflict: sumM((m) => m.historyConflict),
    unconverted: unconvertedList.reduce((o, u) => ((o[u.currency] = (o[u.currency] || 0) + u.amount), o), {}),
  };
  total.expenses = total.marketExpenses + total.sharedExpenses + total.unallocatedExpenses;
  total.netProfit = total.productProfit - total.expenses;
  const cq = qualityFor({ ...total, unconverted: total.unconverted, estAds: total.estAds, estShipping: total.estShipping, returns: total.returns }, 'company');
  total.quality = cq;

  const flagCount = (f) => products.filter((p) => p.flag === f).length;
  return {
    month: monthStart, products, marketSummary: summary, company: total,
    sharedExpenses: company.shared, sharedByCategory: company.sharedByCategory,
    unallocated: { usd: company.unallocated, byCategory: company.unallocatedByCategory, unconverted: unconvertedList },
    skippedAccounting: skipped, unknownDeliveryOrders: unknownList, returnLists,
    unmapped: [...unmapped.values()].sort((a, b) => b.units - a.units), reviewList,
    totals: { netProfit: total.netProfit, revenue: total.revenue, stars: flagCount('star'), losers: flagCount('loss'), risky: flagCount('risky'), unset: flagCount('unset') },
  };
}

/** لقطة الإغلاق: أرقام الشهر المفتاحية فقط (تُقارَن لاحقاً بالحساب الحي). */
export function snapshotOf(r) {
  const c = r.company;
  return { netProfit: round2(c.netProfit), revenue: round2(c.revenue), productCost: round2(c.productCost), expenses: round2(c.expenses), orders: c.orders, units: c.units, status: c.quality.status };
}
export function diffSnapshot(a, b) {
  return Object.keys(a || {}).filter((k) => a[k] !== (b || {})[k]).map((k) => ({ field: k, before: a[k], after: (b || {})[k] }));
}
const round2 = (x) => Math.round(num(x) * 100) / 100;
