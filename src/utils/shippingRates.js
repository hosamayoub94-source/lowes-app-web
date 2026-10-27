// =============================================================
// shippingRates — تعرفة الشحن التقديرية لكل شركة (دوال صرفة، بلا Supabase) — D-161
// اختبار: node test-delivery-accounting.mjs
//
// القواعد (قرار حسام):
//  • تعرفة لكل شركة تُدخَل مرة؛ التعديل بتاريخ سريان جديد ولا يغيّر الماضي (pickRate يقرأ الصف الساري بتاريخ الطلب).
//  • الفعلي يغلب التقديري: delivery_cost موثّقة (> 0) ودافعها «علينا» ← فعلي، لا تقدير.
//  • الدافع «عميل» (صريحاً) ← لا تكلفة علينا ولا تقدير (يدفعها المستلم لشركة الشحن).
//  • غير ذلك (علينا بلا مبلغ موثّق، أو افتراضي غير مؤكد) ← تقدير بأجرة الشركة الساريّة، مع وسم «الدافع غير مؤكد».
//  • مرتجع نهائي (returned) ← ذهاب + مرتجع حسب سياسة الشركة (none=0 | fixed | same_as_outbound | unknown=غير معروف).
//    راجع للمركز/لم يُستلم ← ذهاب فقط (المرتجع لم يثبت). بلا تعرفة للشركة ← «بلا تعرفة» لا صفر.
//  • التقدير لا يُكتب على الطلبات ولا يُخلط بالفعلي ولا يدخل الرواتب ولا العمولات.
// =============================================================
import { carrierKey, hasDocumentedCost } from './returnsShipping.js';

export const RETURN_POLICY_LABELS = { none: 'لا يأخذون على المرتجع', fixed: 'مبلغ ثابت', same_as_outbound: 'مثل أجرة الذهاب', unknown: 'غير معروف' };
export const RATE_MARKETS = { syria: 'سوريا', turkey: 'تركيا', uae: 'الإمارات' };
export const RATE_CURRENCIES = ['SYP', 'TRY', 'AED', 'USD'];

const num = (v) => Number(v) || 0;
const round2 = (v) => Math.round(v * 100) / 100;
const addCur = (by, cur, v) => { by[cur] = round2((by[cur] || 0) + v); };
/** يوم إسطنبول YYYY-MM-DD لتاريخ/وقت. */
export function istanbulDay(v) {
  const t = Date.parse(v);
  return Number.isFinite(t) ? new Date(t + 3 * 3600 * 1000).toISOString().slice(0, 10) : null;
}

/** التعرفة السارية لشركة وسوق بتاريخ معيّن (آخر effective_from ≤ التاريخ). null = لا تعرفة. */
export function pickRate(rates, carrier, market, onDay) {
  const key = carrierKey(carrier);
  const day = String(onDay || '').slice(0, 10);
  let best = null;
  for (const r of rates || []) {
    if (r.market !== market || carrierKey(r.carrier) !== key) continue;
    const eff = String(r.effective_from).slice(0, 10);
    if (day && eff > day) continue;
    if (!best || eff > String(best.effective_from).slice(0, 10)) best = r;
  }
  return best;
}

const WENT_OUT = new Set(['delivered', 'settled', 'returned', 'returning', 'not_received']);

/**
 * تقدير شحن طلب واحد. basis: actual | customer_paid | estimated | no_rate | none
 * outbound/returnFee: {amount, currency} أو null. returnState: 'free' | 'charged' | 'unknown' | 'pending' | null
 */
