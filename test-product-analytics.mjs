// اختبار كشف مبيعات وتكلفة المنتجات حسب السوق — node test-product-analytics.mjs
// أرقام متوقعة محسوبة يدوياً فوق computeMonthly (نفس قواعد الربحية).
import { computeMonthly, snapshotOf, diffSnapshot } from './src/utils/profitabilityCalc.js';
import {
  buildMarketProductReport, buildStatusBreakdown, buildCategoryIndex, buildAliasIndex, filterRows, rankProducts,
  compareMarkets, compareMonths, combineReports, detailedSnapshotOf, exportSheets, dedupeById,
} from './src/utils/productAnalytics.js';

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) pass++; else { fail++; console.error('❌', msg); } };
const eq = (a, b, msg) => ok(Math.abs((a ?? NaN) - b) < 1e-9, `${msg} (متوقع ${b}، كان ${a})`);

const nameMap = [
  { alias_name: 'Rosemary Oil', canonical_name: 'زيت الروزماري', brand: 'lowes', is_active: true },
  { alias_name: 'Serum A', canonical_name: 'سيروم أ', brand: 'lowes', is_active: true },
  { alias_name: 'Mask X', canonical_name: 'ماسك الطين', brand: 'lowes', is_active: true },
];
// زيت الروزماري: تكلفة 4$ منذ حزيران ثم 5$ من تشرين الأول. سيروم: 8$. ماسك: 3$ (بلا مبيعات).
const history = [
  { item_name: 'زيت الروزماري', effective_from: '2026-06-01', sale_price_usd: 10, cost_usd: 4, ad_cost_usd: 0, shipping_cost_usd: 0, source: 'entered' },
  { item_name: 'زيت الروزماري', effective_from: '2026-10-01', sale_price_usd: 10, cost_usd: 5, ad_cost_usd: 0, shipping_cost_usd: 0, source: 'entered' },
  { item_name: 'سيروم أ', effective_from: '2026-06-01', sale_price_usd: 15, cost_usd: 8, ad_cost_usd: 0, shipping_cost_usd: 0, source: 'entered' },
  { item_name: 'ماسك الطين', effective_from: '2026-06-01', sale_price_usd: 9, cost_usd: 3, ad_cost_usd: 0, shipping_cost_usd: 0, source: 'entered' },
];
const fxRates = [
  { month: '2026-09-01', scope: 'all', currency: 'SYP', units_per_usd: 140, entered_at: '2026-09-30T10:00:00Z' },
  { month: '2026-10-01', scope: 'all', currency: 'SYP', units_per_usd: 140, entered_at: '2026-10-30T10:00:00Z' },
  { month: '2026-10-01', scope: 'all', currency: 'TRY', units_per_usd: 50, entered_at: '2026-10-30T10:00:00Z' },
];
const products = [{ name: 'Rosemary Oil', category: 'العناية بالشعر' }, { name: 'Serum A', category: 'العناية بالوجه' }];
let n = 0;
const O = (o) => ({ id: `o${++n}`, order_code: `C${n}`, brand: 'lowes', market: 'syria', status: 'delivered', order_date: '2026-10-03T10:00:00+03:00',
  items: [{ name: 'Rosemary Oil', qty: 1 }], amount: 1400, currency: 'SYP', delivered_at: '2026-10-05T10:00:00+03:00', delivery_basis: 'carrier',
  delivery_bulk_suspect: false, delivered_before_return: false, history_conflict: false, return_at: null, return_bulk_suspect: false, hist_rows: 2,
  reserve_qty: 0, restock_qty: 0, waste_qty: 0, archived: false, ...o });

