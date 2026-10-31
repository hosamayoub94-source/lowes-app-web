// اختبار قراءة التكلفة عبر الأسماء البديلة (D-176) — node test-cost-alias-resolution.mjs
// القواعد: التكلفة باسم بديل تصل للمنتج الموحّد · كل سوق وشهر مستقل · التعارض لا يُحسم آلياً · لا تعديل للمصدر.
import { computeMonthly, unifyCostSources, summarizeCostConflicts, buildResolver, resolveEcon, buildVersionIndex, buildMarketIndex } from './src/utils/profitabilityCalc.js';
import { buildProductLines } from './src/utils/deliveryAccounting.js';
import { costStatusOf, needsCostAttention } from './src/utils/costStatus.js';

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

// ════ 9) كل فترة سريان مستقلة — لا تُدمج فترتان بتاريخين مختلفين ولو بنفس الشهر ════
// القاعدة تفرض اليوم بداية الشهر (CHECK)، لكن الكود لا يعتمد على ذلك: التجميع بتاريخ السريان الدقيق.
const dayOf = (r) => String(r.effective_from).slice(0, 10);
const histIntra = [H('سيروم اللحية', '2026-10-01', 2), H('BEARD SERUM', '2026-10-15', 3)];
const U2 = unifyCostSources({ historyRows: histIntra, resolve, decisions: {} });
eq(U2.conflicts.length, 0, '9: فترتان مختلفتان بنفس الشهر ليستا تعارضاً');
eq(U2.history.length, 2, '9: الفترتان محفوظتان (لا دمج)');
ok(U2.history.map(dayOf).sort().join() === '2026-10-01,2026-10-15', '9: تاريخ السريان الدقيق محفوظ ولم يُسوَّ إلى بداية الشهر');
// سلسلة من ثلاث فترات بالشهر نفسه
const U3 = unifyCostSources({ historyRows: [H('سيروم اللحية', '2026-10-01', 2), H('BEARD SERUM', '2026-10-10', 3), H('سيروم اللحية', '2026-10-20', 4)], resolve, decisions: {} });
eq(U3.history.length, 3, '9: ثلاث فترات بشهر واحد ← ثلاث نسخ مستقلة'); eq(U3.conflicts.length, 0, '9: بلا تعارض');
// سوقي: نفس القاعدة
const UM = unifyCostSources({ marketPriceRows: [{ item_name: 'سيروم اللحية', market: 'syria', effective_from: '2026-10-01', cost_usd: 5 }, { item_name: 'BEARD SERUM', market: 'syria', effective_from: '2026-10-15', cost_usd: 6 }], resolve, decisions: {} });
eq(UM.market.length, 2, '9: سوقي: فترتان ← نسختان'); eq(UM.conflicts.length, 0, '9: سوقي: بلا تعارض');

// 10) الطلب قبل تاريخ تغيير التكلفة يأخذ القديمة وبعده الجديدة (حتى على مستوى اليوم والثانية، بتوقيت إسطنبول)
const OD = (id, name, delivered_at, mkt = 'uae') => ({ id, order_code: id, brand: 'lowes', market: mkt, status: 'delivered', items: [{ name, qty: 1 }], amount: 20, currency: 'USD',
  order_date: delivered_at, delivered_at, delivery_basis: 'carrier', hist_rows: 2, reserve_qty: 0, restock_qty: 0, waste_qty: 0 });
