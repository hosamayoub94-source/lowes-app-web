// =============================================================
// deliveryAccounting — مصدر واحد لـ«ما دخل حساب الفترة» (دوال صرفة، بلا Supabase)
// اختبار: node test-delivery-accounting.mjs
//
// القاعدة (طلب المالك): الطلب يدخل المبيعات/العمولات/الرواتب في الفترة التي انتقلت فيها حالته
// إلى delivered فعلاً — لا order_date. الصفوف تأتي من الدالة profitability_orders (delivered_at + delivery_basis
// محسوبة هناك من order_status_history/إثبات شركة الشحن) فلا نظام موازٍ.
//  • delivery_basis = unknown (لا حدث تسليم موثوق) ← تاريخ بديل order_date موسوم 'legacy_order_date'
//    (قرار حسام 27 تشرين الأول 2026) ويمكن استبعاده بـ includeLegacy:false.
//  • settled ليس بيعاً مستقلاً: يُحتسب فقط إن كان له تسليم فعلي سابق (delivered_at معروف)؛ وإلا يُعلَّم settled_no_delivery.
//  • المرتجع (returned) لا يدخل المبيعات النهائية؛ يُعرض كمرتجع.
//  • غير المسلَّم (تجهيز/شحن/وارد/لم يُستلم) يُعرض بقيمه ولا يدخل أي مجموع.
//  • قيمة الطلب = orders.amount الفعلي بعملته؛ قيمة المنتجات تحليلية من product_economics (نسخة الشهر).
// =============================================================
import { resolveEcon, buildResolver, buildVersionIndex, buildMarketIndex, normName, monthBounds, istanbulMonthStart, ISTANBUL_OFFSET } from './profitabilityCalc.js';

export const MARKETS = ['syria', 'turkey', 'uae'];
export const MARKET_LABELS = { syria: 'سوريا', turkey: 'تركيا', uae: 'الإمارات' };

// مجموعات الطلبات غير المسلَّمة — لا تدخل أي حساب.
export const UNDELIVERED_GROUPS = {
  preparing: { label: 'قيد التجهيز', statuses: ['preparing', 'ready', 'motor_prep', 'prepaid'] },
  shipping: { label: 'الشحن / النقل', statuses: ['shipped', 'at_center', 'on_way', 'motor', 'special_delivery'] },
  incoming: { label: 'واردة / معلّقة', statuses: ['pending', 'waiting'] },
  not_received: { label: 'لم تُستلم / مرتجعة', statuses: ['not_received', 'returning', 'returned'] },
};
const GROUP_OF = Object.fromEntries(Object.entries(UNDELIVERED_GROUPS).flatMap(([g, v]) => v.statuses.map((s) => [s, g])));
export const undeliveredGroupOf = (status) => GROUP_OF[status] || null;
// حالات الحساب: لا يجوز أن يظهر أي منها في مجموع المبيعات/العمولات/الرواتب (يستعملها الاختبار والتحقق).
export const NON_ACCOUNTING_STATUSES = ['pending', 'preparing', 'ready', 'motor', 'motor_prep', 'at_center', 'shipped', 'on_way', 'special_delivery', 'prepaid', 'waiting', 'not_received', 'returning', 'returned', 'cancelled'];

const num = (v) => Number(v) || 0;
const ts = (v) => { const t = Date.parse(v); return Number.isFinite(t) ? t : null; };
const round2 = (v) => Math.round(v * 100) / 100;