export function estimateOrderShipping(o, rates) {
  const carrier = carrierKey(o?.shipping_company);
  const base = { carrier, basis: 'none', outbound: null, returnFee: null, returnState: null, payerUnconfirmed: false, rate: null };
  if (!WENT_OUT.has(o?.status)) return base;
  if (o.shipping_payer === 'customer') return { ...base, basis: 'customer_paid' };
  if (hasDocumentedCost(o)) return { ...base, basis: 'actual', outbound: { amount: num(o.delivery_cost), currency: String(o.currency || 'USD').toUpperCase() } };
  const at = istanbulDay(o.delivery_at || o.order_date);
  const rate = pickRate(rates, o.shipping_company, o.market, at);
  if (!rate) return { ...base, basis: 'no_rate' };
  const outbound = { amount: num(rate.outbound_fee), currency: rate.currency };
  let returnFee = null, returnState = null;
  if (o.status === 'returned') {
    if (rate.return_policy === 'none') { returnFee = { amount: 0, currency: rate.currency }; returnState = 'free'; }
    else if (rate.return_policy === 'fixed') { returnFee = { amount: num(rate.return_fee), currency: rate.currency }; returnState = 'charged'; }
    else if (rate.return_policy === 'same_as_outbound') { returnFee = { amount: num(rate.outbound_fee), currency: rate.currency }; returnState = 'charged'; }
    else returnState = 'unknown';
  } else if (o.status === 'returning' || o.status === 'not_received') returnState = 'pending';
  return { ...base, basis: 'estimated', outbound, returnFee, returnState, payerUnconfirmed: true, rate };
}

const usdOf = (amount, cur, rateMap) => (cur === 'USD' ? amount : rateMap?.[cur] > 0 ? amount * rateMap[cur] : null);
const blank = () => ({ orders: 0, estimated: 0, actual: 0, customerPaid: 0, noRate: 0, payerUnconfirmed: 0, returnUnknown: 0, returnPending: 0, outbound: {}, returnFee: {}, actualByCurrency: {} });

/** ملخص التقدير حسب الشركة + المجاميع. rateMap = عملة → دولار (للتحويل فقط؛ ناقص السعر يُعدّ ولا يُصفَّر). */
export function shippingEstimateSummary(orders, rates, rateMap) {
  const by = new Map();
  const totals = { ...blank(), usdOutbound: 0, usdReturn: 0, usdMissing: 0 };
  for (const o of orders || []) {
    const e = estimateOrderShipping(o, rates);
    if (e.basis === 'none') continue;
    const g = by.get(e.carrier) || { carrier: e.carrier, ...blank() };
    for (const t of [g, totals]) {
      t.orders += 1;
      if (e.basis === 'customer_paid') t.customerPaid += 1;
      else if (e.basis === 'no_rate') t.noRate += 1;
      else if (e.basis === 'actual') { t.actual += 1; addCur(t.actualByCurrency, e.outbound.currency, e.outbound.amount); }
      else {
        t.estimated += 1;
        if (e.payerUnconfirmed) t.payerUnconfirmed += 1;
        addCur(t.outbound, e.outbound.currency, e.outbound.amount);
        if (e.returnFee) addCur(t.returnFee, e.returnFee.currency, e.returnFee.amount);
        if (e.returnState === 'unknown') t.returnUnknown += 1;
        if (e.returnState === 'pending') t.returnPending += 1;
      }
    }
    if (e.basis === 'estimated') {
      const u = usdOf(e.outbound.amount, e.outbound.currency, rateMap);
      if (u === null) totals.usdMissing += 1; else totals.usdOutbound = round2(totals.usdOutbound + u);
      if (e.returnFee) { const r = usdOf(e.returnFee.amount, e.returnFee.currency, rateMap); if (r === null) totals.usdMissing += 1; else totals.usdReturn = round2(totals.usdReturn + r); }
    }
    by.set(e.carrier, g);
  }
  return { rows: [...by.values()].sort((a, b) => b.orders - a.orders), totals };
}

/** آخر تعرفة سارية اليوم لكل (شركة، سوق) + سجل كل الصفوف مرتّباً (للعرض بشاشة الإدخال). */
export function rateOverview(rates, today = istanbulDay(new Date().toISOString())) {
  const groups = new Map();
  for (const r of rates || []) {
    const k = `${carrierKey(r.carrier)}|${r.market}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  return [...groups.entries()].map(([k, list]) => {
    const sorted = [...list].sort((a, b) => (String(a.effective_from) < String(b.effective_from) ? 1 : -1));
    const current = sorted.find((r) => String(r.effective_from).slice(0, 10) <= today) || null;
    const [carrier, market] = k.split('|');
    return { carrier, market, current, upcoming: sorted.filter((r) => String(r.effective_from).slice(0, 10) > today), history: sorted };
  }).sort((a, b) => (a.market === b.market ? (a.carrier < b.carrier ? -1 : 1) : a.market < b.market ? -1 : 1));
}
