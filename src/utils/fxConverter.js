// =============================================================
// fxConverter — S3b: محوِّل شهري لشاشات المبيعات. يُمرَّر مكان خريطة السعر الواحد (rateMap) إلى summarize/buildReport. دوال نقية، مُختبَرة:
//   node test-fx-converter.mjs
// يعتمد convertToUsd (fxResolve): سعر شهر تسليم الطلب لغرض محاسبة التسليم؛ وحدة العملة حسب تاريخ تسجيل الطلب وحجم المبلغ؛ لا أسعار افتراضية.
// =============================================================
import { convertToUsd } from './fxResolve.js';

/** null إن لم تتوفر أسعار شهرية صالحة (فشل التحميل) ⇒ الشاشة تعود للطريقة القديمة بشريط واضح (D12). */
export function makeMonthlyConverter(fx) {
  if (!fx || fx.error || !Array.isArray(fx.rows)) return null;
  const rows = fx.rows, units = fx.units || [];
  return {
    monthly: true,
    /** {usd|null, status: ok|approximate|carried|missing|unit_legacy|unit_suspect|invalid, …} لطلب واحد. */
    convert(o) {
      return convertToUsd({ amount: o.amount, currency: o.currency || 'USD', date: o.delivery_at || o.order_date, unitDate: o.order_date || o.delivery_at, purpose: 'delivery_accounting' }, rows, units);
    },
  };
}

export const STATUS_LABEL = { ok: 'مؤكَّد', approximate: 'تقريبي', carried: 'مُرحَّل (تقديري)', missing: 'بلا سعر', unit_legacy: 'وحدة قديمة', unit_suspect: 'وحدة مشبوهة', invalid: 'بلا مبلغ' };

/** تفصيل غير المحوَّل كجملة عربية موجزة (للعرض). */
export function describeUnconverted(b) {
  const parts = [];
  if (b?.invalid) parts.push(`${b.invalid} بلا مبلغ`);
  if (b?.noRate) parts.push(`${b.noRate} بلا سعر`);
  if (b?.legacy) parts.push(`${b.legacy} وحدة قديمة`);
  if (b?.suspect) parts.push(`${b.suspect} وحدة مشبوهة`);
  return parts.join(' · ');
}

/** سطر الدولار للعرض من مجموعة summarize في وضع المحوِّل: {text, estimated, final} */
export function usdDisplay(g, fmt = (n) => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })) {
  const est = (g?.estimatedN || 0) > 0;
  const text = `${est ? '≈ ' : ''}$${fmt(g?.usd || 0)}`;
  const detail = est ? `منه $${fmt(g.usdConfirmed)} مؤكَّد + $${fmt(g.usdEstimated)} تقديري (تقريبي ${g.approximateN || 0} · مُرحَّل ${g.carriedN || 0})` : '';
  const un = describeUnconverted(g?.unconvertedBreakdown);
  return { text, estimated: est, detail, unconverted: g?.usdMissing || 0, unconvertedText: un, final: !est && !(g?.usdMissing > 0) };
}

/**
 * قيمة الدولار لصف طلب في شاشة الطلبات: بوضع المحوِّل = سعر شهر التسليم (null لغير المحوَّل، est لتقديري)، وإلا السعر الواحد القديم حرفياً.
 * @param toUsdLegacy دالة toUsd(amount, currency, rateMap) القديمة
 */
export function usdForRow(o, { converter = null, rateMap, toUsdLegacy }) {
  if (!converter) return { usd: toUsdLegacy(o.amount, o.currency, rateMap), est: false, status: 'legacy' };
  const c = converter.convert(o);
  return { usd: c.usd, est: c.status === 'approximate' || c.status === 'carried', status: c.status };
}
