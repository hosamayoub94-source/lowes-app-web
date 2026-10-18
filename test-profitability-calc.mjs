// اختبار منطق الربحية الشهرية — node test-profitability-calc.mjs
// أرقام متوقعة محسوبة يدوياً + نموذج مرجعي مستقل على سيناريوهات عشوائية.
import { computeMonthly, monthBounds, pickVersion, buildVersionIndex, classifyAccountingEntry, snapshotOf, diffSnapshot } from './src/utils/profitabilityCalc.js';
import { recordStatusHistory } from './supabase/functions/_shared/orderHistory.ts';

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) pass++; else { fail++; console.error('❌', msg); } };
const eq = (a, b, msg) => ok(Math.abs(a - b) < 1e-9, `${msg} (متوقع ${b}، كان ${a})`);

const nameMap = [
  { alias_name: 'ROSEMARY SHAMPOO', canonical_name: 'شامبو الروزماري', brand: 'lowes', is_active: true },
  { alias_name: 'Serum A', canonical_name: 'سيروم أ', brand: 'lowes', is_active: true },
  { alias_name: 'Old Strong', canonical_name: 'ستونغ قديم', brand: 'strong', is_active: false },
];
// سيروم أ: 20$/8$ منذ حزيران، تقدير إعلان 1 وشحن 2. شامبو: 10/4 حتى أيلول ثم 12/5 من تشرين الأول.
const history = [
  { item_name: 'شامبو الروزماري', effective_from: '2026-06-01', sale_price_usd: 10, cost_usd: 4, ad_cost_usd: 0, shipping_cost_usd: 0, source: 'entered' },
  { item_name: 'شامبو الروزماري', effective_from: '2026-10-01', sale_price_usd: 12, cost_usd: 5, ad_cost_usd: 0, shipping_cost_usd: 0, source: 'entered' },
  { item_name: 'سيروم أ', effective_from: '2026-06-01', sale_price_usd: 20, cost_usd: 8, ad_cost_usd: 1, shipping_cost_usd: 2, source: 'entered' },
];
const base = { nameMapRows: nameMap, historyRows: history, brand: 'lowes' };
let oid = 0;
// صف كما تُرجعه profitability_orders
// سعر الكتالوج الموحَّد كما يدفعه الزبون افتراضياً (تُحاكي قيمة الطلب الفعلية = سعر×كمية ما لم يُحدَّد amount صراحةً)
const CANON = { 'ROSEMARY SHAMPOO': 'شامبو الروزماري', 'Serum A': 'سيروم أ' };
const UNI = { 'شامبو الروزماري': (m) => (m >= '2026-10' ? 12 : 10), 'سيروم أ': () => 20 };
const defAmount = (o) => (o.items || []).reduce((s, x) => { const f = UNI[CANON[x.name]]; return s + (f ? f(String(o.delivered_at || o.order_date || '').slice(0, 7)) * (x.qty || 1) : 0); }, 0);
const R0 = (o) => ({ id: `o${++oid}`, order_code: `C${oid}`, market: 'turkey', status: 'delivered', order_date: '2026-09-05T10:00:00+03:00', items: [{ name: 'Serum A', qty: 1 }],
  amount: 100, currency: 'USD', delivered_at: '2026-09-08T10:00:00+03:00', delivery_basis: 'carrier', delivery_source: 'yurtici', delivery_bulk_suspect: false,
  delivered_before_return: false, history_conflict: false, return_at: null, return_source: null, return_bulk_suspect: false, hist_rows: 3, reserve_qty: 0, restock_qty: 0, waste_qty: 0, ...o });
const R = (o) => { const x = R0(o); if (!('amount' in o)) x.amount = defAmount(x); return x; };
const E = (market, category, amount, extra = {}) => ({ month: '2026-09-01', market, category, amount_usd: amount, ...extra });
const run = (orders, extra = {}, month = '2026-09') => computeMonthly({ ...base, orders, month, ...extra });
const sy = (r) => r.marketSummary.syria, tr = (r) => r.marketSummary.turkey, ua = (r) => r.marketSummary.uae;
const hasIssue = (q, code) => q.issues.some((i) => i.code === code);

// ════ 1) الشهر الصحيح عند اختلاف الإنشاء عن التسليم ════
const aug28 = R({ order_date: '2026-08-28T10:00:00+03:00', delivered_at: '2026-09-03T10:00:00+03:00', items: [{ name: 'ROSEMARY SHAMPOO', qty: 2 }] });
eq(tr(run([aug28])).units, 2, '1: طلب أُنشئ في آب وسُلِّم في أيلول يُحسب بأيلول'); eq(tr(run([aug28])).revenue, 20, '1: إيراد أيلول 2×10');
eq(tr(run([aug28], {}, '2026-08')).units, 0, '1: لا يُحسب بآب (شهر الإنشاء)');
const sep30 = R({ order_date: '2026-09-29T10:00:00+03:00', delivered_at: '2026-10-02T09:00:00+03:00', items: [{ name: 'ROSEMARY SHAMPOO', qty: 1 }] });
eq(tr(run([sep30])).units, 0, '1: أُنشئ أيلول وسُلِّم تشرين الأول لا يُحسب بأيلول'); eq(tr(run([sep30], {}, '2026-10')).revenue, 12, '1: يُحسب بتشرين الأول بسعر تشرين الأول');
eq(tr(run([R({ delivered_at: '2026-09-30T23:59:59+03:00' }), R({ delivered_at: '2026-10-01T00:00:00+03:00' })])).orders, 1, '1: آخر ثانية بأيلول فقط');

// ════ 2) التاريخ المجهول لا يُسنَد لأي شهر ════
const unk = R({ delivered_at: null, delivery_basis: 'unknown', delivery_source: null, hist_rows: 0 });
for (const mth of ['2026-09', '2026-10']) { const x = run([unk], {}, mth); eq(tr(x).units, 0, `2: مجهول التاريخ لا يدخل مبيعات ${mth}`); eq(tr(x).revenue, 0, `2: ولا إيراد ${mth}`); }
let r = run([unk]);
eq(r.unknownDeliveryOrders.length, 1, '2: يظهر في قائمة مسلَّمة بتاريخ غير معروف'); ok(r.unknownDeliveryOrders[0].reason === 'no_history', '2: السبب: لا سجل');
ok(r.company.quality.status === 'partial' && hasIssue(r.company.quality, 'unknown_delivery'), '2: الربح جزئي مع تحذير التاريخ المجهول');

// ════ 3) أحداث الاستيراد الجماعي لا تُساوى بتاريخ التسليم ════
r = run([R({ delivered_at: null, delivery_basis: 'unknown', delivery_bulk_suspect: true, hist_rows: 4 })]);
eq(tr(r).units, 0, '3: حدث تسليم من استيراد جماعي لا يُعدّ مبيعاً بشهر'); ok(r.unknownDeliveryOrders[0].reason === 'bulk_import_event', '3: السبب موسوم bulk_import_event');
r = run([R({ delivery_basis: 'substitute_tracker', delivery_source: 'updated_by:الكرم-تلقائي' }), R({ delivery_basis: 'substitute_staff_event', delivery_source: 'app' })]);
eq(tr(r).substituteOrders, 2, '3: طلبان بتاريخ بديل مُعلَّمان'); ok(hasIssue(r.company.quality, 'substitute_dates'), '3: تحذير التاريخ البديل');
r = run([R({ delivery_basis: 'external', delivery_source: 'sheet' })]); eq(tr(r).deliveryBasis.external, 1, '3: الأساس external محفوظ');

// ════ 4+5) مصادر سجل الحالات + عدم ابتلاع الفشل (الكود الحقيقي للدالة المشتركة) ════
const mkClient = (failWith) => { const calls = []; return { calls, from(t) { return { insert: async (row) => { calls.push({ t, row }); if (t === 'order_status_history' && failWith) return { error: { message: failWith } }; return { error: null }; } }; } }; };
const SOURCES = ['app', 'sheet', 'yurtici', 'star', 'babel', 'babel_webhook', 'karam', 'ptt'];
for (const s of SOURCES) { const c = mkClient(null); const okRes = await recordStatusHistory(c, { order_id: 'x', from_status: 'a', to_status: 'delivered', changed_by: 't', source: s }, 'test'); ok(okRes === true && c.calls.length === 1, `4: المصدر المشروع ${s} يُدرَج`); }
{ const c = mkClient('violates check constraint "order_status_history_source_check"'); const res = await recordStatusHistory(c, { order_id: 'x', from_status: 'a', to_status: 'delivered', changed_by: 't', source: 'karam' }, 'track-karam');
  ok(res === false, '5: فشل الإدراج يُرجع false ولا يُبتلع'); const f = c.calls.find((x) => x.t === 'order_status_history_failures'); ok(!!f && /check constraint/.test(f.row.error) && f.row.context === 'track-karam', '5: الفشل مسجَّل بجدول order_status_history_failures مع السياق'); }
{ const c = { from() { return { insert: async () => { throw new Error('network down'); } }; } }; const res = await recordStatusHistory(c, { order_id: 'x', to_status: 'delivered', source: 'app' }, 'ctx'); ok(res === false, '5: استثناء الشبكة لا يكسر مسار تحديث الطلب'); }
{ const c = mkClient(null); const res = await recordStatusHistory(c, { order_id: 'x', to_status: 'delivered', source: 'invented' }, 'ctx'); ok(res === false && c.calls.some((x) => x.t === 'order_status_history_failures') && !c.calls.some((x) => x.t === 'order_status_history'), '5: مصدر غير مشروع يُرفض ويُسجَّل قبل الإرسال'); }

