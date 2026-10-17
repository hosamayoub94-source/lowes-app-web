// اختبار منطق الربحية الشهرية — node test-profitability-calc.mjs
// أرقام متوقعة محسوبة يدوياً (لا من الدالة نفسها).
import { computeMonthly, normName, monthBounds, pickVersion, buildVersionIndex } from './src/utils/profitabilityCalc.js';

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) pass++; else { fail++; console.error('❌', msg); } };
const eq = (a, b, msg) => ok(Math.abs(a - b) < 1e-9, `${msg} (متوقع ${b}، كان ${a})`);

const nameMap = [
  { alias_name: 'ROSEMARY SHAMPOO', canonical_name: 'شامبو الروزماري', brand: 'lowes', is_active: true },
  { alias_name: 'شامبو  الروزماري', canonical_name: 'شامبو الروزماري', brand: 'lowes', is_active: true },
  { alias_name: 'شامبو الروزمـاري', canonical_name: 'شامبو الروزماري', brand: 'lowes', is_active: true },
  { alias_name: 'Serum A', canonical_name: 'سيروم أ', brand: 'lowes', is_active: true },
  { alias_name: 'Old Strong', canonical_name: 'ستونغ قديم', brand: 'strong', is_active: false },
  { alias_name: 'Strong Vit', canonical_name: 'فيتامين سترونغ', brand: 'strong', is_active: true },
];

// سعر شامبو: 10$ تكلفة 4$ حتى أيلول؛ من تشرين الأول: سعر 12$ تكلفة 5$.
const history = [
  { item_name: 'شامبو الروزماري', effective_from: '2000-01-01', sale_price_usd: 10, cost_usd: 4, ad_cost_usd: 0, shipping_cost_usd: 0 },
  { item_name: 'شامبو الروزماري', effective_from: '2026-10-01', sale_price_usd: 12, cost_usd: 5, ad_cost_usd: 0, shipping_cost_usd: 0 },
  { item_name: 'سيروم أ', effective_from: '2000-01-01', sale_price_usd: 20, cost_usd: 8, ad_cost_usd: 1, shipping_cost_usd: 2 },
  { item_name: 'فيتامين سترونغ', effective_from: '2000-01-01', sale_price_usd: 0, cost_usd: 0, ad_cost_usd: 0, shipping_cost_usd: 0 },
];

const O = (status, market, date, items, extra = {}) => ({ status, market, order_date: date, items, amount: 100, currency: 'USD', ...extra });
const sept = [
  O('delivered', 'turkey', '2026-09-05T10:00:00+03:00', [{ name: 'ROSEMARY SHAMPOO', qty: 2 }, { name: 'Serum A', qty: 1 }]),
  O('settled',   'syria',  '2026-09-10T10:00:00+03:00', [{ name: 'شامبو الروزماري', qty: 3 }]),
  O('delivered', 'uae',    '2026-09-12T10:00:00+03:00', [{ name: 'شامبو  الروزماري', qty: 1 }]),
  O('returned',  'turkey', '2026-09-15T10:00:00+03:00', [{ name: 'Serum A', qty: 1 }]),
  O('pending',   'turkey', '2026-09-16T10:00:00+03:00', [{ name: 'Serum A', qty: 9 }]),   // لا يُحسب
  O('cancelled', 'syria',  '2026-09-17T10:00:00+03:00', [{ name: 'Serum A', qty: 9 }]),   // لا يُحسب
  O('shipped',   'syria',  '2026-09-18T10:00:00+03:00', [{ name: 'Serum A', qty: 9 }]),   // قيد الشحن: ليس مبيعاً
  O('delivered', 'turkey', '2026-09-19T10:00:00+03:00', [{ name: 'Old Strong', qty: 5 }]), // مجمَّد → مستبعد
  O('delivered', 'turkey', '2026-09-20T10:00:00+03:00', [{ name: 'Strong Vit', qty: 4 }]), // براند آخر
  O('delivered', 'turkey', '2026-09-21T10:00:00+03:00', []),                                // بلا أصناف
  O('delivered', 'turkey', '2026-09-22T10:00:00+03:00', [{ name: 'منتج غير مخطّط', qty: 2 }]),
  O('delivered', 'turkey', '2026-08-31T23:30:00+03:00', [{ name: 'Serum A', qty: 50 }]),   // آب → خارج الشهر
  O('delivered', 'turkey', '2026-10-01T00:00:00+03:00', [{ name: 'Serum A', qty: 50 }]),   // أول تشرين الأول → خارج
  O('delivered', 'turkey', '2026-09-23T10:00:00+03:00', [{ name: 'Serum A', qty: 1 }], { deleted_at: '2026-09-24' }), // محذوف
];

