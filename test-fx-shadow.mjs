/* global process */
// S2 Shadow Mode: مقارنة التحويل القديم بالجديد. للقراءة فقط. run: node test-fx-shadow.mjs
import { buildFxShadow } from './src/utils/fxShadow.js';

let pass = 0; let fail = 0;
const ok = (c, m) => { if (c) pass += 1; else { fail += 1; console.error('FAIL', m); } };
const near = (a, b, m, eps = 0.011) => ok(Math.abs(Number(a) - b) <= eps, `${m} (got ${a}, want ${b})`);

const D = 'delivery_accounting';
const r = (currency, month, rate, extra = {}) => ({ purpose: D, currency, units_per_usd: rate, period_month: month, market: null, currency_unit: 'current', status: 'confirmed', rate_quality: 'exact', source: 't', created_at: '2026-10-30T00:00:00Z', ...extra });
const FX = {
  rows: [r('TRY', '2026-08-01', 48), r('TRY', '2026-09-01', 46.8), r('TRY', '2026-10-01', 50), r('SYP', '2026-08-01', 131), r('SYP', '2026-09-01', 131), r('SYP', '2026-10-01', 140),
    r('AED', '2026-08-01', 3.6725), r('AED', '2026-09-01', 3.6725), r('AED', '2026-10-01', 3.6725),
    r('TRY', '2026-03-01', 45.9, { rate_quality: 'approximate' }), r('SYP', '2026-03-01', 130, { rate_quality: 'approximate' })],
  units: [{ currency: 'SYP', unit: 'legacy', valid_from: '2000-01-01', valid_to: '2025-12-31', min_amount: 20000 }, { currency: 'SYP', unit: 'suspect', valid_from: '2026-01-01', valid_to: null, min_amount: 20000 }],
};
// الشاشة اليوم: سعر واحد لكل عملة (سعر اليوم)
const TODAY = { USD: 1, TRY: 1 / 50, SYP: 1 / 140, AED: 1 / 3.6725 };
const o = (amount, currency, delivery_at, extra = {}) => ({ amount, currency, delivery_at, order_date: delivery_at, ...extra });

// ── أكتوبر: القديم = الجديد (الأسعار نفسها)، كله مؤكَّد
const oct = [o(1400, 'TRY', '2026-10-05T10:00:00+03:00'), o(2000, 'SYP', '2026-10-06T10:00:00+03:00'), o(70, 'AED', '2026-10-07T10:00:00+03:00'), o(20, 'USD', '2026-10-08T10:00:00+03:00')];
let s = buildFxShadow(oct, TODAY, FX, 28 + 2000 / 140 + 70 / 3.6725 + 20);
near(s.total.oldUsd, s.total.newUsd, 'أكتوبر: القديم = الجديد'); ok(s.diff === 0 || Math.abs(s.diff) < 0.011, 'فرق أكتوبر صفر');
ok(s.final === true && s.total.notConvertedN === 0 && s.total.estimated === 0, 'أكتوبر نهائي: لا تقدير ولا غير محوَّل');
ok(s.byCurrency.length === 4 && s.byMonth.length === 1, 'تفصيل 4 عملات وشهر واحد');

// ── سبتمبر: الجديد يرتفع لأن أسعار سبتمبر أقل من سعر اليوم (D2)
const sep = [o(46800, 'TRY', '2026-09-15T12:00:00+03:00'), o(5240, 'SYP', '2026-09-16T12:00:00+03:00')];
s = buildFxShadow(sep, TODAY, FX);
near(s.total.oldUsd, 46800 / 50 + 5240 / 140, 'سبتمبر القديم بسعر اليوم'); near(s.total.confirmed, 1000 + 40, 'سبتمبر الجديد بأسعار سبتمبر (46.8 و131)');
ok(s.diff > 0 && s.final === true, 'الفرق موجب ونهائي');

// ── آذار 2026: تقريبي، يظهر تقديرياً لا مؤكَّداً، ويُسجَّل
const mar = [o(459, 'TRY', '2026-03-10T12:00:00+03:00'), o(1300, 'SYP', '2026-03-11T12:00:00+03:00')];
s = buildFxShadow(mar, TODAY, FX);
near(s.total.confirmed, 0, 'لا شيء مؤكَّد'); near(s.total.approximate, 10 + 10, 'تقريبي 459/45.9 + 1300/130'); near(s.total.estimated, 20, 'التقديري = التقريبي');
ok(s.final === false && s.approximate.length === 2 && s.total.approximateN === 2, 'غير نهائي ويسرد الأسعار التقريبية المستعملة');

// ── شهر بلا سعر (ديسمبر 2026): مُرحَّل تقديري من أكتوبر
s = buildFxShadow([o(500, 'TRY', '2026-12-05T12:00:00+03:00')], TODAY, FX);
ok(s.total.carriedN === 1 && s.carried[0].carriedFrom === '2026-10-01' && s.carried[0].month === '2026-12-01' && s.final === false, 'مُرحَّل مسجَّل المصدر وغير نهائي');
near(s.total.carried, 10, 'التقدير المرحَّل 500/50');