// ════ 6-9) سياسة المرتجعات ════
const retBase = { status: 'returned', delivered_at: null, delivery_basis: 'unknown', return_at: '2026-09-20T10:00:00+03:00', return_source: 'yurtici', items: [{ name: 'Serum A', qty: 2 }], reserve_qty: 2 };
r = run([R({ ...retBase, restock_qty: 2 })]);
eq(tr(r).returns.costOut, 16, '6: تكلفة ما خرج من المخزون 2×8'); eq(tr(r).returns.restockedCost, 16, '6: التكلفة المستردة كاملة'); eq(tr(r).returns.damagedLoss, 0, '6: لا تالف'); eq(tr(r).returns.unresolvedCost, 0, '6: لا تسوية معلّقة');
eq(tr(r).estShipping, 6, '6: شحن المرتجع غير المسلَّم = مرة ونصف (1.5×2×2)'); eq(tr(r).productProfit, -6, '6: لا أثر ربحي من البضاعة المستردة — الأثر الوحيد تقدير الشحن'); ok(!hasIssue(tr(r).quality, 'return_unresolved'), '6: لا تحذير غير محسوم');
r = run([R({ ...retBase, restock_qty: 1 })]);
eq(tr(r).returns.restockedCost, 16, '6: استرداد جزئي مثبَت 8 + الباقي 8 يُعدّ إعادة للمخزون بقاعدة المالك'); eq(tr(r).returns.assumedRestockCost, 8, '6: الجزء المفترض مُعلَن'); eq(tr(r).returns.unresolvedCost, 0, '6: لا تسوية معلّقة');
r = run([R({ ...retBase, waste_qty: 2 })]);
eq(tr(r).returns.damagedLoss, 16, '7: خسارة التالف الموثَّق = التكلفة'); eq(tr(r).productProfit, -16 - 6, '7: خسارة التالف 16 + شحن 6'); eq(tr(r).returns.restockedCost, 0, '7: لا استرداد');
r = run([R({ ...retBase })]);
eq(tr(r).returns.damagedLoss, 0, '8: المجهول لا يُحتسب تالفاً'); eq(tr(r).returns.restockedCost, 16, '8: مصير غير موثَّق = إعادة للمخزون بقاعدة المالك'); eq(tr(r).returns.assumedRestockCost, 16, '8: ويُعلَن أنه مفترض'); eq(tr(r).returns.unresolvedCost, 0, '8: لا تسوية معلّقة');
eq(tr(r).productProfit, -6, '8: أثر المرتجع غير المسلَّم = الشحن 1.5× فقط'); ok(!hasIssue(tr(r).quality, 'return_unresolved'), '8: لا تحذير غير محسوم');
r = run([R({ status: 'returning', delivered_at: null, delivery_basis: 'unknown' }), R({ status: 'not_received', delivered_at: null, delivery_basis: 'unknown' })]);
eq(tr(r).returns.orders, 0, '8: returning/not_received ليسا مرتجعاً مكتملاً'); eq(tr(r).pendingReturns.orders, 2, '8: يظهران معلّقين'); eq(tr(r).productProfit, 0, '8: بلا أثر ربحي'); ok(hasIssue(tr(r).quality, 'pending_returns'), '8: تحذير المعلّق');
const dr = R({ status: 'returned', order_date: '2026-09-02T10:00:00+03:00', delivered_at: '2026-09-10T10:00:00+03:00', delivered_before_return: true, return_at: '2026-10-05T10:00:00+03:00', items: [{ name: 'ROSEMARY SHAMPOO', qty: 2 }], reserve_qty: 2, restock_qty: 2 });
const sepR = run([dr], {}, '2026-09'), octR = run([dr], {}, '2026-10');
eq(tr(sepR).revenue, 20, '9: إيراد التسليم يبقى بأيلول'); eq(tr(sepR).productCost, 8, '9: تكلفة التسليم بأيلول'); eq(tr(sepR).returns.revenueReduction, 0, '9: لا خصم مرتجع بأيلول');
eq(tr(octR).revenue, 0, '9: تشرين الأول بلا إيراد جديد'); eq(tr(octR).returns.revenueReduction, 20, '9: تخفيض الإيراد بشهر الإرجاع بسعر شهر التسليم (10) لا سعر تشرين الأول (12)');
eq(tr(octR).returns.restockedCost, 8, '9: التكلفة المستردة بسعر شهر التسليم (4×2)'); eq(tr(octR).productProfit, -20 + 8, '9: أثر تشرين الأول = −20 + 8');
eq(tr(sepR).productProfit + tr(octR).productProfit, 0, '9: الإجمالي عبر الشهرين = صفر لمرتجع كامل مُسترَد');
ok(!!dr.order_code, '9: مرجع الطلب الأصلي (رمز الطلب) محفوظ بالصف');
const o2 = run([R({ ...dr, restock_qty: 0 })], {}, '2026-10');
eq(tr(o2).productProfit, -20 + 8, '9: بلا إثبات: −الإيراد + التكلفة المفترضة المستردة'); eq(tr(o2).returns.assumedRestockCost, 8, '9: التكلفة المفترضة المستردة 8'); eq(tr(o2).returns.unresolvedCost, 0, '9: لا تسوية معلّقة');
const rb = R({ ...dr, return_at: null, return_bulk_suspect: true });
r = run([rb], {}, '2026-09'); eq(tr(r).returnTimingUnknown.orders, 1, '9: مرتجع بتوقيت جماعي غير موثوق يظهر'); eq(tr(r).returnTimingUnknown.revenue, 20, '9: قيمته المعلّقة 20'); ok(hasIssue(tr(r).quality, 'return_timing_unknown'), '9: تحذير التوقيت');
r = run([rb], {}, '2026-10'); eq(tr(r).returns.orders, 0, '9: لا يُنسَب لتشرين الأول'); eq(tr(r).returnTimingUnknown.orders, 0, '9: ولا يظهر بشهر غير شهر تسليمه');
r = run([R({ status: 'returning', delivered_at: null, delivery_basis: 'unknown', return_at: '2026-09-20T10:00:00+03:00', items: [{ name: 'Serum A', qty: 2 }] })]);
eq(tr(r).returns.orders, 0, '8: returning لا يصير مرتجعاً مكتملاً حتى لو حمل return_at'); eq(tr(r).pendingReturns.orders, 1, '8: يبقى معلّقاً');
r = run([R({ ...retBase, return_bulk_suspect: true })]);
eq(tr(r).returns.orders, 0, '9: توقيت إرجاع من تحويل جماعي لا يُسنَد لشهر حتى لو وُجد return_at'); eq(tr(r).returnTimingUnknown.orders, 1, '9: يظهر كتوقيت غير موثوق');
r = run([R({ ...retBase, history_conflict: true })]); ok(hasIssue(tr(r).quality, 'history_conflict'), '9: سجل متناقض يُحذَّر منه');

// ════ 10) سعر جديد لا يغيّر الأشهر السابقة ════
const shamp = R({ items: [{ name: 'ROSEMARY SHAMPOO', qty: 2 }], delivered_at: '2026-09-08T10:00:00+03:00' });
const plusNov = [...history, { item_name: 'شامبو الروزماري', effective_from: '2026-11-01', sale_price_usd: 99, cost_usd: 50, ad_cost_usd: 0, shipping_cost_usd: 0, source: 'entered' }];
eq(tr(run([shamp], { historyRows: plusNov })).revenue, 20, '10: نسخة تشرين الثاني لا تغيّر أيلول');
eq(tr(run([R({ items: [{ name: 'ROSEMARY SHAMPOO', qty: 2 }], delivered_at: '2026-10-08T10:00:00+03:00' })], {}, '2026-10')).revenue, 24, '10: تشرين الأول بالسعر الجديد');
const may = R({ items: [{ name: 'ROSEMARY SHAMPOO', qty: 3 }], delivered_at: '2026-05-08T10:00:00+03:00', order_date: '2026-05-05T10:00:00+03:00' });
r = run([may], {}, '2026-05'); eq(tr(r).revenue, 30, '10: أيار: الإيراد الفعلي من قيمة الطلب'); eq(tr(r).productCost, 0, '10: ولا تكلفة مخترَعة قبل أول نسخة'); eq(tr(r).unpricedUnits, 3, '10: القطع ناقصة'); ok(tr(r).quality.status === 'partial', '10: جزئي');
const idx = buildVersionIndex([], [{ item_name: 'X', sale_price_usd: 3, cost_usd: 1, updated_at: '2026-08-17T10:00:00Z' }]);
ok(pickVersion(idx, 'x', '2026-07-01') === null && pickVersion(idx, 'x', '2026-08-01').source === 'legacy_backfill', '10: صنف بلا تاريخ: لا نسخة قبل شهر التحديث، وبعده موسوم legacy');

