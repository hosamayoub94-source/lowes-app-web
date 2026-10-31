// اختبار قراءة التكلفة عبر الأسماء البديلة (D-176) — node test-cost-alias-resolution.mjs
// القواعد: التكلفة باسم بديل تصل للمنتج الموحّد · كل سوق وشهر مستقل · التعارض لا يُحسم آلياً · لا تعديل للمصدر.
import { computeMonthly, unifyCostSources, buildResolver, resolveEcon, buildVersionIndex, buildMarketIndex } from './src/utils/profitabilityCalc.js';
import { buildProductLines } from './src/utils/deliveryAccounting.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('❌', m); } };
const eq = (a, b, m) => ok(Math.abs((a ?? NaN) - b) < 1e-9, `${m} (متوقع ${b}، كان ${a})`);

const nameMap = [
  { alias_name: 'BEARD SERUM', canonical_name: 'سيروم اللحية', brand: 'lowes', is_active: true },
  { alias_name: 'سيروم اللحية', canonical_name: 'سيروم اللحية', brand: 'lowes', is_active: true },
  { alias_name: 'Skin lightening cream', canonical_name: 'كريم تفتيح البشرة', brand: 'lowes', is_active: true },
  { alias_name: 'كريم تفتيح البشرة', canonical_name: 'كريم تفتيح البشرة', brand: 'lowes', is_active: true },
  { alias_name: 'HAIR REMOVAL CREAM', canonical_name: 'كريم إزالة الشعر', brand: 'lowes', is_active: true },
  { alias_name: 'HAIR REMOVEL CREAM', canonical_name: 'كريم إزالة الشعر', brand: 'lowes', is_active: true },
  { alias_name: 'Super viga blue', canonical_name: 'Super Viga Blue', brand: 'lowes', is_active: true },
  { alias_name: 'ROSEMARY OIL', canonical_name: 'زيت الروزماري', brand: 'lowes', is_active: true },
];
const H = (item_name, effective_from, cost_usd, extra = {}) => ({ item_name, effective_from, sale_price_usd: 10, cost_usd, ad_cost_usd: 0, shipping_cost_usd: 0, source: 'entered', ...extra });
const history = [
  H('BEARD SERUM', '2026-06-01', 4),                  // بديل فقط بحزيران
  H('سيروم اللحية', '2026-10-01', 2.52),              // موحّد بتشرين الأول
  H('كريم تفتيح البشرة', '2026-08-01', 4),
  H('كريم تفتيح البشرة', '2026-10-01', 2.52),         // تعارض: موحّد 2.52 ≠ بديل 3
  H('Skin lightening cream', '2026-10-01', 3),
  H('HAIR REMOVAL CREAM', '2026-06-01', 4),           // تعارض بين بديلين فقط
  H('HAIR REMOVEL CREAM', '2026-06-01', 6),
  H('Super viga blue', '2026-06-01', 3),              // تعارض: نفس الاسم بإملاءين بتكلفتين (كان يُختار عشوائياً)
  H('super viga  blue', '2026-06-01', 6),
  H('زيت الروزماري', '2026-08-01', 3),
  H('ROSEMARY OIL', '2026-08-01', 3),                 // تطابق ← ليس تعارضاً
];
const marketRows = [
  { item_name: 'BEARD SERUM', market: 'syria', effective_from: '2026-10-01', sale_price_usd: 9, cost_usd: 5, shipping_cost_usd: null },
  { item_name: 'سيروم اللحية', market: 'turkey', effective_from: '2026-10-01', sale_price_usd: 9, cost_usd: 6, shipping_cost_usd: null },
  { item_name: 'زيت الروزماري', market: 'uae', effective_from: '2026-10-01', sale_price_usd: 9, cost_usd: 7, shipping_cost_usd: null },
  { item_name: 'ROSEMARY OIL', market: 'uae', effective_from: '2026-10-01', sale_price_usd: 9, cost_usd: 8, shipping_cost_usd: null }, // تعارض سوقي
];
const snapshot = JSON.stringify({ history, marketRows });
const resolve = buildResolver(nameMap);
const U = unifyCostSources({ historyRows: history, marketPriceRows: marketRows, resolve, decisions: {} });
const V = buildVersionIndex(U.history, U.current), M = buildMarketIndex(U.market);
const econ = (name, market, month) => resolveEcon(V, M, resolve(name).key, market, month, '2026-10-01');

