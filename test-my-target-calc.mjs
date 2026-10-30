/* global process */
// اختبار بطاقة «هدفي» (S3c): تحويل بسعر الشهر المؤكَّد، تقديري/مُرحَّل، غير محوَّل، وحدة SYP، تركي/سوري/إماراتي، فشل الأسعار.
// run: node test-my-target-calc.mjs
import { computeMyTarget, progressPct } from './src/utils/myTargetCalc.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('FAIL', m); } };
const near = (a, b, m, eps = 1e-9) => ok(Math.abs(a - b) <= eps, `${m} (got ${a}, want ${b})`);

const D = 'delivery_accounting';
const r = (currency, month, rate, extra = {}) => ({ purpose: D, currency, units_per_usd: rate, period_month: month, market: null, currency_unit: 'current', status: 'confirmed', rate_quality: 'exact', source: 't', created_at: '2026-10-30T00:00:00Z', ...extra });
const FX = {
  rows: [r('SYP', '2026-09-01', 131), r('SYP', '2026-10-01', 140), r('TRY', '2026-10-01', 50), r('AED', '2026-10-01', 3.6725),
    r('SYP', '2026-03-01', 130, { rate_quality: 'approximate' }), r('SYP', '2026-11-01', 999, { status: 'superseded' })],
  units: [{ currency: 'SYP', unit: 'legacy', valid_from: '2000-01-01', valid_to: '2025-12-31', min_amount: 20000 }, { currency: 'SYP', unit: 'suspect', valid_from: '2026-01-01', valid_to: null, min_amount: 20000 }],
};
const OCT = { month: '2026-10-15' };

