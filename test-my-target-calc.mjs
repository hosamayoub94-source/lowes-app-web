/* global process */
// اختبار بطاقة «هدفي»: التحويل، فشل الأسعار، غياب سعر، تركي/سوري/بلا تحويل. run: node test-my-target-calc.mjs
import { createServer } from 'vite';
import path from 'node:path';
import { computeMyTarget, progressPct, rateOf } from './src/utils/myTargetCalc.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('FAIL', m); } };
const near = (a, b, m, eps = 1e-9) => ok(Math.abs(a - b) <= eps, `${m} (got ${a}, want ${b})`);

// 1) خريطة الأسعار الحقيقية: صفوف الإنتاج (الأحدث أولاً) عبر buildRateToUsd الفعلية — بما فيها الصفوف القديمة المتضاربة
globalThis.__sb = {};
const server = await createServer({
  configFile: false, logLevel: 'silent', appType: 'custom', server: { middlewareMode: true, hmr: false, watch: null },
  resolve: { alias: { '@utils': path.resolve('src/utils'), '@': path.resolve('src') } },
  plugins: [{ name: 'fake-sb', enforce: 'pre',
    resolveId(s) { return s === '@services/supabase' ? '\0sb' : s === '@services/deliveryAccountingService' ? path.resolve('src/services/deliveryAccountingService.js') : null; },
    load(id) { return id === '\0sb' ? 'export const supabase = globalThis.__sb; export const supabaseAnon = globalThis.__sb;' : null; } }],
});
let map;
try {
  const { buildRateToUsd } = await server.ssrLoadModule('/src/modules/payroll/services/payrollEngine.js');
  const prodRowsNewestFirst = [
    { from_cur: 'USD', to_cur: 'AED', rate: 3.6725 }, // 28/10
    { from_cur: 'USD', to_cur: 'TRY', rate: 50 }, { from_cur: 'USD', to_cur: 'SYP', rate: 140 }, // 26/10
    { from_cur: 'SYP', to_cur: 'USD', rate: 0.007 }, // 21/6 قديم (≈142.9)
    { from_cur: 'TRY', to_cur: 'USD', rate: 0.0308 }, // 20/5 قديم
  ];
  map = buildRateToUsd(prodRowsNewestFirst);
  near(map.SYP, 1 / 140, 'SYP = 1/140 (الأحدث USD→SYP يغلب السطر المباشر القديم 0.007)');
  near(map.TRY, 1 / 50, 'TRY = 1/50 (يغلب 0.0308 القديم)');
  near(map.AED, 1 / 3.6725, 'AED');
  // نظام الوحدات القديم (13000) لا يتسرّب لو كان أقدم
  const withOld = buildRateToUsd([...prodRowsNewestFirst, { from_cur: 'USD', to_cur: 'SYP', rate: 13000 }, { from_cur: 'SYP', to_cur: 'USD', rate: 0.000077 }]);
  near(withOld.SYP, 1 / 140, 'صفوف الليرة السورية القديمة (13000) لا تؤثر ما دام الأحدث 140');
} finally { await server.close(); }