const A = O({ items: [{ name: 'Rosemary Oil', qty: 2 }], amount: 2800 });                                    // 20$، تكلفة 10
const B = O({ items: [{ name: 'Rosemary Oil', qty: 1 }, { name: 'Serum A', qty: 1 }], amount: 30, currency: 'USD' }); // 15$ + 15$
const C = O({ amount: 0 });                                                                                    // مجاني
const D = O({ amount: null });                                                                                 // بلا قيمة
const H = O({ archived: true });                                                                               // مؤرشف: 10$
const G = O({ status: 'returned', order_date: '2026-09-15T10:00:00+03:00', delivered_at: '2026-09-20T10:00:00+03:00', delivered_before_return: true, return_at: '2026-10-10T10:00:00+03:00' });
const S1 = O({ order_date: '2026-09-02T10:00:00+03:00', delivered_at: '2026-09-04T10:00:00+03:00' });         // بيع أيلول
const T1 = O({ market: 'turkey', items: [{ name: 'Super Viga', qty: 2 }], amount: 1000, currency: 'TRY' });   // 20$ بلا تكلفة
const T2 = O({ market: 'turkey', items: [{ name: 'Serum A', qty: 1 }], amount: 500, currency: 'TRY' });       // 10$، تكلفة 8
const U1 = O({ market: 'uae', items: [{ name: 'Serum A', qty: 1 }], amount: 73.5, currency: 'AED' });         // بلا سعر صرف
const rpcOrders = [A, B, C, D, H, G, S1, T1, T2, U1];
const openOrders = [
  O({ status: 'cancelled', items: [{ name: 'Rosemary Oil', qty: 3 }] }),
  O({ status: 'shipped', items: [{ name: 'Serum A', qty: 2 }] }),
  O({ status: 'cancelled', order_date: '2026-09-28T10:00:00+03:00' }),   // شهر آخر: لا يُحسب بتشرين
];

const run = (month, orders = rpcOrders, extraHistory = []) => computeMonthly({ orders, nameMapRows: nameMap, historyRows: [...history, ...extraHistory], fxRates, month, brand: 'lowes', nowMonth: '2026-10-01' });
const oct = run('2026-10');
const catIdx = buildCategoryIndex(products, nameMap);
const sbOct = buildStatusBreakdown([...rpcOrders, ...openOrders], { nameMapRows: nameMap, month: '2026-10', brand: 'lowes' });
const rep = (r, market, sb = sbOct) => buildMarketProductReport(r, { market, categoryIndex: catIdx, statusBreakdown: sb });
const syr = rep(oct, 'syria');
const row = (report, name) => report.rows.find((x) => x.name === name);

// ════ 1) الكميات وتكلفة الوحدة والتكلفة والمبيعات والربح — سوريا تشرين الأول ════
const ros = row(syr, 'زيت الروزماري');
eq(ros.soldUnits, 6, '1: قطع الروزماري المسلّمة (2+1+1 مجاني+1 بلا قيمة+1 مؤرشف)');
eq(ros.paidUnits, 4, '1: القطع المدفوعة المحوَّلة');
eq(ros.freeUnits, 1, '1: القطع المجانية'); eq(ros.noValueUnits, 1, '1: بلا قيمة');
eq(ros.unitCost, 5, '1: تكلفة الوحدة = نسخة تشرين الأول'); ok(ros.costFrom === '2026-10-01', '1: تاريخ سريان التكلفة');
ok(row(syr, 'ماسك الطين').costFrom === '2026-06-01', '2: تاريخ سريان تكلفة منتج بلا مبيعات');
eq(ros.totalCost, 20, '1: إجمالي التكلفة = 4 قطع مدفوعة × 5');
eq(ros.freeCost, 5, '1: تكلفة المجاني منفصلة');
eq(ros.salesUsd, 45, '1: المبيعات = 20 + 15 + 10');
eq(ros.grossProfit, 25, '1: الربح الإجمالي = 45 − 20');
eq(ros.margin, 56, '1: الهامش %');
eq(ros.returnedUnits, 1, '1: مرتجع مكتمل بشهر الإرجاع'); eq(ros.netUnits, 5, '1: صافي الكمية = 6 − 1');
eq(ros.orders, 5, '1: عدد الطلبات (A,B,C,D,H)'); eq(ros.freeOrders, 1, '1: طلب مجاني واحد');
eq(ros.salesNative.SYP, 4200, '1: قيمة بالليرة السورية (2800+1400)'); eq(ros.salesNative.USD, 15, '1: قيمة بالدولار منفصلة');
ok(ros.category === 'العناية بالشعر', '1: التصنيف من products عبر الاسم الموحّد');
const ser = row(syr, 'سيروم أ');
eq(ser.salesUsd, 15, '1: سيروم سوريا 15$'); eq(ser.grossProfit, 7, '1: ربح سيروم = 15 − 8');

