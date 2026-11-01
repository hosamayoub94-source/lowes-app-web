// =============================================================
// crossEngineChecks — مطابقة المحرّكات (دوال صرفة، بلا Supabase)
// اختبار: node test-cross-engine-checks.mjs
//
// لا يحسب أي رقم جديد: يستعمل قاعدة كل محرّك كما هي (profitabilityDeliveryIn من الربحية،
// deliveryEntry من محاسبة التسليمات/الرواتب) ويُظهر أين تختلفان على الصفوف نفسها (profitability_orders).
// الهدف: «ربحية أكتوبر تطابق محاسبة التسليمات» إما تتحقق، أو يظهر الفرق طلباً طلباً مع سببه.
// =============================================================
import { profitabilityDeliveryIn } from './profitabilityCalc.js';
import { deliveryEntry, FINANCE_CONFIRMED_AFFECTS_PAYROLL } from './deliveryAccounting.js';

const t = (v) => { const x = Date.parse(v); return Number.isFinite(x) ? x : null; };

export const RECOGNITION_GAP_REASONS = {
  legacy_order_date: 'محاسبة التسليمات/الرواتب تُدخله بتاريخ الطلب (لا تاريخ تسليم موثوق) — الربحية لا تُسنده لأي شهر',
  settled_sale: '«تمت التسوية» بتسليم سابق: محاسبة التسليمات/الرواتب تعدّه بيعاً — الربحية لا تعدّه بيع منتجات',
  returned_after_delivery: 'سُلِّم ثم أُرجع: الربحية تُدخل التسليم ثم تخصم المرتجع — محاسبة التسليمات لا تعدّه بيعاً',
  finance_confirmed_off: 'تأكيد مالي مستبعد من الرواتب (الإعداد) بينما الربحية تعتمده',
  other: 'سبب غير مصنَّف — راجع الطلب',
};

/**
 * الطلبات التي يُدخلها محرّك واحد فقط في الفترة.
 * @param {Array} rows صفوف profitability_orders للفترة (مع status/delivered_at/delivery_basis/order_date)
 * @param {{from:string,to:string,includeLegacy?:boolean,financeConfirmed?:boolean}} p حدود الفترة (to حصرية)
 * @returns {{ both:number, profitOnly:Array, deliveryOnly:Array, byReason:Object }}
 */
export function recognitionGap(rows = [], { from, to, includeLegacy = true, financeConfirmed = FINANCE_CONFIRMED_AFFECTS_PAYROLL } = {}) {
  const t0 = t(from), t1 = t(to);
  const inM = (ts) => { const x = t(ts); return x !== null && x >= t0 && x < t1; };
  const seen = new Set();
  const profitOnly = [], deliveryOnly = [], byReason = {};
  let both = 0;
  for (const o of rows) {
    const key = o.id ?? o.order_code;
    if (key != null) { if (seen.has(key)) continue; seen.add(key); }
    const inProfit = profitabilityDeliveryIn(o, inM);
    const de = deliveryEntry(o, { includeLegacy, financeConfirmed });
    const inDelivery = !!(de && inM(de.at));
    if (inProfit && inDelivery) { both++; continue; }
    if (!inProfit && !inDelivery) continue;
    let reason = 'other';
    if (inDelivery) {
      if (de.source === 'legacy_order_date') reason = 'legacy_order_date';
      else if (o.status === 'settled') reason = 'settled_sale';
    } else if (o.status === 'returned' && o.delivered_before_return) reason = 'returned_after_delivery';
    else if (o.delivery_basis === 'finance_confirmed' && !financeConfirmed) reason = 'finance_confirmed_off';
    const item = { id: o.id, code: o.order_code || null, market: o.market || null, status: o.status, basis: o.delivery_basis || null,
      order_date: o.order_date || null, delivered_at: o.delivered_at || null, amount: Number(o.amount) || 0, currency: o.currency || null, reason };
    (inDelivery ? deliveryOnly : profitOnly).push(item);
    byReason[reason] = (byReason[reason] || 0) + 1;
  }
  return { both, profitOnly, deliveryOnly, byReason };
}

/**
 * مقارنة مصادر سعر الصرف لنفس الشهر: profitability_fx_rates · fx_monthly_rates (لكل غرض) · سعر الدورة المثبَّت.
 * لكل عملة: القيم حسب المصدر + حالة كل قيمة (confirmed | approximate | carried | missing) + هل تختلف.
 * لا يختار سعراً: الاختيار قرار (اعتماد السعر المرجعي لكل غرض).
 * @param {{month:string, profitabilityFx?:Array, monthlyFx?:Array, run?:object, currencies?:string[]}} p
 */
export function compareFxSources({ month, profitabilityFx = [], monthlyFx = [], run = null, currencies = ['TRY', 'SYP', 'AED'] } = {}) {
  const m = `${String(month).slice(0, 7)}-01`;
  const day = (v) => (v ? String(v).slice(0, 10) : null);
  const out = [];
  for (const cur of currencies) {
    const sources = [];
    // الربحية: صف الشهر نفسه (scope all) الأحدث إدخالاً — مثل buildFxLookup
    const pf = profitabilityFx.filter((r) => r.currency === cur && day(r.month) === m && (r.scope || 'all') === 'all')
      .sort((a, b) => (String(a.entered_at) < String(b.entered_at) ? 1 : -1))[0];
    sources.push(pf ? { source: 'profitability', rate: Number(pf.units_per_usd), quality: 'confirmed' } : { source: 'profitability', rate: null, quality: 'missing' });
    // fx_monthly_rates: لكل غرض، صف الشهر النشط؛ وإلا آخر شهر سابق = «مرحَّل»
    for (const purpose of [...new Set(monthlyFx.map((r) => r.purpose))].sort()) {
      const rows = monthlyFx.filter((r) => r.purpose === purpose && r.currency === cur && !r.superseded_at && r.period_month && (r.status || 'confirmed') === 'confirmed');
      const exact = rows.filter((r) => day(r.period_month) === m).sort((a, b) => (String(a.created_at) < String(b.created_at) ? 1 : -1))[0];
      const prior = rows.filter((r) => day(r.period_month) < m).sort((a, b) => (day(a.period_month) < day(b.period_month) ? 1 : -1))[0];
      if (exact) sources.push({ source: `monthly:${purpose}`, rate: Number(exact.units_per_usd), quality: exact.rate_quality === 'approximate' ? 'approximate' : 'confirmed' });
      else if (prior) sources.push({ source: `monthly:${purpose}`, rate: Number(prior.units_per_usd), quality: 'carried', from: day(prior.period_month) });
      else sources.push({ source: `monthly:${purpose}`, rate: null, quality: 'missing' });
    }
    const runRate = cur === 'TRY' ? run?.rate_usd_try : cur === 'SYP' ? run?.rate_usd_syp : null;
    if (run && (cur === 'TRY' || cur === 'SYP')) sources.push(Number(runRate) > 0 ? { source: 'payroll_run', rate: Number(runRate), quality: 'confirmed' } : { source: 'payroll_run', rate: null, quality: 'missing' });
    const values = [...new Set(sources.filter((s) => s.rate > 0).map((s) => s.rate))];
    out.push({ currency: cur, sources, mismatch: values.length > 1, values });
  }
  return { month: m, currencies: out, mismatches: out.filter((c) => c.mismatch).map((c) => c.currency) };
}