// 1) سوري: SYP بسعر الشهر (140) + USD كما هو
const syria = [{ market: 'syria', currency: 'SYP', amount: 2800 }, { market: 'syria', currency: 'USD', amount: 18 }, { market: 'syria', currency: 'SYP', amount: 0 }];
{
  const c = computeMyTarget(syria, FX, OCT);
  near(c.syria.val, 38, 'سوري أكتوبر: 2800/140 + 18 = 38$'); near(c.syria.confirmed, 38, 'كله مؤكَّد');
  ok(c.syria.estimatedN === 0 && c.syria.unconverted === 0 && c.turkey === null, 'لا تقدير ولا غير محوَّل ولا بطاقة تركية');
}
// 2) نفس الطلبات بشهر آخر يُحوَّل بسعر ذلك الشهر (لا سعر اليوم): سبتمبر 131
{
  const c = computeMyTarget(syria, FX, { month: '2026-09-20' });
  near(c.syria.val, 2800 / 131 + 18, 'سبتمبر: 131 لا 140');
}
// 3) تركي: بالليرة بلا تحويل ولا حاجة للأسعار
{
  const o = [{ market: 'turkey', currency: 'TRY', amount: 1400 }, { market: 'turkey', currency: 'TRY', amount: 700.5 }];
  const a = computeMyTarget(o, FX, OCT), b = computeMyTarget(o, null, OCT);
  near(a.turkey.val, 2100.5, 'تركي: مجموع الليرة'); ok(a.syria === null, 'لا بطاقة سورية');
  ok(b.turkey.val === 2100.5 && b.turkey.unconverted === 0, 'فشل الأسعار لا يؤثر على التركي');
}
// 4) USD وحده يعمل حتى لو فشل تحميل الأسعار
{
  const c = computeMyTarget([{ market: 'syria', currency: 'USD', amount: 50 }], null, OCT);
  ok(c.syria.val === 50 && c.syria.unconverted === 0 && c.syria.estimatedN === 0, 'USD فقط + فشل الأسعار = رقم نهائي بلا تحذير');
}
// 5) فشل تحميل الأسعار: SYP لا يُقدَّر — غير محوَّل
{
  const c = computeMyTarget(syria, null, OCT);
  near(c.syria.val, 18, 'يُحسب USD فقط'); ok(c.syria.unconverted === 2 && c.syria.currencies.join() === 'SYP', 'طلبان SYP معلنان غير محوَّلين');
}
// 6) شهر بلا سعر أصلاً (قبل أي سعر) = غير محوَّل؛ سعر غير صالح لا يُستعمل
{
  const c = computeMyTarget([{ market: 'syria', currency: 'SYP', amount: 1400 }], FX, { month: '2025-12-10' });
  ok(c.syria.val === 0 && c.syria.unconverted === 1, 'ديسمبر 2025 بلا سعر = غير محوَّل');
  const bad = computeMyTarget([{ market: 'syria', currency: 'SYP', amount: 1400 }], { rows: [r('SYP', '2026-10-01', 0)], units: [] }, OCT);
  ok(bad.syria.unconverted === 1, 'سعر صفر لا يُستعمل');
}
// 7) شهر جديد بلا سعر (نوفمبر): مُرحَّل من أكتوبر ⇒ تقديري معلَن، والمُستبدَل لا يُستعمل أبداً
{
  const c = computeMyTarget([{ market: 'syria', currency: 'SYP', amount: 1400 }], FX, { month: '2026-11-03' });
  near(c.syria.val, 10, 'نوفمبر: 1400/140 من أكتوبر'); near(c.syria.confirmed, 0, 'لا شيء مؤكَّد');
  ok(c.syria.estimatedN === 1 && c.syria.carriedFrom.join() === '2026-10', 'تقديري مُرحَّل من 2026-10 (لا 999 المستبدَل)');
}
// 8) سعر تقريبي معتمد: تقديري، ويخدم شهره فقط
{
  const c = computeMyTarget([{ market: 'syria', currency: 'SYP', amount: 1300 }], FX, { month: '2026-03-10' });
  near(c.syria.val, 10, 'مارس تقريبي 1300/130'); ok(c.syria.estimatedN === 1 && c.syria.approximateN === 1 && c.syria.confirmed === 0, 'تقديري/تقريبي لا مؤكَّد');
  const apr = computeMyTarget([{ market: 'syria', currency: 'SYP', amount: 1300 }], FX, { month: '2026-04-10' });
  ok(apr.syria.unconverted === 1 && apr.syria.val === 0, 'أبريل بلا سعر مؤكَّد سابق = غير محوَّل (لا يرث تقريبي مارس)');
}
// 9) حماية الوحدة: مبلغ سوري ≥ 20,000 بعد القطع = غير محوَّل (مشبوه)؛ مسجَّل بوحدة قديمة = غير محوَّل
{
  const c = computeMyTarget([{ market: 'syria', currency: 'SYP', amount: 150000 }, { market: 'syria', currency: 'SYP', amount: 2000 }], FX, OCT);
  near(c.syria.val, 2000 / 140, 'يدخل الصغير فقط'); ok(c.syria.unconverted === 1, 'الكبير غير محوَّل');
  const old = computeMyTarget([{ market: 'syria', currency: 'SYP', amount: 120000, order_date: '2025-11-20T10:00:00+03:00' }], FX, { month: '2026-01-04' });
  ok(old.syria.unconverted === 1, 'مبلغ قديم الوحدة (سُجّل نوفمبر 2025) لا يُحوَّل بسعر الوحدة الحالية');
}
// 10) إماراتي خارج الهدف؛ سوق سوريا بعملة TRY → تركيا؛ عملة غير TRY بسوق تركي لا تُجمع كليرة
{
  const u = computeMyTarget([{ market: 'uae', currency: 'AED', amount: 500 }], FX, OCT);
  ok(u.turkey === null && u.syria.val === 0, 'الإمارات خارج الهدف');
  const t = computeMyTarget([{ market: 'syria', currency: 'TRY', amount: 1200 }], FX, OCT);
  ok(t.turkey.val === 1200 && t.syria === null, 'سوق سوريا بعملة TRY → بطاقة تركيا');
  const x = computeMyTarget([{ market: 'turkey', currency: 'USD', amount: 30 }, { market: 'turkey', currency: 'TRY', amount: 100 }], FX, OCT);
  ok(x.turkey.val === 100 && x.turkey.unconverted === 1, 'USD بسوق تركي لا يُجمع على أنه ليرة');
}
// 11) حالات حدّية
ok(computeMyTarget([], FX, OCT).syria.val === 0, 'لا طلبات: بطاقة سوريا 0');
ok(computeMyTarget(null, FX, OCT).syria.val === 0, 'orders=null آمن');
near(computeMyTarget([{ market: 'syria', currency: 'USD', amount: '12.5' }, { market: 'syria', currency: 'USD', amount: null }], FX, OCT).syria.val, 12.5, 'مبلغ نصّي/فارغ');
{
  const c = computeMyTarget([{ market: 'syria', currency: 'SYP', amount: null }], FX, OCT);
  ok(c.syria.unconverted === 1, 'طلب مسلَّم بمبلغ فارغ (مثل SL-4434) = غير محوَّل لا صفر مؤكَّد');
}
// 12) التقريب: لا تقريب وسيط؛ النسبة مرة واحدة وسقف 100
near(computeMyTarget(Array.from({ length: 3 }, () => ({ market: 'syria', currency: 'SYP', amount: 1 })), FX, OCT).syria.val, 3 / 140, 'لا تقريب بين الطلبات', 1e-12);
ok(progressPct(499, 1000) === 50 && progressPct(494, 1000) === 49 && progressPct(1500, 1000) === 100 && progressPct(10, 0) === 0, 'النسبة: تقريب وسقف وصفر هدف');
ok(progressPct(999.4, 1000) === 100 && progressPct(994.9, 1000) === 99, 'حدّ التقريب 99.5% → 100 (سلوك قديم محفوظ)');
// 13) شهر اليوم الافتراضي (إسطنبول): بلا opts يستعمل الآن — لا يرمي
ok(computeMyTarget([{ market: 'syria', currency: 'USD', amount: 5 }], FX).syria.val === 5, 'الشهر الافتراضي يعمل');

console.log(`\nنتيجة: ${pass}/${pass + fail}`);
process.exit(fail === 0 ? 0 : 1);
