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
export const PACKAGING_CATEGORIES = ['تغليف', 'أجور التغليف', 'مواد تغليف', 'التغليف', 'تغليف + أجور التغليف'];
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

/** فهرس أسعار السوق: مفتاح item|market ← صفوف مرتّبة تنازلياً بالشهر. */
export function buildMarketIndex(rows = []) {
  const idx = new Map();
  for (const r of rows) { const k = `${normName(r.item_name)}|${r.market}`; (idx.get(k) || idx.set(k, []).get(k)).push(r); }
  for (const arr of idx.values()) arr.sort((a, b) => (a.effective_from < b.effective_from ? 1 : -1));
  return idx;
}
const hasN = (v) => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));
/**
 * سعر/تكلفة/شحن صنف بسوق وشهر. السعر من جدول السوق فقط؛ غيابه ← السعر الموحّد القديم موسوماً legacy_unified؛ غيابهما ← missing.
 * لا يُستعمل أبداً سعر سوق آخر. التكلفة: تكلفة السوق إن وُجدت وإلا التكلفة الموحّدة.
 */
export function resolveEcon(versions, marketIdx, key, market, monthStart, nowMonth) {
  const uni = pickVersion(versions, key, monthStart);
  const arr = marketIdx.get(`${key}|${market}`);
  const find = (f) => (arr ? (arr.find((r) => String(r.effective_from).slice(0, 10) <= monthStart && hasN(r[f])) || null) : null);
  const mp = find('sale_price_usd'), mc = find('cost_usd'), ms = find('shipping_cost_usd');
  let price = 0, basis = 'missing', priceFrom = null;
  if (mp) { price = Number(mp.sale_price_usd) || 0; basis = 'market'; priceFrom = String(mp.effective_from).slice(0, 10); }
  else if (uni && Number(uni.sale_price_usd) > 0) { price = Number(uni.sale_price_usd); basis = 'legacy_unified'; priceFrom = String(uni.effective_from).slice(0, 10); }
  const cost = mc ? Number(mc.cost_usd) || 0 : Number(uni?.cost_usd) || 0;
  const ship = ms ? Number(ms.shipping_cost_usd) || 0 : Number(uni?.shipping_cost_usd) || 0;
  const status = basis === 'missing' ? 'missing' : basis === 'legacy_unified' ? 'legacy_unified' : (monthStart >= (nowMonth || monthStart) ? 'current' : 'historical');
  return { uni, price, cost, ship, ad: Number(uni?.ad_cost_usd) || 0, basis, priceFrom, status, costBasis: mc ? 'market' : 'unified', costStatus: cost > 0 ? (mc ? 'market' : 'unified') : 'missing', complete: price > 0 && cost > 0 };
}