const expSept = [
  { month: '2026-09-01', market: 'turkey', category: 'رواتب', amount_usd: 7 },
  { month: '2026-09-01', market: 'turkey', category: 'رواتب', amount_usd: 3 },     // صفّان لنفس التصنيف
  { month: '2026-09-01', market: 'all',    category: 'محاسبة + الضرائب الشهرية', amount_usd: 6 },
  { month: '2026-09-01', market: 'syria',  category: 'تغليف + أجور التغليف', amount_usd: 1.5 },
  { month: '2026-10-01', market: 'uae',    category: 'رواتب', amount_usd: 999 },     // شهر آخر → يُتجاهل
];

const base = { nameMapRows: nameMap, historyRows: history, brand: 'lowes' };
const s = computeMonthly({ ...base, orders: sept, expenses: expSept, month: '2026-09' });

// ── وحدات/إيراد: تركيا: شامبو 2 + سيروم 1 + غير مخطّط 2 (بلا اقتصاد)
const tr = s.marketSummary.turkey, sy = s.marketSummary.syria, ae = s.marketSummary.uae;
eq(tr.units, 5, 'تركيا قطع مباعة'); eq(sy.units, 3, 'سوريا قطع'); eq(ae.units, 1, 'الإمارات قطع');
eq(tr.orders, 2, 'تركيا طلبات مسلّمة (طلب الأصناف المجمّدة/بلا أصناف/براند آخر لا يُعدّ)');
eq(tr.returns, 1, 'تركيا مرتجع'); eq(tr.returnedOrders, 1, 'تركيا طلبات مرتجعة');
eq(tr.ordersNoItems, 1, 'طلب بلا أصناف مُبلَّغ');
// إيراد تركيا: 2×10 + 1×20 = 40 ؛ تكلفة: 2×4 + 1×8 = 16 ؛ مرتجع سيروم: 8 ؛ تقدير إعلان 1×1 = 1؛ شحن (1+1)×2 = 4
eq(tr.revenue, 40, 'إيراد تركيا'); eq(tr.productCost, 16, 'تكلفة تركيا'); eq(tr.returnLoss, 8, 'خسارة المرتجع');
eq(tr.estAds, 1, 'إعلان مقدّر'); eq(tr.estShipping, 4, 'شحن مقدّر (يشمل وحدة المرتجع)');
eq(tr.productProfit, 40 - 16 - 8 - 1 - 4, 'ربح أصناف تركيا = 11');
eq(tr.expenses, 10, 'مصاريف تركيا = صفّان لنفس التصنيف'); eq(tr.netProfit, 1, 'صافي تركيا = 11 − 10');
eq(tr.unpricedUnits, 2, 'قطع بلا اقتصاد (غير مخطّط)');
// سوريا: 3×10 = 30 − 12 = 18 − مصاريف 1.5 = 16.5
eq(sy.revenue, 30, 'إيراد سوريا'); eq(sy.netProfit, 16.5, 'صافي سوريا');
// الإمارات: 10 − 4 = 6
eq(ae.netProfit, 6, 'صافي الإمارات');
// الشركة: (1 + 16.5 + 6) − مشترك 6 = 17.5
eq(s.sharedExpenses, 6, 'مصاريف مشتركة'); eq(s.company.netProfit, 17.5, 'صافي الشركة');
eq(s.company.units, 9, 'قطع الشركة'); eq(s.company.expenses, 17.5, 'مصاريف الشركة = 10+1.5+6');
ok(s.unmapped.length === 1 && s.unmapped[0].units === 2, 'الاسم غير المخطّط ظاهر في قائمة غير المخطّطة');
// توحيد الأسماء: ثلاث صيغ للشامبو = صنف واحد لكل سوق
ok(s.products.filter((p) => p.name === 'شامبو الروزماري').length === 3, 'الشامبو صنف واحد لكل سوق (3 أسواق)');
ok(!s.products.some((p) => p.name === 'ستونغ قديم'), 'الصنف المجمَّد مستبعد');
ok(!s.products.some((p) => p.name === 'فيتامين سترونغ'), 'براند سترونغ خارج عرض lowes');

// ── المبيعات المعلّقة/الملغاة/قيد الشحن لا تظهر: وحدات سيروم تركيا المباعة = 1 فقط
eq(s.products.find((p) => p.name === 'سيروم أ' && p.market === 'turkey').units, 1, 'سيروم: المعلّق/الملغي/الشحن/خارج الشهر/المحذوف مستبعدون');

