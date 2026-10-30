/* global process */
// S3b-2: المرتجعات والتسويات والشحن بالسعر الشهري حسب تاريخ الحدث (D13). بلا محوِّل = السلوك القديم حرفياً.
// run: node test-fx-returns-shipping.mjs
import { summarize, buildReport, periodBounds } from './src/utils/deliveryAccounting.js';
import { returnsAnalysis, shippingSummary } from './src/utils/returnsShipping.js';
import { shippingEstimateSummary } from './src/utils/shippingRates.js';
import { makeMonthlyConverter, eventDateFor, usdSubMonthly } from './src/utils/fxConverter.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('FAIL', m); } };
const near = (a, b, m, eps = 0.011) => ok(Math.abs(Number(a) - b) <= eps, `${m} (got ${a}, want ${b})`);

const D = 'delivery_accounting';
const r = (currency, month, rate, extra = {}) => ({ purpose: D, currency, units_per_usd: rate, period_month: month, market: null, currency_unit: 'current', status: 'confirmed', rate_quality: 'exact', source: 't', created_at: '2026-10-30T00:00:00Z', ...extra });
const FX = {
  rows: [r('TRY', '2026-08-01', 48), r('TRY', '2026-09-01', 46.8), r('TRY', '2026-10-01', 50), r('SYP', '2026-08-01', 131), r('SYP', '2026-09-01', 131), r('SYP', '2026-10-01', 140),
    r('TRY', '2026-03-01', 45.9, { rate_quality: 'approximate' })],
  units: [{ currency: 'SYP', unit: 'legacy', valid_from: '2000-01-01', valid_to: '2025-12-31', min_amount: 20000 }, { currency: 'SYP', unit: 'suspect', valid_from: '2026-01-01', valid_to: null, min_amount: 20000 }],
};
const TODAY = { USD: 1, TRY: 1 / 50, SYP: 1 / 140 };
const conv = makeMonthlyConverter(FX);

// ── eventDateFor
ok(eventDateFor({ delivery_at: 'D', order_date: 'O' }, 'delivery').date === 'D' && eventDateFor({ order_date: 'O' }, 'delivery').date === 'O', 'delivery: تاريخ التسليم ثم الطلب');
ok(eventDateFor({ return_at: 'R', order_date: 'O' }, 'return').date === 'R' && !eventDateFor({ return_at: 'R', order_date: 'O' }, 'return').fallback, 'return: تاريخ الاسترجاع الموثوق');
ok(eventDateFor({ order_date: 'O' }, 'return').date === 'O' && eventDateFor({ order_date: 'O' }, 'return').fallback === true, 'return بلا توقيت: تاريخ الطلب ⇒ fallback');
ok(eventDateFor({ event_at: 'E', status_since: 'S', order_date: 'O' }, 'pending').date === 'E' && eventDateFor({ status_since: 'S', order_date: 'O' }, 'pending').date === 'S' && eventDateFor({ order_date: 'O' }, 'pending').fallback, 'pending: event_at ثم status_since ثم fallback');
ok(eventDateFor({ settled_at: 'T', order_date: 'O' }, 'settled').date === 'T' && eventDateFor({ order_date: 'O' }, 'settled').fallback, 'settled: تاريخ التسوية ثم fallback');
ok(eventDateFor({ delivery_at: 'D', order_date: 'O' }, 'shipping').date === 'D' && !eventDateFor({ order_date: 'O' }, 'shipping').fallback, 'shipping: تاريخ التسليم/الشحن');
ok(eventDateFor({ delivery_at: 'D', order_date: 'O' }, 'order').date === 'O', 'order: تاريخ التسجيل');

// ── converter.convert بتاريخ الحدث: طلب سُلِّم آب (48) واسترُجع أيلول (46.8)
const ret = { id: 'r1', status: 'returned', amount: 46800, currency: 'TRY', market: 'turkey', handler_name: 'أ', order_date: '2026-08-10T10:00:00+03:00', delivery_at: '2026-08-12T10:00:00+03:00', return_at: '2026-09-15T10:00:00+03:00' };
{
  const c = conv.convert(ret, 'return');
  near(c.usd, 1000, 'المرتجع بسعر شهر الاسترجاع (أيلول 46.8)'); ok(c.status === 'ok', 'مؤكَّد');
  near(conv.convert(ret, 'delivery').usd, 46800 / 48, 'بينما نفس الطلب كمبيعات بسعر شهر تسليمه (آب 48)');
  const nr = { ...ret, return_at: null, id: 'r2' };
  const f = conv.convert(nr, 'return');
  ok(f.status === 'dated_fallback' && f.underlying === 'ok' && Math.abs(f.usd - 46800 / 48) < 1e-9, 'مرتجع بلا توقيت: بتاريخ الطلب (آب) ويُعلَن تقديرياً dated_fallback');
  ok(conv.convert({ ...nr, amount: null }, 'return').status === 'invalid', 'بلا مبلغ يبقى invalid ولو بلا تاريخ');
}