// ════ 2) المنتجات بلا مبيعات تظهر ════
const mask = row(syr, 'ماسك الطين');
ok(!!mask, '2: منتج بلا مبيعات يظهر بالكشف'); eq(mask.soldUnits, 0, '2: كميته صفر'); eq(mask.unitCost, 3, '2: تكلفة وحدته السارية تظهر');
ok(mask.grossProfit === 0, '2: ربح صفر (لا شيء مدفوع)');

// ════ 3) الإجماليات + عدم احتساب الملغى/قيد التوصيل ════
const t = syr.totals;
eq(t.orders, 5, '3: الطلبات المسلّمة'); eq(t.units, 7, '3: القطع المسلّمة');
eq(t.salesUsd, 60, '3: المبيعات'); eq(t.cogs, 28, '3: التكلفة'); eq(t.grossProfit, 32, '3: الربح الإجمالي');
eq(t.freeOrders, 1, '3: طلبات مجانية'); eq(t.noValueOrders, 1, '3: طلبات بلا قيمة (غير المجانية)');
eq(t.statusOrders.cancelled, 1, '3: الملغى يُعدّ منفصلاً (شهر الطلب فقط)'); eq(t.statusOrders.in_transit, 1, '3: قيد التوصيل منفصل');
eq(ros.statusUnits.cancelled, 3, '3: قطع الملغى للروزماري'); eq(ser.statusUnits.in_transit, 2, '3: قطع قيد التوصيل للسيروم');
ok(!Object.keys(t.salesNative).includes('TOTAL') && t.salesNative.SYP === 4200 && t.salesNative.USD === 30, '3: لا جمع لعملات مختلفة (SYP و USD منفصلان)');

// ════ 4) المرتجعات ════
eq(t.returnOrders, 1, '4: مرتجع واحد مكتمل'); eq(t.returnRevenueReduction, 10, '4: تخفيض الإيراد بسعر شهر التسليم (1400/140)');
eq(t.returnEffect, -10, '4: أثر المرتجع المؤكَّد (بلا حركة استرداد موثّقة لا تُسترد التكلفة)');
eq(t.netUnits, 6, '4: صافي قطع السوق = 7 − 1');

// ════ 5) التكلفة التاريخية لا تتغيّر ════
const sep = run('2026-09');
const rosSep = row(rep(sep, 'syria', null), 'زيت الروزماري');
eq(rosSep.unitCost, 4, '5: أيلول بتكلفة أيلول'); eq(rosSep.totalCost, 8, '5: بيعتا أيلول (S1 + G قبل إرجاعه) × 4');
const sepAfterEdit = run('2026-09', rpcOrders, [{ item_name: 'زيت الروزماري', effective_from: '2026-11-01', sale_price_usd: 10, cost_usd: 9, ad_cost_usd: 0, shipping_cost_usd: 0 }]);
eq(row(rep(sepAfterEdit, 'syria', null), 'زيت الروزماري').totalCost, 8, '5: تكلفة جديدة من تشرين الثاني لا تغيّر أيلول');
eq(row(rep(run('2026-10', rpcOrders, [{ item_name: 'زيت الروزماري', effective_from: '2026-11-01', sale_price_usd: 10, cost_usd: 9 }]), 'syria'), 'زيت الروزماري').totalCost, 20, '5: ولا تشرين الأول');

