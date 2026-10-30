/* global process */
// S3d: مقترح أسعار «إعداد شهر الرواتب» + خطة وكتابة الأسعار الشهرية بعد التثبيت. run: node test-fx-month-setup.mjs
import { suggestSetupRates, planWriteThrough, summarizeWriteThrough, recordMonthlyRatesAfterSetup, setupMonthKey } from './src/utils/fxMonthSetup.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('FAIL', m); } };

const row = (purpose, currency, month, rate, extra = {}) => ({ purpose, currency, units_per_usd: rate, period_month: month, market: null, currency_unit: 'current', status: 'confirmed', rate_quality: 'exact', source: 't', created_at: '2026-10-30T00:00:00Z', ...extra });
const ROWS = [
  row('payroll', 'TRY', '2026-10-01', 50), row('payroll', 'SYP', '2026-10-01', 140), row('payroll', 'TRY', '2026-09-01', 46.8), row('payroll', 'SYP', '2026-09-01', 131),
  row('delivery_accounting', 'TRY', '2026-10-01', 50), row('delivery_accounting', 'SYP', '2026-10-01', 140), row('delivery_accounting', 'TRY', '2026-09-01', 46.8), row('delivery_accounting', 'SYP', '2026-09-01', 131),
  row('delivery_accounting', 'TRY', '2026-03-01', 45.9, { rate_quality: 'approximate' }), row('delivery_accounting', 'SYP', '2026-03-01', 130, { rate_quality: 'approximate' }),
  row('delivery_accounting', 'TRY', '2026-08-01', 48), row('delivery_accounting', 'SYP', '2026-08-01', 131), // آب: تسليم فقط، لا رواتب
  row('payroll', 'TRY', '2026-12-01', 99, { status: 'superseded' }),
];

ok(setupMonthKey(2026, 9) === '2026-09-01' && setupMonthKey(2026, 11) === '2026-11-01', 'مفتاح الشهر');

// ── suggestSetupRates
let s = suggestSetupRates(ROWS, 2026, 10);
ok(s.TRY.rate === 50 && s.TRY.level === 'confirmed' && /الرواتب الشهرية/.test(s.TRY.label) && s.SYP.rate === 140, 'أكتوبر: من أسعار الرواتب المؤكَّدة 50/140');
s = suggestSetupRates(ROWS, 2026, 8);
ok(s.TRY.rate === 48 && s.TRY.level === 'confirmed' && /محاسبة التسليم/.test(s.TRY.label), 'آب: لا سعر رواتب ⇒ سعر محاسبة التسليم لنفس الشهر (مؤكَّد)');
s = suggestSetupRates(ROWS, 2026, 3);
ok(s.TRY.rate === 45.9 && s.TRY.level === 'estimate' && /تقريبي/.test(s.TRY.label), 'آذار: تقريبي ⇒ تقديري بتنبيه');
s = suggestSetupRates(ROWS, 2026, 11);
ok(s.TRY.rate === 50 && s.TRY.level === 'estimate' && /مُرحَّل من 2026-10/.test(s.TRY.label), 'نوفمبر: مُرحَّل من أكتوبر بتنبيه «تقديري، راجعه» (لا 99 المستبدَل)');
s = suggestSetupRates(ROWS, 2025, 12);
ok(s.TRY.rate === null && s.TRY.level === 'none' && /أدخله يدوياً/.test(s.TRY.label) && s.SYP.rate === null, 'قبل أي سعر: حقل فارغ لا افتراضي');
s = suggestSetupRates([], 2026, 10); ok(s.TRY.rate === null && s.SYP.rate === null, 'بلا صفوف: فارغ');
s = suggestSetupRates(ROWS, 2026, 4);
ok(s.TRY.rate === 48 || s.TRY.rate === null, 'أبريل: لا يرث تقريبي مارس'); // لا سعر مؤكَّد قبله ⇒ null
ok(suggestSetupRates(ROWS, 2026, 4).TRY.rate === null, 'أبريل بلا سعر مؤكَّد سابق ⇒ فارغ');
// الرواتب تتقدّم على التسليم عند اختلاف القيمتين لنفس الشهر
const diff = [row('payroll', 'TRY', '2026-10-01', 50), row('delivery_accounting', 'TRY', '2026-10-01', 49.5)];
ok(suggestSetupRates(diff, 2026, 10).TRY.rate === 50, 'عند الاختلاف سعر الرواتب هو المقترح');

