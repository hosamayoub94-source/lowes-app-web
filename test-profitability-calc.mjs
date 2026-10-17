// اختبار منطق الربحية الشهرية — node test-profitability-calc.mjs
// الأرقام المتوقعة محسوبة يدوياً، ويُقارَن المحرك أيضاً بنموذج مرجعي بسيط ومستقل على 300 سيناريو عشوائي.
import { computeMonthly, normName, monthBounds, pickVersion, buildVersionIndex, hasActualExpense } from './src/utils/profitabilityCalc.js';

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
// شامبو: 10$ تكلفة 4$ حتى أيلول؛ من تشرين الأول: 12$ و5$. سيروم أ: 20$/8$ مع تقدير إعلان 1$ وشحن 2$ للوحدة.
const history = [
  { item_name: 'شامبو الروزماري', effective_from: '2026-06-01', sale_price_usd: 10, cost_usd: 4, ad_cost_usd: 0, shipping_cost_usd: 0 },
  { item_name: 'شامبو الروزماري', effective_from: '2026-10-01', sale_price_usd: 12, cost_usd: 5, ad_cost_usd: 0, shipping_cost_usd: 0 },
  { item_name: 'سيروم أ', effective_from: '2026-06-01', sale_price_usd: 20, cost_usd: 8, ad_cost_usd: 1, shipping_cost_usd: 2 },
  { item_name: 'فيتامين سترونغ', effective_from: '2026-06-01', sale_price_usd: 0, cost_usd: 0, ad_cost_usd: 0, shipping_cost_usd: 0 },
];
const base = { nameMapRows: nameMap, historyRows: history, brand: 'lowes' };
let oid = 0;
const O = (status, market, date, items, extra = {}) => ({ id: `o${++oid}`, status, market, order_date: date, items, amount: 100, currency: 'USD', ...extra });
const E = (market, category, amount) => ({ month: '2026-09-01', market, category, amount_usd: amount });

// ── شهر فيه الأسواق الثلاثة: سيروم أ بسعر 20/8، إعلان 1، شحن 2 — وحدة واحدة لكل سوق
const threeMarkets = [
  O('delivered', 'syria', '2026-09-05T10:00:00+03:00', [{ name: 'Serum A', qty: 1 }]),
  O('delivered', 'turkey', '2026-09-06T10:00:00+03:00', [{ name: 'Serum A', qty: 1 }]),
  O('delivered', 'uae', '2026-09-07T10:00:00+03:00', [{ name: 'Serum A', qty: 1 }]),
];
const run = (expenses, orders = threeMarkets) => computeMonthly({ ...base, orders, expenses, month: '2026-09' });
// تقدير الوحدة: ربح = 20 − 8 − 1 − 2 = 9 ؛ بلا تقدير إعلان = 10 ؛ بلا إعلان ولا شحن = 12
const adOn = (r, m) => r.marketSummary[m].estAds, shipOn = (r, m) => r.marketSummary[m].estShipping;
const noExp = run([]);
for (const m of ['syria', 'turkey', 'uae']) { eq(adOn(noExp, m), 1, `بلا مصاريف: تقدير إعلان ${m}`); eq(shipOn(noExp, m), 2, `بلا مصاريف: تقدير شحن ${m}`); eq(noExp.marketSummary[m].netProfit, 9, `بلا مصاريف: صافي ${m}`); }