// ───────────────────────── المصاريف ─────────────────────────
const SET = (a) => new Set(a.map(normName));
const ADS = SET(ADS_CATEGORIES), SHIP = SET(SHIPPING_CATEGORIES), PAY = SET(PAYROLL_CATEGORIES), PACK = SET(PACKAGING_CATEGORIES);
export function expenseGroup(category, channelKind) {
  const k = normName(category);
  if (ADS.has(k)) return 'ads';
  if (SHIP.has(k) || channelKind === 'shipping') return 'shipping';
  if (PAY.has(k)) return 'payroll';
  if (PACK.has(k)) return 'packaging';
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
// سياسة المالك (18 تشرين الأول): الطلب المرتجع يعود للمخزون؛ شحنه مرة ونصف إجمالاً (بعد التسليم يُضاف نصف مرة فوق الشحن المحسوب عند التسليم)
const MAX_QTY = 500; // كمية بند أكبر من هذا = إدخال خاطئ (مثلاً رقم هاتف) → تُعدّ 1 وتُنبَّه
const RETURN_SHIP_FACTOR = (afterDelivery) => (afterDelivery ? 0.5 : 1.5);
const emptyReturns = () => ({ fxMissingOrders: 0, assumedRestockCost: 0, orders: 0, units: 0, revenueReduction: 0, costOut: 0, restockedCost: 0, damagedLoss: 0, unresolvedCost: 0, unresolvedOrders: 0, unpricedUnits: 0 });
const emptyMarket = () => ({
  orders: 0, ordersNoItems: 0, units: 0, revenue: 0, referenceRevenue: 0, unallocatedRevenue: 0, unallocatedOrders: 0, mixedBrandUnsplit: 0,
  suspectQtyLines: 0, customerDeliveryFees: {}, partialPayment: { orders: 0, byCurrency: {} }, payrollMissing: false,
  revenueByCurrency: {}, revenueNoFx: { orders: 0, units: 0, byCurrency: {} }, revenueMissing: { orders: 0, units: 0 }, productCost: 0, estAds: 0, estShipping: 0, productProfit: 0,
  returns: emptyReturns(),
  expenses: 0, expensesByCategory: {}, actualShipping: 0, netProfit: 0,
  unpricedUnits: 0, legacyUnifiedUnits: 0, unmappedUnits: 0, collected: {}, settledOrders: 0, settledCollected: {},
  deliveryBasis: {}, substituteOrders: 0, substituteUnits: 0,
  unknownDelivery: { orders: 0, units: 0 }, returnTimingUnknown: { orders: 0, units: 0, revenue: 0, cost: 0 },
  pendingReturns: { orders: 0, units: 0, cost: 0 }, historyConflict: 0,
  unconverted: {}, adsEstimated: true, shippingEstimated: true,
});

const ISSUES = {
  missing_econ: ['partial', 'قطع بلا تكلفة معتمدة (تكلفتها غير محسوبة)'],
  revenue_fx_missing: ['partial', 'طلبات مسلَّمة بعملة بلا سعر صرف شهري معتمد — لا إيراد ولا تكلفة لها بالأرقام'],
  revenue_missing: ['partial', 'طلبات مسلَّمة بقيمة صفرية أو غير مسجَّلة — لا إيراد ولا تكلفة لها بالأرقام'],
  revenue_unsplit: ['partial', 'طلبات بأصناف من براندات مختلفة تعذّر توزيع قيمتها (لم تُحسب)'],
  qty_suspect: ['partial', 'بنود بكمية مشبوهة (أكبر من 500 — خطأ إدخال محتمل) عُدّت قطعة واحدة'],
  unallocated_revenue: ['estimated', 'إيراد طلبات غير موزّع على المنتجات (سعر مرجعي ناقص لأحد أصنافها أو طلب بلا أصناف)'],
  return_fx_missing: ['partial', 'مرتجعات بعد تسليم تعذّر تحويل قيمة بيعها (بلا سعر صرف) — لم يُحسب أثرها'],
  no_items: ['partial', 'طلبات مسلَّمة بلا أصناف'],
  unknown_delivery: ['partial', 'طلبات مسلَّمة بتاريخ تسليم غير معروف (غير مُسنَدة لأي شهر)'],
  fx_missing: ['partial', 'مصاريف بعملة بلا سعر صرف شهري معتمد (غير محسوبة بالدولار)'],
  estimates: ['estimated', 'إعلان/شحن بتقدير الوحدة (لا مصروف فعلي محوَّل)'],
  estimate_with_unallocated: ['estimated', 'تقدير مستخدم بينما يوجد مصروف فعلي غير موزّع على سوق (قد يتكرر)'],
  payroll_missing: ['partial', 'رواتب غير مُدخَلة لسوق فيه نشاط (لا يدوياً ولا بالمحاسبة) — أدخلها يدوياً أو اكتب 0 صراحةً'],
  payroll_from_accounting: ['estimated', 'رواتب مأخوذة من المحاسبة مؤقتاً — لم تُدخَل يدوياً للسوق'],
  unallocated_expenses: ['estimated', 'مصاريف غير موزّعة على سوق'],
  substitute_dates: ['estimated', 'مبيعات بتاريخ تسليم بديل (وقت تسجيل/تحديث وليس وقت تسليم مؤكد)'],
  legacy_prices: ['estimated', 'أسعار/تكاليف تاريخها مستنتج من updated_at وليس من سجل أصلي'],
  legacy_unified_price: ['estimated', 'قطع بسعر مرجعي موحّد قديم لأن سعراً لهذا السوق لم يُدخَل (يؤثر على توزيع الإيراد والمرجع التحليلي)'],
  packaging_missing: ['partial', 'أجور التغليف: لا قيد محاسبي بالشهر ولا تكلفة تغليف معتمدة لكل وحدة (ناقص — غير محسوب)'],
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
export function computeMonthly({ catalogNames = [], orders = [], nameMapRows = [], historyRows = [], currentRows = [], expenses = [], accountingEntries = [], channels = [], fxRates = [], marketPriceRows = [], nowMonth = null, month, brand = 'lowes' }) {
  const { monthStart, from, to } = monthBounds(month);
  const t0 = Date.parse(from), t1 = Date.parse(to);
  const inM = (ts) => { const t = Date.parse(ts); return Number.isFinite(t) && t >= t0 && t < t1; };
  const resolve = buildResolver(nameMapRows);
  const versions = buildVersionIndex(historyRows, currentRows);
  const marketIdx = buildMarketIndex(marketPriceRows);
  const nowM = nowMonth || istanbulMonthStart(new Date().toISOString());

  const chById = Array.isArray(channels) ? Object.fromEntries(channels.map((c) => [c.id, c])) : channels;
  const summary = { syria: emptyMarket(), turkey: emptyMarket(), uae: emptyMarket() };
  const mk = (m) => (summary[m] ||= emptyMarket());

  const fxCacheTop = new Map();
  const fx = (cur, mkt) => { if (!fxCacheTop.has(monthStart)) fxCacheTop.set(monthStart, buildFxLookup(fxRates, monthStart)); return fxCacheTop.get(monthStart)(cur, mkt); };

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
  // الرواتب: الإدخال اليدوي لسوق يحلّ محل رواتب المحاسبة لنفس السوق (لا جمع الاثنين)؛ «مشترك» اليدوي يحلّ محل «غير موزّع» المحاسبي
  const manualPayroll = new Set(records.filter((r) => r.source === 'manual' && r.group === 'payroll').map((r) => r.market));
  const payrollOverridden = [];
  for (let i = records.length - 1; i >= 0; i--) {
    const r = records[i];
    if (r.source === 'accounting' && r.group === 'payroll' && (manualPayroll.has(r.market) || (r.market === 'unallocated' && manualPayroll.has('shared')))) { payrollOverridden.push(r); records.splice(i, 1); }
  }
  const payroll = {};
  for (const k of [...MARKET_KEYS, 'shared', 'unallocated']) payroll[k] = { manual: 0, accounting: 0, overridden: 0, entered: false };
  for (const r of records) if (r.group === 'payroll' && payroll[r.market]) { if (r.source === 'manual') { payroll[r.market].manual += r.usd; payroll[r.market].entered = true; } else payroll[r.market].accounting += r.usd; }
  for (const r of payrollOverridden) payroll[r.market].overridden += r.usd;
  const actual = (group, m) => records.some((r) => r.group === group && r.usd > 0 && (r.market === m || r.market === 'shared'));
  for (const k of MARKET_KEYS) { summary[k].adsEstimated = !actual('ads', k); summary[k].shippingEstimated = !actual('shipping', k); }

  // ── الطلبات ──
  const agg = new Map(), unmapped = new Map(), usedVersions = new Map(), unknownList = [], returnLists = { unresolved: [], timingUnknown: [], pending: [] }, revenueGaps = [], brandExcluded = {};
  const itemsOf = (o) => {
    const out = [];
    for (const it of Array.isArray(o.items) ? o.items : []) {
      const raw = String(it?.name ?? '').trim(); if (!raw) continue;
      const r = resolve(raw); const qty = Number(it.qty);
      const bad = Number.isFinite(qty) && qty > MAX_QTY;
      out.push({ ...r, raw, q: Number.isFinite(qty) && qty > 0 && !bad ? qty : 1, qtySuspect: bad });
    }
    return out;
  };
  const versionFor = (it, ref, market) => {
    const e = resolveEcon(versions, marketIdx, it.key, market, ref, nowM);
    const id = `${it.key}|${market}`;
    const rec = usedVersions.get(id) || { key: it.key, name: it.name, market, units: 0, v: e.uni, e };
    rec.units += it.q; rec.v = rec.v || e.uni; rec.e = rec.e || e; usedVersions.set(id, rec);
    return { v: e.uni, price: e.price, cost: e.cost, ship: e.ship, ad: e.ad, basis: e.basis, complete: e.complete };
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
  // ── إيراد الطلب الفعلي (قيمة الطلب amount بعملته) → دولار بسعر الصرف الشهري المعتمد للسوق ──
  const fxCache = new Map();
  const fxAt = (mth) => { if (!fxCache.has(mth)) fxCache.set(mth, buildFxLookup(fxRates, mth)); return fxCache.get(mth); };
  const orderRevenue = (o, m, mth) => {
    const amount = num(o.amount), cur = String(o.currency || '').trim().toUpperCase();
    if (!(amount > 0)) return { ok: false, why: 'no_amount', amount, cur };
    if (!cur) return { ok: false, why: 'no_currency', amount, cur };
    if (cur === 'USD') return { ok: true, usd: amount, amount, cur, rate: 1 };
    const rate = fxAt(mth)(cur, m);
    return rate ? { ok: true, usd: amount / rate, amount, cur, rate } : { ok: false, why: 'no_fx', amount, cur };
  };
  /** يوزّع إيراد الطلب الفعلي على أصنافه بنسبة الكمية (سعر البيع يتغيّر من طلب لآخر فلا يصلح وزناً). mode: noitems | by_units */
  const splitRevenue = (c, rv) => {
    if (c.all.length === 0) return { mode: 'noitems', total: rv.usd, shares: [] };
    const totalQ = c.all.reduce((s, it) => s + it.q, 0);
    const shares = c.all.filter((it) => c.items.includes(it)).map((it) => ({ it, usd: rv.usd * (it.q / totalQ) }));
    return { mode: 'by_units', total: shares.reduce((s, x) => s + x.usd, 0), shares };
  };
  const handleDelivery = (c) => {
    const { o, M, m } = c;
    const noItemsOrder = c.all.length === 0 && (brand === 'all' || brand === 'lowes');
    if (!countedItems(c) && !noItemsOrder) return;
    M.orders++;
    M.deliveryBasis[o.delivery_basis] = (M.deliveryBasis[o.delivery_basis] || 0) + 1;
    if (String(o.delivery_basis).startsWith('substitute')) { M.substituteOrders++; M.substituteUnits += c.units; }
    if (o.status === 'delivered' && o.currency) M.collected[o.currency] = (M.collected[o.currency] || 0) + num(o.amount);
    if (noItemsOrder) M.ordersNoItems++;
    const pvs = c.items.map((it) => {
      const r = row(it, m); const pv = versionFor(it, monthStart, m);

      r.units += it.q; M.units += it.q; if (it.qtySuspect) M.suspectQtyLines++;
      if (!it.mapped) { const u = unmapped.get(it.key) || { name: it.raw, units: 0 }; u.units += it.q; unmapped.set(it.key, u); M.unmappedUnits += it.q; }
      return { it, r, pv };
    });
    const rv = orderRevenue(o, m, monthStart);
    if (!rv.ok) {
      // لا إيراد ولا تكلفة لهذا الطلب (لا نُظهر ربحاً بنصف البيانات)
      if (rv.why === 'no_fx') { M.revenueNoFx.orders++; M.revenueNoFx.units += c.units; M.revenueNoFx.byCurrency[rv.cur] = (M.revenueNoFx.byCurrency[rv.cur] || 0) + rv.amount; }
      else { M.revenueMissing.orders++; M.revenueMissing.units += c.units; }
      for (const { r } of pvs) { r.complete = false; r.noRevenue = true; }
      revenueGaps.push({ id: o.id, code: o.order_code, market: m, currency: rv.cur || null, amount: rv.amount, why: rv.why, units: c.units });
      return;
    }
    M.revenueByCurrency[rv.cur] = (M.revenueByCurrency[rv.cur] || 0) + rv.amount;
    if (o.shipping_payer === 'customer' && num(o.delivery_cost) > 0) M.customerDeliveryFees[rv.cur] = (M.customerDeliveryFees[rv.cur] || 0) + num(o.delivery_cost);
    if (o.payment_status === 'partial') { M.partialPayment.orders++; M.partialPayment.byCurrency[rv.cur] = (M.partialPayment.byCurrency[rv.cur] || 0) + num(o.paid_amount); }
    const sp = splitRevenue(c, rv, monthStart);
    M.revenue += sp.total;
    if (sp.mode === 'noitems' || sp.mode === 'unallocated') { M.unallocatedRevenue += sp.total; M.unallocatedOrders++; }

    for (const s of sp.shares) pvs.find((x) => x.it === s.it).r.revenue += s.usd;
    for (const { it, r, pv } of pvs) {
      if (pv.basis === 'market' && pv.price > 0) M.referenceRevenue += pv.price * it.q;
      if (pv.cost > 0) r.productCost += pv.cost * it.q; else { r.complete = false; M.unpricedUnits += it.q; }
      r.estAds += (M.adsEstimated ? pv.ad : 0) * it.q; r.estShipping += (M.shippingEstimated ? pv.ship : 0) * it.q;
    }
  };
  const handleCompletedReturn = (c) => {
    const { o, M, m } = c;
    const R = M.returns; R.orders++; R.units += c.units;
    const afterDelivery = !!o.delivered_before_return && !!o.delivered_at;
    const dMonth = afterDelivery ? istanbulMonthStart(o.delivered_at) : istanbulMonthStart(o.order_date);
    let revRed = 0;
    if (afterDelivery) {
      const rv = orderRevenue(o, m, dMonth);
      if (!rv.ok) { R.fxMissingOrders++; return; }   // لا يمكن تحويل قيمة البيع الأصلي → لا نخصم ولا نسترد جزئياً
      revRed = splitRevenue(c, rv, dMonth).total;
    }
    let costOut = 0, incomplete = 0;
    for (const it of c.items) {
      const pv = versionFor(it, dMonth, m);
      if (!(pv.cost > 0)) { incomplete += it.q; continue; }
      costOut += pv.cost * it.q;
      const r = row(it, m); r.returns += it.q; r.estShipping += (M.shippingEstimated ? pv.ship : 0) * it.q * RETURN_SHIP_FACTOR(afterDelivery);
    }
    R.unpricedUnits += incomplete;
    const denom = num(o.reserve_qty) > 0 ? num(o.reserve_qty) : c.allUnits;
    const rr = denom > 0 ? Math.min(1, num(o.restock_qty) / denom) : 0;
    const rw = denom > 0 ? Math.min(1 - rr, num(o.waste_qty) / denom) : 0;
    const damaged = costOut * rw, assumed = costOut - costOut * rr - damaged, restocked = costOut * rr + assumed, unresolved = 0;
    R.assumedRestockCost += assumed;
    R.revenueReduction += revRed; R.costOut += costOut; R.restockedCost += restocked; R.damagedLoss += damaged; R.unresolvedCost += unresolved;
    if (unresolved > 1e-9 || incomplete) { R.unresolvedOrders++; returnLists.unresolved.push({ id: o.id, code: o.order_code, market: m, units: c.units, cost: unresolved, afterDelivery, return_at: o.return_at }); }
    // أثر P&L المؤكَّد فقط: − تخفيض الإيراد الفعلي + التكلفة المستردة (إن سُلِّم سابقاً)؛ − التالف الموثَّق (إن لم يُسلَّم سابقاً)
    M.__returnEffect = (M.__returnEffect || 0) + (afterDelivery ? -revRed + restocked : -damaged);
  };
  const handleReturnTimingUnknown = (c) => {
    const { o, M, m } = c;
    let rev = 0, cost = 0;
    const ref = o.delivered_at ? istanbulMonthStart(o.delivered_at) : istanbulMonthStart(o.order_date);
    if (o.delivered_before_return) { const rv = orderRevenue(o, m, ref); if (rv.ok) rev = splitRevenue(c, rv, ref).total; }
    for (const it of c.items) { const pv = versionFor(it, ref, m); if (pv.cost > 0) cost += pv.cost * it.q; }
    M.returnTimingUnknown.orders++; M.returnTimingUnknown.units += c.units; M.returnTimingUnknown.revenue += rev; M.returnTimingUnknown.cost += cost;
    returnLists.timingUnknown.push({ id: o.id, code: o.order_code, market: m, units: c.units, revenue: rev, cost, afterDelivery: !!o.delivered_before_return });
  };
  const handlePending = (c) => {
    const { o, M, m } = c;
    let cost = 0; for (const it of c.items) { const pv = versionFor(it, istanbulMonthStart(o.order_date), m); if (pv.cost > 0) cost += pv.cost * it.q; }
    M.pendingReturns.orders++; M.pendingReturns.units += c.units; M.pendingReturns.cost += cost;
    returnLists.pending.push({ id: o.id, code: o.order_code, market: m, status: o.status, units: c.units, cost });
  };
  const handleOrder = (o) => {
    const m = MARKET_KEYS.includes(o.market) ? o.market : 'unknown';
    // العلامة من الطلب نفسه (orders.brand) وليست من تخمين أسماء الأصناف: تركيا فيها طلبات لويز وسترونغ معاً، وأسماء سترونغ الحرّة كانت تُحسب «لويز» افتراضياً
    if (o.brand && brand !== 'all' && o.brand !== brand) {
      if (o.status === 'delivered' && o.delivered_at && inM(o.delivered_at)) { const mm = MARKET_KEYS.includes(o.market) ? o.market : 'unknown'; brandExcluded[mm] = (brandExcluded[mm] || 0) + 1; }
      return undefined;
    }
    const all = itemsOf(o), items = o.brand ? all.filter((it) => it.active) : filt(all);
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
    p.flag = r.noRevenue ? 'nofx' : !r.complete ? 'unset' : p.unitProfit <= 0 ? 'loss' : ret > 25 ? 'risky' : p.netProfit > 0 && r.units >= 2 ? 'star' : 'ok';
    const rk = usedVersions.get(`${r.key}|${r.market}`); const ee = rk?.e || resolveEcon(versions, marketIdx, r.key, r.market, monthStart, nowM);
    p.versionFrom = ee.priceFrom; p.priceBasis = ee.basis; p.priceStatus = ee.status;
    p.price = ee.price; p.cost = ee.cost; p.adRaw = ee.ad; p.shipRaw = ee.ship; p.ad = m.adsEstimated ? p.adRaw : 0; p.ship = m.shippingEstimated ? p.shipRaw : 0;
    products.push(p);
    m.productCost += r.productCost; m.estAds += r.estAds; m.estShipping += r.estShipping;
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
  for (const rec of usedVersions.values()) {
    const e = rec.e, v = e?.uni; if (!e || (!e.price && !e.cost)) continue;
    const price = e.price, cost = e.cost, reasons = [];
    const pk = `${price}/${cost}`;
    if (price > 0 && cost > 0 && pairCount.get(pk) >= 5) reasons.push(`نمط متكرر: ${pairCount.get(pk)} صنفاً بنفس السعر/التكلفة ${pk}`);
    if (price > 0 && cost > 0 && (price <= 1 || cost >= price)) reasons.push(`قيمة مشتبهة: سعر ${price} وتكلفة ${cost} (هامش صفر/سالب أو مبلغ 1$)`);
    if (e.basis === 'legacy_unified') reasons.push('لا سعر مُدخَل لهذا السوق — استُعمل السعر الموحّد القديم');
    if (v?.source === 'legacy_backfill') reasons.push('تاريخ البدء مستنتج من updated_at وليس من سجل أصلي');
    if (reasons.length) reviewList.push({ key: rec.key, market: rec.market, name: rec.name, units: rec.units, price, cost, versionFrom: e.priceFrom, source: e.basis === 'market' ? 'entered' : (v?.source || 'entered'), reasons });
  }
  reviewList.sort((a, b) => b.units - a.units);
  const legacyUnits = [...usedVersions.values()].filter((r) => r.e?.basis !== 'market' && r.v?.source === 'legacy_backfill').reduce((s, r) => s + r.units, 0);

  // ── جودة الصافي ──
  const sumM = (f) => Object.values(summary).reduce((s, m) => s + f(m), 0);
  const estUsedAds = Object.values(summary).some((m) => m.adsEstimated && m.estAds > 0), estUsedShip = Object.values(summary).some((m) => m.shippingEstimated && m.estShipping > 0);
  const unallocActual = (g) => records.some((r) => r.market === 'unallocated' && r.group === g && r.usd > 0);
  const unconvertedCount = unconvertedList.length;
  const qualityFor = (m, scope) => assess({
    missing_econ: { units: m.unpricedUnits + m.returns.unpricedUnits },
    revenue_fx_missing: { orders: m.revenueNoFx.orders },
    revenue_missing: { orders: m.revenueMissing.orders },
    revenue_unsplit: { orders: m.mixedBrandUnsplit },
    unallocated_revenue: { orders: m.unallocatedOrders },
    qty_suspect: { count: m.suspectQtyLines },
    return_fx_missing: { orders: m.returns.fxMissingOrders },
    no_items: { orders: m.ordersNoItems },
    unknown_delivery: { orders: m.unknownDelivery.orders, units: m.unknownDelivery.units },
    fx_missing: scope === 'company' ? { count: unconvertedCount } : { count: Object.keys(m.unconverted).length },
    estimates: { amount: m.estAds + m.estShipping },
    estimate_with_unallocated: scope === 'company' && ((estUsedAds && unallocActual('ads')) || (estUsedShip && unallocActual('shipping'))) ? { count: 1 } : null,
    unallocated_expenses: scope === 'company' ? { amount: company.unallocated } : null,
    substitute_dates: { orders: m.substituteOrders, units: m.substituteUnits },
    legacy_prices: scope === 'company' ? { units: legacyUnits } : null,

    packaging_missing: scope === 'company' && m.orders > 0 && !records.some((r) => r.group === 'packaging' && r.usd > 0) ? { count: 1 } : null,
    unmapped: { units: m.unmappedUnits },
    settled_review: { orders: m.settledOrders },
    return_unresolved: { orders: m.returns.unresolvedOrders, amount: m.returns.unresolvedCost },
    return_timing_unknown: { orders: m.returnTimingUnknown.orders, units: m.returnTimingUnknown.units },
    pending_returns: { orders: m.pendingReturns.orders, units: m.pendingReturns.units },
    history_conflict: { count: m.historyConflict },
    manual_duplicate: scope === 'company' ? { count: manualDup } : null,
    payroll_missing: { count: scope === 'company' ? MARKET_KEYS.filter((k) => summary[k].payrollMissing).length : (m.payrollMissing ? 1 : 0) },
    payroll_from_accounting: { count: scope === 'company' ? MARKET_KEYS.filter((k) => summary[k].payrollFromAccounting).length : (m.payrollFromAccounting ? 1 : 0) },
  });
  for (const k of MARKET_KEYS) { const m = summary[k]; m.payrollMissing = (m.orders > 0 || m.revenueNoFx.orders > 0) && !(payroll[k].entered || payroll[k].accounting > 0 || payroll.shared.entered); m.payrollFromAccounting = !payroll[k].entered && !payroll.shared.entered && payroll[k].accounting > 0; }
  for (const m of Object.values(summary)) m.quality = qualityFor(m, 'market');

  const total = {
    orders: sumM((m) => m.orders), units: sumM((m) => m.units), revenue: sumM((m) => m.revenue), productCost: sumM((m) => m.productCost),
    estAds: sumM((m) => m.estAds), estShipping: sumM((m) => m.estShipping), productProfit: sumM((m) => m.productProfit),
    marketExpenses: sumM((m) => m.expenses), sharedExpenses: company.shared, unallocatedExpenses: company.unallocated,
    returns: ['orders', 'units', 'revenueReduction', 'costOut', 'assumedRestockCost', 'restockedCost', 'damagedLoss', 'unresolvedCost', 'unresolvedOrders', 'unpricedUnits', 'fxMissingOrders'].reduce((o, k) => (o[k] = sumM((m) => m.returns[k]), o), {}),
    suspectQtyLines: sumM((m) => m.suspectQtyLines), referenceRevenue: sumM((m) => m.referenceRevenue), unallocatedRevenue: sumM((m) => m.unallocatedRevenue), unallocatedOrders: sumM((m) => m.unallocatedOrders), mixedBrandUnsplit: sumM((m) => m.mixedBrandUnsplit),
    revenueByCurrency: Object.values(summary).reduce((o, m) => { for (const [k, v] of Object.entries(m.revenueByCurrency)) o[k] = (o[k] || 0) + v; return o; }, {}),
    revenueNoFx: { orders: sumM((m) => m.revenueNoFx.orders), units: sumM((m) => m.revenueNoFx.units), byCurrency: Object.values(summary).reduce((o, m) => { for (const [k, v] of Object.entries(m.revenueNoFx.byCurrency)) o[k] = (o[k] || 0) + v; return o; }, {}) },
    revenueMissing: { orders: sumM((m) => m.revenueMissing.orders), units: sumM((m) => m.revenueMissing.units) },
    customerDeliveryFees: Object.values(summary).reduce((o, m) => { for (const [k, v] of Object.entries(m.customerDeliveryFees)) o[k] = (o[k] || 0) + v; return o; }, {}),
    partialPayment: { orders: sumM((m) => m.partialPayment.orders) },
    unpricedUnits: sumM((m) => m.unpricedUnits), legacyUnifiedUnits: sumM((m) => m.legacyUnifiedUnits), unmappedUnits: sumM((m) => m.unmappedUnits), ordersNoItems: sumM((m) => m.ordersNoItems), settledOrders: sumM((m) => m.settledOrders),
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

  // ── جدول الأسعار المعتمدة لكل صنف وسوق (للمحرر) ──
  const names = new Map();
  nameMapRows.filter((r) => r.canonical_name && r.is_active !== false && (brand === 'all' || r.brand === brand)).forEach((r) => names.set(normName(r.canonical_name), r.canonical_name));
  const addIfCanonical = (n) => { const r = resolve(n); if (r.key === normName(n) && r.active && !names.has(r.key) && (brand === 'all' || r.brand === brand)) names.set(r.key, n); };
  for (const arr of versions.values()) arr.forEach((r) => addIfCanonical(r.item_name));
  for (const arr of marketIdx.values()) arr.forEach((r) => addIfCanonical(r.item_name));
  const catalogKeys = new Set(catalogNames.map(normName));
  const priceTable = [...names.entries()].map(([key, name]) => ({ key, name, inCatalog: catalogKeys.size === 0 ? null : catalogKeys.has(key), markets: Object.fromEntries(MARKET_KEYS.map((m) => [m, resolveEcon(versions, marketIdx, key, m, monthStart, nowM)])) }))
    .map((r) => ({ ...r, markets: Object.fromEntries(Object.entries(r.markets).map(([m, e]) => [m, { price: e.price, cost: e.cost, ship: e.ship, basis: e.basis, status: e.status, from: e.priceFrom, costBasis: e.costBasis, costStatus: e.costStatus, complete: e.complete }])) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ar'));

  const flagCount = (f) => products.filter((p) => p.flag === f).length;
  return {
    month: monthStart, products, marketSummary: summary, company: total,
    sharedExpenses: company.shared, sharedByCategory: company.sharedByCategory,
    unallocated: { usd: company.unallocated, byCategory: company.unallocatedByCategory, unconverted: unconvertedList },
    payroll, payrollOverridden, priceTable, revenueGaps, brandExcluded, skippedAccounting: skipped, unknownDeliveryOrders: unknownList, returnLists,
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