// ════ 6) توزيع الأسواق + تكلفة مفقودة + بلا سعر صرف ════
const tr = rep(oct, 'turkey');
const sv = row(tr, 'Super Viga');
ok(sv && sv.grossProfit === null, '6: صنف بلا تكلفة: ربح غير محسوب (لا صفر)'); ok(sv.unitCost === null, '6: تكلفة الوحدة فارغة لا مخترعة');
eq(tr.totals.revenueWithoutCost, 20, '6: مبيعات بلا تكلفة معروضة منفصلة'); eq(tr.totals.grossProfit, 2, '6: ربح تركيا من الأصناف ذات التكلفة فقط');
ok(tr.totals.quality.some((q) => q.code === 'no_cost'), '6: تنبيه جودة «بلا تكلفة»');
const ua = rep(oct, 'uae');
eq(row(ua, 'سيروم أ').salesUsd, 0, '6: الإمارات بلا سعر صرف: لا دولار مخترع'); eq(ua.totals.salesNativeNoFx.AED, 73.5, '6: القيمة بالدرهم ظاهرة');
ok(ua.totals.quality.some((q) => q.code === 'no_fx'), '6: تنبيه «بلا سعر صرف»');
ok(!row(syr, 'Super Viga'), '6: صنف تركيا لا يظهر بسوريا');
const all = rep(oct, 'all');
const serAll = row(all, 'سيروم أ');
eq(serAll.soldUnits, 3, '6: كل الأسواق: سيروم 1+1+1'); eq(serAll.salesUsd, 25, '6: 15 + 10 + 0'); eq(serAll.totalCost, 16, '6: تكلفة المدفوع المحوَّل فقط'); eq(serAll.grossProfit, 9, '6: ربح كل الأسواق');
eq(all.totals.salesUsd, syr.totals.salesUsd + tr.totals.salesUsd + ua.totals.salesUsd, '6: مجموع الأسواق = كل الأسواق');
const cmp = compareMarkets(oct, { categoryIndex: catIdx, statusBreakdown: sbOct });
eq(cmp.length, 3, '6: مقارنة 3 أسواق'); eq(cmp.find((x) => x.market === 'syria').salesUsd, 60, '6: سطر سوريا بالمقارنة');

// ════ 7) عدم التكرار + المؤرشف مرة واحدة ════
const dup = run('2026-10', dedupeById([...rpcOrders, A, H]));
eq(rep(dup, 'syria').totals.salesUsd, 60, '7: طلب مكرر بالمصدر لا يُحسب مرتين');
eq(row(rep(dup, 'syria'), 'زيت الروزماري').orders, 5, '7: المؤرشف محسوب مرة واحدة');
eq(sbOct.byMarket.syria.cancelled.orders, 1, '7: إزالة تكرار بفئات الحالة');
const sbDup = buildStatusBreakdown([...openOrders, ...openOrders], { nameMapRows: nameMap, month: '2026-10' });
eq(sbDup.byMarket.syria.cancelled.orders, 1, '7: نفس الطلب مرتين بفئة الحالة يُعدّ مرة');

// ════ 8) Drill-down ════
ok(ros.orderRefs.length === 5 && ros.orderRefs.find((r) => r.id === C.id).kind === 'free', '8: مراجع الطلبات مع نوعها');
eq(ros.orderRefs.find((r) => r.id === B.id).usd, 15, '8: إيراد الطلب المخصّص للمنتج');
ok(ros.returnRefs.length === 1 && ros.returnRefs[0].id === G.id, '8: مرجع المرتجع');
ok(!('customer_name' in ros.orderRefs[0]) && !('phone_1' in ros.orderRefs[0]), '8: لا بيانات زبون بالمراجع');