// ════ 11-14) المصاريف: المحاسبة مصدر رسمي ════
const channels = [
  { id: 'chSY', name_ar: 'بابل', kind: 'shipping', market: 'syria' }, { id: 'chNo', name_ar: 'الموتور', kind: 'shipping', market: null },
  { id: 'chAd', name_ar: 'إعلانات', kind: 'recurring', market: null }, { id: 'chPay', name_ar: 'رواتب + سلف', kind: 'expense', market: null },
];
const AE = (o) => ({ id: `a${++oid}`, entry_type: 'expense', category: 'شحن', channel_id: 'chNo', amount_usd: 0, amount_try: 0, amount_syp: 0, is_void: false, transfer_group: null, entry_date: '2026-09-10', ...o });
const fxSYP = [{ month: '2026-09-01', scope: 'all', currency: 'SYP', units_per_usd: 100, entered_at: '2026-09-30T00:00:00Z' }];
const one = [R({})];
const cash = AE({ category: 'رواتب + سلف', channel_id: 'chPay', amount_usd: 50 });
const tIn = AE({ entry_type: 'transfer', category: 'transfer_in', amount_usd: 500, transfer_group: 'g1' }), tOut = AE({ entry_type: 'transfer', category: 'transfer_out', amount_usd: 500, transfer_group: 'g1' });
const fake = AE({ category: 'تحويل من كاش ل شام كاش', amount_syp: 8000 });
r = run(one, { accountingEntries: [cash, tIn, tOut, fake], channels });
eq(r.company.expenses, 50, '11: المصروف النقدي فقط 50 (التحويلان لا يُحسبان)'); eq(r.skippedAccounting.transfer, 2, '11: ساقا التحويل مستبعدتان'); eq(r.skippedAccounting.suspected_transfer.length, 1, '11: «تحويل من كاش ل شام كاش» مستبعد ومعروض للمراجعة');
ok(classifyAccountingEntry(AE({ is_void: true }), {}).skip === 'void', '11: القيد الملغى مستبعد');
const acc1 = AE({ category: 'إعلانات', channel_id: 'chAd', amount_usd: 30 });
r = run(one, { accountingEntries: [acc1], channels, expenses: [E('all', 'حملات إعلانية', 30, { accounting_entry_id: acc1.id })] });
eq(r.company.expenses, 30, '12: يُحسب مرة واحدة (المحاسبة) رغم وجود نسخة يدوية مربوطة'); ok(hasIssue(r.company.quality, 'manual_duplicate'), '12: تحذير تكرار يدوي');
r = run(one, { accountingEntries: [acc1], channels, expenses: [E('all', 'حملات إعلانية', 30)] });
eq(r.company.expenses, 60, '12: غير المربوط يُحسب (لا نخمّن التكرار) — يلزم الربط الصريح');
const s1 = AE({ category: 'شحن', channel_id: 'chSY', amount_syp: 21940 });
r = run(one, { accountingEntries: [s1], channels });
eq(sy(r).expenses, 0, '13: بلا سعر صرف لا يدخل بالدولار'); eq(r.company.unconverted.SYP, 21940, '13: يبقى 21,940 ل.س بعملته'); ok(r.company.quality.status === 'partial' && hasIssue(r.company.quality, 'fx_missing'), '13: الربح جزئي بسبب غياب سعر الصرف');
eq(sy(r).shippingEstimated ? 1 : 0, 1, '13: تقدير الشحن لا يُلغى بمصروف غير محوَّل');
r = run(one, { accountingEntries: [s1], channels, fxRates: fxSYP });
eq(sy(r).expenses, 219.4, '13: مع سعر شهري مُدخَل 100 يتحوّل 21940/100'); eq(sy(r).shippingEstimated ? 1 : 0, 0, '13: المصروف الفعلي المحوَّل يلغي تقدير شحن سوريا'); eq(r.company.unconverted.SYP || 0, 0, '13: لا متبقٍّ');
r = run(one, { accountingEntries: [s1], channels, fxRates: [{ ...fxSYP[0], month: '2026-08-01' }] }); eq(sy(r).expenses, 0, '13: سعر شهر آخر لا يُستعمل');
r = run(one, { accountingEntries: [s1], channels, fxRates: [fxSYP[0], { ...fxSYP[0], units_per_usd: 200, entered_at: '2026-10-02T00:00:00Z' }] }); eq(sy(r).expenses, 109.7, '13: الأحدث إدخالاً يغلب (200)');
r = run(one, { accountingEntries: [s1], channels, fxRates: [{ ...fxSYP[0], scope: 'turkey' }] }); eq(sy(r).expenses, 0, '13: سعر نطاق تركيا لا يُطبَّق على سوريا');
const mot = AE({ category: 'الموتور', channel_id: 'chNo', amount_syp: 1000 }), mws = AE({ category: 'مواصلات', channel_id: null, amount_syp: 500 });
r = run(one, { accountingEntries: [mot, mws], channels, fxRates: fxSYP });
eq(sy(r).expenses + tr(r).expenses + ua(r).expenses, 0, '14: لا يُوزَّع على أي سوق'); eq(r.unallocated.usd, 15, '14: غير موزّع 1500/100 = 15'); eq(r.company.netProfit, tr(r).netProfit + sy(r).netProfit + ua(r).netProfit - 15, '14: يدخل بإجمالي الشركة فقط');
ok(hasIssue(r.company.quality, 'unallocated_expenses'), '14: تحذير مصروف غير موزّع');
r = run(one, { accountingEntries: [AE({ category: 'بابل', channel_id: 'chSY', amount_usd: 7 })], channels }); eq(sy(r).expenses, 7, '14: قناة market=syria تُنسب لسوريا');
r = run(one, { accountingEntries: [AE({ category: 'شحن', channel_id: 'chNo', amount_usd: 5 })], channels }); ok(hasIssue(r.company.quality, 'estimate_with_unallocated'), '14: تقدير مع فعلي غير موزّع يُحذَّر');

// ════ إلغاء تقدير الإعلان/الشحن لكل سوق ════
const three = [R({ market: 'syria' }), R({ market: 'turkey' }), R({ market: 'uae' })];
let q = run(three, { expenses: [E('syria', 'حملات إعلانية', 5)] });
eq(sy(q).adsEstimated ? 1 : 0, 0, 'إعلان سوريا يلغي سوريا'); eq(tr(q).adsEstimated ? 1 : 0, 1, 'ويُبقي تركيا'); eq(ua(q).adsEstimated ? 1 : 0, 1, 'ويُبقي الإمارات');
q = run(three, { expenses: [E('uae', 'سوشل ميديا', 5)] }); eq(ua(q).adsEstimated ? 1 : 0, 0, 'سوشل ميديا يلغي الإمارات'); eq(sy(q).adsEstimated ? 1 : 0, 1, 'ويُبقي سوريا');
q = run(three, { expenses: [E('all', 'أجور الشحن', 5)] }); eq(['syria', 'turkey', 'uae'].filter((m) => q.marketSummary[m].shippingEstimated).length, 0, 'شحن مشترك يلغي الثلاثة');
q = run(three, { expenses: [E('all', 'رواتب', 5), E('turkey', 'حملات إعلانية', 0)] }); eq(['syria', 'turkey', 'uae'].filter((m) => q.marketSummary[m].adsEstimated).length, 3, 'رواتب ومصروف 0 لا يلغيان');
// 15) ثبات إجمالي الشركة ومنع تكرار المشترك
q = run(three, { expenses: [E('all', 'رواتب', 6), E('turkey', 'رواتب', 3)] });
eq(q.sharedExpenses, 6, '15: المشترك 6 مرة واحدة'); eq(q.company.expenses, 9, '15: مصاريف الشركة = 6 + 3'); eq(q.company.netProfit, q.company.productProfit - 9, '15: صافي الشركة = أرباح الأصناف − مصاريف (بلا تكرار)');
eq(q.company.netProfit, sy(q).netProfit + tr(q).netProfit + ua(q).netProfit - 6, '15: = Σ الأسواق − المشترك');