// 1) التكلفة باسم بديل تصل للمنتج الموحّد
eq(econ('سيروم اللحية', 'uae', '2026-06-01').cost, 4, '1: حزيران من BEARD SERUM');
eq(econ('سيروم اللحية', 'uae', '2026-09-01').cost, 4, '1: أيلول يرث حزيران (لا نسخة أحدث)');
eq(econ('سيروم اللحية', 'uae', '2026-10-01').cost, 2.52, '1: تشرين الأول = نسخة الموحّد');
ok(econ('سيروم اللحية', 'uae', '2026-06-01').uni.cost_source === 'alias', '1: مصدرها موسوم alias');

// 2) التكلفة التاريخية لا تتغيّر بتكلفة لاحقة
eq(econ('كريم تفتيح البشرة', 'uae', '2026-08-01').cost, 4, '2: آب يبقى 4 رغم تعارض تشرين الأول');
eq(econ('كريم تفتيح البشرة', 'uae', '2026-09-01').cost, 4, '2: أيلول يبقى 4');

// 3) التعارض لا يُحسم آلياً ولا يرجع لنسخة أقدم
eq(econ('كريم تفتيح البشرة', 'uae', '2026-10-01').cost, 0, '3: تعارض موحّد/بديل ← غير محسوم (لا 2.52 ولا 3 ولا 4 القديمة)');
ok(econ('كريم تفتيح البشرة', 'uae', '2026-10-01').costStatus === 'conflict', '3: الحالة conflict');
eq(econ('كريم إزالة الشعر', 'uae', '2026-07-01').cost, 0, '3: تعارض بديلين (4/6) ← غير محسوم ويستمر للأشهر التالية حتى قرار');
eq(econ('Super Viga Blue', 'uae', '2026-06-01').cost, 0, '3: إملاءان لنفس الاسم بتكلفتين ← تعارض (كان اختياراً عشوائياً)');
eq(econ('زيت الروزماري', 'syria', '2026-08-01').cost, 3, '3: قيمتان متطابقتان ليستا تعارضاً');
eq(U.conflicts.length, 4, '3: 4 تعارضات بهذه البيانات (3 تاريخ + 1 سوق)');
ok(U.conflicts.every((c) => c.values.length >= 2 && c.decided === null), '3: كل تعارض بقيمه ومصادره وبلا قرار');

// 4) قرار المالك يُطبَّق على المجموعة نفسها فقط
const D = unifyCostSources({ historyRows: history, marketPriceRows: marketRows, resolve, decisions: { 'كريم تفتيح البشرة||2026-10-01': 2.52 } });
const Vd = buildVersionIndex(D.history, D.current), Md = buildMarketIndex(D.market);
eq(resolveEcon(Vd, Md, resolve('كريم تفتيح البشرة').key, 'uae', '2026-10-01', '2026-10-01').cost, 2.52, '4: القرار المسجّل يُعتمد');
ok(D.conflicts.find((c) => c.name === 'كريم تفتيح البشرة').decided === 2.52, '4: يظهر كقرار لا كتعارض مفتوح');
eq(resolveEcon(Vd, Md, resolve('كريم إزالة الشعر').key, 'uae', '2026-06-01', '2026-10-01').cost, 0, '4: لا يمتد لتعارض آخر');

