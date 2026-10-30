// =============================================================
// fxConverter — S3b: محوِّل شهري لشاشات المبيعات. يُمرَّر مكان خريطة السعر الواحد (rateMap) إلى summarize/buildReport. دوال نقية، مُختبَرة:
//   node test-fx-converter.mjs
// يعتمد convertToUsd (fxResolve): سعر شهر تسليم الطلب لغرض محاسبة التسليم؛ وحدة العملة حسب تاريخ تسجيل الطلب وحجم المبلغ؛ لا أسعار افتراضية.
// =============================================================
import { convertToUsd } from './fxResolve.js';

/**
 * تاريخ الحدث الذي يُحدِّد شهر السعر (D13): delivery = تسليم الطلب؛ return = تاريخ الاسترجاع الموثوق؛ pending = تاريخ حدث راجع/لم يُستلم؛
 * settled = تاريخ التسوية؛ shipping = تاريخ التسليم/الشحن؛ order = تاريخ تسجيل الطلب (طلبات خارج الحساب).
 * fallback=true ⇒ لم يتوفر تاريخ الحدث فاستُعمل تاريخ الطلب (يُعلَن تقديرياً).
 */
export function eventDateFor(o, kind = 'delivery') {
  const first = (...xs) => xs.find((x) => x != null && x !== '') ?? null;
  const ord = o.order_date ?? null;
  switch (kind) {
    case 'return': { const d = first(o.return_at); return d ? { date: d, fallback: false } : { date: ord, fallback: true }; }
    case 'pending': { const d = first(o.event_at, o.status_since); return d ? { date: d, fallback: false } : { date: ord, fallback: true }; }
    case 'settled': { const d = first(o.settled_at); return d ? { date: d, fallback: false } : { date: ord, fallback: true }; }
    case 'shipping': { const d = first(o.delivery_at); return d ? { date: d, fallback: false } : { date: ord, fallback: false }; }
    case 'order': return { date: ord, fallback: false };
    default: return { date: first(o.delivery_at, o.order_date), fallback: false };
  }
}

/** مجمِّع دولار مشترك (مؤكَّد/تقديري/غير محوَّل) لأي مجموعة g؛ يُنهى بـ finalizeUsd (تقريب مرة واحدة). */
export function accumulateUsd(g, c) {
  if (g.usdConfirmed === undefined) Object.assign(g, { usdConfirmed: 0, usdEstimated: 0, estimatedN: 0, approximateN: 0, carriedN: 0, fallbackN: 0, unconvertedBreakdown: { noRate: 0, legacy: 0, suspect: 0, invalid: 0 } });
  if (c.status === 'ok') g.usdConfirmed += c.usd;
  else if (c.status === 'approximate') { g.usdEstimated += c.usd; g.estimatedN += 1; g.approximateN += 1; }
  else if (c.status === 'carried') { g.usdEstimated += c.usd; g.estimatedN += 1; g.carriedN += 1; }
  else if (c.status === 'dated_fallback') { g.usdEstimated += c.usd; g.estimatedN += 1; g.fallbackN += 1; }
  else {
    g.usdMissing = (g.usdMissing || 0) + 1;
    const b = g.unconvertedBreakdown;
    if (c.status === 'unit_legacy') b.legacy += 1; else if (c.status === 'unit_suspect') b.suspect += 1; else if (c.status === 'invalid') b.invalid += 1; else b.noRate += 1;
  }
}
const r2 = (v) => Math.round(v * 100) / 100;
export function finalizeUsd(g) {
  if (g.usdConfirmed === undefined) return g;
  const c = g.usdConfirmed, e = g.usdEstimated;
  g.usd = r2(c + e); g.usdConfirmed = r2(c); g.usdEstimated = r2(e);
  return g;
}

/** null إن لم تتوفر أسعار شهرية صالحة (فشل التحميل) ⇒ الشاشة تعود للطريقة القديمة بشريط واضح (D12). */
export function makeMonthlyConverter(fx) {
  if (!fx || fx.error || !Array.isArray(fx.rows)) return null;
  const rows = fx.rows, units = fx.units || [];
  return {
    monthly: true,
    /** {usd|null, status: ok|approximate|carried|missing|unit_legacy|unit_suspect|invalid, …} لطلب واحد. */
    convert(o, kind = 'delivery') {
      const { date, fallback } = eventDateFor(o, kind);
      const c = convertToUsd({ amount: o.amount, currency: o.currency || 'USD', date, unitDate: o.order_date || date, purpose: 'delivery_accounting' }, rows, units);
      // لا تاريخ حدث موثوقاً ⇒ سعر شهر تسجيل الطلب ويُعدّ تقديرياً صراحةً (لا تحويل صامت): الحالة dated_fallback
      if (fallback && c.usd != null && ['ok', 'approximate', 'carried'].includes(c.status)) return { ...c, status: 'dated_fallback', underlying: c.status };
      return c;
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
  const detail = est ? `منه $${fmt(g.usdConfirmed)} مؤكَّد + $${fmt(g.usdEstimated)} تقديري (تقريبي ${g.approximateN || 0} · مُرحَّل ${g.carriedN || 0}${g.fallbackN ? ` · بتاريخ الطلب ${g.fallbackN}` : ''})` : '';
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

/** نص « · ≈ $X (+N غير محوَّل)» لمجموعة بوضع المحوِّل (يُستعمل مكان نص السعر الواحد القديم بالشاشة). */
export function usdSubMonthly(g, fmt) {
  if (!g || (!g.usd && !g.usdMissing)) return '';
  const d = usdDisplay(g, fmt);
  return `${g.usd ? ` · ${d.text}` : ''}${g.usdMissing ? ` · +${g.usdMissing} غير محوَّل (${d.unconvertedText})` : ''}`;
}