// ════ 16) استمرار التحذيرات ════
r = run([R({ amount: 50, items: [{ name: 'منتج مجهول', qty: 2 }] }), R({ amount: 30, items: [] }), R({ status: 'settled', delivered_at: null, delivery_basis: 'unknown', amount: 1250, currency: 'SYP', order_date: '2026-09-09T10:00:00+03:00' })]);
ok(hasIssue(tr(r).quality, 'unmapped'), '16: اسم غير موحّد'); ok(hasIssue(tr(r).quality, 'missing_econ'), '16: منتج بلا سعر/تكلفة'); ok(hasIssue(tr(r).quality, 'no_items'), '16: مسلَّم بلا أصناف'); ok(hasIssue(tr(r).quality, 'settled_review'), '16: تسوية للمراجعة');
eq(r.unmapped.length, 1, '16: القائمة غير الموحّدة'); eq(tr(r).unpricedUnits, 2, '16: القطع الناقصة'); eq(tr(r).revenue, 80, '16: الإيراد الفعلي 50+30 (غير موزَّع على المنتجات)'); eq(tr(r).productCost, 0, '16: ولا تكلفة صفرية مخترَعة'); ok(hasIssue(tr(r).quality, 'unallocated_revenue'), '16: إيراد غير موزَّع ظاهر'); eq(tr(r).settledCollected.SYP, 1250, '16: التسوية بعملتها');
r = run(three); ok(hasIssue(r.company.quality, 'estimates'), 'تقدير الوحدة = تقديري'); ok(hasIssue(r.company.quality, 'packaging_missing') && !hasIssue(r.company.quality, 'legacy_unified_price'), 'التغليف الناقص يظهر ولا تحذير بسعر البيع (غير مطلوب)');
const MPF = (market) => ({ item_name: 'سيروم أ', market, effective_from: '2026-06-01', sale_price_usd: 20, cost_usd: null, shipping_cost_usd: null });
r = run(three, { marketPriceRows: ['syria', 'turkey', 'uae'].map(MPF), expenses: [E('all', 'حملات إعلانية', 1), E('all', 'أجور الشحن', 1), E('all', 'تغليف', 1), E('syria', 'رواتب', 0), E('turkey', 'رواتب', 0), E('uae', 'رواتب', 0)] });
ok(r.company.quality.status === 'final', 'بلا نواقص ولا تقديرات = نهائي (' + r.company.quality.issues.map((i) => i.code) + ')');
const hl = [...Array.from({ length: 6 }, (_, i) => ({ item_name: `P${i}`, effective_from: '2026-08-01', sale_price_usd: 8, cost_usd: 4, ad_cost_usd: 0, shipping_cost_usd: 0, source: 'legacy_backfill' })), { item_name: 'جل', effective_from: '2026-10-01', sale_price_usd: 1, cost_usd: 1, ad_cost_usd: 0, shipping_cost_usd: 0, source: 'legacy_backfill' }];
r = computeMonthly({ nameMapRows: [], historyRows: hl, expenses: [], month: '2026-10', orders: [R({ delivered_at: '2026-10-03T10:00:00+03:00', items: [{ name: 'P0', qty: 2 }, { name: 'جل', qty: 1 }] })] });
ok(r.reviewList.some((x) => x.name === 'P0' && x.reasons.some((s) => /نمط متكرر: 6/.test(s))), 'مراجعة: النمط 8/4 المتكرر مُدرَج بدليله'); ok(r.reviewList.some((x) => x.name === 'جل' && x.reasons.some((s) => /قيمة مشتبهة/.test(s))), 'مراجعة: 1/1 مشتبه');
ok(hasIssue(r.company.quality, 'legacy_prices'), 'تحذير تاريخ مستنتج من updated_at'); eq(r.reviewList.find((x) => x.name === 'P0').price, 8, 'لا تُغيَّر القيم (للعرض فقط)');
const snap = snapshotOf(run(three)); const later = snapshotOf(run(three, { expenses: [E('all', 'رواتب', 6)] }));
ok(diffSnapshot(snap, later).some((d) => d.field === 'expenses' && d.before === 0 && d.after === 6), 'فرق لقطة الإغلاق يُظهر المصاريف قبل/بعد'); ok(diffSnapshot(snap, snap).length === 0, 'لا فرق بلا تغيير');

// ════ نموذج مرجعي مستقل (حلقات بسيطة) على سيناريوهات عشوائية ════
let seed = 777; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff; const pick = (a) => a[Math.floor(rnd() * a.length)];
const P = { 'Serum A': [20, 8], 'ROSEMARY SHAMPOO': [10, 4] }; const MK = ['syria', 'turkey', 'uae'];
let mism = 0;
for (let i = 0; i < 200; i++) {
  const all = Array.from({ length: Math.floor(rnd() * 20) }, () => R({ market: pick(MK), status: pick(['delivered', 'delivered', 'settled']), delivered_at: pick(['2026-09-04T10:00:00+03:00', '2026-10-04T10:00:00+03:00', '2026-08-30T10:00:00+03:00']), items: [{ name: pick(Object.keys(P)), qty: 1 + Math.floor(rnd() * 3) }] }));
  const exp = Array.from({ length: Math.floor(rnd() * 3) }, () => E(pick([...MK, 'all']), pick(['رواتب', 'تغليف + أجور التغليف']), pick([1, 2.5])));
  const got = run(all, { expenses: exp, historyRows: history.map((h) => ({ ...h, ad_cost_usd: 0, shipping_cost_usd: 0 })) });
  const shared = exp.filter((e) => e.market === 'all').reduce((s, e) => s + e.amount_usd, 0); let sumNet = 0;
  for (const m of MK) {
    let net = 0; for (const o of all) if (o.market === m && o.status === 'delivered' && o.delivered_at.startsWith('2026-09')) { const [pr, co] = P[o.items[0].name]; net += (pr - co) * o.items[0].qty; }
    net -= exp.filter((e) => e.market === m).reduce((s, e) => s + e.amount_usd, 0); sumNet += net;
    if (Math.abs(got.marketSummary[m].netProfit - net) > 1e-9) mism++;
  }
  if (Math.abs(got.company.netProfit - (sumNet - shared)) > 1e-9) mism++;
}
eq(mism, 0, 'نموذج مرجعي: 200 سيناريو (تسليم بشهر، settled، مصاريف مشتركة وسوقية) بلا اختلاف');

const b = monthBounds('2026-12'); ok(b.from === '2026-12-01T00:00:00+03:00' && b.to === '2027-01-01T00:00:00+03:00', 'حدود ديسمبر');
eq(run([], {}, '2026-11').company.netProfit, 0, 'شهر فارغ = 0'); eq(run([], { expenses: [{ month: '2026-11-01', market: 'all', category: 'رواتب', amount_usd: 100 }] }, '2026-11').company.netProfit, -100, 'مصاريف بلا مبيعات = خسارة');

