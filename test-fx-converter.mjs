/* global process */
// S3b-1: المحوِّل الشهري لشاشات المبيعات. توافق رجعي حرفي بلا محوِّل + السعر الشهري بوجوده + التصدير + العرض + مفتاح التشغيل.
// run: node test-fx-converter.mjs
import { summarize, buildReport, exportSheets, periodBounds, toUsd } from './src/utils/deliveryAccounting.js';
import { makeMonthlyConverter, usdDisplay, describeUnconverted, usdForRow, STATUS_LABEL } from './src/utils/fxConverter.js';
import { FX_MONTHLY_DISPLAY } from './src/utils/fxFlags.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('FAIL', m); } };
const near = (a, b, m, eps = 0.011) => ok(Math.abs(Number(a) - b) <= eps, `${m} (got ${a}, want ${b})`);

// مفتاح التشغيل: مغلق حتى تقرّر المراجعة قلبه (قلبه = PR يعدّل هذا الاختبار عمداً)
ok(FX_MONTHLY_DISPLAY === false, 'FX_MONTHLY_DISPLAY مغلق افتراضياً (S3b-1 لا يغيّر أي رقم معروض)');

const D = 'delivery_accounting';
const r = (currency, month, rate, extra = {}) => ({ purpose: D, currency, units_per_usd: rate, period_month: month, market: null, currency_unit: 'current', status: 'confirmed', rate_quality: 'exact', source: 't', created_at: '2026-10-30T00:00:00Z', ...extra });
const FX = {
  rows: [r('TRY', '2026-08-01', 48), r('TRY', '2026-09-01', 46.8), r('TRY', '2026-10-01', 50), r('SYP', '2026-09-01', 131), r('SYP', '2026-10-01', 140), r('AED', '2026-09-01', 3.6725), r('AED', '2026-10-01', 3.6725),
    r('TRY', '2026-03-01', 45.9, { rate_quality: 'approximate' }), r('SYP', '2026-03-01', 130, { rate_quality: 'approximate' })],
  units: [{ currency: 'SYP', unit: 'legacy', valid_from: '2000-01-01', valid_to: '2025-12-31', min_amount: 20000 }, { currency: 'SYP', unit: 'suspect', valid_from: '2026-01-01', valid_to: null, min_amount: 20000 }],
};
const TODAY = { USD: 1, TRY: 1 / 50, SYP: 1 / 140, AED: 1 / 3.6725 };
const conv = makeMonthlyConverter(FX);
const o = (amount, currency, at, extra = {}) => ({ amount, currency, delivery_at: at, order_date: at, market: 'turkey', handler_name: 'علي', ...extra });

// ── makeMonthlyConverter
ok(makeMonthlyConverter(null) === null && makeMonthlyConverter({ rows: [], error: 'x' }) === null && makeMonthlyConverter({}) === null, 'بلا أسعار/خطأ ⇒ null (الشاشة تعود للقديم بشريط)');
ok(conv && conv.monthly === true, 'محوِّل صالح');

// ── 1) توافق رجعي: بلا محوِّل نفس الحساب القديم تماماً (تقريب كل خطوة، مفاتيح المجموعة بلا حقول جديدة)
{
  const orders = [o(1400, 'TRY', '2026-10-05T10:00:00+03:00'), o(2000, 'SYP', '2026-10-06T10:00:00+03:00', { market: 'syria' }), o(70, 'AED', '2026-10-07T10:00:00+03:00', { market: 'uae' }), o(20, 'USD', '2026-10-08T10:00:00+03:00', { market: 'syria' }), o(5, 'EUR', '2026-10-09T10:00:00+03:00')];
  const s = summarize(orders, () => 'all', TODAY);
  const g = s[0];
  ok(Object.keys(g).sort().join() === ['byCurrency', 'count', 'key', 'usd', 'usdMissing'].sort().join(), 'بلا محوِّل: لا حقول جديدة بالمجموعة');
  ok(g.usdMissing === 1 && g.count === 5, 'EUR بلا سعر = usdMissing (سلوك قديم)');
  let run = 0; for (const x of orders) { const u = toUsd(x.amount, x.currency, TODAY); if (u !== null) run = Math.round((run + u) * 100) / 100; }
  ok(g.usd === run, 'التقريب الجاري القديم محفوظ حرفياً');
  ok(JSON.stringify(summarize(orders, () => 'all', TODAY, null)) === JSON.stringify(s), 'converter=null ≡ غيابه');
}