// ── planWriteThrough
const plan = (rows, rates, y = 2026, m = 11) => planWriteThrough(rows, { year: y, month: m, rates });
let ops = plan(ROWS, { TRY: 52, SYP: 145 });
ok(ops.length === 4 && ops.every((o) => o.action === 'insert'), 'نوفمبر بلا أسعار: 4 إدخالات (رواتب/تسليم × TRY/SYP)');
ops = plan(ROWS, { TRY: 50, SYP: 140 }, 2026, 10);
ok(ops.every((o) => o.action === 'same'), 'أكتوبر المطابق: كله same (لا كتابة مكررة)');
ops = plan(ROWS, { TRY: 51, SYP: 140 }, 2026, 10);
ok(ops.filter((o) => o.action === 'conflict').length === 2 && ops.find((o) => o.action === 'conflict').existing === 50 && ops.filter((o) => o.action === 'same').length === 2, 'اختلاف TRY بأكتوبر: تعارض لغرضين، ولا نكتب فوقه');
ops = plan(ROWS, { TRY: 48, SYP: 131 }, 2026, 8);
ok(ops.filter((o) => o.purpose === 'payroll').every((o) => o.action === 'insert') && ops.filter((o) => o.purpose === 'delivery_accounting').every((o) => o.action === 'same'), 'آب: الرواتب إدخال، التسليم موجود مطابق');
ops = plan(ROWS, { TRY: 46, SYP: 130 }, 2026, 3);
ok(ops.filter((o) => o.purpose === 'delivery_accounting').every((o) => o.action === 'insert'), 'مارس: التقريبي لا يمنع تسجيل المؤكَّد (يُستبدَل)');
ops = plan(ROWS, { TRY: '', SYP: 'abc' });
ok(ops.every((o) => o.action === 'invalid'), 'سعر فارغ/نصي = invalid لا يُكتب');
ops = plan(ROWS, { TRY: 0, SYP: -5 }); ok(ops.every((o) => o.action === 'invalid'), 'صفر/سالب = invalid');
ops = plan(ROWS, { TRY: 52 }); ok(ops.filter((o) => o.currency === 'SYP').every((o) => o.action === 'invalid'), 'عملة غائبة = invalid');
ops = plan([{ ...row('payroll', 'TRY', '2026-11-01', 52), status: 'superseded' }], { TRY: 52, SYP: 145 });
ok(ops.every((o) => o.action === 'insert'), 'المستبدَل لا يُحتسب موجوداً');

// ── recordMonthlyRatesAfterSetup (تبعيات مُحقَنة)
const mk = (rows, err = null) => ({ loadFx: async () => ({ rows, error: err }), calls: [], save: null });
{
  const d = mk(ROWS); d.save = async (a) => { d.calls.push(a); return 'id'; };
  const msg = await recordMonthlyRatesAfterSetup({ year: 2026, month: 11, rates: { TRY: 52, SYP: 145 } }, d);
  ok(d.calls.length === 4 && /سُجّل 4/.test(msg), 'يسجّل 4 أسعار ويُبلغ');
  ok(d.calls.every((c) => c.quality === 'exact' && c.month === '2026-11-01' && /إعداد شهر الرواتب/.test(c.note)), 'جودة مؤكَّدة، شهر الإعداد، ملاحظة المصدر');
  ok(new Set(d.calls.map((c) => `${c.purpose}|${c.currency}`)).size === 4 && d.calls.some((c) => c.purpose === 'payroll' && c.currency === 'SYP' && c.rate === 145), 'الرواتب والتسليم لكل عملة');
}
{
  const d = mk(ROWS); d.save = async (a) => { d.calls.push(a); };
  const msg = await recordMonthlyRatesAfterSetup({ year: 2026, month: 10, rates: { TRY: 50, SYP: 140 } }, d);
  ok(d.calls.length === 0 && /مطابقة مسبقاً/.test(msg), 'لا كتابة عند التطابق');
  const m2 = await recordMonthlyRatesAfterSetup({ year: 2026, month: 10, rates: { TRY: 51, SYP: 140 } }, d);
  ok(d.calls.length === 0 && /تعارض/.test(m2) && /50/.test(m2), 'التعارض يُنبَّه ولا يُكتب فوقه');
}
{
  // فشل الكتابة (غير أدمن): لا يرمي، ويُبلغ، والبقية تُحاوَل
  const d = mk(ROWS); let n = 0; d.save = async () => { n += 1; if (n <= 2) throw new Error('لا صلاحية: إدخال الأسعار للأدمن فقط.'); };
  const msg = await recordMonthlyRatesAfterSetup({ year: 2026, month: 11, rates: { TRY: 52, SYP: 145 } }, d);
  ok(n === 4 && /تعذّر تسجيل 2/.test(msg) && /للأدمن فقط/.test(msg) && /الرواتب لم تتأثر/.test(msg), 'فشل جزئي مُعلَن ولا يوقف الباقي ولا يمس الرواتب');
  const d2 = mk(ROWS); d2.save = async () => { throw new Error('لا صلاحية: إدخال الأسعار للأدمن فقط.'); };
  let threw = false; let m3 = '';
  try { m3 = await recordMonthlyRatesAfterSetup({ year: 2026, month: 11, rates: { TRY: 52, SYP: 145 } }, d2); } catch { threw = true; }
  ok(!threw && /تعذّر تسجيل 4/.test(m3), 'فشل كلي (غير أدمن) لا يرمي أبداً');
}
{
  const d = { loadFx: async () => ({ rows: [], error: 'permission denied' }), save: async () => { throw new Error('must not be called'); } };
  const msg = await recordMonthlyRatesAfterSetup({ year: 2026, month: 11, rates: { TRY: 52, SYP: 145 } }, d);
  ok(/تعذّر قراءة الأسعار الشهرية/.test(msg) && /لم تُسجَّل/.test(msg), 'فشل القراءة: رسالة ولا كتابة (حتى لا نكتب فوق سعر لا نراه)');
  const d2 = { loadFx: async () => { throw new Error('network'); }, save: async () => { throw new Error('x'); } };
  ok(/network/.test(await recordMonthlyRatesAfterSetup({ year: 2026, month: 11, rates: { TRY: 1, SYP: 1 } }, d2)), 'استثناء القراءة لا يتسرّب');
}
ok(summarizeWriteThrough([{ action: 'invalid' }], []).includes('غير صالح'), 'رسالة السعر غير الصالح');

console.log(`\nنتيجة: ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