// ── summarize بنوع الحدث + عدّاد fallback
{
  const rows = [ret, { ...ret, id: 'r2', return_at: null }];
  const g = summarize(rows, () => 'all', TODAY, conv, 'return')[0];
  near(g.usdConfirmed, 1000, 'مؤكَّد 1000'); near(g.usdEstimated, 46800 / 48, 'تقديري (بتاريخ الطلب)'); ok(g.fallbackN === 1 && g.estimatedN === 1, 'fallbackN=1');
  const old = summarize(rows, () => 'all', TODAY)[0];
  ok(Object.keys(old).sort().join() === ['byCurrency', 'count', 'key', 'usd', 'usdMissing'].sort().join() && old.usd === 1872, 'بلا محوِّل: كما كان (سعر اليوم 50)');
  // تسويات بتاريخ التسوية
  const st = { id: 's1', status: 'settled', amount: 2620, currency: 'SYP', market: 'syria', order_date: '2026-08-01T10:00:00+03:00', settled_at: '2026-10-05T10:00:00+03:00' };
  near(summarize([st], () => 'all', TODAY, conv, 'settled')[0].usd, 2620 / 140, 'تسوية بسعر شهر التسوية (أكتوبر 140)');
  near(summarize([st], () => 'all', TODAY, conv, 'order')[0].usd, 2620 / 131, 'وبنوع order بسعر شهر الطلب (آب 131)');
}

// ── returnsAnalysis
{
  const rows = [
    { ...ret, return_kind: 'reliable' },
    { ...ret, id: 'r3', return_at: null, status: 'returned', return_kind: 'unknown_timing' },
    { id: 'p1', status: 'returning', amount: 5000, currency: 'TRY', market: 'turkey', order_date: '2026-09-01T10:00:00+03:00', event_at: '2026-10-02T10:00:00+03:00', return_kind: 'returning' },
    { id: 'p2', status: 'not_received', amount: 700, currency: 'SYP', market: 'syria', order_date: '2026-09-03T10:00:00+03:00', return_kind: 'not_received' },
  ];
  const a = returnsAnalysis(rows, TODAY, conv);
  near(a.byKind.reliable.usdConfirmed, 1000, 'موثوق بشهر الاسترجاع');
  ok(a.byKind.unknown_timing.fallbackN === 1 && a.byKind.unknown_timing.usdEstimated > 0, 'توقيت غير موثوق: تقديري بتاريخ الطلب');
  near(a.byKind.returning.usd, 5000 / 50, 'راجع للمركز بشهر حدثه (أكتوبر 50)');
  ok(a.byKind.not_received.fallbackN === 1, 'لم يُستلم بلا تاريخ حدث: fallback');
  near(a.total.usd, a.byKind.reliable.usd + a.byKind.unknown_timing.usd + a.byKind.returning.usd + a.byKind.not_received.usd, 'الإجمالي = مجموع الأنواع');
  const b = returnsAnalysis(rows, TODAY);
  ok(b.total.usdConfirmed === undefined && b.total.usd > 0, 'بلا محوِّل: لا حقول جديدة (سلوك قديم)');
}

// ── shippingSummary
{
  const orders = [
    { id: 'a', status: 'delivered', market: 'turkey', shipping_company: 'PTT', shipping_payer: 'company', delivery_cost: 468, currency: 'TRY', order_date: '2026-09-01T10:00:00+03:00', delivery_at: '2026-09-05T10:00:00+03:00' },
    { id: 'b', status: 'delivered', market: 'turkey', shipping_company: 'PTT', shipping_payer: 'customer', delivery_cost: 500, currency: 'TRY', order_date: '2026-10-01T10:00:00+03:00', delivery_at: '2026-10-05T10:00:00+03:00' },
    { id: 'c', status: 'delivered', market: 'syria', shipping_company: 'بابل', shipping_payer: 'company', delivery_cost: 1400, currency: 'SYP', order_date: '2026-10-01T10:00:00+03:00', delivery_at: '2026-10-06T10:00:00+03:00' },
  ];
  const m = shippingSummary(orders, TODAY, conv), o = shippingSummary(orders, TODAY);
  near(m.totals.company.usd, 468 / 46.8 + 1400 / 140, 'تكلفة علينا: أيلول 46.8 وأكتوبر 140');
  near(m.totals.customer.usd, 500 / 50, 'على العميل: أكتوبر 50');
  near(o.totals.company.usd, 468 / 50 + 1400 / 140, 'القديم بسعر اليوم 50');
  ok(m.totals.company.usdConfirmed !== undefined && o.totals.company.usdConfirmed === undefined, 'حقول التفصيل بالمحوِّل فقط');
  near(m.rows.reduce((s, g) => s + g.usd, 0), m.totals.company.usd + m.totals.customer.usd, 'مجموع الصفوف = مجموع الدافعين');
  const nrate = shippingSummary([{ ...orders[0], currency: 'EUR', id: 'z' }], TODAY, conv);
  ok(nrate.totals.company.usdMissing === 1 && nrate.totals.company.usd === 0, 'عملة بلا سعر = غير محوَّل لا صفر مؤكَّد');
}