// ════ أسعار حسب السوق (مرجعية) + الإيراد الفعلي من قيمة الطلب ════
const MP2 = (market, from, price, cost = null, ship = null, item = 'سيروم أ') => ({ item_name: item, market, effective_from: from, sale_price_usd: price, cost_usd: cost, shipping_cost_usd: ship });
const rows3 = [MP2('syria', '2026-06-01', 25), MP2('turkey', '2026-06-01', 30), MP2('uae', '2026-06-01', 40)];
const FX = (cur, scope, rate, month = '2026-09-01') => ({ month, scope, currency: cur, units_per_usd: rate, entered_at: '2026-10-01T00:00:00Z' });
// الإيراد الأساسي = قيمة الطلب الفعلية (amount)، لا سعر الكتالوج × الكمية؛ والأخير مرجع تحليلي فقط
const m1 = run(three, { marketPriceRows: rows3 });
eq(sy(m1).revenue, 20, 'M1: إيراد سوريا = قيمة الطلب (20) لا سعر السوق المرجعي (25)'); eq(tr(m1).revenue, 20, 'M1: تركيا كذلك'); eq(ua(m1).revenue, 20, 'M1: الإمارات كذلك');
eq(sy(m1).referenceRevenue, 25, 'M1: المرجع التحليلي بسعر السوق (سوريا 25)'); eq(tr(m1).referenceRevenue, 30, 'M1: تركيا 30'); eq(ua(m1).referenceRevenue, 40, 'M1: الإمارات 40');
eq(m1.company.revenue, 60, 'M1: إيراد الشركة = مجموع الأسواق'); eq(m1.company.referenceRevenue, 95, 'M1: ومرجع الشركة = مجموع المراجع');
ok(sy(m1).productCost === 8 && tr(m1).productCost === 8, 'M1: التكلفة الموحّدة لم تتأثر بسعر البيع');
// تغيير سعر سوريا المرجعي لا يغيّر تركيا/الإمارات، ولا إيراد سوريا الفعلي
const m2 = run(three, { marketPriceRows: [MP2('syria', '2026-06-01', 99), MP2('turkey', '2026-06-01', 30), MP2('uae', '2026-06-01', 40)] });
eq(sy(m2).referenceRevenue, 99, 'M2: مرجع سوريا تغيّر'); eq(sy(m2).revenue, 20, 'M2: وإيراد سوريا الفعلي لم يتغيّر'); eq(tr(m2).referenceRevenue, 30, 'M2: مرجع تركيا ثابت'); eq(ua(m2).referenceRevenue, 40, 'M2: مرجع الإمارات ثابت');
// سعر تشرين الأول لا يغيّر أيلول (نتائج أيلول متطابقة حرفياً)
const octRows = [...rows3, MP2('syria', '2026-10-01', 50), MP2('turkey', '2026-10-01', 31)];
const sepBefore = run(three, { marketPriceRows: rows3 }, '2026-09'), sepAfter = run(three, { marketPriceRows: octRows }, '2026-09');
ok(JSON.stringify(sepBefore.marketSummary) === JSON.stringify(sepAfter.marketSummary) && JSON.stringify(sepBefore.company) === JSON.stringify(sepAfter.company), 'M3: أيلول متطابق حرفياً قبل/بعد إضافة سعر تشرين الأول');
const octThree = three.map((o) => ({ ...o, delivered_at: '2026-10-08T10:00:00+03:00', order_date: '2026-10-05T10:00:00+03:00', amount: 20 }));
const o1 = run(octThree, { marketPriceRows: octRows }, '2026-10');
eq(sy(o1).referenceRevenue, 50, 'M3: مرجع تشرين الأول الجديد'); eq(tr(o1).referenceRevenue, 31, 'M3: تركيا تشرين الأول'); eq(ua(o1).referenceRevenue, 40, 'M3: الإمارات ترث آخر سعر لها'); eq(sy(o1).revenue, 20, 'M3: والإيراد الفعلي من الطلب');
// التكلفة التاريخية لا تتغير بتغيير سعر البيع وحده
const costRows = [MP2('syria', '2026-06-01', 25, 5), MP2('syria', '2026-10-01', 50, null)];
const c9 = run([R({ market: 'syria' })], { marketPriceRows: costRows }, '2026-09');
const c10 = run([R({ market: 'syria', order_date: '2026-10-05T10:00:00+03:00', delivered_at: '2026-10-08T10:00:00+03:00' })], { marketPriceRows: costRows }, '2026-10');
eq(sy(c9).productCost, 5, 'M5: تكلفة أيلول = تكلفة السوق 5'); eq(sy(c10).productCost, 5, 'M5: تغيير سعر تشرين الأول وحده لم يغيّر التكلفة');
// سوق بلا سعر مرجعي: لا يستعير سعر سوق آخر؛ الإيراد يبقى فعلياً غير موزَّع على المنتجات
const NI = 'صنف-جديد-ZZ';
const only = [MP2('turkey', '2026-06-01', 30, 10, null, NI)];
const sOrd = R({ market: 'syria', amount: 70, items: [{ name: NI, qty: 2 }] }), tOrd = R({ market: 'turkey', amount: 55, items: [{ name: NI, qty: 2 }] });
const m6 = run([sOrd, tOrd], { marketPriceRows: only });
eq(sy(m6).revenue, 70, 'M6: إيراد سوريا فعلي رغم غياب سعرها المرجعي'); eq(sy(m6).unallocatedRevenue, 0, 'M6: يوزَّع بالقطع على المنتجات (لا حاجة لسعر بيع)'); eq(sy(m6).referenceRevenue, 0, 'M6: لا مرجع لسوريا');
ok(hasIssue(sy(m6).quality, 'missing_econ') && !hasIssue(sy(m6).quality, 'unallocated_revenue'), 'M6/7: تحذير التكلفة الناقصة ظاهر ولا تحذير توزيع'); eq(sy(m6).unpricedUnits, 2, 'M6: قطعتا سوريا بلا تكلفة');
eq(tr(m6).revenue, 55, 'M6: تركيا إيرادها الفعلي 55'); eq(tr(m6).referenceRevenue, 60, 'M6: ومرجعها 2×30'); eq(tr(m6).productCost, 20, 'M6: وتكلفة السوق 2×10'); eq(tr(m6).unallocatedRevenue, 0, 'M6: موزَّع بالكامل');
const ptRow = m6.priceTable.find((x) => x.name === NI);
ok(!!ptRow && ptRow.markets.syria.status === 'missing' && ptRow.markets.uae.status === 'missing' && ['current', 'historical'].includes(ptRow.markets.turkey.status), 'M7: جدول الأسعار يوسم الناقص والمعتمد');
const m6b = run([R({ market: 'syria', amount: 18 })], { marketPriceRows: [MP2('turkey', '2026-06-01', 30)] });
eq(sy(m6b).referenceRevenue, 0, 'M6b: لا مرجع لسوريا: لا يُستعار سعر تركيا ولا يدخل السعر الموحّد القديم'); ok(m6b.products[0].priceBasis === 'legacy_unified', 'M6b: أساس السعر موسوم');
const pAug = run(three, { marketPriceRows: rows3, nowMonth: '2026-10-01' }, '2026-09'); ok(pAug.products.every((p) => p.priceStatus === 'historical'), 'M8: سعر شهر سابق = تاريخي موثّق');
const pNow = run(octThree, { marketPriceRows: rows3, nowMonth: '2026-10-01' }, '2026-10'); ok(pNow.products.every((p) => p.priceStatus === 'current'), 'M8: سعر الشهر الحالي = حالي');