// ── 2) بالمحوِّل: ذهبي أكتوبر = القديم (نفس الأسعار) ومؤكَّد كله
{
  const oct = [o(1400, 'TRY', '2026-10-05T10:00:00+03:00'), o(2000, 'SYP', '2026-10-06T10:00:00+03:00', { market: 'syria' }), o(70, 'AED', '2026-10-07T10:00:00+03:00', { market: 'uae' }), o(20, 'USD', '2026-10-08T10:00:00+03:00', { market: 'syria' })];
  const g = summarize(oct, () => 'all', TODAY, conv)[0];
  near(g.usd, 28 + 2000 / 140 + 70 / 3.6725 + 20, 'أكتوبر بالمحوِّل = القديم');
  ok(g.usdConfirmed === g.usd && g.usdEstimated === 0 && g.estimatedN === 0 && g.usdMissing === 0, 'كله مؤكَّد');
}
// ── 3) سبتمبر بأسعار سبتمبر لا سعر اليوم
{
  const sep = [o(46800, 'TRY', '2026-09-15T12:00:00+03:00'), o(5240, 'SYP', '2026-09-16T12:00:00+03:00', { market: 'syria' })];
  const g = summarize(sep, () => 'all', TODAY, conv)[0];
  near(g.usd, 1000 + 40, 'سبتمبر 46.8 و131');
  ok(summarize(sep, () => 'all', TODAY)[0].usd !== g.usd, 'يختلف عن الطريقة القديمة');
}
// ── 4) تقديري/مُرحَّل/غير محوَّل بأنواعه + المؤكَّد منفصل
{
  const mix = [
    o(1400, 'TRY', '2026-10-05T10:00:00+03:00'),                       // مؤكَّد 28
    o(459, 'TRY', '2026-03-10T12:00:00+03:00'),                        // تقريبي 10
    o(500, 'TRY', '2026-12-05T12:00:00+03:00'),                        // مُرحَّل من أكتوبر 10
    o(5, 'EUR', '2026-10-05T10:00:00+03:00'),                          // بلا سعر
    o(120000, 'SYP', '2026-01-05T12:00:00+03:00', { order_date: '2025-11-20T10:00:00+03:00' }), // وحدة قديمة
    o(150000, 'SYP', '2026-10-05T10:00:00+03:00'),                     // مشبوه
    o(null, 'TRY', '2026-10-05T10:00:00+03:00'),                       // بلا مبلغ
  ];
  const g = summarize(mix, () => 'all', TODAY, conv)[0];
  near(g.usdConfirmed, 28, 'مؤكَّد 28'); near(g.usdEstimated, 20, 'تقديري 20 (تقريبي 10 + مُرحَّل 10)'); near(g.usd, 48, 'الإجمالي = مؤكَّد + تقديري');
  ok(g.estimatedN === 2 && g.approximateN === 1 && g.carriedN === 1, 'عدّادات التقدير');
  ok(g.usdMissing === 4 && g.unconvertedBreakdown.noRate === 1 && g.unconvertedBreakdown.legacy === 1 && g.unconvertedBreakdown.suspect === 1 && g.unconvertedBreakdown.invalid === 1, 'غير محوَّل 4 مفصَّلة');
  ok(g.count === 7, 'كل الطلبات معدودة');
  const ud = usdDisplay(g);
  ok(ud.estimated && ud.text.startsWith('≈ $') && /مؤكَّد/.test(ud.detail) && /تقريبي 1 · مُرحَّل 1/.test(ud.detail) && !ud.final && /بلا مبلغ/.test(ud.unconvertedText), 'العرض: ≈، تفصيل، غير نهائي، أسباب');
  ok(describeUnconverted({ invalid: 1, noRate: 2, legacy: 0, suspect: 3 }) === '1 بلا مبلغ · 2 بلا سعر · 3 وحدة مشبوهة', 'وصف غير المحوَّل');
  const clean = usdDisplay(summarize([o(1400, 'TRY', '2026-10-05T10:00:00+03:00')], () => 'all', TODAY, conv)[0]);
  ok(clean.final && !clean.estimated && clean.text === '$28' && clean.detail === '', 'فترة مؤكَّدة: رقم عادي نهائي بلا «≈»');
}
// ── 5) التقريب مرة واحدة: 754 طلباً سورياً
{
  const many = Array.from({ length: 754 }, () => o(1000, 'SYP', '2026-10-05T10:00:00+03:00', { market: 'syria' }));
  near(summarize(many, () => 'all', TODAY, conv)[0].usd, 754000 / 140, 'تقريب نهائي واحد', 0.0051);
}
// ── 6) مفاتيح التجميع (سوق/موظف) تعمل بالمحوِّل ومجموع الأجزاء = الكل
{
  const list = [o(1400, 'TRY', '2026-10-05T10:00:00+03:00', { handler_name: 'أ' }), o(2000, 'SYP', '2026-10-06T10:00:00+03:00', { market: 'syria', handler_name: 'ب' }), o(459, 'TRY', '2026-03-10T12:00:00+03:00', { handler_name: 'أ' })];
  const byS = summarize(list, (x) => x.handler_name, TODAY, conv);
  const all = summarize(list, () => 'all', TODAY, conv)[0];
  near(byS.reduce((a, g) => a + g.usd, 0), all.usd, 'مجموع الموظفين = الإجمالي');
  ok(byS.find((g) => g.key === 'أ').estimatedN === 1 && byS.find((g) => g.key === 'ب').estimatedN === 0, 'التقدير يُنسب لصاحبه');
}