// 1) إعلان سوريا لا يلغي تركيا والإمارات
let r = run([E('syria', 'حملات إعلانية', 5)]);
eq(adOn(r, 'syria'), 0, '1: سوريا مُلغى'); eq(adOn(r, 'turkey'), 1, '1: تركيا باقٍ'); eq(adOn(r, 'uae'), 1, '1: الإمارات باقٍ');
eq(r.marketSummary.syria.netProfit, 10 - 5, '1: صافي سوريا بعد المصروف الفعلي'); eq(shipOn(r, 'syria'), 2, '1: شحن سوريا لم يتأثر');
// 2) إعلان تركيا
r = run([E('turkey', 'حملات إعلانية', 5)]);
eq(adOn(r, 'turkey'), 0, '2: تركيا مُلغى'); eq(adOn(r, 'syria'), 1, '2: سوريا باقٍ'); eq(adOn(r, 'uae'), 1, '2: الإمارات باقٍ');
// 3) إعلان الإمارات
r = run([E('uae', 'حملات إعلانية', 5)]);
eq(adOn(r, 'uae'), 0, '3: الإمارات مُلغى'); eq(adOn(r, 'syria'), 1, '3: سوريا باقٍ'); eq(adOn(r, 'turkey'), 1, '3: تركيا باقٍ');
// 4) سوشل ميديا لسوق واحد
r = run([E('turkey', 'سوشل ميديا', 3)]);
eq(adOn(r, 'turkey'), 0, '4: سوشل ميديا يلغي تركيا'); eq(adOn(r, 'syria'), 1, '4: سوريا باقٍ'); eq(adOn(r, 'uae'), 1, '4: الإمارات باقٍ');
// 5) حملات إعلانية — نفس السلوك (اختبار بسوق مختلف)
r = run([E('uae', 'حملات إعلانية', 3)]);
eq(adOn(r, 'uae'), 0, '5: حملات تلغي الإمارات'); eq(adOn(r, 'turkey'), 1, '5: تركيا باقٍ');
// 5ب) التصنيفان معاً بسوق واحد لا يمتدان لغيره
r = run([E('syria', 'حملات إعلانية', 2), E('syria', 'سوشل ميديا', 2)]);
eq(adOn(r, 'syria'), 0, '5ب: سوريا مُلغى'); eq(adOn(r, 'turkey'), 1, '5ب: تركيا باقٍ'); eq(adOn(r, 'uae'), 1, '5ب: الإمارات باقٍ');
// 6) all يلغي الأسواق الثلاثة؛ والمصروف المشترك لا يُوزَّع
r = run([E('all', 'حملات إعلانية', 6)]);
for (const m of ['syria', 'turkey', 'uae']) eq(adOn(r, m), 0, `6: all يلغي ${m}`);
eq(r.sharedExpenses, 6, '6: المشترك 6 مرة واحدة'); eq(r.company.netProfit, 30 - 6, '6: صافي الشركة = 3×10 − 6');
// مصروف مشترك لا يخص الإعلانات لا يلغي شيئاً
r = run([E('all', 'رواتب', 6), E('syria', 'تغليف + أجور التغليف', 4)]);
for (const m of ['syria', 'turkey', 'uae']) { eq(adOn(r, m), 1, `رواتب/تغليف لا يلغي إعلان ${m}`); eq(shipOn(r, m), 2, `رواتب/تغليف لا يلغي شحن ${m}`); }
// مصروف بقيمة صفر لا يلغي
r = run([E('syria', 'حملات إعلانية', 0)]);
eq(adOn(r, 'syria'), 1, 'مصروف إعلان بقيمة 0 لا يلغي التقدير');
// 7) شحن تركيا لا يلغي سوريا والإمارات
r = run([E('turkey', 'أجور الشحن', 4)]);
eq(shipOn(r, 'turkey'), 0, '7: تركيا مُلغى'); eq(shipOn(r, 'syria'), 2, '7: سوريا باقٍ'); eq(shipOn(r, 'uae'), 2, '7: الإمارات باقٍ'); eq(adOn(r, 'turkey'), 1, '7: إعلان تركيا لم يتأثر بالشحن');
// 8) شحن سوريا
r = run([E('syria', 'أجور الشحن', 4)]);
eq(shipOn(r, 'syria'), 0, '8: سوريا مُلغى'); eq(shipOn(r, 'turkey'), 2, '8: تركيا باقٍ'); eq(shipOn(r, 'uae'), 2, '8: الإمارات باقٍ');
// 9) شحن مشترك all
r = run([E('all', 'أجور الشحن', 9)]);
for (const m of ['syria', 'turkey', 'uae']) eq(shipOn(r, m), 0, `9: all يلغي شحن ${m}`);
eq(r.company.netProfit, 3 * 11 - 9, '9: صافي الشركة بعد شحن مشترك (ربح الوحدة 20−8−1 = 11)');
// 10) تعديل/حذف المصروف يعيد التقدير
eq(adOn(run([E('syria', 'حملات إعلانية', 5)]), 'syria'), 0, '10: قبل الحذف مُلغى');
eq(adOn(run([]), 'syria'), 1, '10: بعد الحذف يعود التقدير');
eq(adOn(run([E('syria', 'رواتب', 5)]), 'syria'), 1, '10: تعديل التصنيف من إعلان إلى رواتب يعيد التقدير');
eq(adOn(run([E('turkey', 'حملات إعلانية', 5)]), 'syria'), 1, '10: نقل المصروف إلى تركيا يعيد تقدير سوريا');
eq(adOn(run([E('syria', 'حملات إعلانية', 0)]), 'syria'), 1, '10: تعديل القيمة إلى 0 يعيد التقدير');
eq(adOn(run([{ month: '2026-10-01', market: 'all', category: 'حملات إعلانية', amount_usd: 9 }]), 'syria'), 1, 'مصروف إعلان تشرين الأول لا يلغي تقدير أيلول');
ok(hasActualExpense([E('all', 'سوشل ميديا', 1)], ['حملات إعلانية', 'سوشل ميديا'], 'uae'), 'hasActualExpense: all × سوشل ميديا');