const costOf = (orders, month, hRows, extra = {}) => computeMonthly({ orders, nameMapRows: nameMap, historyRows: hRows, marketPriceRows: [], month, nowMonth: '2026-11-01', costDecisions: {}, ...extra }).marketSummary.uae.productCost;
// 10أ) حدّ الشهر: تغيّرت التكلفة 2026-10-01 (القديمة باسم بديل، الجديدة بالموحّد)
const hBoundary = [H('BEARD SERUM', '2026-09-01', 2), H('سيروم اللحية', '2026-10-01', 3)];
eq(costOf([OD('s1', 'سيروم اللحية', '2026-09-30T23:59:59+03:00')], '2026-09', hBoundary), 2, '10: قبل التغيير بثانية (30/9 23:59:59) ← القديمة 2');
eq(costOf([OD('s2', 'سيروم اللحية', '2026-10-01T00:00:00+03:00')], '2026-10', hBoundary), 3, '10: لحظة التغيير (1/10 00:00:00) ← الجديدة 3');
eq(costOf([OD('s3', 'BEARD SERUM', '2026-10-20T10:00:00+03:00')], '2026-10', hBoundary), 3, '10: اسم بديل بعد التغيير ← الجديدة 3');
// 10ب) تغيير بمنتصف الشهر (يوم 15) — لو سُمح به: قبله القديمة وبعده الجديدة بنفس الشهر
const hMid = [H('سيروم اللحية', '2026-10-01', 2), H('BEARD SERUM', '2026-10-15', 3)];
eq(costOf([OD('m1', 'سيروم اللحية', '2026-10-02T10:00:00+03:00')], '2026-10', hMid), 2, '10: 2/10 ← 2');
eq(costOf([OD('m2', 'سيروم اللحية', '2026-10-14T23:59:59+03:00')], '2026-10', hMid), 2, '10: 14/10 23:59:59 (قبل التغيير بثانية) ← 2');
eq(costOf([OD('m3', 'سيروم اللحية', '2026-10-15T00:00:00+03:00')], '2026-10', hMid), 3, '10: 15/10 00:00:00 (لحظة التغيير) ← 3');
eq(costOf([OD('m4', 'BEARD SERUM', '2026-10-31T10:00:00+03:00')], '2026-10', hMid), 3, '10: 31/10 ← 3');
eq(costOf([OD('m1', 'سيروم اللحية', '2026-10-02T10:00:00+03:00'), OD('m2', 'سيروم اللحية', '2026-10-14T23:59:59+03:00'), OD('m3', 'سيروم اللحية', '2026-10-15T00:00:00+03:00'), OD('m4', 'سيروم اللحية', '2026-10-31T10:00:00+03:00')], '2026-10', hMid), 10, '10: أربعة طلبات بشهر واحد = 2+2+3+3 (كل طلب بتكلفة فترته)');
// 10ج) سوقي بمنتصف الشهر
const mMid = [{ item_name: 'سيروم اللحية', market: 'syria', effective_from: '2026-10-01', sale_price_usd: 9, cost_usd: 5 }, { item_name: 'BEARD SERUM', market: 'syria', effective_from: '2026-10-15', sale_price_usd: 9, cost_usd: 6 }];
const costSy = (orders) => computeMonthly({ orders, nameMapRows: nameMap, historyRows: hMid, marketPriceRows: mMid, month: '2026-10', nowMonth: '2026-11-01', costDecisions: {} }).marketSummary.syria.productCost;
eq(costSy([OD('y1', 'سيروم اللحية', '2026-10-10T10:00:00+03:00', 'syria')]), 5, '10: سوريا قبل 15/10 ← 5');
eq(costSy([OD('y2', 'سيروم اللحية', '2026-10-16T10:00:00+03:00', 'syria')]), 6, '10: سوريا بعد 15/10 ← 6');
eq(costOf([OD('u1', 'سيروم اللحية', '2026-10-20T10:00:00+03:00')], '2026-10', hMid, { marketPriceRows: mMid }), 3, '10: الإمارات بلا صف سوقي ← الموحّدة بفترتها (لا تأخذ سعر سوريا)');
// 10د) المرتجع بعد التسليم يُسترد بتكلفة فترة التسليم لا بتكلفة شهر الإرجاع
const ret = { ...OD('r1', 'سيروم اللحية', '2026-10-05T10:00:00+03:00'), status: 'returned', delivered_before_return: true, return_at: '2026-10-20T10:00:00+03:00', reserve_qty: 1, restock_qty: 1 };
const retRes = computeMonthly({ orders: [ret], nameMapRows: nameMap, historyRows: hMid, marketPriceRows: [], month: '2026-10', nowMonth: '2026-11-01', costDecisions: {} });
eq(retRes.marketSummary.uae.returns.costOut, 2, '10: مرتجع طلب سُلِّم 5/10 (قبل التغيير) ← بتكلفة 2 لا 3');
const ret2 = { ...OD('r2', 'سيروم اللحية', '2026-10-20T10:00:00+03:00'), status: 'returned', delivered_before_return: true, return_at: '2026-10-25T10:00:00+03:00', reserve_qty: 1, restock_qty: 1 };
const retRes2 = computeMonthly({ orders: [ret2], nameMapRows: nameMap, historyRows: hMid, marketPriceRows: [], month: '2026-10', nowMonth: '2026-11-01', costDecisions: {} });
eq(retRes2.marketSummary.uae.returns.costOut, 3, '10: مرتجع طلب سُلِّم 20/10 (بعد التغيير) ← بتكلفة 3 لا 2 (يوم التسليم لا بداية الشهر)');