/** حدود فترة بتوقيت إسطنبول: month='YYYY-MM' أو from/to بتاريخين YYYY-MM-DD (to شاملة). */
export function periodBounds({ month, fromDate, toDate } = {}) {
  if (fromDate && toDate) {
    const next = new Date(Date.parse(`${toDate}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
    return { from: `${fromDate}T00:00:00${ISTANBUL_OFFSET}`, to: `${next}T00:00:00${ISTANBUL_OFFSET}`, label: `${fromDate} → ${toDate}` };
  }
  const b = monthBounds(month);
  return { from: b.from, to: b.to, label: b.monthStart.slice(0, 7), monthStart: b.monthStart };
}

/** تاريخ دخول الطلب للحساب + مصدره. null = لا يدخل (غير مسلَّم). */
export function deliveryEntry(o, { includeLegacy = true } = {}) {
  if (!['delivered', 'settled'].includes(o.status)) return null;
  if (o.delivered_at && o.delivery_basis && o.delivery_basis !== 'unknown') {
    return { at: o.delivered_at, source: o.delivery_basis === 'carrier' || o.delivery_basis === 'external' ? 'history' : 'substitute', basis: o.delivery_basis };
  }
  if (o.status === 'settled') return null; // settled بلا تسليم سابق ليس بيعاً
  if (includeLegacy && o.order_date) return { at: o.order_date, source: 'legacy_order_date', basis: 'legacy_order_date' };
  return null;
}

/**
 * يفصل صفوف الفترة: delivered (تدخل الحساب) | returns | settledNoDelivery | legacyExcluded.
 * كل طلب مرة واحدة فقط (مفتاح id) ولو تكرر الصف.
 */
export function selectDeliveredInPeriod(rows, { from, to, includeLegacy = true } = {}) {
  const t0 = ts(from), t1 = ts(to);
  const seen = new Set();
  const out = { delivered: [], returns: [], settledNoDelivery: [], legacyExcluded: [] };
  for (const o of rows || []) {
    const key = o.id ?? o.order_code;
    if (key != null) { if (seen.has(key)) continue; seen.add(key); }
    if (o.status === 'returned') {
      const at = ts(o.return_at) ?? ts(o.order_date);
      if (at !== null && at >= t0 && at < t1) out.returns.push({ ...o, return_basis: o.return_at ? 'history' : 'legacy_order_date' });
      continue;
    }
    if (o.status === 'settled' && !(o.delivered_at && o.delivery_basis && o.delivery_basis !== 'unknown')) {
      const at = ts(o.order_date);
      if (at !== null && at >= t0 && at < t1) out.settledNoDelivery.push(o);
      continue;
    }
    const e = deliveryEntry(o, { includeLegacy });
    if (!e) {
      if (o.status === 'delivered' && !includeLegacy) {
        const at = ts(o.order_date);
        if (at !== null && at >= t0 && at < t1 && (!o.delivery_basis || o.delivery_basis === 'unknown')) out.legacyExcluded.push(o);
      }
      continue;
    }
    const at = ts(e.at);
    if (at === null || at < t0 || at >= t1) continue;
    out.delivered.push({ ...o, delivery_at: e.at, delivery_source: e.source, delivery_basis_final: e.basis });
  }
  return out;
}

/** الطلبات غير المسلَّمة (تجهيز/شحن/وارد/لم تُستلم) — للعرض فقط. */
export function selectUndelivered(rows) {
  const seen = new Set();
  const list = [];
  for (const o of rows || []) {
    const g = undeliveredGroupOf(o.status);
    if (!g || o.status === 'returned') continue; // المرتجع النهائي يُعرض بقسم المرتجعات بفترته
    const key = o.id ?? o.order_code;
    if (key != null) { if (seen.has(key)) continue; seen.add(key); }
    list.push({ ...o, group: g });
  }
  return list;
}

/** مبلغ بالدولار بخريطة rateMap {USD:1, TRY:0.02, …} (عملة → دولار). null = لا سعر صرف. */
export function toUsd(amount, currency, rateMap) {
  const cur = String(currency || 'USD').toUpperCase();
  if (cur === 'USD') return num(amount);
  const r = rateMap?.[cur];
  return r > 0 ? num(amount) * r : null;
}

/** فلاتر اللوحة (كلها اختيارية). */
export function applyFilters(rows, f = {}) {
  // 'all' = بلا فلتر (قيمة القوائم الافتراضية بالشاشة) — لا يجوز أن يُعامَل كاسم بائع أو منتج
  const seller = f.seller && f.seller !== 'all' ? normName(f.seller) : null;
  const product = f.product && f.product !== 'all' ? normName(f.product) : null;
  return (rows || []).filter((o) => {
    if (f.market && f.market !== 'all' && o.market !== f.market) return false;
    if (f.brand && f.brand !== 'all' && (o.brand || 'lowes') !== f.brand) return false;
    if (seller && normName(o.handler_name) !== seller) return false;
    if (f.status && f.status !== 'all' && o.status !== f.status) return false;
    if (f.carrier && f.carrier !== 'all' && (o.shipping_company || '') !== f.carrier) return false;
    if (f.currency && f.currency !== 'all' && String(o.currency || '').toUpperCase() !== f.currency) return false;
    if (product && !(Array.isArray(o.items) ? o.items : []).some((it) => normName(it?.name).includes(product))) return false;
    return true;
  });
}

/** مجاميع حسب مفتاح: لكل مجموعة count و byCurrency (قيمة فعلية) و usd (null عند نقص سعر صرف). */
export function summarize(orders, keyFn, rateMap) {
  const m = new Map();
  for (const o of orders) {
    const k = keyFn(o) ?? '—';
    const g = m.get(k) || { key: k, count: 0, byCurrency: {}, usd: 0, usdMissing: 0 };
    g.count += 1;
    const cur = String(o.currency || 'USD').toUpperCase();
    g.byCurrency[cur] = round2((g.byCurrency[cur] || 0) + num(o.amount));
    const u = toUsd(o.amount, cur, rateMap);
    if (u === null) g.usdMissing += 1; else g.usd = round2(g.usd + u);
    m.set(k, g);
  }
  return [...m.values()].sort((a, b) => b.usd - a.usd || b.count - a.count);
}

/**
 * سطور المنتجات المسلَّمة لكل سوق: كمية × sale_price_usd (نسخة الشهر) — قيمة تحليلية.
 * صنف بلا سعر/تكلفة: يظهر بتحذير ولا يكسر التقرير (لا يدخل مجموع الربح).
 */
export function buildProductLines(delivered, returns, { nameMapRows = [], historyRows = [], currentRows = [], marketPriceRows = [], monthStart, nowMonth = null } = {}) {
  const resolve = buildResolver(nameMapRows);
  const versions = buildVersionIndex(historyRows, currentRows);
  const marketIdx = buildMarketIndex(marketPriceRows);
  const rows = new Map();
  const slot = (it, market) => {
    const id = `${market}|${it.key}`;
    if (!rows.has(id)) rows.set(id, { market, name: it.name, key: it.key, qty: 0, returnedQty: 0, value: 0, cost: 0, profit: 0, unitPrice: 0, unitCost: 0, unitProfit: 0, warning: null, mapped: it.mapped });
    return rows.get(id);
  };
  const itemsOf = (o) => (Array.isArray(o.items) ? o.items : []).map((raw) => {
    const name = String(raw?.name ?? '').trim();
    if (!name) return null;
    const r = resolve(name);
    const q = Number(raw.qty);
    return { ...r, q: Number.isFinite(q) && q > 0 && q <= 500 ? q : 1 };
  }).filter((it) => it && it.active);
  for (const o of delivered) {
    for (const it of itemsOf(o)) {
      const e = resolveEcon(versions, marketIdx, it.key, o.market, monthStart || istanbulMonthStart(o.delivery_at) || String(o.delivery_at).slice(0, 7) + '-01', nowMonth);
      const r = slot(it, o.market);
      r.qty += it.q;
      r.unitPrice = e.price; r.unitCost = e.cost;
      if (!(e.price > 0)) r.warning = 'no_price';
      else if (!(e.cost > 0)) r.warning = r.warning || 'no_cost';
      if (e.price > 0) r.value = round2(r.value + it.q * e.price);
      if (e.price > 0 && e.cost > 0) { r.cost = round2(r.cost + it.q * e.cost); r.profit = round2(r.profit + it.q * (e.price - e.cost)); }
      r.unitProfit = e.price > 0 && e.cost > 0 ? round2(e.price - e.cost) : 0;
    }
  }
  for (const o of returns || []) for (const it of itemsOf(o)) slot(it, o.market).returnedQty += it.q;
  return [...rows.values()].sort((a, b) => (a.market === b.market ? b.qty - a.qty : a.market < b.market ? -1 : 1));
}

/** فهرس الرواتب بنفس شكل payrollEngine: Map<اسم موحّد, {byCur:{cur:{total,count}}, prepaidTry, returnsCount}>. */
export function buildPayrollIndex(delivered, { normalize = (s) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' '), excludeMarkets = [] } = {}) {
  const index = new Map();
  for (const o of delivered || []) {
    if (excludeMarkets.includes(o.market)) continue;
    if (!['delivered', 'settled'].includes(o.status)) continue; // دفاع: لا شيء غير مسلَّم
    const key = normalize(o.handler_name);
    if (!key) continue;
    const cur = o.currency || 'USD';
    const b = index.get(key) || { byCur: {}, prepaidTry: 0, returnsCount: 0 };
    const s = b.byCur[cur] || { total: 0, count: 0 };
    s.total += num(o.amount); s.count += 1; b.byCur[cur] = s;
    const pm = String(o.payment_method || '');
    if (cur === 'TRY' && (pm.includes('مسبق') || pm.includes('bank') || pm.includes('بنك'))) b.prepaidTry += num(o.amount);
    index.set(key, b);
  }
  return index;
}

/** التقرير الكامل (المنطق الصرف) — الخدمة تغذّيه بالصفوف والمراجع. */
export function buildReport({ rows, period, rateMap = { USD: 1 }, filters = {}, includeLegacy = true, refs = {}, nowMonth = null }) {
  const sel = selectDeliveredInPeriod(rows, { from: period.from, to: period.to, includeLegacy });
  const delivered = applyFilters(sel.delivered, filters);
  const returns = applyFilters(sel.returns, filters);
  const undelivered = applyFilters(selectUndelivered(rows), filters);
  const monthStart = period.monthStart || null; // مدى مخصص: سعر كل طلب من شهر تسليمه
  const totals = summarize(delivered, () => 'all', rateMap)[0] || { count: 0, byCurrency: {}, usd: 0, usdMissing: 0 };
  return {
    period, criterion: 'delivery transition date', includeLegacy,
    delivered, returns, undelivered,
    settledNoDelivery: sel.settledNoDelivery, legacyExcluded: sel.legacyExcluded,
    legacyCount: delivered.filter((o) => o.delivery_source === 'legacy_order_date').length,
    totals,
    byMarket: summarize(delivered, (o) => o.market, rateMap),
    bySeller: summarize(delivered, (o) => o.handler_name || '—', rateMap),
    undeliveredByGroup: Object.keys(UNDELIVERED_GROUPS).map((g) => ({ group: g, label: UNDELIVERED_GROUPS[g].label, ...(summarize(undelivered.filter((o) => o.group === g), () => g, rateMap)[0] || { count: 0, byCurrency: {}, usd: 0, usdMissing: 0 }) })),
    products: buildProductLines(delivered, returns, { ...refs, monthStart, nowMonth }),
  };
}

/** أوراق التصدير (aoa) — الصفحة الأخيرة تثبّت الفترة ومعيار الإدخال. */
export function exportSheets(report, { sellerCommissions = [] } = {}) {
  const cur = (o) => Object.entries(o.byCurrency || {}).map(([c, v]) => `${v} ${c}`).join(' + ');
  const orderRow = (o) => [o.order_code || o.id, o.market, o.status, o.handler_name || '', o.customer_name || '', o.shipping_company || '', o.amount, o.currency, o.delivery_at || o.order_date || '', o.delivery_source || ''];
  const head = ['الطلب', 'السوق', 'الحالة', 'البائع', 'العميل', 'شركة الشحن', 'القيمة', 'العملة', 'تاريخ التسليم/الطلب', 'مصدر التاريخ'];
  return {
    'ملخص الأسواق': [['السوق', 'عدد الطلبات المسلّمة', 'القيمة الفعلية', 'بالدولار', 'طلبات بلا سعر صرف'], ...report.byMarket.map((m) => [m.key, m.count, cur(m), m.usd, m.usdMissing])],
    'الطلبات المسلّمة': [head, ...report.delivered.map(orderRow)],
    'غير المسلّمة': [[...head.slice(0, 9), 'المجموعة'], ...report.undelivered.map((o) => [...orderRow(o).slice(0, 9), o.group])],
    'المنتجات المسلّمة': [['السوق', 'المنتج', 'الكمية', 'القيمة $', 'التكلفة $', 'ربح الوحدة $', 'الربح $', 'مرتجع', 'تحذير'], ...report.products.map((p) => [p.market, p.name, p.qty, p.value, p.cost, p.unitProfit, p.profit, p.returnedQty, p.warning || ''])],
    'الموظفون والعمولات': [['الموظف', 'طلبات مسلّمة', 'المبيعات', 'بالدولار', 'العمولة $'], ...report.bySeller.map((s) => [s.key, s.count, cur(s), s.usd, sellerCommissions.find((c) => normName(c.name) === normName(s.key))?.commission ?? ''])],
    'الفترة': [['الفترة', report.period.label], ['معيار الإدخال', 'delivery transition date'], ['تواريخ تقديرية (legacy)', report.legacyCount], ['تضمين القديم', report.includeLegacy ? 'نعم' : 'لا']],
  };
}

/**
 * خطأ التحميل → نوع + رسالة عربية صريحة. (عطل: انتهاء مهلة الدالة كان يظهر كـ«تحتاج جلسة مدير» فيُضلِّل.)
 * 57014 = canceling statement due to statement timeout (دور authenticated مهلته 8 ثوانٍ).
 */
export function describeLoadError(e) {
  const code = String(e?.code || '');
  const msg = String(e?.message || e || '');
  if (e?.name === 'AbortError' || /\babort/i.test(msg)) return { kind: 'aborted', message: '' };
  if (code === '57014' || /statement timeout/i.test(msg)) return { kind: 'timeout', message: 'انتهت مهلة قاعدة البيانات (8 ثوانٍ) أثناء جلب الطلبات — الدالة بطيئة الآن. أعد المحاولة بعد لحظات ولا تبدّل الأشهر بسرعة.' };
  if (code === '42501' || /permission denied|not allowed|jwt/i.test(msg)) return { kind: 'permission', message: 'لا صلاحية لقراءة هذه البيانات — تحتاج جلسة مدير أو مدير مبيعات حقيقية (سجّل الخروج ثم ادخل بالـPIN).' };
  return { kind: 'other', message: msg || 'تعذّر تحميل التقرير' };
}