// 11) تغيّر سعر/تكلفة تشرين الأول لا يغيّر أيلول
const priced = [
  O('delivered', 'turkey', '2026-09-05T10:00:00+03:00', [{ name: 'ROSEMARY SHAMPOO', qty: 2 }]),
  O('delivered', 'turkey', '2026-10-05T10:00:00+03:00', [{ name: 'ROSEMARY SHAMPOO', qty: 2 }]),
];
const sep = computeMonthly({ ...base, orders: priced, expenses: [], month: '2026-09' });
const oct = computeMonthly({ ...base, orders: priced, expenses: [], month: '2026-10' });
eq(sep.marketSummary.turkey.revenue, 20, '11: أيلول 2×10'); eq(sep.marketSummary.turkey.productCost, 8, '11: أيلول تكلفة 2×4');
eq(oct.marketSummary.turkey.revenue, 24, '11: تشرين الأول 2×12'); eq(oct.marketSummary.turkey.productCost, 10, '11: تشرين الأول تكلفة 2×5');
const sepAfter = computeMonthly({ ...base, historyRows: [...history, { item_name: 'شامبو الروزماري', effective_from: '2026-11-01', sale_price_usd: 99, cost_usd: 50, ad_cost_usd: 0, shipping_cost_usd: 0 }], orders: priced, expenses: [], month: '2026-09' });
eq(sepAfter.marketSummary.turkey.revenue, 20, '11: نسخة تشرين الثاني لا تغيّر أيلول');
// تاريخ مجهول يبقى ناقصاً: شهر قبل أول نسخة
const early = computeMonthly({ ...base, orders: [O('delivered', 'turkey', '2026-05-05T10:00:00+03:00', [{ name: 'ROSEMARY SHAMPOO', qty: 3 }])], expenses: [], month: '2026-05' });
eq(early.marketSummary.turkey.revenue, 0, 'أيار قبل أول نسخة: لا إيراد مُخترَع'); eq(early.marketSummary.turkey.unpricedUnits, 3, 'أيار: القطع تُعدّ ناقصة'); ok(early.marketSummary.turkey.quality.status === 'partial', 'أيار: الحالة جزئي');
// أصناف بلا تاريخ تأخذ شهر آخر تحديث لا بداية الزمن
const idx = buildVersionIndex([], [{ item_name: 'X', sale_price_usd: 3, cost_usd: 1, updated_at: '2026-08-17T10:00:00Z' }]);
ok(pickVersion(idx, 'x', '2026-07-01') === null, 'قبل شهر التحديث: لا نسخة'); eq(pickVersion(idx, 'x', '2026-08-01').sale_price_usd, 3, 'شهر التحديث وما بعده: القيمة');
const idx2 = buildVersionIndex(history);
eq(pickVersion(idx2, normName('شامبو الروزماري'), '2031-01-01').sale_price_usd, 12, 'الأشهر اللاحقة تتبع آخر نسخة');
// 12) إعادة الحفظ لنفس الشهر لا تُكرّر السجل — الاختبار الفعلي بقاعدة البيانات: supabase/tests/profitability_history_test.sql
const dupMonth = [...history, { ...history[1] }];
eq(computeMonthly({ ...base, historyRows: dupMonth, orders: priced, expenses: [], month: '2026-10' }).marketSummary.turkey.revenue, 24, '12: صفّ شهري مكرّر لا يغيّر الحساب');