// ── قيمة الطلب الفعلية: خصم، عدة منتجات، تحويل العملة ──
const disc = run([R({ market: 'syria', amount: 18 })]);
eq(sy(disc).revenue, 18, 'X1: خصم → الإيراد 18 لا 20'); eq(sy(disc).referenceRevenue, 0, 'X1: لا مرجع بلا سعر سوق مُدخَل'); eq(run([R({ market: 'syria', amount: 18 })], { marketPriceRows: [MP2('syria', '2026-06-01', 20)] }).marketSummary.syria.referenceRevenue, 20, 'X1: المرجع 20 حين يُدخَل سعر للسوق'); eq(disc.products[0].revenue, 18, 'X1: صف المنتج يأخذ الإيراد الفعلي');
const multi = run([R({ market: 'turkey', amount: 24, items: [{ name: 'ROSEMARY SHAMPOO', qty: 1 }, { name: 'Serum A', qty: 1 }] })]);
const mp = Object.fromEntries(multi.products.map((p) => [p.name, p]));
eq(mp['شامبو الروزماري'].revenue, 12, 'X2: توزيع 24 بالقطع (1:1) → 12'); eq(mp['سيروم أ'].revenue, 12, 'X2: → 12'); eq(tr(multi).revenue, 24, 'X2: إيراد السوق = قيمة الطلب'); eq(tr(multi).unallocatedRevenue, 0, 'X2: موزَّع');
const noItems = run([R({ market: 'turkey', amount: 33, items: [] })]);
eq(tr(noItems).revenue, 33, 'X3: طلب بلا أصناف: الإيراد فعلي'); eq(tr(noItems).unallocatedRevenue, 33, 'X3: غير موزَّع على المنتجات'); ok(hasIssue(tr(noItems).quality, 'no_items'), 'X3: ويظهر تحذير بلا أصناف');
// تحويل العملة بسعر شهري معتمد لكل سوق
const sypOrd = R({ market: 'syria', amount: 1000, currency: 'SYP' });
const withFx = run([sypOrd], { fxRates: [FX('SYP', 'syria', 100)] });
eq(sy(withFx).revenue, 10, 'X4: 1000 SYP ÷ 100 = 10$'); eq(sy(withFx).revenueByCurrency.SYP, 1000, 'X4: الأصل بعملته محفوظ');
const fxAll = run([sypOrd], { fxRates: [FX('SYP', 'all', 200), FX('SYP', 'syria', 100)] }); eq(sy(fxAll).revenue, 10, 'X4: سعر السوق يتقدّم على سعر "الكل"');
const fxOnlyAll = run([sypOrd], { fxRates: [FX('SYP', 'all', 200)] }); eq(sy(fxOnlyAll).revenue, 5, 'X4: وإلا سعر "الكل"');
const noFx = run([sypOrd]);
eq(sy(noFx).revenue, 0, 'X5: بلا سعر صرف → لا إيراد'); eq(sy(noFx).productCost, 0, 'X5: ولا تكلفة (لا ربح بنصف البيانات)'); eq(sy(noFx).revenueNoFx.byCurrency.SYP, 1000, 'X5: يبقى 1000 SYP معروضاً بعملته'); eq(sy(noFx).units, 1, 'X5: القطعة تُعدّ مسلَّمة');
ok(hasIssue(sy(noFx).quality, 'revenue_fx_missing') && sy(noFx).quality.status === 'partial', 'X5: جزئي وبتحذير الصرف'); eq(noFx.revenueGaps.length, 1, 'X5: ويظهر الطلب بقائمة الفجوات');
const wrongMonth = run([sypOrd], { fxRates: [FX('SYP', 'syria', 100, '2026-10-01')] }); eq(sy(wrongMonth).revenue, 0, 'X5: سعر شهر آخر لا يُستعمل');
const aed = run([R({ market: 'uae', amount: 367, currency: 'AED' })], { fxRates: [FX('AED', 'uae', 3.67)] }); eq(ua(aed).revenue, 100, 'X6: 367 AED ÷ 3.67 = 100');
const tryO = run([R({ market: 'turkey', amount: 300, currency: 'TRY' })], { fxRates: [FX('TRY', 'turkey', 30)] }); eq(tr(tryO).revenue, 10, 'X6: 300 TRY ÷ 30 = 10');
const zero = run([R({ market: 'turkey', amount: 0 })]); eq(tr(zero).revenue, 0, 'X7: قيمة صفرية لا إيراد'); ok(hasIssue(tr(zero).quality, 'revenue_missing') && tr(zero).quality.status === 'partial', 'X7: جزئي');
const nocur = run([R({ market: 'turkey', amount: 50, currency: null })]); ok(hasIssue(tr(nocur).quality, 'revenue_missing'), 'X7: عملة غير مسجَّلة تُعامل كناقصة');
// المعلّق والملغى لا يُحسبان
const notSales = run([R({ status: 'pending', delivered_at: null, delivery_basis: 'unknown' }), R({ status: 'cancelled', delivered_at: null, delivery_basis: 'unknown' }), R({ status: 'returning', delivered_at: null, delivery_basis: 'unknown' })]);
eq(tr(notSales).revenue, 0, 'X8: معلّق/ملغى/راجع لا إيراد'); eq(tr(notSales).orders, 0, 'X8: ولا طلبات مسلَّمة');
// المرتجع بعد التسليم يخصم القيمة الفعلية بسعر صرف شهر التسليم
const dl = R({ market: 'syria', amount: 1000, currency: 'SYP', status: 'returned', delivered_before_return: true, delivered_at: '2026-09-10T10:00:00+03:00', return_at: '2026-10-05T10:00:00+03:00' });
const fxBoth = [FX('SYP', 'syria', 100, '2026-09-01'), FX('SYP', 'syria', 125, '2026-10-01')];
const rSep = run([dl], { fxRates: fxBoth }, '2026-09'), rOct = run([dl], { fxRates: fxBoth }, '2026-10');
eq(sy(rSep).revenue, 10, 'R1: بيع أيلول 1000/100'); eq(sy(rOct).returns.revenueReduction, 10, 'R1: الخصم بتشرين الأول بسعر شهر التسليم (100) لا سعر تشرين الأول (125)'); eq(sy(rOct).revenue, 0, 'R1: لا إيراد جديد بتشرين الأول');
const rNoFx = run([dl], { fxRates: [FX('SYP', 'syria', 125, '2026-10-01')] }, '2026-10'); eq(sy(rNoFx).returns.revenueReduction, 0, 'R2: لا سعر لشهر التسليم → لا خصم مخمَّن'); ok(hasIssue(sy(rNoFx).quality, 'return_fx_missing') && sy(rNoFx).quality.status === 'partial', 'R2: جزئي بتحذير المرتجع');
// المصاريف المشتركة تُطرح من صافي الشركة فقط
const sh = run([R({ market: 'syria', amount: 100 })], { expenses: [E('all', 'رواتب', 30)] });
eq(sy(sh).netProfit, sy(sh).productProfit, 'N1: صافي السوق لا يتأثر بالمشترك'); eq(sh.company.netProfit, sh.company.productProfit - 30, 'N1: صافي الشركة يطرح المشترك');
// ── مثال المالك: 500 طلب، إيراد فعلي 5000$، 100 قطعة من منتج تكلفته 3$ بسوريا ──
const hist500 = [...history, { item_name: 'P500', effective_from: '2026-06-01', sale_price_usd: 10, cost_usd: 3, ad_cost_usd: 0, shipping_cost_usd: 0, source: 'entered' }, { item_name: 'Q500', effective_from: '2026-06-01', sale_price_usd: 10, cost_usd: 2, ad_cost_usd: 0, shipping_cost_usd: 0, source: 'entered' }];
const mkO = (item, i) => R({ market: 'syria', amount: 1000, currency: 'SYP', items: [{ name: item, qty: 1 }], order_code: `E${i}` });
const ordersA = [...Array.from({ length: 100 }, (_, i) => mkO('P500', i)), ...Array.from({ length: 400 }, (_, i) => mkO('Q500', 100 + i))];
const exA = computeMonthly({ ...base, historyRows: hist500, orders: ordersA, month: '2026-09', fxRates: [FX('SYP', 'syria', 100)] });
eq(sy(exA).orders, 500, 'E1: 500 طلب'); eq(sy(exA).revenue, 5000, 'E1: الإيراد الفعلي 5000$ (500×1000 SYP ÷ 100)'); eq(sy(exA).units, 500, 'E1: القطع');
const pP = exA.products.find((p) => p.name === 'P500'), pQ = exA.products.find((p) => p.name === 'Q500');
eq(pP.productCost, 300, 'E1: 100 قطعة × 3$ = 300'); eq(pQ.productCost, 800, 'E1: 400 × 2$'); eq(sy(exA).productCost, 1100, 'E1: تكلفة السوق 1100'); eq(sy(exA).productProfit, 3900, 'E1: ربح المنتجات 5000−1100 = 3900');
const ordersB = [...Array.from({ length: 100 }, (_, i) => mkO('P500', i)), ...Array.from({ length: 400 }, (_, i) => mkO('Z500', 100 + i))];
const exB = computeMonthly({ ...base, historyRows: hist500, orders: ordersB, month: '2026-09', fxRates: [FX('SYP', 'syria', 100)] });
eq(sy(exB).revenue, 5000, 'E2: الإيراد 5000$'); eq(sy(exB).productCost, 300, 'E2: تكلفة المنتج المعروفة فقط 100×3'); eq(sy(exB).productProfit, 4700, 'E2: 5000−300'); eq(sy(exB).unpricedUnits, 400, 'E2: 400 قطعة بلا تكلفة ظاهرة');
ok(sy(exB).quality.status === 'partial' && hasIssue(sy(exB).quality, 'missing_econ'), 'E2: ليس نهائياً بسبب التكلفة الناقصة');
const exNoFx = computeMonthly({ ...base, historyRows: hist500, orders: ordersA, month: '2026-09' });
eq(sy(exNoFx).revenue, 0, 'E3: بلا سعر صرف لا يُعرض إيراد'); eq(sy(exNoFx).revenueNoFx.orders, 500, 'E3: 500 طلب بانتظار سعر الصرف'); eq(sy(exNoFx).revenueNoFx.byCurrency.SYP, 500000, 'E3: 500,000 SYP بعملتها'); ok(sy(exNoFx).quality.status === 'partial', 'E3: ليس نهائياً');
// الصافي لا يكون نهائياً إذا نقص أي شيء
ok(['partial', 'estimated'].includes(exA.company.quality.status), 'E4: الشركة ليست نهائية (التغليف/المصاريف ناقصة)');
// المصاريف الفعلية لا تُحتسب مرتين + التغليف
const chans = [{ id: 'chS', market: 'syria', kind: 'expense', name_ar: 'ق' }];
const packEntry = { id: 'a1', entry_type: 'expense', category: 'تغليف', amount_usd: 5, amount_try: 0, amount_syp: 0, channel_id: 'chS', is_void: false };
const k1 = run([R({ market: 'syria' })], { marketPriceRows: rows3, accountingEntries: [packEntry], channels: chans });
eq(sy(k1).expensesByCategory['تغليف'], 5, 'P1: تغليف مسجّل بالمحاسبة يظهر ضمن الفعلي'); ok(!hasIssue(k1.company.quality, 'packaging_missing'), 'P1: لا تحذير ناقص حين يوجد قيد');
const k2 = run([R({ market: 'syria' })], { marketPriceRows: rows3, accountingEntries: [packEntry], channels: chans, expenses: [E('syria', 'تغليف', 5, { accounting_entry_id: 'a1' })] });
eq(sy(k2).expensesByCategory['تغليف'], 5, 'P2: المصروف اليدوي المربوط بالقيد لا يُحتسب ثانية'); ok(hasIssue(k2.company.quality, 'manual_duplicate'), 'P2: يُعلَن التجاهل');
ok(hasIssue(run(three, { marketPriceRows: rows3 }).company.quality, 'packaging_missing'), 'P3: لا قيد ولا تكلفة وحدة → التغليف ناقص ظاهر');
// المرتجع لا يضيف تغليفاً ولا يعدّل المخزون: مدخلات مجمَّدة بعمق
const deepFreeze = (x) => { if (x && typeof x === 'object' && !Object.isFrozen(x)) { Object.freeze(x); Object.values(x).forEach(deepFreeze); } return x; };
const retIn = deepFreeze({ orders: [R({ status: 'returned', delivered_before_return: true, return_at: '2026-09-20T10:00:00+03:00', restock_qty: 0, reserve_qty: 1, items: [{ name: 'Serum A', qty: 1 }] })], marketPriceRows: rows3 });
let thrown = null, rr = null; try { rr = run(retIn.orders, { marketPriceRows: retIn.marketPriceRows }); } catch (e) { thrown = e; }
ok(!thrown, 'S1: حساب المرتجع لا يعدّل أي مدخل (لا كتابة على حركات المخزون)'); ok(!!rr && tr(rr).returns.assumedRestockCost === 8, 'S1: الافتراض محاسبي فقط (assumedRestockCost=8)');
ok(retIn.orders[0].restock_qty === 0, 'S1: restock_qty الأصلي لم يتغير');
const retPack = run(retIn.orders, { marketPriceRows: rows3, accountingEntries: [packEntry], channels: chans });
eq(tr(retPack).expensesByCategory['تغليف'] || 0, 0, 'P4: المرتجع لا يضيف تغليفاً من عنده'); eq(sy(retPack).expensesByCategory['تغليف'], 5, 'P4: التغليف الفعلي يُحتسب مرة واحدة فقط');
// مجموع الأسواق = الشركة مع قاعدة العملات المعتمدة
const q2 = run(three, { marketPriceRows: rows3, expenses: [E('syria', 'تغليف', 2), E('all', 'رواتب', 3)], accountingEntries: [{ id: 'z1', entry_type: 'expense', category: 'أجور', amount_usd: 0, amount_try: 0, amount_syp: 500, channel_id: 'chS', is_void: false }], channels: chans, fxRates: [FX('SYP', 'all', 100)] });
eq(q2.company.netProfit, sy(q2).netProfit + tr(q2).netProfit + ua(q2).netProfit - 3, 'M9: الشركة = Σ الأسواق − المشترك بعد تطبيق سعر الصرف المعتمد'); eq(sy(q2).expensesByCategory['أجور'], 5, 'M9: 500 SYP ÷ 100 = 5$');