// ── تغيّر السعر لشهر جديد لا يغيّر الشهر السابق
const octOrders = [O('delivered', 'turkey', '2026-10-05T10:00:00+03:00', [{ name: 'ROSEMARY SHAMPOO', qty: 2 }])];
const o = computeMonthly({ ...base, orders: octOrders, expenses: [], month: '2026-10' });
eq(o.marketSummary.turkey.revenue, 24, 'تشرين الأول يستعمل السعر الجديد 12'); eq(o.marketSummary.turkey.productCost, 10, 'تكلفة جديدة 5');
const sAgain = computeMonthly({ ...base, orders: sept, expenses: expSept, month: '2026-09' });
eq(sAgain.marketSummary.turkey.revenue, 40, 'أيلول بعد إضافة نسخة تشرين الأول ما زال 40');
eq(sAgain.company.netProfit, s.company.netProfit, 'صافي أيلول لم يتغيّر');
// طلب الحد الفاصل (1 تشرين الأول 00:00 إسطنبول) ينتمي لتشرين الأول: 50 قطعة سيروم فقط، لا شيء من طلبات أيلول
eq(computeMonthly({ ...base, orders: sept, expenses: [], month: '2026-10' }).company.units, 50, 'تشرين الأول من مصفوفة أيلول = طلب الحد الفاصل فقط');

// ── المصاريف الفعلية تلغي تقدير الإعلان/الشحن (منع العدّ المزدوج)
const withActual = computeMonthly({ ...base, orders: sept, month: '2026-09', expenses: [...expSept, { month: '2026-09-01', market: 'all', category: 'حملات إعلانية', amount_usd: 5 }, { month: '2026-09-01', market: 'turkey', category: 'أجور الشحن', amount_usd: 2 }] });
eq(withActual.marketSummary.turkey.estAds, 0, 'لا تقدير إعلان مع مصروف إعلانات فعلي'); eq(withActual.marketSummary.turkey.estShipping, 0, 'لا تقدير شحن مع مصروف شحن فعلي');
// حساب صريح: أرباح الأصناف = تركيا(40-16-8)=16 + سوريا 18 + إمارات 6 = 40 ؛ مصاريف = 10+1.5+6+5+2 = 24.5 ؛ صافي = 15.5
eq(withActual.company.netProfit, 15.5, 'صافي الشركة مع إعلانات/شحن فعليين');

// ── سلوك النسخ
const idx = buildVersionIndex(history);
eq(pickVersion(idx, normName('شامبو الروزماري'), '2026-09-01').sale_price_usd, 10, 'نسخة أيلول');
eq(pickVersion(idx, normName('شامبو الروزماري'), '2026-10-01').sale_price_usd, 12, 'نسخة تشرين الأول');
eq(pickVersion(idx, normName('شامبو الروزماري'), '2031-01-01').sale_price_usd, 12, 'الأشهر اللاحقة تتبع آخر نسخة');
ok(pickVersion(idx, normName('لا وجود'), '2026-09-01') === null, 'صنف بلا نسخة = null');
// احتياط: صنف بلا تاريخ يُؤخذ من القيمة الحالية كخط أساس
const idx2 = buildVersionIndex([], [{ item_name: 'X', sale_price_usd: 3, cost_usd: 1 }]);
eq(pickVersion(idx2, 'x', '2026-01-01').sale_price_usd, 3, 'احتياط من product_economics');

// ── حدود الشهر وديسمبر
const b = monthBounds('2026-12');
ok(b.from === '2026-12-01T00:00:00+03:00' && b.to === '2027-01-01T00:00:00+03:00', 'حدود ديسمبر');

// ── شهر فارغ لا ينهار
const empty = computeMonthly({ ...base, orders: [], expenses: [], month: '2026-11' });
ok(empty.company.netProfit === 0 && empty.products.length === 0, 'شهر بلا مبيعات = 0');
// ── مصاريف بلا مبيعات = خسارة
const onlyExp = computeMonthly({ ...base, orders: [], expenses: [{ month: '2026-11-01', market: 'all', category: 'رواتب', amount_usd: 100 }], month: '2026-11' });
eq(onlyExp.company.netProfit, -100, 'مصاريف مشتركة بلا مبيعات = −100');

console.log(`\n${pass} نجح · ${fail} فشل`);
process.exit(fail ? 1 : 0);