// 13) المعلّق والملغي والمحذوف وقيد الشحن لا تُحسب مبيعات
const noise = [
  O('delivered', 'turkey', '2026-09-05T10:00:00+03:00', [{ name: 'Serum A', qty: 1 }]),
  ...['pending', 'waiting', 'preparing', 'shipped', 'on_way', 'cancelled', 'prepaid', 'motor'].map((s) => O(s, 'turkey', '2026-09-06T10:00:00+03:00', [{ name: 'Serum A', qty: 7 }])),
  O('delivered', 'turkey', '2026-09-07T10:00:00+03:00', [{ name: 'Serum A', qty: 5 }], { deleted_at: '2026-09-08' }),
];
r = run([], noise);
eq(r.marketSummary.turkey.units, 1, '13: وحدة مباعة واحدة فقط'); eq(r.marketSummary.turkey.orders, 1, '13: طلب مسلَّم واحد'); eq(r.marketSummary.turkey.returns, 0, '13: لا مرتجعات');
// 14) settled ليس بيع منتجات
const settled = [O('settled', 'syria', '2026-09-09T10:00:00+03:00', [{ name: 'Serum A', qty: 4 }], { amount: 1250, currency: 'SYP' }), ...threeMarkets.slice(0, 1)];
r = run([], settled);
eq(r.marketSummary.syria.units, 1, '14: settled لا يزيد القطع'); eq(r.marketSummary.syria.revenue, 20, '14: settled لا يزيد الإيراد');
eq(r.marketSummary.syria.settledOrders, 1, '14: يظهر كتسوية للمراجعة'); eq(r.marketSummary.syria.settledCollected.SYP, 1250, '14: المحصَّل بعملته');
ok(r.marketSummary.syria.quality.issues.some((i) => i.code === 'settled_review'), '14: تحذير مراجعة التسوية'); ok(r.marketSummary.syria.quality.status !== 'final', '14: ليس نهائياً');
// 15) المرتجعات منفصلة، بلا تضخيم ولا حذف مزدوج للمبيعات
const rets = [
  O('delivered', 'turkey', '2026-09-05T10:00:00+03:00', [{ name: 'Serum A', qty: 2 }]),
  O('returned', 'turkey', '2026-09-06T10:00:00+03:00', [{ name: 'Serum A', qty: 3 }]),
  O('returning', 'turkey', '2026-09-07T10:00:00+03:00', [{ name: 'Serum A', qty: 1 }]),
  O('not_received', 'turkey', '2026-09-08T10:00:00+03:00', [{ name: 'Serum A', qty: 1 }]),
];
r = run([], rets);
const t = r.marketSummary.turkey;
eq(t.units, 2, '15: المبيعات لا تتضمن المرتجع'); eq(t.returns, 5, '15: المرتجعات منفصلة'); eq(t.revenue, 40, '15: الإيراد من المسلَّم فقط (لم يُخصم مرتجع منه)');
eq(t.returnLoss, 5 * 8, '15: خسارة المرتجع = تكلفة 5 قطع'); eq(t.returnedOrders, 3, '15: 3 طلبات مرتجعة');
eq(t.netProfit, 40 - 16 - 40 - 2 * 1 - (2 + 5) * 2, '15: الصافي = إيراد − تكلفة − مرتجع − إعلان − شحن (يشمل المرتجع)');
const sh = { [rets[1].id]: [{ to_status: 'shipped' }, { to_status: 'returned' }], [rets[2].id]: [{ to_status: 'delivered' }, { to_status: 'returning' }] };
r = computeMonthly({ ...base, orders: rets, expenses: [], month: '2026-09', statusHistory: sh });
eq(r.marketSummary.turkey.returnsNoHistory.orders, 1, '15: مرتجع بلا سجل حالات مُبلَّغ'); eq(r.marketSummary.turkey.returnsAfterDelivery.orders, 1, '15: مرتجع بعد تسليم مُبلَّغ');
ok(r.marketSummary.turkey.quality.issues.some((i) => i.code === 'returns_no_history') && r.marketSummary.turkey.quality.issues.some((i) => i.code === 'returns_after_delivery'), '15: التحذيران بقائمة الجودة');
// 16) مسلَّم بلا أصناف = تحذير وحالة جزئي
r = run([], [O('delivered', 'uae', '2026-09-09T10:00:00+03:00', []), O('delivered', 'uae', '2026-09-10T10:00:00+03:00', null)]);
eq(r.marketSummary.uae.ordersNoItems, 2, '16: طلبان بلا أصناف'); ok(r.marketSummary.uae.quality.status === 'partial', '16: الحالة جزئي'); ok(r.marketSummary.uae.quality.issues.some((i) => i.code === 'no_items'), '16: التحذير ظاهر');
eq(r.marketSummary.uae.units, 0, '16: لا قطع مُخترَعة');
// 17) صنف بلا تكلفة (أو بلا سعر) ليس تكلفته صفر
const holes = [{ item_name: 'نصف مسعّر', effective_from: '2026-06-01', sale_price_usd: 10, cost_usd: 0 }, { item_name: 'بلا سعر', effective_from: '2026-06-01', sale_price_usd: 0, cost_usd: 4 }];
r = computeMonthly({ nameMapRows: [], historyRows: holes, brand: 'lowes', expenses: [], month: '2026-09', orders: [O('delivered', 'syria', '2026-09-05T10:00:00+03:00', [{ name: 'نصف مسعّر', qty: 3 }, { name: 'بلا سعر', qty: 2 }])] });
eq(r.marketSummary.syria.revenue, 0, '17: لا إيراد لصنف بلا تكلفة'); eq(r.marketSummary.syria.productCost, 0, '17: لا تكلفة صفرية مُحتسبة'); eq(r.marketSummary.syria.netProfit, 0, '17: لا ربح مُضخَّم');
eq(r.marketSummary.syria.unpricedUnits, 5, '17: 5 قطع ناقصة'); ok(r.marketSummary.syria.quality.status === 'partial', '17: الحالة جزئي'); ok(r.products.every((p) => p.flag === 'unset' && p.unitProfit === null), '17: الصنفان «حدّد» بلا ربح وحدة');
// 18) الأسماء غير الموحّدة تبقى ظاهرة للمراجعة
r = run([], [O('delivered', 'turkey', '2026-09-05T10:00:00+03:00', [{ name: 'DERMA ROLLER (1) mm', qty: 2 }, { name: 'ديرمارولار', qty: 1 }, { name: 'Serum A', qty: 1 }])]);
eq(r.unmapped.length, 2, '18: اسمان غير موحّدين'); ok(r.unmapped.map((u) => u.name).includes('DERMA ROLLER (1) mm') && r.unmapped.map((u) => u.name).includes('ديرمارولار'), '18: الأسماء الخام محفوظة');
eq(r.marketSummary.turkey.unmappedUnits, 3, '18: 3 قطع بأسماء غير موحّدة'); ok(r.marketSummary.turkey.quality.issues.some((i) => i.code === 'unmapped'), '18: تحذير غير موحّد');
ok(!r.products.some((p) => p.name === 'DERMA ROLLER (1) mm' && p.hasEcon), '18: لا دمج تلقائي مع ديرما رول 1mm');
// 19) المصاريف المشتركة لا تتكرر بإجمالي الشركة
r = run([E('all', 'رواتب', 6), E('turkey', 'رواتب', 3), E('syria', 'تغليف + أجور التغليف', 2)]);
eq(r.sharedExpenses, 6, '19: المشترك 6'); eq(r.company.expenses, 6 + 3 + 2, '19: إجمالي المصاريف = مشترك + سوقية (بلا تكرار)');
eq(r.company.marketExpenses, 5, '19: مصاريف الأسواق 5'); eq(r.marketSummary.uae.expenses, 0, '19: الإمارات لا تحمل حصة من المشترك');
// 20) الشركة = مجموع الأسواق − المشترك (بالدولار فقط، بلا جمع عملات الأصل)
const sumNet = ['syria', 'turkey', 'uae'].reduce((s, m) => s + r.marketSummary[m].netProfit, 0);
eq(r.company.netProfit, sumNet - r.sharedExpenses, '20: صافي الشركة = Σ الأسواق − المشترك');
const mixed = [O('delivered', 'syria', '2026-09-05T10:00:00+03:00', [{ name: 'Serum A', qty: 1 }], { amount: 1925, currency: 'SYP' }), O('delivered', 'turkey', '2026-09-05T10:00:00+03:00', [{ name: 'Serum A', qty: 1 }], { amount: 1400, currency: 'TRY' }), O('delivered', 'uae', '2026-09-05T10:00:00+03:00', [{ name: 'Serum A', qty: 1 }], { amount: 113, currency: 'AED' })];
r = run([], mixed);
ok(r.marketSummary.syria.collected.SYP === 1925 && r.marketSummary.turkey.collected.TRY === 1400 && r.marketSummary.uae.collected.AED === 113, '20: المحصَّل بعملة كل سوق');
ok(!('collected' in r.company), '20: لا رقم تحصيل مجمَّع للشركة عبر عملات مختلفة');
eq(r.company.revenue, 60, '20: الإيراد المحسوب بالدولار فقط (3×20)');