// ── shippingEstimateSummary
{
  const RATES = [{ carrier: 'قدموس', market: 'syria', currency: 'SYP', outbound_fee: 1400, return_policy: 'fixed', return_fee: 700, effective_from: '2026-01-01' }];
  const o = (id, status, extra = {}) => ({ id, status, market: 'syria', shipping_company: 'قدموس', currency: 'SYP', shipping_payer: 'company', delivery_cost: 0, order_date: '2026-09-10T10:00:00+03:00', delivery_at: '2026-09-12T10:00:00+03:00', ...extra });
  const orders = [o('e1', 'delivered'), o('e2', 'returned', { delivery_at: '2026-10-03T10:00:00+03:00' })];
  const m = shippingEstimateSummary(orders, RATES, TODAY, conv), old = shippingEstimateSummary(orders, RATES, TODAY);
  near(m.totals.usdOutbound, 1400 / 131 + 1400 / 140, 'ذهاب: سبتمبر 131 وأكتوبر 140');
  near(m.totals.usdReturn, 700 / 140, 'إرجاع بشهر الشحن (أكتوبر)');
  near(old.totals.usdOutbound, 2 * 1400 / 140, 'القديم بسعر اليوم');
  ok(m.totals.outboundUsd && m.totals.returnUsd && old.totals.outboundUsd === undefined, 'تفصيل الذهاب/الإرجاع بالمحوِّل فقط');
  ok(m.totals.usdMissing === 0, 'لا غير محوَّل');
}

// ── buildReport كاملاً: مرتجع وشحن بالمحوِّل، والمسلَّم لم يتغير
{
  const period = periodBounds({ month: '2026-10' });
  const row = (id, status, extra) => ({ id, order_code: id, status, order_date: '2026-10-02T10:00:00+03:00', amount: 5000, currency: 'TRY', market: 'turkey', handler_name: 'أ', items: [], shipping_company: 'PTT', shipping_payer: 'company', delivery_cost: 500, ...extra });
  const rows = [
    row('d1', 'delivered', { delivered_at: '2026-10-05T10:00:00+03:00', delivery_basis: 'carrier' }),
    row('x1', 'returned', { return_at: '2026-10-20T10:00:00+03:00', return_bulk_suspect: false, delivered_at: '2026-09-25T10:00:00+03:00', delivery_basis: 'carrier', order_date: '2026-09-20T10:00:00+03:00' }),
  ];
  const mon = buildReport({ rows, period, rateMap: TODAY, refs: {}, converter: conv });
  const old = buildReport({ rows, period, rateMap: TODAY, refs: {} });
  ok(mon.returnsTotal.usdConfirmed !== undefined && old.returnsTotal.usdConfirmed === undefined, 'المرتجعات بالمحوِّل فقط عند تمريره');
  near(mon.returnsTotal.usd, 5000 / 50, 'مرتجع أكتوبر بسعر أكتوبر');
  near(mon.totals.usd, 5000 / 50, 'المسلَّم كما هو');
  ok(mon.shipping.totals.company.usdConfirmed !== undefined, 'الشحن بالمحوِّل');
  ok(old.shipping.totals.company.usdConfirmed === undefined && JSON.stringify(old.returnsTotal) === JSON.stringify(buildReport({ rows, period, rateMap: TODAY, refs: {}, converter: null }).returnsTotal), 'بلا محوِّل: متطابق حرفياً');
}

// ── نص العرض
ok(usdSubMonthly(null, (n) => n) === '' && usdSubMonthly({ usd: 0, usdMissing: 0 }, (n) => n) === '', 'مجموعة فارغة: لا نص');
{
  const g = { usd: 100, usdConfirmed: 60, usdEstimated: 40, estimatedN: 2, approximateN: 1, carriedN: 0, fallbackN: 1, usdMissing: 1, unconvertedBreakdown: { noRate: 1, legacy: 0, suspect: 0, invalid: 0 } };
  const t = usdSubMonthly(g, (n) => String(n));
  ok(t.includes('≈ $100') && t.includes('+1 غير محوَّل') && t.includes('بلا سعر'), 'نص: تقدير وغير محوَّل مع السبب');
}

console.log(`\nنتيجة: ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