// 11) تعارض حقيقي بنفس فترة السريان ← لا اختيار، ومفتاح القرار بتاريخ الفترة الدقيق
const hSame = [H('سيروم اللحية', '2026-10-01', 2), H('BEARD SERUM', '2026-10-15', 3), H('سيروم اللحية', '2026-10-15', 4)];
const US = unifyCostSources({ historyRows: hSame, resolve, decisions: {} });
eq(US.conflicts.length, 1, '11: تعارض واحد (فترة 15/10 فقط)');
ok(US.conflicts[0].decisionKey === 'سيروم اللحية||2026-10-15' && US.conflicts[0].period === '2026-10-15', '11: مفتاح القرار بتاريخ الفترة الدقيق');
eq(costOf([OD('c1', 'سيروم اللحية', '2026-10-10T10:00:00+03:00')], '2026-10', hSame), 2, '11: قبل فترة التعارض ← القديمة 2 (غير متأثرة)');
eq(costOf([OD('c2', 'سيروم اللحية', '2026-10-20T10:00:00+03:00')], '2026-10', hSame), 0, '11: داخل فترة التعارض ← غير محسوم (لا 3 ولا 4)');
eq(costOf([OD('c3', 'سيروم اللحية', '2026-10-20T10:00:00+03:00')], '2026-10', hSame, { costDecisions: { 'سيروم اللحية||2026-10-15': 4 } }), 4, '11: بعد قرار المالك لهذه الفترة ← 4');
eq(costOf([OD('c4', 'سيروم اللحية', '2026-10-10T10:00:00+03:00')], '2026-10', hSame, { costDecisions: { 'سيروم اللحية||2026-10-15': 4 } }), 2, '11: القرار لا يمتد لما قبل فترته');
ok(unifyCostSources({ historyRows: hSame, resolve, decisions: { 'سيروم اللحية||2026-10-01': 9 } }).conflicts.length === 1, '11: قرار بتاريخ فترة أخرى لا يحسم هذا التعارض');

// 12) دليل التعارض للمالك: المصدر ووقت الكتابة ووقت آخر تحديث للصف الحالي — عرض فقط، لا يُستعمل للاختيار
const hEv = [{ ...H('BEARD SERUM', '2026-08-01', 4, { source: 'legacy_backfill', created_at: '2026-10-17T09:03:00Z' }) }, { ...H('سيروم اللحية', '2026-08-01', 3, { source: 'legacy_backfill', created_at: '2026-10-17T09:03:00Z' }) }];
const cur = [{ item_name: 'BEARD SERUM', sale_price_usd: 8, cost_usd: 4, updated_at: '2026-08-17T14:39:00Z' }, { item_name: 'سيروم اللحية', sale_price_usd: 8, cost_usd: 3, updated_at: '2026-08-17T17:28:00Z' }];
const UE = unifyCostSources({ historyRows: hEv, currentRows: cur, resolve, decisions: {} });
const ev = UE.conflicts.find((c) => c.table === 'product_economics_history');
ok(ev && ev.values.every((v) => v.source === 'legacy_backfill' && v.recordedAt && v.observedAt), '12: كل قيمة بمصدرها ووقت كتابتها ووقت تحديثها');
ok(ev.inferredPeriod === true, '12: فترة السريان موسومة «مستنتجة» لأن المصدر legacy_backfill');
eq(UE.history.find((r) => r.cost_source === 'conflict') ? 0 : 1, 0, '12: بالرغم من اختلاف التوقيت لا يُختار الأحدث تلقائياً (يبقى تعارضاً)');
ok(UE.history.every((r) => r.cost_usd === null), '12: لا قيمة معتمدة');