// ── قبل أي سعر (2025): غير محوَّل؛ وحدة قديمة؛ مشبوه
const old = [o(1400, 'TRY', '2025-12-05T12:00:00+03:00'), o(120000, 'SYP', '2025-12-06T12:00:00+03:00'), o(150000, 'SYP', '2026-03-05T12:00:00+03:00'), o(1800, 'SYP', '2025-12-07T12:00:00+03:00')];
s = buildFxShadow(old, TODAY, FX);
ok(s.total.missingN === 2 && s.total.legacyN === 1 && s.total.suspectN === 1 && s.total.notConvertedN === 4, 'غير محوَّل مفصَّل: بلا سعر 2 (TRY 2025 وSYP الصغير)، وحدة قديمة 1، مشبوه 1');
ok(s.total.newUsd === 0 && s.final === false, 'لا يدخل أي مجموع');
near(s.total.oldUsd, 1400 / 50 + 120000 / 140 + 150000 / 140 + 1800 / 140, 'القديم كان يضخّم: يحوّل 120,000 قديمة بـ140 (857$) — الخطر الذي تحميه الحماية الجديدة');
ok(s.total.oldUsd > 1000, 'القديم >1000$ لطلبات 2025 السورية الكبيرة');

// وحدة المبلغ تتبع تاريخ تسجيل الطلب لا تسليمه: سُجِّل 28/12/2025 بوحدة قديمة وسُلِّم 4/1/2026
s = buildFxShadow([{ amount: 120000, currency: 'SYP', order_date: '2025-12-28T12:00:00+03:00', delivery_at: '2026-01-04T12:00:00+03:00' }], TODAY, FX);
ok(s.total.legacyN === 1 && s.total.suspectN === 0, 'طلب قديم الوحدة سُلِّم بعد القطع = unit_legacy (وحدة التسجيل)، لا «مشبوه»');

// ── فترة متعددة الأشهر: تفصيل شهري مرتّب
s = buildFxShadow([...oct, ...sep, ...mar], TODAY, FX);
ok(s.byMonth.map((m) => m.month).join() === '2026-03-01,2026-09-01,2026-10-01', 'تفصيل شهري مرتّب');
near(s.total.count, 4 + 2 + 2, 'العدد الكلي'); near(s.byMonth.reduce((a, m) => a + m.newUsd, 0), s.total.newUsd, 'مجموع الأشهر = الإجمالي');

// ── حالات حدّية: بلا طلبات، بلا أسعار محمَّلة، عملة بلا سعر، مبلغ غير رقمي، تقريب
s = buildFxShadow([], TODAY, FX); ok(s.total.count === 0 && s.final === true && s.diff === 0, 'بلا طلبات');
s = buildFxShadow(oct, TODAY, { rows: [], units: [] });
ok(s.fxLoaded === false && s.total.missingN === 3 && s.total.confirmed === 20 && s.final === false, 'أسعار شهرية غير محمَّلة: USD وحده يُحوَّل والباقي غير محوَّل (لا افتراضي)');
s = buildFxShadow([o(10, 'EUR', '2026-10-05T10:00:00+03:00'), o('abc', 'TRY', '2026-10-05T10:00:00+03:00')], TODAY, FX);
ok(s.total.missingN === 1 && s.total.invalidN === 1, 'EUR بلا سعر، مبلغ نصّي غير صالح');
const many = Array.from({ length: 754 }, () => o(1000, 'SYP', '2026-10-05T10:00:00+03:00'));
s = buildFxShadow(many, TODAY, FX);
near(s.total.newUsd, 754000 / 140, 'تجميع 754 طلباً: تقريب واحد نهائي', 0.0051);
ok(s.displayedOldUsd === null, 'لا رقم معروض ⇒ null');
s = buildFxShadow(oct, TODAY, FX, 200.123); ok(s.displayedOldUsd === 200.12, 'الرقم المعروض يُمرَّر كما هو (مقرَّباً للعرض)');
// delivery_at مفقود يُستعمل order_date
s = buildFxShadow([{ amount: 1400, currency: 'TRY', order_date: '2026-10-05T10:00:00+03:00' }], TODAY, FX);
near(s.total.confirmed, 28, 'بلا delivery_at يُستعمل order_date');
// حدود الشهر بتوقيت إسطنبول: 31/10 23:30 إسطنبول = 20:30 UTC → أكتوبر
s = buildFxShadow([o(5000, 'TRY', '2026-10-31T20:30:00Z')], TODAY, FX); near(s.total.confirmed, 100, '31/10 23:30 إسطنبول يبقى أكتوبر (50)');
s = buildFxShadow([o(5000, 'TRY', '2026-10-31T21:30:00Z')], TODAY, FX);
ok(s.total.carriedN === 1, '31/10 21:30 UTC = 1 نوفمبر إسطنبول → مُرحَّل من أكتوبر لا مؤكَّد');

console.log(`\nنتيجة: ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