// ── جودة الصافي: نهائي/تقديري/جزئي
const cleanAll = run([E('all', 'حملات إعلانية', 1), E('all', 'أجور الشحن', 1)]);
ok(cleanAll.marketSummary.turkey.quality.status === 'final', 'جودة: بلا نواقص ولا تقديرات = نهائي');
ok(noExp.marketSummary.turkey.quality.status === 'estimated', 'جودة: تقدير إعلان/شحن = تقديري');
ok(noExp.company.quality.status === 'estimated', 'جودة الشركة تقديري');
r = run([E('all', 'حملات إعلانية', 1), E('all', 'أجور الشحن', 1)], [...threeMarkets, O('delivered', 'syria', '2026-09-09T10:00:00+03:00', [])]);
ok(r.company.quality.status === 'partial', 'جودة الشركة جزئي إذا أي سوق ناقص');

// ── حدود الشهر
r = computeMonthly({ ...base, expenses: [], month: '2026-09', orders: [
  O('delivered', 'turkey', '2026-08-31T23:30:00+03:00', [{ name: 'Serum A', qty: 50 }]),
  O('delivered', 'turkey', '2026-10-01T00:00:00+03:00', [{ name: 'Serum A', qty: 50 }]),
  O('delivered', 'turkey', '2026-09-01T00:00:00+03:00', [{ name: 'Serum A', qty: 1 }]),
  O('delivered', 'turkey', '2026-09-30T23:59:59+03:00', [{ name: 'Serum A', qty: 1 }]),
] });
eq(r.marketSummary.turkey.units, 2, 'الحدود: أول وآخر لحظة بأيلول فقط');
const b = monthBounds('2026-12');
ok(b.from === '2026-12-01T00:00:00+03:00' && b.to === '2027-01-01T00:00:00+03:00', 'حدود ديسمبر');
r = run([], [O('delivered', 'turkey', '2026-09-05T10:00:00+03:00', [{ name: 'Old Strong', qty: 5 }, { name: 'Strong Vit', qty: 4 }, { name: 'Serum A', qty: 1 }])]);
eq(r.marketSummary.turkey.units, 1, 'براند: المجمَّد وسترونغ خارج عرض lowes');
eq(computeMonthly({ ...base, orders: [], expenses: [], month: '2026-11' }).company.netProfit, 0, 'شهر فارغ = 0');
eq(computeMonthly({ ...base, orders: [], expenses: [{ month: '2026-11-01', market: 'all', category: 'رواتب', amount_usd: 100 }], month: '2026-11' }).company.netProfit, -100, 'مصاريف بلا مبيعات = خسارة');