// 13) تعارض جدول «الحالي» لا يُحتسب قراراً إن كان للمنتج الموحّد سجل تاريخ (لا يُقرأ أصلاً)
const curConf = [{ item_name: 'BEARD SERUM', sale_price_usd: 8, cost_usd: 4, updated_at: '2026-09-05T10:00:00Z' }, { item_name: 'سيروم اللحية', sale_price_usd: 8, cost_usd: 5, updated_at: '2026-09-20T10:00:00Z' }];
const UI = unifyCostSources({ historyRows: [H('سيروم اللحية', '2026-06-01', 2)], currentRows: curConf, resolve, decisions: {} });
const ci = UI.conflicts.find((c) => c.table === 'product_economics');
ok(ci && ci.inert === true, '13: تعارض «الحالي» مع وجود سجل تاريخ للموحّد ← غير فعّال (inert)');
const UI2 = unifyCostSources({ historyRows: [], currentRows: curConf, resolve, decisions: {} });
ok(UI2.conflicts.find((c) => c.table === 'product_economics')?.inert === false, '13: بلا سجل تاريخ ← فعّال (يحتاج قراراً)');
const sum = summarizeCostConflicts([...US.conflicts, ...UI.conflicts]);
ok(sum.groups === 2 && sum.inert === 1 && sum.decisions === 1, '13: الملخص: 2 مجموعة، منها 1 غير فعّالة، = قرار واحد فعّال');

// 14) مراجعة #128: المحرر يعرض التعارض «بانتظار قرار» لا «ناقصة»، وdecisions=null لا ينهار
{
  const H14 = (n, d, c) => ({ item_name: n, effective_from: d, sale_price_usd: 10, cost_usd: c, ad_cost_usd: 0, shipping_cost_usd: 0 });
  const pt = computeMonthly({ orders: [], nameMapRows: nameMap, historyRows: [H14('سيروم اللحية', '2026-10-01', 2), H14('BEARD SERUM', '2026-10-01', 3)], month: '2026-10', nowMonth: '2026-10-01', costDecisions: {} }).priceTable.find((t) => t.name === 'سيروم اللحية');
  ok(pt.markets.uae.costStatus === 'conflict', '14: جدول المحرر يحمل الحالة conflict');
  const [lab] = costStatusOf(pt.markets.uae.costStatus), [labMissing] = costStatusOf('missing');
  ok(lab !== labMissing && /تعارض/.test(lab), '14: المحرر يعرض «تعارض» لا «ناقصة»');
  ok(needsCostAttention('conflict') && needsCostAttention('missing') && !needsCostAttention('market') && !needsCostAttention('unified'), '14: فلتر «الناقصة والمتعارضة» يشمل conflict');
  ok(costStatusOf('شيء_غير_معروف')[0] === labMissing, '14: حالة مجهولة ← ناقصة (كما كان)');
  let threw = false; try { unifyCostSources({ historyRows: [H14('سيروم اللحية', '2026-10-01', 2), H14('BEARD SERUM', '2026-10-01', 3)], resolve, decisions: null }); } catch { threw = true; }
  ok(!threw, '14: decisions=null مع تعارض لا ينهار'); 
}

console.log(`\n${pass} نجح · ${fail} فشل`);
if (fail) process.exit(1);