// 2) سوري: SYP يتحوّل بـ140 + USD كما هو
const syriaOrders = [
  { market: 'syria', currency: 'SYP', amount: 2800 }, // = 20$
  { market: 'syria', currency: 'USD', amount: 18 },
  { market: 'syria', currency: 'SYP', amount: 0 },
];
{
  const r = computeMyTarget(syriaOrders, map);
  near(r.syria.val, 38, 'سوري: 2800/140 + 18 = 38$');
  ok(r.syria.unconverted === 0 && r.turkey === null, 'سوري: لا غير-محوَّل ولا بطاقة تركية');
}
// 3) تركي: بالليرة كما هي، ولا يحتاج أسعاراً حتى لو فشل التحميل
{
  const o = [{ market: 'turkey', currency: 'TRY', amount: 1400 }, { market: 'turkey', currency: 'TRY', amount: 700.5 }];
  const a = computeMyTarget(o, map), b = computeMyTarget(o, null);
  near(a.turkey.val, 2100.5, 'تركي: مجموع الليرة'); ok(a.syria === null, 'تركي: لا بطاقة سورية');
  ok(b.turkey.val === 2100.5 && b.turkey.unconverted === 0, 'تركي: فشل الأسعار لا يؤثر');
}
// 4) عملة لا تحتاج تحويلاً (USD فقط): تعمل دون أسعار
{
  const r = computeMyTarget([{ market: 'syria', currency: 'USD', amount: 50 }], null);
  ok(r.syria.val === 50 && r.syria.unconverted === 0, 'USD فقط + فشل الأسعار = رقم نهائي بلا تحذير');
}
// 5) فشل تحميل الأسعار (null): SYP لا يُقدَّر — يُعدّ غير محوَّل، والقيمة لا تحتوي تقديراً
{
  const r = computeMyTarget(syriaOrders, null);
  near(r.syria.val, 18, 'فشل الأسعار: يُحسب USD فقط (18$) بلا تخمين لـSYP');
  ok(r.syria.unconverted === 2 && r.syria.currencies.join() === 'SYP', 'فشل الأسعار: طلبان SYP معلنان غير محوَّلين');
}
// 6) سعر غير متوفر لعملة معينة (خريطة بلا SYP، أو سعر صفر/NaN/سالب)
for (const bad of [{ TRY: 0.02 }, { SYP: 0 }, { SYP: NaN }, { SYP: -1 }, { SYP: 'abc' }, {}]) {
  const r = computeMyTarget([{ market: 'syria', currency: 'SYP', amount: 1400 }], bad);
  ok(r.syria.val === 0 && r.syria.unconverted === 1, 'سعر غير صالح ' + JSON.stringify(bad) + ' = غير محوَّل لا 0$ مؤكدة');
}
// 7) عملة غريبة بلا سعر؛ طلب بلا عملة = SYP تاريخياً ويحتاج سعر SYP
{
  const r = computeMyTarget([{ market: 'syria', currency: 'EUR', amount: 10 }, { market: 'syria', currency: '', amount: 1400 }], map);
  near(r.syria.val, 10, 'بلا عملة تُعامل SYP (1400/140 = 10$)'); ok(r.syria.unconverted === 1 && r.syria.currencies.join() === 'EUR', 'EUR بلا سعر = معلَن');
}
// 8) إماراتي خارج الهدف؛ طلب سوري بعملة TRY يذهب للبطاقة التركية (السلوك التاريخي)؛ عملة غير TRY بسوق تركي لا تُجمع كليرة
{
  const r = computeMyTarget([{ market: 'uae', currency: 'AED', amount: 500 }], map);
  ok(r.turkey === null && r.syria.val === 0, 'الإمارات خارج الهدف (تظهر بطاقة سوريا الفارغة كما قبل)');
  const t = computeMyTarget([{ market: 'syria', currency: 'TRY', amount: 1200 }], map);
  ok(t.turkey.val === 1200 && t.syria === null, 'سوق سوريا بعملة TRY → بطاقة تركيا');
  const x = computeMyTarget([{ market: 'turkey', currency: 'USD', amount: 30 }, { market: 'turkey', currency: 'TRY', amount: 100 }], map);
  ok(x.turkey.val === 100 && x.turkey.unconverted === 1, 'USD بسوق تركي لا يُجمع على أنه ليرة');
}
// 9) مبلغ نصّي/فارغ، قوائم فارغة
{
  ok(computeMyTarget([], map).syria.val === 0, 'لا طلبات: بطاقة سوريا 0');
  ok(computeMyTarget(null, map).syria.val === 0, 'orders=null آمن');
  near(computeMyTarget([{ market: 'syria', currency: 'USD', amount: '12.5' }, { market: 'syria', currency: 'USD', amount: null }], map).syria.val, 12.5, 'مبلغ نصّي/فارغ');
}
// 10) التقريب: لا تقريب وسيط؛ النسبة تُقرَّب مرة واحدة وسقف 100
near(computeMyTarget(Array.from({ length: 3 }, () => ({ market: 'syria', currency: 'SYP', amount: 1 })), map).syria.val, 3 / 140, 'لا تقريب بين الطلبات', 1e-12);
ok(progressPct(499, 1000) === 50 && progressPct(494, 1000) === 49 && progressPct(1500, 1000) === 100 && progressPct(10, 0) === 0, 'النسبة: تقريب وسقف وصفر هدف');
ok(progressPct(999.4, 1000) === 100 && progressPct(994.9, 1000) === 99, 'حدّ التقريب 99.5% → 100 (سلوك قديم محفوظ)');
// 11) rateOf
ok(rateOf('usd', null) === 1 && rateOf('SYP', null) === null && rateOf('SYP', { SYP: 0.5 }) === 0.5, 'rateOf');

console.log(`\nنتيجة: ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