// ════ 9) بحث/تصنيف/ترتيب ════
const ai = buildAliasIndex(nameMap);
ok(filterRows(syr.rows, { q: 'روزماري', aliasIndex: ai }).length === 1, '9: بحث عربي «روزماري»');
ok(filterRows(syr.rows, { q: 'rosemary', aliasIndex: ai })[0]?.name === 'زيت الروزماري', '9: بحث بالاسم البديل');
ok(filterRows(syr.rows, { category: 'العناية بالوجه' }).every((r) => r.category === 'العناية بالوجه'), '9: فلتر التصنيف');
ok(filterRows(syr.rows, { onlyWithSales: true }).every((r) => r.soldUnits > 0 || r.returnedUnits > 0), '9: إخفاء بلا مبيعات');
const rk = rankProducts(syr.rows);
ok(rk.topSelling[0].name === 'زيت الروزماري', '9: الأكثر مبيعاً'); ok(rk.topProfit[0].name === 'زيت الروزماري', '9: الأعلى ربحاً');
ok(rk.lowPerformers[0].name === 'سيروم أ', '9: الأقل أداءً (أدنى هامش)'); ok(rk.noSales.some((r) => r.name === 'ماسك الطين'), '9: بلا مبيعات');

// ════ 10) مقارنة الأشهر + تجميع سنة ════
const sepRep = rep(sep, 'syria', null);
const series = compareMonths([sepRep, syr]);
eq(series[0].salesUsd, 20, '10: أيلول 2 × 10$'); eq(series[1].change.salesUsd, 200, '10: تغيّر المبيعات % (60 مقابل 20)');
const comb = combineReports([sepRep, syr]);
eq(comb.totals.salesUsd, 80, '10: مجموع شهرين'); eq(row(comb, 'زيت الروزماري').soldUnits, 8, '10: كميات مجمّعة');
ok(row(comb, 'زيت الروزماري').unitCost === 'mixed', '10: تكلفة وحدة متغيّرة بين الأشهر = متعددة');
eq(row(comb, 'زيت الروزماري').totalCost, 28, '10: التكلفة المجمّعة = 8 + 20');
eq(row(comb, 'زيت الروزماري').grossProfit, 37, '10: ربح مجمّع = 65 − 28');

const combAll = combineReports([rep(sep, 'all', null), rep(oct, 'all')]);
eq(combAll.rows.filter((r) => r.key === row(oct.products ? rep(oct, 'all') : null, 'زيت الروزماري').key).length, 1, '10: كل الأسواق: سطر واحد للمنتج عبر الأشهر');
eq(row(combAll, 'زيت الروزماري').soldUnits, 8, '10: كل الأسواق مجمّعة');

// ════ 11) النسخة المعتمدة + التصدير ════
const base = snapshotOf(oct);
const snap = detailedSnapshotOf(base, oct, { fxRates, brand: 'lowes' });
ok(snap.detail.fx.length === 2 && snap.detail.fx.every((f) => f.units_per_usd > 0), '11: أسعار صرف الشهر محفوظة باللقطة');
ok(snap.detail.products.some((p) => p.name === 'زيت الروزماري' && p.market === 'syria'), '11: أسطر المنتجات محفوظة');
ok(diffSnapshot(snap, base).length === 0, '11: detail لا يُطلق إنذار تغيّر كاذب');
ok(diffSnapshot({ ...snap, revenue: 1 }, base).length === 1, '11: تغيّر رقم مفتاحي ما زال يُكشف');
const sheets = exportSheets(syr, { title: 'سوريا — 2026-10', fxRates });
ok(sheets['كشف المنتجات'].length === syr.rows.length + 1, '11: ورقة الكشف = كل الأسطر + العنوان');
ok(Object.keys(sheets).includes('الملخص والافتراضات'), '11: ورقة الافتراضات');
const evil = exportSheets({ ...syr, rows: [{ ...ros, name: '=HYPERLINK("x")' }] });
ok(String(evil['كشف المنتجات'][1][0]).startsWith("'"), '11: حماية من حقن الصيغ');

// ════ 12) عدم المساس بالأرقام القديمة ════
eq(oct.marketSummary.syria.revenue, 60, '12: إيراد السوق بالمحرك كما هو');
eq(oct.marketSummary.syria.productCost, 28, '12: تكلفة السوق بالمحرك كما هي');

console.log(`\n${pass} نجح · ${fail} فشل`);
if (fail) process.exit(1);