// ════ معنى قيمة الطلب: خصم + أجور توصيل + دفع جزئي (amount = قيمة البضاعة لا المحصَّل ولا أجور التوصيل) ════
const dOrd = R({ market: 'syria', amount: 90, shipping_payer: 'customer', delivery_cost: 10, payment_status: 'unpaid' });
const dRun = run([dOrd]);
eq(sy(dRun).revenue, 90, 'D1: أجور التوصيل على العميل لا تُضاف للإيراد (amount فقط)'); eq(sy(dRun).customerDeliveryFees.USD, 10, 'D1: وتُعرض معلومةً منفصلة'); eq(sy(dRun).referenceRevenue, 0, 'D1: لا مرجع بلا سعر سوق');
const cOrd = run([R({ market: 'syria', amount: 90, shipping_payer: 'company', delivery_cost: 7 })]);
eq(sy(cOrd).revenue, 90, 'D2: أجور توصيل على الشركة: لا تغيّر الإيراد'); eq(Object.keys(sy(cOrd).customerDeliveryFees).length, 0, 'D2: ولا تُعدّ محصّلة من العميل'); eq(sy(cOrd).expenses, 0, 'D2: ولا تدخل مصروفاً (delivery_cost معلومة فقط)');
const pOrd = run([R({ market: 'syria', amount: 90, payment_status: 'partial', paid_amount: 40 })]);
eq(sy(pOrd).revenue, 90, 'D3: الدفع الجزئي لا يخفّض الإيراد (القيمة كاملة)'); eq(sy(pOrd).partialPayment.orders, 1, 'D3: يُعرض كمعلومة'); eq(sy(pOrd).partialPayment.byCurrency.USD, 40, 'D3: المدفوع مقدَّماً 40');
const dscM = run([R({ market: 'turkey', amount: 27, items: [{ name: 'ROSEMARY SHAMPOO', qty: 1 }, { name: 'Serum A', qty: 1 }], shipping_payer: 'customer', delivery_cost: 5 })]);
eq(tr(dscM).revenue, 27, 'D4: خصم على عدة منتجات + توصيل: الإيراد 27 فقط'); const dp = Object.fromEntries(dscM.products.map((p) => [p.name, p.revenue])); eq(dp['شامبو الروزماري'], 13.5, 'D4: توزيع 27 بالقطع → 13.5'); eq(dp['سيروم أ'], 13.5, 'D4: → 13.5');
// خصم أكبر من المرجع (سعر أعلى من المرجع) لا يكسر شيئاً
eq(run([R({ market: 'turkey', amount: 45 })]).marketSummary.turkey.revenue, 45, 'D5: قيمة أعلى من المرجع تُقبل كما هي');

// ════ عزل سوريا: سعر/تكلفة سوريا لا يؤثران على تركيا والإمارات ════
const isoOrders = [R({ market: 'syria', amount: 20 }), R({ market: 'turkey', amount: 20 }), R({ market: 'uae', amount: 20 })];
const isoBase = run(isoOrders, { marketPriceRows: [MP2('turkey', '2026-06-01', 30, 6), MP2('uae', '2026-06-01', 40, 7)], expenses: [E('syria', 'رواتب', 1), E('turkey', 'رواتب', 1), E('uae', 'رواتب', 1)] });
const isoSyria = run(isoOrders, { marketPriceRows: [MP2('syria', '2026-06-01', 99, 1), MP2('turkey', '2026-06-01', 30, 6), MP2('uae', '2026-06-01', 40, 7)], expenses: [E('syria', 'رواتب', 1), E('turkey', 'رواتب', 1), E('uae', 'رواتب', 1)] });
ok(JSON.stringify(isoBase.marketSummary.turkey) === JSON.stringify(isoSyria.marketSummary.turkey), 'I1: تغيير سعر وتكلفة سوريا لم يغيّر أي رقم لتركيا (تطابق حرفي)');
ok(JSON.stringify(isoBase.marketSummary.uae) === JSON.stringify(isoSyria.marketSummary.uae), 'I1: ولا للإمارات (تطابق حرفي)');
ok(isoBase.marketSummary.syria.productCost !== isoSyria.marketSummary.syria.productCost, 'I1: بينما تغيّرت سوريا نفسها (الاختبار حسّاس)'); eq(isoSyria.marketSummary.syria.productCost, 1, 'I1: تكلفة سوريا الخاصة 1');
eq(isoSyria.marketSummary.turkey.productCost, 6, 'I1: تكلفة تركيا الخاصة 6 لم تتأثر'); eq(isoSyria.marketSummary.uae.productCost, 7, 'I1: تكلفة الإمارات الخاصة 7');

// ════ الرواتب: يدوي لكل سوق يحلّ محل المحاسبة ولا يُجمع معها ════
const chP = [{ id: 'chS', market: 'syria', kind: 'expense', name_ar: 'ق' }, { id: 'chT', market: 'turkey', kind: 'expense', name_ar: 'ت' }];
const accPay = (id, ch, syp) => ({ id, entry_type: 'expense', category: 'رواتب + سلف', amount_usd: 0, amount_try: 0, amount_syp: syp, channel_id: ch, is_void: false });
const fx100 = [FX('SYP', 'all', 100)];
const onlyAcc = run([R({ market: 'syria', amount: 20 })], { accountingEntries: [accPay('p1', 'chS', 500)], channels: chP, fxRates: fx100 });
eq(sy(onlyAcc).expensesByCategory['رواتب + سلف'], 5, 'Y1: بلا إدخال يدوي تُقرأ رواتب المحاسبة (5$)'); ok(hasIssue(sy(onlyAcc).quality, 'payroll_from_accounting') && sy(onlyAcc).quality.status !== 'final', 'Y1: وتُوسَم مؤقتة (تقديري)');
const withManual = run([R({ market: 'syria', amount: 20 })], { accountingEntries: [accPay('p1', 'chS', 500)], channels: chP, fxRates: fx100, expenses: [E('syria', 'رواتب', 20)] });
eq(sy(withManual).expenses, 20, 'Y2: الراتب اليدوي 20 يحلّ محل رواتب المحاسبة (لا 25)'); eq(withManual.payroll.syria.overridden, 5, 'Y2: المُستبعَد من المحاسبة 5 معروض'); eq(withManual.payrollOverridden.length, 1, 'Y2: قائمة المستبعَد'); ok(!hasIssue(sy(withManual).quality, 'payroll_from_accounting'), 'Y2: لا وسم مؤقت');
const otherMarket = run([R({ market: 'syria', amount: 20 }), R({ market: 'turkey', amount: 20 })], { accountingEntries: [accPay('p1', 'chT', 500)], channels: chP, fxRates: fx100, expenses: [E('syria', 'رواتب', 20)] });
eq(tr(otherMarket).expenses, 5, 'Y3: راتب سوريا اليدوي لا يستبعد رواتب تركيا بالمحاسبة'); eq(sy(otherMarket).expenses, 20, 'Y3: سوريا 20');
const zeroManual = run([R({ market: 'turkey', amount: 20 })], { expenses: [E('turkey', 'رواتب', 0)] }); ok(!hasIssue(tr(zeroManual).quality, 'payroll_missing'), 'Y4: صفر مُدخَل صراحةً = لا نقص');
const noPay = run([R({ market: 'turkey', amount: 20 })]); ok(hasIssue(tr(noPay).quality, 'payroll_missing') && tr(noPay).quality.status === 'partial', 'Y5: سوق فيه نشاط بلا رواتب = ناقص (جزئي)'); ok(!hasIssue(ua(noPay).quality, 'payroll_missing'), 'Y5: سوق بلا نشاط لا يُطالَب برواتب');
const sharedPay = run([R({ market: 'turkey', amount: 20 })], { expenses: [E('all', 'رواتب', 9)] }); ok(!hasIssue(tr(sharedPay).quality, 'payroll_missing'), 'Y6: راتب مشترك يُسقط النقص'); eq(sharedPay.company.netProfit, tr(sharedPay).netProfit - 9, 'Y6: ويُطرح من صافي الشركة فقط');