// 5) كل سوق مستقل
eq(econ('سيروم اللحية', 'syria', '2026-10-01').cost, 5, '5: تكلفة سوريا من صف سوقي باسم بديل');
eq(econ('سيروم اللحية', 'turkey', '2026-10-01').cost, 6, '5: تركيا من صفها');
eq(econ('سيروم اللحية', 'uae', '2026-10-01').cost, 2.52, '5: الإمارات بلا صف سوقي ← الموحّدة (لا تأخذ سعر سوق آخر)');
eq(econ('زيت الروزماري', 'uae', '2026-10-01').cost, 0, '5: تعارض سوقي ← غير محسوم، لا رجوع صامت للتكلفة الموحّدة 3');
eq(econ('زيت الروزماري', 'syria', '2026-10-01').cost, 3, '5: سوق آخر غير متأثر بالتعارض');

// 6) لا تعديل لأي صف مصدر
ok(JSON.stringify({ history, marketRows }) === snapshot, '6: صفوف المصدر لم تتغيّر');

// 7) المحرك الكامل: بيع حزيران بتكلفة البديل + تنبيه التعارض
const O = (o) => ({ id: o.id, order_code: o.id, brand: 'lowes', market: 'uae', status: 'delivered', items: [{ name: o.name, qty: 2 }], amount: 20, currency: 'USD',
  order_date: `${o.m}-03T10:00:00+03:00`, delivered_at: `${o.m}-05T10:00:00+03:00`, delivery_basis: 'carrier', hist_rows: 2, reserve_qty: 0, restock_qty: 0, waste_qty: 0 });
const jun = computeMonthly({ orders: [O({ id: 'a', name: 'سيروم اللحية', m: '2026-06' })], nameMapRows: nameMap, historyRows: history, marketPriceRows: marketRows, month: '2026-06', nowMonth: '2026-10-01', costDecisions: {} });
eq(jun.marketSummary.uae.productCost, 8, '7: حزيران: 2 × 4 من الاسم البديل (كان 0 بلا تكلفة)');
const oct = computeMonthly({ orders: [O({ id: 'b', name: 'كريم تفتيح البشرة', m: '2026-10' })], nameMapRows: nameMap, historyRows: history, marketPriceRows: marketRows, month: '2026-10', nowMonth: '2026-10-01', costDecisions: {} });
eq(oct.marketSummary.uae.productCost, 0, '7: تشرين الأول: تعارض ← لا تكلفة مختارة');
eq(oct.marketSummary.uae.costConflictUnits, 2, '7: قطع التعارض معدودة');
ok(oct.company.quality.issues.some((i) => i.code === 'cost_conflict'), '7: تنبيه «تكلفة متعارضة» بجودة الشهر');
ok(oct.costConflicts.length === 4, '7: قائمة التعارضات بالناتج');
const before = computeMonthly({ orders: [O({ id: 'c', name: 'زيت الروزماري', m: '2026-08' })], nameMapRows: nameMap, historyRows: history, marketPriceRows: marketRows, month: '2026-08', nowMonth: '2026-10-01', costDecisions: {} });
eq(before.marketSummary.uae.productCost, 6, '7: منتج بلا تعارض: الرقم كما كان (2 × 3)');

// 8) شاشة المبيعات والتسليم تقرأ بنفس القاعدة
const d = [{ id: 'e', order_id: 'e', market: 'uae', status: 'delivered', items: [{ name: 'BEARD SERUM', qty: 3 }], amount: 30, currency: 'USD', delivered_at: '2026-07-04T10:00:00+03:00', delivery_basis: 'carrier', delivery_at: '2026-07-04T10:00:00+03:00' }];
const lines = buildProductLines(d, [], { nameMapRows: nameMap, historyRows: history, monthStart: '2026-07-01' });
eq(lines[0].cost, 12, '8: /sales-delivery: 3 × 4 من الاسم البديل');

console.log(`\n${pass} نجح · ${fail} فشل`);
if (fail) process.exit(1);