// ── نموذج مرجعي مستقل (حلقات بسيطة) مقابل المحرك على سيناريوهات عشوائية
let seed = 12345; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const pick = (a) => a[Math.floor(rnd() * a.length)];
const prod = { 'سيروم أ': { alias: 'Serum A', price: 20, cost: 8, ad: 1, ship: 2 }, 'شامبو الروزماري': { alias: 'ROSEMARY SHAMPOO', price: 10, cost: 4, ad: 0.5, ship: 1 }, 'ناقص': { alias: 'ناقص', price: 0, cost: 0, ad: 0, ship: 0 } };
const mkts = ['syria', 'turkey', 'uae'], statuses = ['delivered', 'delivered', 'delivered', 'returned', 'not_received', 'pending', 'cancelled', 'settled', 'shipped'];
const cats = ['حملات إعلانية', 'سوشل ميديا', 'أجور الشحن', 'رواتب', 'تغليف + أجور التغليف', 'ضرائب الربح'];
function refCalc(orders, expenses) {
  const out = {}; let shared = 0;
  for (const m of mkts) {
    let rev = 0, cost = 0, loss = 0, ad = 0, ship = 0;
    const adActual = expenses.some((e) => (e.category === 'حملات إعلانية' || e.category === 'سوشل ميديا') && e.amount_usd > 0 && (e.market === 'all' || e.market === m));
    const shActual = expenses.some((e) => e.category === 'أجور الشحن' && e.amount_usd > 0 && (e.market === 'all' || e.market === m));
    for (const o of orders) {
      if (o.market !== m) continue;
      for (const it of o.items) {
        const p = Object.values(prod).find((x) => x.alias === it.name);
        if (!(p.price > 0 && p.cost > 0)) continue;
        if (o.status === 'delivered') { rev += p.price * it.qty; cost += p.cost * it.qty; if (!adActual) ad += p.ad * it.qty; if (!shActual) ship += p.ship * it.qty; }
        else if (o.status === 'returned' || o.status === 'not_received') { loss += p.cost * it.qty; if (!shActual) ship += p.ship * it.qty; }
      }
    }
    let ex = 0; for (const e of expenses) if (e.market === m) ex += e.amount_usd;
    out[m] = rev - cost - loss - ad - ship - ex;
  }
  for (const e of expenses) if (e.market === 'all') shared += e.amount_usd;
  out.company = mkts.reduce((s, m) => s + out[m], 0) - shared;
  return out;
}
let mismatches = 0;
for (let i = 0; i < 300; i++) {
  const orders = Array.from({ length: Math.floor(rnd() * 25) }, () => O(pick(statuses), pick(mkts), '2026-09-10T10:00:00+03:00', Array.from({ length: 1 + Math.floor(rnd() * 3) }, () => ({ name: pick(Object.values(prod)).alias, qty: 1 + Math.floor(rnd() * 4) }))));
  const expenses = Array.from({ length: Math.floor(rnd() * 5) }, () => ({ month: '2026-09-01', market: pick([...mkts, 'all']), category: pick(cats), amount_usd: pick([0, 1, 2.5, 7]) }));
  const hist = [{ item_name: 'سيروم أ', effective_from: '2026-06-01', sale_price_usd: 20, cost_usd: 8, ad_cost_usd: 1, shipping_cost_usd: 2 }, { item_name: 'شامبو الروزماري', effective_from: '2026-06-01', sale_price_usd: 10, cost_usd: 4, ad_cost_usd: 0.5, shipping_cost_usd: 1 }];
  const got = computeMonthly({ nameMapRows: nameMap, historyRows: hist, orders, expenses, month: '2026-09', brand: 'lowes' });
  const exp = refCalc(orders, expenses);
  for (const m of mkts) if (Math.abs(got.marketSummary[m].netProfit - exp[m]) > 1e-9) mismatches++;
  if (Math.abs(got.company.netProfit - exp.company) > 1e-9) mismatches++;
}
eq(mismatches, 0, 'نموذج مرجعي: 300 سيناريو عشوائي بلا أي اختلاف');

console.log(`\n${pass} نجح · ${fail} فشل`);
process.exit(fail ? 1 : 0);