// ── 7) buildReport: بالمحوِّل وبدونه
const period = periodBounds({ month: '2026-10' });
const row = (id, amount, currency, market, seller, at = '2026-10-10T12:00:00+03:00') => ({ id, order_code: id, status: 'delivered', delivered_at: at, delivery_basis: 'carrier', order_date: at, amount, currency, market, handler_name: seller, items: [] });
const rows = [row('a1', 1400, 'TRY', 'turkey', 'أ'), row('a2', 2800, 'SYP', 'syria', 'ب'), row('a3', 70, 'AED', 'uae', 'ج'), row('a4', 20, 'USD', 'syria', 'ب')];
{
  const old = buildReport({ rows, period, rateMap: TODAY, refs: {} });
  const mon = buildReport({ rows, period, rateMap: TODAY, refs: {}, converter: conv });
  ok(old.fxMonthly === false && old.converter === null && old.totals.usd > 0, 'بلا محوِّل: fxMonthly=false');
  ok(mon.fxMonthly === true && mon.totals.usdConfirmed !== undefined, 'بالمحوِّل: fxMonthly=true وحقول التفصيل');
  near(mon.totals.usd, old.totals.usd, 'أكتوبر: نفس الرقم بالطريقتين', 0.011);
  ok(mon.byMarket.length === 3 && mon.bySeller.length === 3, 'مجموع الأسواق والموظفين');
  ok(mon.delivered.length === old.delivered.length && mon.returns.length === old.returns.length, 'الطلبات المسلَّمة والمرتجعات لا تتغير');
  ok(JSON.stringify(mon.returnsTotal) === JSON.stringify(old.returnsTotal) && JSON.stringify(mon.shipping) === JSON.stringify(old.shipping), 'بلا مرتجعات/شحن موثّق بالفترة: التقريران متطابقان (التفصيل في test-fx-returns-shipping)');
}
// ── 8) التصدير
{
  const old = exportSheets(buildReport({ rows, period, rateMap: TODAY, refs: {} }));
  const mon = exportSheets(buildReport({ rows, period, rateMap: TODAY, refs: {}, converter: conv }));
  ok(old['ملخص الأسواق'][0].length === 5 && old['الطلبات المسلّمة'][0].length === 10 && old['الموظفون والعمولات'][0].length === 5, 'تصدير بلا محوِّل: الأعمدة القديمة كما هي');
  ok(mon['ملخص الأسواق'][0].includes('منه تقديري $') && mon['الطلبات المسلّمة'][0].slice(-2).join() === 'بالدولار,حالة السعر' && mon['الموظفون والعمولات'][0].includes('منه تقديري $'), 'تصدير بالمحوِّل: أعمدة التقدير وحالة السعر');
  ok(mon['الطلبات المسلّمة'].slice(1).every((x) => x.length === 12 && Object.keys(STATUS_LABEL).includes(x[11])), 'كل صف طلب يحمل USD وحالة السعر');
  ok(mon['الطلبات المسلّمة'][1][10] === 28 && mon['الطلبات المسلّمة'][1][11] === 'ok', 'صف الطلب: 28$ مؤكَّد');
}
// ── 9) usdForRow (شاشة الطلبات)
{
  const legacy = usdForRow({ amount: 1400, currency: 'TRY' }, { converter: null, rateMap: TODAY, toUsdLegacy: toUsd });
  ok(legacy.usd === 28 && legacy.est === false && legacy.status === 'legacy', 'بلا محوِّل: السعر الواحد القديم');
  const m = usdForRow(o(459, 'TRY', '2026-03-10T12:00:00+03:00'), { converter: conv, rateMap: TODAY, toUsdLegacy: toUsd });
  near(m.usd, 10, 'مارس بالمحوِّل'); ok(m.est === true && m.status === 'approximate', 'تقديري موسوم');
  const u = usdForRow(o(null, 'TRY', '2026-10-05T10:00:00+03:00'), { converter: conv, rateMap: TODAY, toUsdLegacy: toUsd });
  ok(u.usd === null && u.est === false && u.status === 'invalid', 'بلا مبلغ = null (يُعدّ غير محوَّل بالشاشة)');
  const p = usdForRow(o(1400, 'TRY', '2026-10-05T10:00:00+03:00'), { converter: conv, rateMap: TODAY, toUsdLegacy: toUsd });
  ok(p.usd === 28 && p.est === false && p.status === 'ok', 'أكتوبر مؤكَّد');
}

console.log(`\nنتيجة: ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