// ════ ثغرات كشفها اختبار الطفرات ════
// بداية الشهر شاملة: تسليم عند 00:00:00 تماماً يُحسب بذلك الشهر
const firstSec = run([R({ market: 'turkey', amount: 20, delivered_at: '2026-10-01T00:00:00+03:00', order_date: '2026-09-28T10:00:00+03:00' })], {}, '2026-10');
eq(tr(firstSec).orders, 1, 'B1: تسليم عند 00:00:00 من أول الشهر يُحسب بذلك الشهر (البداية شاملة)');
eq(run([R({ market: 'turkey', amount: 20, delivered_at: '2026-10-01T00:00:00+03:00' })], {}, '2026-09').marketSummary.turkey.orders, 0, 'B1: وليس بالشهر السابق');
// تحويل داخلي: يُحصى كتحويل لا كمصروف
const trEntry = { id: 'tx1', entry_type: 'transfer', category: 'تحويل بين محافظ', amount_usd: 50, amount_try: 0, amount_syp: 0, channel_id: null, is_void: false };
const trRun = run([R({ market: 'turkey', amount: 20 })], { accountingEntries: [trEntry] });
eq(trRun.skippedAccounting.transfer, 1, 'B2: قيد من نوع transfer يُصنَّف تحويلاً داخلياً'); eq(trRun.company.expenses, 0, 'B2: ولا يدخل المصاريف');
// سوق الطلب غير معروف: لا يُسند لسوريا ولا لغيرها
const unkMkt = run([R({ market: 'ksa', amount: 77 }), R({ market: null, amount: 33 })]);
eq(sy(unkMkt).revenue, 0, 'B3: سوق غير معروف لا يُسند لسوريا'); eq(tr(unkMkt).revenue, 0, 'B3: ولا لتركيا'); eq(ua(unkMkt).revenue, 0, 'B3: ولا للإمارات'); eq(unkMkt.marketSummary.unknown.revenue, 110, 'B3: يبقى ضمن «غير محدد» ظاهراً');
// البراند: lowes لا يحوي سترونغ والعكس
const nmBrand = [...nameMap, { alias_name: 'Strong X', canonical_name: 'ستونغ إكس', brand: 'strong', is_active: true }];
const brandOrd = [R({ market: 'turkey', amount: 20 }), R({ market: 'turkey', amount: 50, items: [{ name: 'Strong X', qty: 1 }] })];
eq(tr(run(brandOrd, { nameMapRows: nmBrand, brand: 'lowes' })).units, 1, 'B4: براند lowes يستبعد منتجات سترونغ'); eq(tr(run(brandOrd, { nameMapRows: nmBrand, brand: 'strong' })).units, 1, 'B4: براند strong يستبعد lowes'); eq(tr(run(brandOrd, { nameMapRows: nmBrand, brand: 'all' })).units, 2, 'B4: الكل يشمل الاثنين');

// ════ تكلفة فقط: التوزيع بالقطع، حالة التكلفة بالسوق، الأصل بالكتالوج، كمية مشبوهة ════
const kq2 = run([R({ market: 'turkey', amount: 30, items: [{ name: 'ROSEMARY SHAMPOO', qty: 2 }, { name: 'Serum A', qty: 1 }] })]);
const kq2p = Object.fromEntries(kq2.products.map((p) => [p.name, p.revenue])); eq(kq2p['شامبو الروزماري'], 20, 'K1: التوزيع بنسبة الكمية 2:1 → 20'); eq(kq2p['سيروم أ'], 10, 'K1: → 10'); eq(tr(kq2).revenue, 30, 'K1: مجموع الإيراد = قيمة الطلب');
const hugeQty = run([R({ market: 'turkey', amount: 50, items: [{ name: 'Serum A', qty: 100959260 }] })]);
eq(tr(hugeQty).units, 1, 'K2: كمية 100 مليون (خطأ إدخال) تُعدّ قطعة واحدة'); eq(tr(hugeQty).productCost, 8, 'K2: ولا تتضخّم التكلفة'); ok(hasIssue(tr(hugeQty).quality, 'qty_suspect') && tr(hugeQty).quality.status === 'partial', 'K2: جزئي بتحذير الكمية المشبوهة');
const costTbl = run([R({ market: 'syria', amount: 20 })], { marketPriceRows: [{ item_name: 'سيروم أ', market: 'turkey', effective_from: '2026-06-01', sale_price_usd: null, cost_usd: 5, shipping_cost_usd: null }], catalogNames: ['سيروم أ'] });
const ctRow = costTbl.priceTable.find((x) => x.name === 'سيروم أ');
ok(ctRow.markets.turkey.costStatus === 'market' && ctRow.markets.turkey.cost === 5, 'K3: تكلفة خاصة بتركيا (5) موسومة market'); ok(ctRow.markets.syria.costStatus === 'unified' && ctRow.markets.syria.cost === 8, 'K3: سوريا ترث الموحّدة (8)'); ok(ctRow.markets.uae.costStatus === 'unified' && ctRow.markets.uae.cost === 8, 'K3: الإمارات ترث الموحّدة (8) ولا تتأثر بتركيا');
ok(ctRow.inCatalog === true, 'K4: صنف بالكتالوج');
const orphan = run([R({ market: 'syria', amount: 20 })], { catalogNames: ['شيء آخر'] }); ok(orphan.priceTable.find((x) => x.name === 'سيروم أ').inCatalog === false, 'K4: صنف بلا أصل بالكتالوج يُوسَم false');
const noCost = run([R({ market: 'syria', amount: 20, items: [{ name: 'صنف-بلا-تكلفة', qty: 1 }] })], { marketPriceRows: [{ item_name: 'صنف-بلا-تكلفة', market: 'syria', effective_from: '2026-06-01', sale_price_usd: 9, cost_usd: null, shipping_cost_usd: null }] });
eq(sy(noCost).unpricedUnits, 1, 'K5: سعر بيع بلا تكلفة لا يكفي — التكلفة ناقصة'); ok(noCost.priceTable.find((x) => x.name === 'صنف-بلا-تكلفة').markets.syria.costStatus === 'missing', 'K5: حالة التكلفة ناقصة');

// ════ العلامة (لويز/سترونغ) من الطلب نفسه ════
const bL = R({ market: 'turkey', amount: 40, brand: 'lowes' }), bS = R({ market: 'turkey', amount: 90, brand: 'strong', items: [{ name: 'Ginseng (3)+SUPER(1)', qty: 1 }] }), bN = R({ market: 'turkey', amount: 10, brand: null });
const brL = run([bL, bS, bN], { brand: 'lowes' }), brS = run([bL, bS, bN], { brand: 'strong' }), brA = run([bL, bS, bN], { brand: 'all' });
eq(tr(brL).revenue, 50, 'BR1: لويز = طلب لويز (40) + طلب بلا علامة (10) فقط — طلب سترونغ مستبعد'); eq(tr(brL).orders, 2, 'BR1: طلبان');
eq(tr(brS).revenue, 90, 'BR2: سترونغ = 90 فقط'); eq(tr(brS).orders, 1, 'BR2: طلب واحد');
eq(tr(brA).revenue, 140, 'BR3: الكل = 140');
eq(brL.brandExcluded.turkey, 1, 'BR4: يُعلَن عدد المستبعد (1)'); eq(Object.keys(brA.brandExcluded).length, 0, 'BR4: لا استبعاد مع «الكل»');
ok(!brL.products.some((p) => /Ginseng/.test(p.name)), 'BR5: اسم سترونغ الحر لا يظهر كمنتج لويز');
eq(brL.marketSummary.turkey.unmappedUnits, 0, 'BR6: اسم سترونغ غير الموحَّد لا يُحسب «غير موحَّد» بعرض لويز');eq(brS.marketSummary.turkey.unmappedUnits, 1, 'BR6: ويظهر بعرض سترونغ');

console.log(`\n${pass} نجح · ${fail} فشل`);
process.exit(fail ? 1 : 0);
