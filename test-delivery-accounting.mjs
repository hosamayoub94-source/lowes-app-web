// اختبار منطق الفترة بتاريخ التسليم — node test-delivery-accounting.mjs
import fs from 'node:fs';
import { FINANCE_CONFIRMED_AFFECTS_PAYROLL, deliveryEntry, periodBounds, selectDeliveredInPeriod, selectUndelivered, buildReport, buildProductLines, buildPayrollIndex, applyFilters, toUsd, NON_ACCOUNTING_STATUSES, exportSheets, describeLoadError, pickPayrollRun } from './src/utils/deliveryAccounting.js';
import { buildStatusViews, bulkMinutes } from './src/utils/statusLedger.js';
import { pickRate, estimateOrderShipping, shippingEstimateSummary, rateOverview, carrierCostOverview, sumCur, isRateLocked } from './src/utils/shippingRates.js';
import { carrierKey, piecesOf, shippingPayerKind, shippingSummary, returnKind, returnsAnalysis, settlementRows, carrierScorecard } from './src/utils/returnsShipping.js';
import { syriaOfficialCarrier, SYRIA_SHIPPING_PRIORITY } from './src/data/syriaCarriers.js';
import { fetchAllRows, fetchAllRowsConcurrent } from './src/utils/fetchAllRows.js';
import { STATUSES } from './src/data/orderStatus.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('❌', m); } };
const eq = (a, b, m) => ok(a === b, `${m} (متوقع ${b}، كان ${a})`);

const o = (id, status, extra = {}) => ({ id, order_code: id, status, market: 'syria', amount: 100, currency: 'USD', order_date: '2026-09-10T10:00:00+03:00', items: [], handler_name: 'Zina', delivered_at: null, delivery_basis: 'unknown', ...extra });
const oct = periodBounds({ month: '2026-10' });
const sep = periodBounds({ month: '2026-09' });
const ids = (arr) => arr.map((x) => x.id).sort().join(',');

// 1) أُنشئ بسبتمبر وسُلّم بأكتوبر ← أكتوبر فقط
{
  const r = [o('A', 'delivered', { delivered_at: '2026-10-03T12:00:00+03:00', delivery_basis: 'carrier' })];
  eq(ids(selectDeliveredInPeriod(r, oct).delivered), 'A', 'سُلّم بأكتوبر يدخل أكتوبر');
  eq(selectDeliveredInPeriod(r, sep).delivered.length, 0, 'ولا يدخل سبتمبر رغم order_date');
}
// 2) أُنشئ بأكتوبر وما زال بالشحن ← لا مبيعات
{
  const r = [o('B', 'shipped', { order_date: '2026-10-05T10:00:00+03:00' })];
  eq(selectDeliveredInPeriod(r, oct).delivered.length, 0, 'قيد الشحن لا يدخل مبيعات أكتوبر');
  eq(selectUndelivered(r).length, 1, 'لكنه يظهر بقسم غير المسلّم');
}
// 3) 5000$ مسلّم بسوريا ← سوريا فقط
{
  const r = [o('C', 'delivered', { amount: 5000, delivered_at: '2026-10-04T10:00:00+03:00', delivery_basis: 'carrier' }), o('C2', 'delivered', { market: 'turkey', currency: 'TRY', amount: 1000, delivered_at: '2026-10-04T10:00:00+03:00', delivery_basis: 'carrier' })];
  const rep = buildReport({ rows: r, period: oct, rateMap: { USD: 1, TRY: 0.02 } });
  const sy = rep.byMarket.find((m) => m.key === 'syria');
  eq(sy.usd, 5000, 'سوريا = 5000$'); eq(sy.count, 1, 'طلب واحد بسوريا');
  eq(rep.byMarket.find((m) => m.key === 'turkey').usd, 20, 'تركيا منفصلة (1000 TRY × 0.02)');
  eq(sy.byCurrency.TRY, undefined, 'لا خلط عملات بسوريا');
}
// 4) Retail 10 × 3$ = 30$
{
  const names = [{ alias_name: 'Retail', canonical_name: 'Retail', brand: 'lowes', is_active: true }];
  const hist = [{ item_name: 'Retail', effective_from: '2026-06-01', sale_price_usd: 3, cost_usd: 1, ad_cost_usd: 0, shipping_cost_usd: 0 }];
  const d = [o('D', 'delivered', { items: [{ name: 'Retail', qty: 10 }], delivered_at: '2026-10-04T10:00:00+03:00', delivery_basis: 'carrier', delivery_at: '2026-10-04T10:00:00+03:00' })];
  const lines = buildProductLines(d, [], { nameMapRows: names, historyRows: hist, monthStart: '2026-10-01' });
  eq(lines[0].qty, 10, 'الكمية 10'); eq(lines[0].value, 30, '10 × 3$ = 30$'); eq(lines[0].profit, 20, 'الربح 20$');
  const bad = buildProductLines(d, [], { nameMapRows: names, historyRows: [], monthStart: '2026-10-01' });
  eq(bad[0].warning, 'no_price', 'منتج بلا سعر ← تحذير بلا كسر'); eq(bad[0].value, 0, 'قيمته 0');
  const nocost = buildProductLines(d, [], { nameMapRows: names, historyRows: [{ ...hist[0], cost_usd: 0 }], monthStart: '2026-10-01' });
  eq(nocost[0].warning, 'no_cost', 'بلا تكلفة ← تحذير'); eq(nocost[0].profit, 0, 'لا ربح مُخمَّن');
}
// 5) delivered ثم settled ← مرة واحدة
{
  const r = [o('E', 'settled', { delivered_at: '2026-10-02T10:00:00+03:00', delivery_basis: 'carrier' }), o('E', 'settled', { delivered_at: '2026-10-02T10:00:00+03:00', delivery_basis: 'carrier' })];
  eq(selectDeliveredInPeriod(r, oct).delivered.length, 1, 'settled بتسليم سابق مرة واحدة (حتى مع تكرار الصف)');
  const idx = buildPayrollIndex(selectDeliveredInPeriod(r, oct).delivered);
  eq(idx.get('zina').byCur.USD.count, 1, 'فهرس الرواتب لا يعدّه مرتين');
  const lone = selectDeliveredInPeriod([o('F', 'settled', { order_date: '2026-10-06T10:00:00+03:00' })], oct);
  eq(lone.delivered.length, 0, 'settled بلا تسليم فعلي ليس بيعاً'); eq(lone.settledNoDelivery.length, 1, 'ويُعلَّم للمراجعة');
}
// 6) returned لا يدخل المبيعات
{
  const r = [o('G', 'returned', { delivered_at: '2026-10-02T10:00:00+03:00', delivery_basis: 'carrier', return_at: '2026-10-09T10:00:00+03:00' })];
  const s = selectDeliveredInPeriod(r, oct);
  eq(s.delivered.length, 0, 'المرتجع ليس بيعاً نهائياً'); eq(s.returns.length, 1, 'يُعرض كمرتجع بشهر الإرجاع');
  eq(selectDeliveredInPeriod(r, sep).returns.length, 0, 'ولا يظهر مرتجعاً بشهر آخر');
}
// 7) غير المسلّمة تظهر بقيمها ولا تدخل الحسابات
{
  const statuses = ['pending', 'preparing', 'ready', 'motor', 'motor_prep', 'at_center', 'shipped', 'on_way', 'special_delivery', 'prepaid', 'waiting', 'not_received', 'returning'];
  const r = statuses.map((s, i) => o(`U${i}`, s, { amount: 10 + i, order_date: '2026-10-05T10:00:00+03:00' }));
  r.push(o('DEL', 'delivered', { delivered_at: '2026-10-06T10:00:00+03:00', delivery_basis: 'carrier', amount: 7 }));
  const rep = buildReport({ rows: r, period: oct });
  eq(rep.delivered.length, 1, 'فقط المسلَّم بالمجاميع'); eq(rep.totals.usd, 7, 'المجموع لا يشمل غير المسلَّم');
  eq(rep.undelivered.length, statuses.length, 'غير المسلَّمة كلها بالقسم المنفصل');
  eq(rep.undeliveredByGroup.reduce((s, g) => s + g.count, 0), statuses.length, 'المجموعات تغطيها');
  eq(rep.undeliveredByGroup.find((g) => g.group === 'shipping').usd > 0, true, 'قيم الشحن ظاهرة');
  const idx = buildPayrollIndex(rep.delivered);
  eq([...idx.values()].reduce((s, b) => s + Object.values(b.byCur).reduce((x, c) => x + c.count, 0), 0), 1, 'الرواتب/العمولات: طلب واحد فقط');
  // دفاع: لو مُرِّر صف غير مسلَّم للفهرس لا يدخل
  const sneaky = buildPayrollIndex(NON_ACCOUNTING_STATUSES.map((s, i) => o(`S${i}`, s)));
  eq(sneaky.size, 0, 'لا حالة غير محاسبية تدخل فهرس الرواتب');
}
// 8) legacy: بلا حدث تسليم ← order_date موسوم، ويمكن استبعاده
{
  const r = [o('L', 'delivered', { order_date: '2026-10-07T10:00:00+03:00' })];
  const a = buildReport({ rows: r, period: oct });
  eq(a.delivered.length, 1, 'legacy يدخل بتاريخ الطلب'); eq(a.legacyCount, 1, 'ويُوسم'); eq(a.delivered[0].delivery_source, 'legacy_order_date', 'مصدر التاريخ legacy_order_date');
  const b = buildReport({ rows: r, period: oct, includeLegacy: false });
  eq(b.delivered.length, 0, 'استبعاد legacy'); eq(b.legacyExcluded.length, 1, 'ويُعرض كمستبعَد');
}
// 9) حدود الشهر بتوقيت إسطنبول
{
  const r = [o('M1', 'delivered', { delivered_at: '2026-09-30T23:59:59+03:00', delivery_basis: 'carrier' }), o('M2', 'delivered', { delivered_at: '2026-10-01T00:00:00+03:00', delivery_basis: 'carrier' })];
  eq(ids(selectDeliveredInPeriod(r, sep).delivered), 'M1', '30 سبتمبر 23:59 ← سبتمبر');
  eq(ids(selectDeliveredInPeriod(r, oct).delivered), 'M2', '1 أكتوبر 00:00 ← أكتوبر');
  const custom = periodBounds({ fromDate: '2026-10-01', toDate: '2026-10-01' });
  eq(ids(selectDeliveredInPeriod(r, custom).delivered), 'M2', 'مدى مخصص ليوم واحد شامل');
}
// 10) عملات، فلاتر، تصدير
{
  eq(toUsd(100, 'AED', { USD: 1, AED: 0.27 }), 27, 'تحويل AED'); eq(toUsd(100, 'SYP', { USD: 1 }), null, 'بلا سعر ← null لا صفر');
  const r = [o('X1', 'delivered', { delivered_at: '2026-10-02T10:00:00+03:00', delivery_basis: 'carrier', shipping_company: 'Yurtici', handler_name: 'Sara' }), o('X2', 'delivered', { delivered_at: '2026-10-02T10:00:00+03:00', delivery_basis: 'carrier', market: 'uae', currency: 'AED', handler_name: 'Zina' })];
  eq(applyFilters(r, { carrier: 'Yurtici' }).length, 1, 'فلتر شركة الشحن'); eq(applyFilters(r, { market: 'uae' }).length, 1, 'فلتر السوق'); eq(applyFilters(r, { currency: 'AED' }).length, 1, 'فلتر العملة'); eq(applyFilters(r, { seller: 'sara' }).length, 1, 'فلتر البائع');
  const rep = buildReport({ rows: r, period: oct, rateMap: { USD: 1, AED: 0.27 } });
  const sheets = exportSheets(rep);
  ok(Object.keys(sheets).length === 11, 'إحدى عشرة ورقة تصدير (ست + المرتجعات + الشحن + التسويات + تقدير الشحن + الوضع الحالي)'); eq(sheets['الفترة'][1][1], 'delivery transition date', 'معيار الإدخال بالتصدير');
  eq(rep.byMarket.length, 2, 'سوقان');
}
// 11) قيم الفلاتر الافتراضية بالشاشة لا تُسقط أي طلب (عطل: seller='all' كان يُعامَل اسم بائع فتظهر الشاشة 0)
{
  const DEFAULTS = { market: 'all', brand: 'all', seller: 'all', status: 'all', carrier: 'all', product: '', currency: 'all' };
  const r = [o('F1', 'delivered', { delivered_at: '2026-10-02T10:00:00+03:00', delivery_basis: 'carrier' }), o('F2', 'shipped', { order_date: '2026-10-05T10:00:00+03:00' })];
  eq(applyFilters(r, DEFAULTS).length, 2, 'الفلاتر الافتراضية تُبقي كل الصفوف');
  const rep = buildReport({ rows: r, period: oct, filters: DEFAULTS });
  eq(rep.delivered.length, 1, 'تقرير بالفلاتر الافتراضية: مسلَّم واحد'); eq(rep.undelivered.length, 1, 'وغير مسلَّم واحد');
  eq(applyFilters(r, { ...DEFAULTS, seller: 'Zina' }).length, 2, 'بائع محدد يطابق'); eq(applyFilters(r, { ...DEFAULTS, seller: 'Nobody' }).length, 0, 'بائع آخر يستبعد');
  eq(applyFilters(r, { ...DEFAULTS, product: 'all' }).length, 2, "product='all' ليس اسم منتج");
}
// 12) خطأ التحميل: انتهاء مهلة القاعدة لا يُعرض كأنه نقص صلاحية (عطل حي: 57014 بعد ~10 ثوانٍ ← «تحتاج جلسة مدير»)
{
  const t = describeLoadError({ code: '57014', message: 'canceling statement due to statement timeout' });
  eq(t.kind, 'timeout', 'خطأ 57014 ← timeout'); ok(/مهلة/.test(t.message) && !/جلسة مدير أو مدير مبيعات\./.test(t.message), 'رسالة المهلة صريحة وليست رسالة الصلاحية');
  eq(describeLoadError({ message: 'canceling statement due to statement timeout' }).kind, 'timeout', 'بالنص وحده أيضاً');
  eq(describeLoadError({ code: '42501', message: 'permission denied for table x' }).kind, 'permission', 'نقص الصلاحية يبقى permission');
  const ab = describeLoadError(Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }));
  eq(ab.kind, 'aborted', 'الإلغاء المقصود لا يُعرض خطأ'); eq(ab.message, '', 'ولا رسالة له');
  eq(describeLoadError(new Error('boom')).message, 'boom', 'خطأ آخر يُعرض كما هو');
}
// 13) المرحلة 1 (D-161): المرتجعات والشحن والتسويات — المجهول «غير موثّق» لا صفر
{
  const RATES = { USD: 1, TRY: 0.02, SYP: 0.0076 };
  const it2 = [{ name: 'A', qty: 2 }, { name: 'B', qty: 1 }];
  // نوع المرتجع: موثوق فقط مع return_at غير جماعي
  eq(returnKind(o('K1', 'returned', { return_at: '2026-10-05T10:00:00+03:00', return_bulk_suspect: false })), 'reliable', 'مرتجع بتاريخ موثوق');
  eq(returnKind(o('K2', 'returned', { return_at: '2026-10-05T10:00:00+03:00', return_bulk_suspect: true })), 'unknown_timing', 'مرتجع جماعي ← توقيت غير موثوق');
  eq(returnKind(o('K3', 'returned', { return_at: null })), 'unknown_timing', 'مرتجع بلا تاريخ ← غير موثوق');
  eq(returnKind(o('K4', 'returning')), 'returning', 'راجع للمركز'); eq(returnKind(o('K5', 'not_received')), 'not_received', 'لم يُستلم'); eq(returnKind(o('K6', 'delivered')), null, 'المسلَّم ليس مرتجعاً');
  // القطع من items
  eq(piecesOf(o('P1', 'returned', { items: it2 })), 3, 'قطع الطلب 2+1'); eq(piecesOf(o('P2', 'returned', { items: [{ name: 'A', qty: 9999 }] })), 1, 'كمية مشبوهة تُعدّ 1'); eq(piecesOf(o('P3', 'returned', { items: [] })), 0, 'بلا أصناف = 0');
  // تحليل المرتجعات: فصل الموثوق عن الجماعي، القيم الفعلية، القطع، التسليم السابق، الاسترداد
  const R = [
    o('R1', 'returned', { amount: 1000, currency: 'TRY', market: 'turkey', items: it2, return_at: '2026-10-05T10:00:00+03:00', return_bulk_suspect: false, delivered_before_return: true, restock_qty: 3 }),
    o('R2', 'returned', { amount: 500, currency: 'TRY', market: 'turkey', items: [{ name: 'A', qty: 1 }], return_at: null, return_bulk_suspect: true, delivered_before_return: false, restock_qty: 0 }),
    o('R3', 'returning', { amount: 200, currency: 'TRY', market: 'turkey', items: [{ name: 'A', qty: 1 }] }),
    o('R4', 'not_received', { amount: 100, currency: 'AED', market: 'uae', items: [{ name: 'B', qty: 2 }] }),
    o('R5', 'delivered', { amount: 9999 }),
  ];
  const A = returnsAnalysis(R, RATES);
  eq(A.byKind.reliable.orders, 1, 'موثوق: طلب'); eq(A.byKind.reliable.pieces, 3, 'موثوق: 3 قطع'); eq(A.byKind.reliable.byCurrency.TRY, 1000, 'موثوق: قيمة فعلية 1000 TRY'); eq(A.byKind.reliable.usd, 20, 'موثوق: $20');
  eq(A.byKind.unknown_timing.orders, 1, 'جماعي منفصل'); eq(A.byKind.unknown_timing.byCurrency.TRY, 500, 'جماعي: 500 TRY لا يُخلط بالموثوق');
  eq(A.byKind.not_received.usdMissing, 1, 'AED بلا سعر صرف ← مُعلَّم لا صفر'); eq(A.total.orders, 4, 'المسلَّم لا يدخل تحليل المرتجعات');
  eq(A.deliveredBeforeReturn, 1, 'خرج ثم رجع: 1'); eq(A.restockDocumented, 1, 'استرداد موثّق: 1'); eq(A.restockUndocumented, 1, 'غير موثّق: 1');
  // الشحن: التكلفة الموثّقة فقط؛ الدافع الافتراضي لا يُعتدّ به
  eq(shippingPayerKind(o('S0', 'delivered', { shipping_payer: 'company', delivery_cost: 0 })), 'unknown', 'company افتراضي بلا تكلفة ← غير معروف (ليس علينا ولا صفر)');
  eq(shippingPayerKind(o('S1', 'delivered', { shipping_payer: 'company', delivery_cost: 450 })), 'company', 'تكلفة موثّقة علينا');
  eq(shippingPayerKind(o('S2', 'delivered', { shipping_payer: 'customer', delivery_cost: 300 })), 'customer', 'تكلفة على العميل');
  eq(shippingPayerKind(o('S3', 'delivered', { shipping_payer: 'customer', delivery_cost: null })), 'unknown', 'عميل بلا مبلغ ← غير موثّق');
  const SH = shippingSummary([
    o('H1', 'delivered', { shipping_company: 'بابل', currency: 'SYP', shipping_payer: 'customer', delivery_cost: 300 }),
    o('H2', 'delivered', { shipping_company: 'بابل اكسبرس', currency: 'SYP', shipping_payer: 'customer', delivery_cost: 200 }),
    o('H3', 'delivered', { shipping_company: 'بابل', currency: 'SYP', shipping_payer: 'company', delivery_cost: 450 }),
    o('H4', 'delivered', { shipping_company: 'Yurtiçi Kargo', currency: 'TRY', shipping_payer: 'company', delivery_cost: 0 }),
    o('H5', 'returned', { shipping_company: 'yurtiçi', currency: 'TRY', shipping_payer: 'company', delivery_cost: 0 }),
  ], RATES);
  eq(SH.totals.customer.byCurrency.SYP, 500, 'تكلفة العميل (بابل + بابل اكسبرس موحّدتان) 500'); eq(SH.totals.company.byCurrency.SYP, 450, 'تكلفة الشركة منفصلة 450');
  eq(SH.totals.unknownOrders, 2, 'طلبان بلا تكلفة موثّقة = غير معروف'); eq(SH.totals.company.byCurrency.TRY, undefined, 'لا صفر مُختلَق للتركي');
  eq(SH.rows.find((g) => g.carrier === 'بابل' && g.payer === 'customer').orders, 2, 'صف بابل/عميل');
  eq(SH.rows.find((g) => g.carrier === 'Yurtiçi' && g.payer === 'unknown').orders, 2, 'Yurtiçi بصيغتين ← صف واحد غير موثّق');
  // أسماء الشركات (عرض فقط)
  eq(carrierKey('شركة الكرم'), 'الكرم', 'الكرم'); eq(carrierKey('قدموس '), 'قدموس', 'قدموس'); eq(carrierKey('❌ Unpaid'), 'غير مصنّف (حقل دفع بدل الناقل)', 'حقل الدفع ليس ناقلاً'); eq(carrierKey(null), 'بلا شركة', 'فارغ'); eq(carrierKey('PTT Kargo'), 'PTT', 'PTT'); eq(carrierKey('شركة جديدة'), 'شركة جديدة', 'اسم مجهول يبقى كما هو');
  // الفلاتر الجديدة
  const rows = [o('F1', 'delivered', { shipping_company: 'بابل اكسبرس', shipping_payer: 'customer', delivery_cost: 100, delivered_at: '2026-10-02T10:00:00+03:00', delivery_basis: 'carrier' }), o('F2', 'delivered', { shipping_company: 'قدموس', shipping_payer: 'company', delivery_cost: 0, delivered_at: '2026-10-02T10:00:00+03:00', delivery_basis: 'carrier' }), o('F3', 'returned', { shipping_company: 'بابل', return_at: '2026-10-03T10:00:00+03:00', return_bulk_suspect: false }), o('F4', 'returned', { shipping_company: 'بابل', return_at: null, return_bulk_suspect: true, order_date: '2026-10-04T10:00:00+03:00' })];
  const rep = buildReport({ rows, period: oct, filters: { carrier: 'بابل' } });
  eq(rep.delivered.length, 1, 'فلتر الشركة الموحّدة يطابق «بابل اكسبرس»'); eq(rep.returns.length, 1, 'مرتجع بابل بتاريخ موثوق'); eq(rep.returnsUnknown.length, 1, 'ومرتجع بابل بتوقيت غير معروف منفصل (لا يُنسَب لشهر بتاريخ الطلب)');
  eq(buildReport({ rows, period: oct, filters: { payer: 'unknown' } }).delivered.length, 1, 'فلتر الدافع: غير موثّق'); eq(buildReport({ rows, period: oct, filters: { payer: 'customer' } }).delivered.length, 1, 'فلتر الدافع: العميل');
  eq(buildReport({ rows, period: oct, filters: { returnKind: 'unknown_timing' } }).returnsUnknown.length, 1, 'فلتر المرتجع غير المعروف التوقيت'); eq(buildReport({ rows, period: oct, filters: { returnKind: 'unknown_timing' } }).returns.length, 0, 'ولا موثوق ضمنه'); eq(buildReport({ rows, period: oct, filters: { returnKind: 'reliable' } }).returns.length, 1, 'فلتر المرتجع الموثوق');
  const full = buildReport({ rows, period: oct });
  eq(full.returnsInfo.byKind.reliable.orders, 1, 'التقرير: موثوق 1'); eq(full.returnsInfo.byKind.unknown_timing.orders, 1, 'التقرير: جماعي 1');
  eq(full.products.length, 0, 'لا منتجات من طلبات بلا أصناف');
  // التسويات: not_received → settled لا يدخل المبيعات ولا يُعدّ تحصيلاً مثبتاً
  const ST = [o('T1', 'settled', { market: 'turkey', amount: 1200, currency: 'TRY', order_date: '2026-10-06T10:00:00+03:00', payment_status: 'unpaid', paid_amount: null }), o('T2', 'settled', { order_date: '2026-10-07T10:00:00+03:00' })];
  const rep2 = buildReport({ rows: ST, period: oct, refs: { settledPaths: new Map([['T1', ['shipped', 'on_way', 'not_received', 'settled']]]) } });
  eq(rep2.delivered.length, 0, 'settled بلا تسليم لا يدخل المبيعات'); eq(rep2.settlements.length, 2, 'يظهر بتبويب التسويات');
  const t1 = rep2.settlements.find((x) => x.id === 'T1'); eq(t1.settlement_kind, 'not_received_settled', 'T1: لم يُستلم ثم سُوّي'); eq(t1.collected_known, false, 'T1: المحصّل غير موثّق'); eq(t1.shipping_documented, false, 'T1: شحن غير موثّق');
  eq(rep2.settlements.find((x) => x.id === 'T2').settlement_kind, 'no_path', 'T2: بلا مسار'); eq(settlementRows([o('T3', 'settled', { paid_amount: 40 })], { T3: ['delivered', 'settled'] })[0].settlement_kind, 'delivered_settled', 'مسلَّم ثم سُوّي');
  eq(settlementRows([o('T4', 'settled', { paid_amount: 40 })], {})[0].collected_known, true, 'محصّل موثّق عند paid_amount > 0');
  // مرتجع بلا return_at وتاريخ طلبه بسبتمبر: لا يدخل أكتوبر ولا يُسنَد لسبتمبر — يظهر كتوقيت غير معروف فقط
  { const x = o('U1', 'returned', { return_at: null, return_bulk_suspect: true, order_date: '2026-09-20T10:00:00+03:00', amount: 700, currency: 'TRY' });
    const a = buildReport({ rows: [x], period: sep }), b = buildReport({ rows: [x], period: oct });
    eq(a.returns.length, 0, 'لا يُسنَد لسبتمبر بتاريخ الطلب'); eq(a.returnsUnknown.length, 1, 'يظهر كتوقيت غير معروف'); eq(a.returnsInfo.byKind.unknown_timing.byCurrency.TRY, 700, 'قيمته الفعلية محفوظة'); eq(b.returns.length, 0, 'ولا يدخل أكتوبر'); }
}
// 14) الوضع الحالي بلا نافذة + أحداث الفترة + التسويات بتاريخ التسوية (قرار حسام: لا 60 ولا 120 يوماً)
{
  const ev = (order_id, to_status, changed_at, source = 'app') => ({ order_id, to_status, changed_at, source });
  const ordr = (id, status, order_date, extra = {}) => o(id, status, { order_date, items: [{ name: 'A', qty: 2 }], market: 'turkey', currency: 'TRY', amount: 800, ...extra });
  const bulkOrders = Array.from({ length: 30 }, (_, k) => ordr('B' + k, 'returning', '2026-08-20T10:00:00+03:00'));
  const bulkEvents = bulkOrders.map((b) => ev(b.id, 'returning', '2026-09-12T10:30:' + String(k2(b)).padStart(2, '0') + '+03:00', 'sheet'));
  function k2(b) { return Number(b.id.slice(1)) % 60; }
  const ledger = {
    orders: [
      ordr('RT0', 'returning', '2025-01-01T10:00:00+03:00'), ordr('RT1', 'returning', '2026-01-10T10:00:00+03:00'),
      ordr('NR1', 'not_received', '2026-02-02T10:00:00+03:00'), ordr('NR2', 'not_received', '2026-03-02T10:00:00+03:00'),
      ordr('SE1', 'settled', '2026-05-10T10:00:00+03:00', { paid_amount: null }), ordr('SE2', 'settled', '2026-09-01T09:00:00+03:00', { paid_amount: 150 }), ordr('SE3', 'settled', '2026-09-03T09:00:00+03:00'),
      ordr('PE1', 'delivered', '2026-09-02T10:00:00+03:00'), ...bulkOrders,
    ],
    events: [
      ev('RT0', 'returning', '2025-02-01T10:00:00+03:00'), ev('RT1', 'returning', '2026-03-01T10:00:00+03:00'), ev('NR1', 'not_received', '2026-02-05T10:00:00+03:00'),
      ev('SE1', 'not_received', '2026-05-12T10:00:00+03:00'), ev('SE1', 'settled', '2026-09-15T10:00:00+03:00'),
      ev('SE2', 'settled', '2026-09-20T10:00:00+03:00'), ev('PE1', 'returning', '2026-09-10T10:00:00+03:00'), ...bulkEvents,
    ],
    paths: new Map([
      ['SE1', [{ to_status: 'shipped', changed_at: '2026-05-11T10:00:00+03:00' }, { to_status: 'not_received', changed_at: '2026-05-12T10:00:00+03:00' }, { to_status: 'settled', changed_at: '2026-09-15T10:00:00+03:00' }]],
      ['SE2', [{ to_status: 'shipped', changed_at: '2026-09-01T10:00:00+03:00' }, { to_status: 'delivered', changed_at: '2026-09-01T12:00:00+03:00' }, { to_status: 'settled', changed_at: '2026-09-20T10:00:00+03:00' }]],
    ]),
  };
  const rows = [
    o('D1', 'delivered', { delivered_at: '2026-09-05T10:00:00+03:00', delivery_basis: 'carrier', amount: 500 }),
    o('SE2', 'settled', { delivered_at: '2026-09-01T12:00:00+03:00', delivery_basis: 'carrier', amount: 800, market: 'turkey', currency: 'TRY', paid_amount: 150 }),
    o('SE1', 'settled', { order_date: '2026-05-10T10:00:00+03:00', amount: 800 }),
    o('RT1', 'returning', { order_date: '2026-01-10T10:00:00+03:00' }), o('NR1', 'not_received', { order_date: '2026-02-02T10:00:00+03:00' }),
  ];
  const sepR = buildReport({ rows, period: sep, refs: { statusLedger: ledger } }), octR = buildReport({ rows, period: oct, refs: { statusLedger: ledger } });
  const ids2 = (a) => a.map((x) => x.id).sort().join(',');
  // الوضع الحالي بلا نافذة: returning/not_received قديمان (2025، كانون الثاني، شباط) ما زالا حالياً
  ok(sepR.currentPending.returning.some((x) => x.id === 'RT0'), 'returning من 2025 ما زال في الوضع الحالي (لا نافذة 60/120)');
  ok(sepR.currentPending.returning.some((x) => x.id === 'RT1'), 'returning من كانون الثاني ما زال حالياً');
  ok(sepR.currentPending.not_received.some((x) => x.id === 'NR1') && sepR.currentPending.not_received.some((x) => x.id === 'NR2'), 'not_received قديم ما زال حالياً');
  eq(ids2(octR.currentPending.returning.filter((x) => !x.id.startsWith('B'))), ids2(sepR.currentPending.returning.filter((x) => !x.id.startsWith('B'))), 'الوضع الحالي لا يتغيّر بتغيّر الشهر');
  // لا تدخل المبيعات
  eq(ids2(sepR.delivered), 'D1,SE2', 'المبيعات: D1 وSE2 (مسلَّم قبل التسوية) فقط');
  ok(!sepR.delivered.some((x) => ['RT0', 'RT1', 'NR1', 'NR2', 'SE1', 'SE3'].includes(x.id)), 'لا returning/not_received/settled بلا تسليم بالمبيعات');
  { const idx2 = buildPayrollIndex(sepR.delivered).get('zina'); eq(Object.values(idx2.byCur).reduce((n, c) => n + c.count, 0), 2, 'فهرس الرواتب: سطرا مبيعات فقط (D1 وSE2) بلا تكرار ولا أي معلّق'); }
  // الوضع الحالي ≠ إحصائية الفترة
  ok(sepR.periodPending.returning.some((x) => x.id === 'PE1') && !sepR.periodPending.returning.some((x) => x.id === 'RT1'), 'حدث الفترة (PE1 بسبتمبر) لا RT1 (آذار)');
  ok(!sepR.currentPending.returning.some((x) => x.id === 'PE1'), 'PE1 لم يعد راجعاً الآن فلا يظهر بالوضع الحالي');
  eq(sepR.periodPending.returning.find((x) => x.id === 'PE1').current_status, 'delivered', 'تُعرض حالته الآن بجانب حدث الفترة');
  eq(octR.periodPending.returning.length, 0, 'أكتوبر بلا أحداث راجع للمركز غير جماعية');
  // الجماعي: لا يُنسب لشهر؛ توقيت غير معروف
  ok(bulkMinutes(ledger.events).size >= 0, 'bulkMinutes تعمل');
  ok(!sepR.periodPending.returning.some((x) => x.id.startsWith('B')), '30 حدثاً بنفس الدقيقة ← جماعي لا يُنسب للفترة');
  ok(sepR.unknownTiming.filter((x) => x.id.startsWith('B')).length === 30 && sepR.unknownTiming.find((x) => x.id === 'B0').unknown_reason === 'bulk_event', 'الجماعي ← توقيت غير معروف');
  ok(sepR.unknownTiming.some((x) => x.id === 'NR2' && x.unknown_reason === 'no_history'), 'not_received بلا أي سجل ← غير معروف');
  // التسويات بتاريخ التسوية
  const se1 = sepR.settlements.find((x) => x.id === 'SE1');
  ok(!!se1, 'طلب أيار تسويته أيلول يظهر بتسويات سبتمبر'); eq(String(se1.settled_at).slice(0, 10), '2026-09-15', 'تاريخ التسوية'); eq(String(se1.order_date).slice(0, 10), '2026-05-10', 'تاريخ الطلب محفوظ'); eq(se1.path, 'shipped › not_received › settled', 'مسار الحالات'); eq(se1.delivered_before, false, 'لم يسبقها تسليم'); eq(se1.settlement_kind, 'not_received_settled', 'لم يُستلم ثم سُوّي'); eq(se1.collected_known, false, 'المحصّل غير موثّق');
  ok(!octR.settlements.some((x) => x.id === 'SE1'), 'ولا يظهر بتسويات أكتوبر');
  const se2 = sepR.settlements.find((x) => x.id === 'SE2');
  ok(!!se2 && se2.delivered_before === true && se2.settlement_kind === 'delivered_settled', 'delivered ثم settled يظهر كتسوية سبقها تسليم'); eq(se2.collected_known, true, 'المحصّل 150 معروف');
  eq(sepR.delivered.filter((x) => x.id === 'SE2').length, 1, 'ويُحسب بيعاً مرة واحدة فقط');
  ok(sepR.settlementsUnknown.some((x) => x.id === 'SE3'), 'settled بلا حدث تسوية ← توقيت غير معروف');
  ok(!sepR.settlements.some((x) => x.id === 'SE3'), 'ولا يُنسب لشهر');
  // إحصائية الفترة منفصلة عن الحالية (لا خلط في returnsInfo/currentInfo)
  eq(sepR.currentInfo.byKind.returning.orders, sepR.currentPending.returning.length, 'currentInfo = الوضع الحالي فقط');
  eq(sepR.returnsInfo.byKind.returning.orders, sepR.periodPending.returning.length, 'returnsInfo = أحداث الفترة فقط');
  ok(sepR.returnsInfo.byKind.returning.orders !== sepR.currentInfo.byKind.returning.orders, 'الرقمان مستقلان (لا خلط)');
  // فلتر البائع يمسّ الجميع بلا إسقاط الافتراضي
  eq(buildReport({ rows, period: sep, refs: { statusLedger: ledger }, filters: { seller: 'all', market: 'all' } }).currentPending.returning.length, sepR.currentPending.returning.length, 'الفلاتر الافتراضية لا تُسقط الوضع الحالي');
  // لا نافذة زمنية بالمنطق الصرف
  { const src = fs.readFileSync('./src/utils/statusLedger.js', 'utf8'); ok(!/(\b60\b|\b120\b)\s*\*\s*(86400000|24)/.test(src) && !/subDays|days'/.test(src), 'لا نافذة 60/120 يوماً بمنطق الدفتر'); }
}
// 15) تعرفة الشحن التقديرية (D-161): بتواريخ سريان، الفعلي يغلب، العميل لا يُقدَّر، المجهول لا يصير صفراً
{
  const RATES = [
    { carrier: 'قدموس', market: 'syria', currency: 'SYP', outbound_fee: 150, return_policy: 'fixed', return_fee: 40, effective_from: '2026-01-01' },
    { carrier: 'قدموس', market: 'syria', currency: 'SYP', outbound_fee: 180, return_policy: 'fixed', return_fee: 40, effective_from: '2026-10-01' },
    { carrier: 'بابل', market: 'syria', currency: 'SYP', outbound_fee: 30, return_policy: 'none', return_fee: null, effective_from: '2026-01-01' },
    { carrier: 'الكرم', market: 'syria', currency: 'SYP', outbound_fee: 20, return_policy: 'same_as_outbound', return_fee: null, effective_from: '2026-01-01' },
    { carrier: 'إيزلا', market: 'syria', currency: 'SYP', outbound_fee: 50, return_policy: 'unknown', return_fee: null, effective_from: '2026-01-01' },
  ];
  const sh = (id, status, co, extra = {}) => o(id, status, { shipping_company: co, market: 'syria', currency: 'SYP', shipping_payer: 'company', delivery_cost: 0, order_date: '2026-09-10T10:00:00+03:00', delivery_at: '2026-09-12T10:00:00+03:00', ...extra });
  // pickRate: بتاريخ السريان، والماضي لا يتغيّر
  eq(pickRate(RATES, 'قدموس', 'syria', '2026-09-30').outbound_fee, 150, 'سبتمبر بالتعرفة القديمة 150'); eq(pickRate(RATES, 'قدموس ', 'syria', '2026-10-01').outbound_fee, 180, 'من 1 أكتوبر 180 (اسم بمسافة زائدة يطابق)');
  eq(pickRate(RATES, 'قدموس', 'syria', '2025-12-31'), null, 'قبل أول تعرفة ← لا تعرفة'); eq(pickRate(RATES, 'قدموس', 'turkey', '2026-09-30'), null, 'سوق آخر لا يستعير تعرفة'); eq(pickRate(RATES, 'بابل اكسبرس', 'syria', '2026-09-30').outbound_fee, 30, 'بابل اكسبرس = بابل');
  // قواعد التقدير
  let e = estimateOrderShipping(sh('E1', 'delivered', 'قدموس'), RATES);
  eq(e.basis, 'estimated', 'مسلَّم بلا تكلفة موثّقة ← تقدير'); eq(e.outbound.amount, 150, 'بسعر سبتمبر'); eq(e.payerUnconfirmed, true, 'الدافع غير مؤكد موسوم');
  eq(estimateOrderShipping(sh('E1b', 'delivered', 'قدموس', { delivery_at: '2026-10-05T10:00:00+03:00' }), RATES).outbound.amount, 180, 'نفس الشركة بأكتوبر 180 — تغيير السعر لا يمسّ سبتمبر');
  e = estimateOrderShipping(sh('E2', 'delivered', 'بابل', { delivery_cost: 450, shipping_payer: 'company' }), RATES);
  eq(e.basis, 'actual', 'تكلفة موثّقة علينا ← فعلي لا تقدير'); eq(e.outbound.amount, 450, 'المبلغ الفعلي');
  eq(estimateOrderShipping(sh('E3', 'delivered', 'بابل', { shipping_payer: 'customer', delivery_cost: 300 }), RATES).basis, 'customer_paid', 'على العميل ← لا تقدير');
  eq(estimateOrderShipping(sh('E3b', 'delivered', 'بابل', { shipping_payer: 'customer', delivery_cost: 0 }), RATES).basis, 'customer_paid', 'دافع العميل بلا مبلغ ← لا نقدّره علينا');
  e = estimateOrderShipping(sh('E4', 'delivered', 'شركة بلا تعرفة'), RATES); eq(e.basis, 'no_rate', 'بلا تعرفة'); eq(e.outbound, null, 'لا صفر مُختلَق');
  eq(estimateOrderShipping(sh('E5', 'preparing', 'بابل'), RATES).basis, 'none', 'لم يخرج بعد ← لا تقدير');
  // المرتجع حسب سياسة الشركة
  e = estimateOrderShipping(sh('R1', 'returned', 'بابل'), RATES); eq(e.returnState, 'free', 'سياسة none ← لا أجرة مرتجع'); eq(e.returnFee.amount, 0, 'صفر مقصود وموسوم free');
  e = estimateOrderShipping(sh('R2', 'returned', 'قدموس'), RATES); eq(e.returnState, 'charged', 'fixed'); eq(e.returnFee.amount, 40, 'مرتجع ثابت 40');
  e = estimateOrderShipping(sh('R3', 'returned', 'الكرم'), RATES); eq(e.returnFee.amount, 20, 'same_as_outbound = 20');
  e = estimateOrderShipping(sh('R4', 'returned', 'إيزلا'), RATES); eq(e.returnState, 'unknown', 'سياسة غير معروفة'); eq(e.returnFee, null, 'لا مبلغ مُختلَق');
  e = estimateOrderShipping(sh('R5', 'not_received', 'قدموس'), RATES); eq(e.returnState, 'pending', 'لم يُستلم: المرتجع لم يثبت'); eq(e.returnFee, null, 'ذهاب فقط'); eq(e.outbound.amount, 150, 'أجرة الذهاب');
  // الملخص
  const SUM = shippingEstimateSummary([sh('S1', 'delivered', 'قدموس'), sh('S2', 'delivered', 'قدموس'), sh('S3', 'returned', 'قدموس'), sh('S4', 'delivered', 'بابل', { delivery_cost: 450 }), sh('S5', 'delivered', 'بابل', { shipping_payer: 'customer', delivery_cost: 300 }), sh('S6', 'delivered', 'مجهولة'), sh('S7', 'returned', 'إيزلا')], RATES, { USD: 1, SYP: 0.01 });
  eq(SUM.totals.outbound.SYP, 150 * 3 + 50, 'ذهاب تقديري: قدموس 3 + إيزلا'); eq(SUM.totals.returnFee.SYP, 40, 'مرتجع تقديري 40 فقط (إيزلا مجهولة)'); eq(SUM.totals.returnUnknown, 1, 'سياسة مجهولة معدودة لا صفر');
  eq(SUM.totals.actual, 1, 'فعلي موثّق 1'); eq(SUM.totals.actualByCurrency.SYP, 450, 'الفعلي منفصل 450'); eq(SUM.totals.customerPaid, 1, 'على العميل 1 لا يدخل'); eq(SUM.totals.noRate, 1, 'بلا تعرفة 1'); eq(SUM.totals.estimated, 4, 'مُقدَّرة 4 (قدموس 3 + إيزلا)');
  eq(SUM.totals.usdOutbound, 5, 'التحويل بالدولار 500 × 0.01'); eq(SUM.totals.payerUnconfirmed, 4, 'كل المُقدَّرة الدافع غير مؤكد');
  // الدمج بالتقرير: كل طلب مرة واحدة (حدث راجع لطلب حالته الآن مسلَّم لا يُعدّ شحنة ثانية)
  const ordX = (id, status, order_date, extra = {}) => o(id, status, { order_date, items: [{ name: 'A', qty: 1 }], market: 'syria', currency: 'SYP', shipping_company: 'قدموس', shipping_payer: 'company', delivery_cost: 0, ...extra });
  const led = { orders: [ordX('X1', 'delivered', '2026-09-02T10:00:00+03:00', { delivered_at: '2026-09-06T10:00:00+03:00' })], events: [{ order_id: 'X1', to_status: 'not_received', changed_at: '2026-09-04T10:00:00+03:00', source: 'yurtici' }], paths: new Map() };
  const rowsX = [o('X1', 'delivered', { delivered_at: '2026-09-06T10:00:00+03:00', delivery_basis: 'carrier', shipping_company: 'قدموس', market: 'syria', currency: 'SYP', shipping_payer: 'company', delivery_cost: 0 })];
  const repX = buildReport({ rows: rowsX, period: sep, refs: { statusLedger: led, carrierRates: RATES } });
  eq(repX.periodPending.not_received.length, 1, 'حدث not_received بالفترة لطلب مسلَّم لاحقاً'); eq(repX.shipping.totals.orders, 1, 'الشحن: شحنة واحدة لا اثنتان'); eq(repX.shippingEstimate.totals.outbound.SYP, 150, 'التقدير مرة واحدة 150 لا 300');
  // نظرة التعرفة
  const ov = rateOverview([...RATES, { carrier: 'قدموس', market: 'syria', currency: 'SYP', outbound_fee: 200, return_policy: 'none', effective_from: '2099-01-01' }], '2026-11-01');
  const q = ov.find((g) => g.carrier === 'قدموس'); eq(q.current.outbound_fee, 180, 'الساري اليوم 180'); eq(q.upcoming.length, 1, 'قادمة 1'); eq(q.history.length, 3, 'السجل 3 صفوف');
}
// 16) سوريا: «الموتور» ← «مشوار»، القائمة الرسمية، «تم الاسترجاع»، «تمت التسوية» = راجع للبائع بلا خصم، وقيمة المرتجعات
{
  eq(carrierKey('توصيل ميتور', 'syria'), 'مشوار', 'توصيل ميتور (سوريا) = مشوار'); eq(carrierKey('الموتور', 'syria'), 'مشوار', 'الموتور (سوريا) = مشوار');
  eq(carrierKey('موتور ', 'syria'), 'مشوار', 'موتور بمسافة (سوريا) = مشوار'); eq(carrierKey('مشوار', 'syria'), 'مشوار', 'مشوار يبقى مشوار');
  eq(carrierKey('توصيل الموتور 🏍️', 'turkey'), 'الموتور', 'موتور إسطنبول (تركيا) لا يتغيّر'); eq(carrierKey('الموتور'), 'الموتور', 'بلا سوق: كما كان');
  eq(carrierKey('العودة'), 'العودة', 'العودة معرّفة');
  const OFF = { 'شركة الكرم': 'الكرم', 'كرم': 'الكرم', 'قدموس ': 'قدموس', 'القدموس ': 'قدموس', 'إيزلا': 'ايزلا', 'ايزلا': 'ايزلا', 'صله': 'صلة', 'صلة ': 'صلة', 'بابل اكسبرس': 'بابل', 'توصيل موتور ': 'مشوار', 'توصيل ميتور': 'مشوار', 'الموتور': 'مشوار', 'شركة مسارات ': 'مسارات', 'توصيل جرمانا': 'توصيل جرمانا', 'العودة': 'العودة' };
  for (const [raw, want] of Object.entries(OFF)) eq(syriaOfficialCarrier(raw), want, `«${raw}» ← ${want}`);
  for (const bad of ['💰 Paid', '❌ Unpaid', 'فاتح كارغو', 'Yurtiçi Kargo', 'PTT Kargo', 'مندوب توصيل', 'مدفوع الاجور', '', null]) eq(syriaOfficialCarrier(bad), null, `غير رسمي بلا شريحة: «${bad}»`);
  eq(SYRIA_SHIPPING_PRIORITY.join('|'), 'قدموس|مسارات|مشوار|توصيل جرمانا|الكرم|العودة|ايزلا|بابل|صلة', 'القائمة الرسمية = قائمة الجدول');
  // تعرفة محفوظة باسم «مشوار» تُلتقط لطلب مخزَّن «الموتور»
  const RM = [{ carrier: 'مشوار', market: 'syria', currency: 'SYP', outbound_fee: 40, return_policy: 'none', effective_from: '2026-01-01' }];
  eq(pickRate(RM, 'توصيل ميتور', 'syria', '2026-09-10')?.outbound_fee, 40, 'تعرفة مشوار تخدم الطلبات القديمة');
  eq(pickRate(RM, 'الموتور', 'turkey', '2026-09-10'), null, 'تعرفة سوريا لا تخدم موتور تركيا');
  eq(STATUSES.returned.label, 'تم الاسترجاع', 'اسم حالة returned');
  // تمت التسوية: راجع للبائع بلا خصم — ليست بيعاً ولا تدخل عدّاد الرواجع المخصوم
  const S1 = o('S1', 'settled', { amount: 80, paid_amount: 80, handler_name: 'Zina', order_date: '2026-09-02T10:00:00+03:00' });
  const S2 = o('S2', 'settled', { amount: 60, handler_name: 'Zina', order_date: '2026-09-03T10:00:00+03:00', delivered_at: '2026-09-04T10:00:00+03:00', delivery_basis: 'carrier' });
  const R1 = o('R1', 'returned', { amount: 250, handler_name: 'Lina', market: 'turkey', currency: 'USD', return_at: '2026-09-15T10:00:00+03:00', return_bulk_suspect: false });
  const led = {
    orders: [S1, S2, R1],
    events: [
      { order_id: 'S1', to_status: 'not_received', changed_at: '2026-09-05T10:00:00+03:00', source: 'x' }, { order_id: 'S1', to_status: 'settled', changed_at: '2026-09-12T10:00:00+03:00', source: 'x' },
      { order_id: 'S2', to_status: 'settled', changed_at: '2026-09-14T10:00:00+03:00', source: 'x' },
    ],
    paths: new Map([
      ['S1', [{ to_status: 'not_received', changed_at: '2026-09-05T10:00:00+03:00' }, { to_status: 'settled', changed_at: '2026-09-12T10:00:00+03:00' }]],
      ['S2', [{ to_status: 'delivered', changed_at: '2026-09-04T10:00:00+03:00' }, { to_status: 'settled', changed_at: '2026-09-14T10:00:00+03:00' }]],
    ]),
  };
  const rep = buildReport({ rows: [S1, S2, R1], period: sep, refs: { statusLedger: led } });
  eq(rep.settledAsReturns.length, 1, 'تسوية بلا تسليم سابق = راجع للبائع (واحدة)'); eq(rep.settledAsReturns[0].id, 'S1', 'هي S1 لا S2 (مسلَّمة قبل التسوية)');
  eq(rep.settledBySeller.find((x) => x.key === 'Zina')?.count, 1, 'محسوبة لبائعها Zina'); eq(rep.settledTotal.byCurrency.USD, 80, 'قيمة التسوية 80');
  eq(rep.delivered.some((x) => x.id === 'S1'), false, 'التسوية بلا تسليم ليست بيعاً');
  eq(rep.returnsInfo.byKind.reliable.orders, 1, 'عدّاد الاسترجاع الموثوق لا يشمل التسوية (فقط R1)'); eq(rep.returnsBySeller.some((x) => x.key === 'Zina'), false, 'Zina بلا «تم الاسترجاع» (التسوية بعمود منفصل)');
  const idx = buildPayrollIndex(rep.delivered); eq([...idx.values()].reduce((n, b) => n + (b.returnsCount || 0), 0), 0, 'فهرس الرواتب: لا خصم رواجع من التسوية');
  // قيمة المرتجعات
  eq(rep.returnsTotal.count, 1, 'مرتجع واحد بالفترة'); eq(rep.returnsTotal.byCurrency.USD, 250, 'قيمة المرتجعات 250'); eq(rep.returnsByMarket.find((x) => x.key === 'turkey')?.count, 1, 'حسب السوق'); eq(rep.returnsBySeller.find((x) => x.key === 'Lina')?.byCurrency.USD, 250, 'حسب البائع');
}
// 17) جدول «شحن كل شركة»: علينا (فعلي + تقدير ذهاب/إرجاع) منفصل عمّا يدفعه العميل
{
  const RT = [{ carrier: 'قدموس', market: 'syria', currency: 'SYP', outbound_fee: 150, return_policy: 'fixed', return_fee: 40, effective_from: '2026-01-01' }];
  const mk = (id, status, extra = {}) => o(id, status, { shipping_company: 'قدموس', market: 'syria', currency: 'SYP', shipping_payer: 'company', delivery_cost: 0, delivery_at: '2026-09-12T10:00:00+03:00', ...extra });
  const list = [mk('C1', 'delivered'), mk('C2', 'delivered'), mk('C3', 'delivered', { shipping_payer: 'customer', delivery_cost: 200 }), mk('C4', 'returned'), mk('C5', 'delivered', { delivery_cost: 90 })];
  const ov = carrierCostOverview(shippingEstimateSummary(list, RT, { USD: 1 }).rows, shippingSummary(list, { USD: 1 }).rows);
  eq(ov.length, 1, 'شركة واحدة'); const g = ov[0];
  eq(g.orders, 5, 'كل الشحنات 5'); eq(g.outbound.SYP, 450, 'ذهاب تقديري: C1 + C2 + C4 = 450'); eq(g.returnFee.SYP, 40, 'إرجاع تقديري C4 = 40'); eq(g.actual.SYP, 90, 'فعلي موثّق علينا C5 = 90');
  eq(g.weBear.SYP, 580, 'إجمالي علينا = 90 + 450 + 40'); eq(g.customerAmount.SYP, 200, 'على العميل 200 (موثّق) لا يُخلط بعلينا'); eq(g.customerOrders, 1, 'طلب واحد دفعه العميل');
  eq(sumCur({ SYP: 1, USD: 2 }, { SYP: 3 }).SYP, 4, 'sumCur عملة بعملة');
  const none = carrierCostOverview(shippingEstimateSummary(list, [], { USD: 1 }).rows, shippingSummary(list, { USD: 1 }).rows)[0];
  eq(Object.keys(none.outbound).length, 0, 'بلا تعرفة: لا ذهاب مختلَق'); eq(none.noRate, 3, 'بلا تعرفة 3 (C1,C2,C4)');
}
// 19) بطاقة أداء الشركات: نسبة الإرجاع، أيام التسليم (بلا التقديري)، تكلفة الشحنة الناجحة
{
  const d = (id, co, ordered, delivered, extra = {}) => ({ id, market: 'syria', shipping_company: co, order_date: ordered, delivery_at: delivered, delivery_source: 'history', ...extra });
  const rows = carrierScorecard({
    delivered: [d('a1', 'قدموس', '2026-09-01T10:00:00Z', '2026-09-03T10:00:00Z'), d('a2', 'قدموس', '2026-09-01T10:00:00Z', '2026-09-05T10:00:00Z'), d('a3', 'قدموس', '2026-09-01T10:00:00Z', '2026-09-01T10:00:00Z', { delivery_source: 'legacy_order_date' }), d('b1', 'بابل', '2026-09-01T10:00:00Z', '2026-09-02T10:00:00Z')],
    returns: [d('r1', 'قدموس', '2026-09-01T10:00:00Z', null), d('r2', 'قدموس', '2026-09-01T10:00:00Z', null)],
    notReceived: [d('n1', 'بابل', '2026-09-01T10:00:00Z', null)],
    weBearByCarrier: new Map([['قدموس', { SYP: 600 }]]),
  });
  const q = rows.find((x) => x.carrier === 'قدموس'); const b = rows.find((x) => x.carrier === 'بابل');
  eq(q.delivered, 3, 'قدموس مسلَّم 3'); eq(q.returned, 2, 'مرتجع 2'); eq(q.returnRate, 40, 'نسبة الإرجاع 2/(3+2)=40%');
  eq(q.avgDays, 3, 'متوسط الأيام (2 و4) = 3 — التقديري لا يدخل'); eq(q.costPerDelivered.SYP, 200, 'تكلفة الشحنة الناجحة 600/3=200');
  eq(b.returnRate, 0, 'بابل بلا مرتجع = 0%'); eq(b.notReceived, 1, 'لم يُستلم 1'); eq(b.costPerDelivered, null, 'بلا تعرفة: لا تكلفة مختلَقة'); eq(b.avgDays, 1, 'بابل يوم واحد');
  const only = carrierScorecard({ delivered: [], returns: [d('x', 'الكرم', '2026-09-01T10:00:00Z', null)] })[0];
  eq(only.returnRate, 100, 'مرتجع بلا مسلَّم = 100%'); eq(only.avgDays, null, 'بلا مسلَّم: لا متوسط');
  eq(carrierScorecard({ delivered: [], returns: [], notReceived: [] }).length, 0, 'فارغ');
}
// 18) قفل التعرفة: شهر سابق مقفل، الشهر الحالي والقادم لا
{
  eq(isRateLocked({ effective_from: '2026-09-30' }, '2026-10-28'), true, 'سبتمبر مقفلة بأكتوبر');
  eq(isRateLocked({ effective_from: '2026-10-01' }, '2026-10-28'), false, 'بداية الشهر الحالي غير مقفلة');
  eq(isRateLocked({ effective_from: '2026-10-28' }, '2026-10-28'), false, 'اليوم غير مقفلة');
  eq(isRateLocked({ effective_from: '2026-11-15' }, '2026-10-28'), false, 'قادمة غير مقفلة');
  eq(isRateLocked({ effective_from: '2025-12-31' }, '2026-01-02'), true, 'عبر حدّ السنة');
}
// 21) fetchAllRowsConcurrent: نفس نتيجة fetchAllRows بنفس الترتيب، وأخطاء الصفحات تُرمى
{
  const mkQuery = (total, calls = { n: 0 }, failAt = null) => () => ({ range: async (a, b) => { calls.n += 1; if (failAt !== null && a === failAt) return { data: null, error: new Error('boom') }; return { data: Array.from({ length: Math.max(0, Math.min(b + 1, total) - a) }, (_, k) => a + k), error: null }; } });
  for (const total of [0, 1, 999, 1000, 1001, 2500, 4000, 4001, 9999]) {
    const a = await fetchAllRows(mkQuery(total)); const c = await fetchAllRowsConcurrent(mkQuery(total));
    ok(a.length === total && c.length === total && c.every((v, k) => v === k) && JSON.stringify(a) === JSON.stringify(c), `متوازية = تسلسلية عند ${total} صفاً`);
  }
  const calls = { n: 0 }; await fetchAllRowsConcurrent(mkQuery(2500, calls));
  ok(calls.n === 4, 'دفعة واحدة (4 طلبات) تكفي لـ2500 صف');
  let threw = false; try { await fetchAllRowsConcurrent(mkQuery(5000, { n: 0 }, 2000)); } catch (e) { threw = e.message === 'boom'; }
  ok(threw, 'خطأ صفحة وسط الدفعة يُرمى لا يُبتلع');
}
// 20) تكلفة الشحن الفعلية بالطلب (carrier_cost_*) تغلب التقدير؛ NULL ≠ صفر
{
  const RT = [{ carrier: 'قدموس', market: 'syria', currency: 'SYP', outbound_fee: 150, return_policy: 'fixed', return_fee: 40, effective_from: '2026-01-01' }];
  const mk = (id, status, extra = {}) => o(id, status, { shipping_company: 'قدموس', market: 'syria', currency: 'SYP', shipping_payer: 'company', delivery_cost: 0, delivery_at: '2026-09-12T10:00:00+03:00', ...extra });
  let e = estimateOrderShipping(mk('A1', 'delivered', { carrier_cost_outbound: 120 }), RT);
  eq(e.basis, 'actual', 'الفعلي بالطلب = actual لا تقدير'); eq(e.outbound.amount, 120, 'المبلغ الفعلي 120 لا 150');
  eq(estimateOrderShipping(mk('A2', 'delivered', { carrier_cost_outbound: 0 }), RT).outbound.amount, 0, 'الصفر موثّق (مجاني)');
  eq(estimateOrderShipping(mk('A3', 'delivered', { carrier_cost_outbound: null }), RT).basis, 'estimated', 'NULL ← تقدير من التعرفة');
  eq(estimateOrderShipping(mk('A3b', 'delivered', { carrier_cost_outbound: '' }), RT).basis, 'estimated', 'نص فارغ ← تقدير');
  e = estimateOrderShipping(mk('A4', 'delivered', { carrier_cost_outbound: 90, carrier_cost_currency: 'USD' }), RT);
  eq(e.outbound.currency, 'USD', 'عملة الناقل المحدّدة');
  e = estimateOrderShipping(mk('A5', 'returned', { carrier_cost_outbound: 100, carrier_cost_return: 55 }), RT);
  eq(e.returnActual, true, 'إرجاع فعلي موثّق'); eq(e.returnFee.amount, 55, 'إرجاع فعلي 55 لا 40');
  e = estimateOrderShipping(mk('A6', 'returned', { carrier_cost_outbound: 100 }), RT);
  eq(e.returnActual, false, 'ذهاب فعلي بلا إرجاع فعلي'); eq(e.returnFee.amount, 40, 'الإرجاع يُقدَّر بالتعرفة 40'); eq(e.returnState, 'charged', 'مُحمَّل');
  eq(estimateOrderShipping(mk('A7', 'delivered', { shipping_payer: 'customer', carrier_cost_outbound: 100 }), RT).basis, 'customer_paid', 'دافع العميل يسبق (لا نحمّل الفعلي علينا)');
  eq(estimateOrderShipping(mk('A8', 'preparing', { carrier_cost_outbound: 100 }), RT).basis, 'none', 'لم يخرج: لا حساب');
  const SUM = shippingEstimateSummary([mk('S1', 'delivered', { carrier_cost_outbound: 120 }), mk('S2', 'delivered'), mk('S3', 'returned', { carrier_cost_outbound: 100, carrier_cost_return: 55 }), mk('S4', 'returned', { carrier_cost_outbound: 80 })], RT, { USD: 1 });
  eq(SUM.totals.actualByCurrency.SYP, 120 + 100 + 55 + 80, 'مجموع الفعلي: ذهاب 120+100+80 وإرجاع فعلي 55');
  eq(SUM.totals.outbound.SYP, 150, 'التقدير لطلب بلا فعلي فقط (S2)'); eq(SUM.totals.returnFee.SYP, 40, 'إرجاع مقدَّر لـS4 فقط');
  eq(SUM.totals.actual, 3, 'ثلاثة طلبات فعلية'); eq(SUM.totals.estimated, 1, 'طلب واحد مقدَّر');
}
// D-174: شهر بأكثر من دورة رواتب (تموز 2026: 3 مسودات + مدفوعة) — تُعتمد المدفوعة لا خطأ صامت
{
  const runs = [
    { id: 'd1', status: 'draft', created_at: '2026-08-01T10:00:00Z' },
    { id: 'p1', status: 'paid', created_at: '2026-07-28T10:00:00Z' },
    { id: 'd2', status: 'draft', created_at: '2026-08-03T10:00:00Z' },
  ];
  eq(pickPayrollRun(runs)?.id, 'p1', 'المدفوعة تسبق المسودات الأحدث');
  eq(pickPayrollRun([{ id: 'd1', status: 'draft', created_at: '2026-08-01' }, { id: 'f1', status: 'finalized', created_at: '2026-07-01' }])?.id, 'f1', 'المعتمدة تسبق المسودة');
  eq(pickPayrollRun([{ id: 'd1', status: 'draft', created_at: '2026-08-01' }, { id: 'd2', status: 'draft', created_at: '2026-08-03' }])?.id, 'd2', 'بين المسودات: الأحدث');
  eq(pickPayrollRun([]), null, 'لا دورة ← null');
  eq(pickPayrollRun(null), null, 'null آمن');
}
// ════ buildProductLines: تسعير كل طلب بيوم تسليمه (إسطنبول) + متوسط مرجّح عند اختلاف التكلفة (D-176) ════
{
  const near = (a, b, m) => ok(Number.isFinite(a) && Math.abs(a - b) < 1e-9, `${m} (متوقع ${b}، كان ${a})`);
  const names = [
    { alias_name: 'Retail', canonical_name: 'Retail', brand: 'lowes', is_active: true },
    { alias_name: 'RETAIL OLD', canonical_name: 'Retail', brand: 'lowes', is_active: true },
  ];
  const H = (item_name, effective_from, sale_price_usd, cost_usd) => ({ item_name, effective_from, sale_price_usd, cost_usd, ad_cost_usd: 0, shipping_cost_usd: 0 });
  // تغيير تكلفة بمنتصف الشهر (القاعدة تمنعه اليوم بقيد CHECK، والكود لا يعتمد عليه): قبل 15/10 → 10$/2$، من 15/10 → 12$/3$
  const hMid = [H('Retail', '2026-10-01', 10, 2), H('RETAIL OLD', '2026-10-15', 12, 3)];
  // صف كما تُنتجه selectDeliveredInPeriod: delivery_at + delivery_basis_final
  const D = (id, delivery_at, qty = 1, extra = {}) => ({ id, order_code: id, status: 'delivered', market: 'syria', items: [{ name: 'Retail', qty }], delivery_at, delivery_basis: 'carrier', delivery_basis_final: 'carrier', ...extra });
  const one = (row, hist, opts = {}) => buildProductLines([row], [], { nameMapRows: names, historyRows: hist, monthStart: '2026-10-01', ...opts })[0];

  // 1) طلب سُلِّم 14/10 ← القديمة؛ 15/10 و20/10 ← الجديدة (وقد مُرِّر monthStart = 1/10)
  const a14 = one(D('a14', '2026-10-14T12:00:00+03:00'), hMid), a15 = one(D('a15', '2026-10-15T12:00:00+03:00'), hMid), a20 = one(D('a20', '2026-10-20T12:00:00+03:00'), hMid);
  near(a14.cost, 2, 'DL1: 14/10 ← تكلفة قديمة 2'); near(a14.value, 10, 'DL1: 14/10 ← سعر قديم 10');
  near(a15.cost, 3, 'DL1: 15/10 ← تكلفة جديدة 3'); near(a15.value, 12, 'DL1: 15/10 ← سعر جديد 12');
  near(a20.cost, 3, 'DL1: 20/10 ← تكلفة جديدة 3'); near(a20.value, 12, 'DL1: 20/10 ← سعر جديد 12');
  // 2) تمرير monthStart لا يعطّل التسعير باليوم: نفس النتيجة بدونه وبقيم أخرى له
  for (const ms of [undefined, null, '2026-10-01', '2026-09-01', '2026-12-01']) {
    const lab = ms === undefined ? 'بلا monthStart' : `monthStart=${ms}`;
    near(one(D('b14', '2026-10-14T12:00:00+03:00'), hMid, { monthStart: ms }).cost, 2, `DL2: ${lab} ← 14/10 يبقى 2`);
    near(one(D('b20', '2026-10-20T12:00:00+03:00'), hMid, { monthStart: ms }).cost, 3, `DL2: ${lab} ← 20/10 يبقى 3`);
  }
  // 3) حدود التوقيت بتوقيت إسطنبول (+03:00) لا UTC
  near(one(D('t1', '2026-10-14T23:59:59+03:00'), hMid).cost, 2, 'DL3: 14/10 23:59:59 إسطنبول ← قبل التغيير 2');
  near(one(D('t2', '2026-10-15T00:00:00+03:00'), hMid).cost, 3, 'DL3: 15/10 00:00:00 إسطنبول ← لحظة التغيير 3');
  near(one(D('t3', '2026-10-14T20:59:59Z'), hMid).cost, 2, 'DL3: 14/10 20:59:59Z = 23:59:59 إسطنبول ← 2');
  near(one(D('t4', '2026-10-14T21:00:00Z'), hMid).cost, 3, 'DL3: 14/10 21:00:00Z = 00:00 يوم 15 بإسطنبول ← 3 (لا تُحسب 14 بحسب UTC)');
  // 4) حدّ الشهر بنسخ بداية-شهر الفعلية: 30/9 ← 2، 1/10 ← 3 — حتى لو مُرِّر monthStart الشهر الآخر
  const hMonths = [H('Retail', '2026-09-01', 10, 2), H('Retail', '2026-10-01', 12, 3)];
  near(one(D('m1', '2026-09-30T23:59:59+03:00'), hMonths, { monthStart: '2026-10-01' }).cost, 2, 'DL4: 30/9 23:59:59 ← 2 ولو monthStart=1/10');
  near(one(D('m2', '2026-10-01T00:00:00+03:00'), hMonths, { monthStart: '2026-09-01' }).cost, 3, 'DL4: 1/10 00:00:00 ← 3 ولو monthStart=1/9');
  near(one(D('m3', '2026-09-30T23:59:59+03:00'), hMonths, { monthStart: undefined }).cost, 2, 'DL4: وضع المدى (بلا monthStart) 30/9 ← 2');
  near(one(D('m4', '2026-10-01T00:00:00+03:00'), hMonths, { monthStart: undefined }).cost, 3, 'DL4: وضع المدى 1/10 ← 3');

  // 5) متوسط مرجّح بالكميات عند اختلاف التكلفة داخل الشهر: 2×(10/2) + 3×(12/3) + 5×(12/3)
  const mixed = buildProductLines([D('q14', '2026-10-14T12:00:00+03:00', 2), D('q15', '2026-10-15T12:00:00+03:00', 3), D('q20', '2026-10-20T12:00:00+03:00', 5)], [], { nameMapRows: names, historyRows: hMid, monthStart: '2026-10-01' })[0];
  near(mixed.qty, 10, 'DL5: إجمالي الكمية 10');
  near(mixed.cost, 28, 'DL5: إجمالي التكلفة = 2×2 + 3×3 + 5×3 = 28');
  near(mixed.value, 116, 'DL5: إجمالي القيمة = 2×10 + 3×12 + 5×12 = 116');
  near(mixed.profit, 88, 'DL5: إجمالي الربح = 2×8 + 3×9 + 5×9 = 88');
  near(mixed.unitCost, 2.8, 'DL5: متوسط تكلفة الوحدة = 28 ÷ 10 = 2.8 (لا تكلفة آخر طلب 3)');
  near(mixed.unitProfit, 8.8, 'DL5: متوسط ربح الوحدة = 88 ÷ 10 = 8.8 (لا ربح آخر طلب 9)');
  near(mixed.unitPrice, 11.6, 'DL5: متوسط سعر الوحدة = 116 ÷ 10');
  ok(mixed.unitCost !== 3 && mixed.unitProfit !== 9, 'DL5: لا تُعرض قيمة آخر طلب كأنها لكل الوحدات');
  eq(mixed.costMixed, true, 'DL5: costMixed = true (التكلفة اختلفت بين الطلبات)');
  // ترتيب الطلبات لا يغيّر النتيجة (المتوسط ليس «آخر طلب»)
  const mixedRev = buildProductLines([D('q20', '2026-10-20T12:00:00+03:00', 5), D('q15', '2026-10-15T12:00:00+03:00', 3), D('q14', '2026-10-14T12:00:00+03:00', 2)], [], { nameMapRows: names, historyRows: hMid, monthStart: '2026-10-01' })[0];
  near(mixedRev.unitCost, 2.8, 'DL5: عكس ترتيب الطلبات ← المتوسط نفسه'); near(mixedRev.cost, 28, 'DL5: والإجمالي نفسه');
  // بلا اختلاف ← القيمة نفسها حرفياً وبلا علامة
  const same = buildProductLines([D('s1', '2026-10-16T12:00:00+03:00', 2), D('s2', '2026-10-25T12:00:00+03:00', 4)], [], { nameMapRows: names, historyRows: hMid, monthStart: '2026-10-01' })[0];
  near(same.unitCost, 3, 'DL5: كل الطلبات بنفس التكلفة ← 3 كما هي'); near(same.unitProfit, 9, 'DL5: ربح الوحدة 9'); eq(same.costMixed, false, 'DL5: costMixed = false');

  // 6) fallback: monthStart فقط حين لا يوجد تاريخ تسليم موثوق
  const legacy = D('l1', '2026-10-20T12:00:00+03:00', 1, { delivery_basis: 'unknown', delivery_basis_final: 'legacy_order_date' });   // order_date استُعمل بديلاً
  const lg = one(legacy, hMid);
  near(lg.cost, 2, 'DL6: legacy_order_date ← fallback = نسخة بداية الشهر (2) لا يوم الطلب (3)'); near(lg.fallbackQty, 1, 'DL6: الكمية موسومة بأنها بتسعير fallback');
  near(one(legacy, hMid, { monthStart: undefined }).cost, 2, 'DL6: وضع المدى: fallback = شهر delivery_at (2)');
  const noBasis = D('l2', '2026-10-20T12:00:00+03:00'); delete noBasis.delivery_basis; delete noBasis.delivery_basis_final;
  near(one(noBasis, hMid).cost, 2, 'DL6: بلا أساس تسليم معروف ← fallback (2)'); near(one(noBasis, hMid).fallbackQty, 1, 'DL6: وموسوم fallback');
  near(a20.fallbackQty, 0, 'DL6: التسعير بيوم التسليم الموثوق ← fallbackQty = 0');
  const trusted = buildProductLines([D('x1', '2026-10-20T12:00:00+03:00', 2), legacy], [], { nameMapRows: names, historyRows: hMid, monthStart: '2026-10-01' })[0];
  near(trusted.qty, 3, 'DL6: مزيج موثوق وfallback — الكمية 3'); near(trusted.fallbackQty, 1, 'DL6: قطعة واحدة بتسعير fallback'); near(trusted.cost, 2 * 3 + 1 * 2, 'DL6: التكلفة = 2×3 (موثوق) + 1×2 (fallback)');
  near(buildProductLines([D('x2', '2026-10-20T12:00:00+03:00', 1, { delivery_basis: 'substitute_staff_event', delivery_basis_final: 'substitute_staff_event' })], [], { nameMapRows: names, historyRows: hMid, monthStart: '2026-10-01' })[0].cost, 3, 'DL6: أساس بديل متحقَّق منه (substitute_*) يُعدّ تاريخاً موثوقاً ← 3');

  // 7) تعارض بنفس فترة السريان: لا اختيار، ولا يؤثر على ما قبله
  const hConf = [H('Retail', '2026-10-01', 10, 2), H('Retail', '2026-10-15', 12, 3), H('RETAIL OLD', '2026-10-15', 12, 4)];
  const cNew = one(D('c20', '2026-10-20T12:00:00+03:00'), hConf);
  eq(cNew.warning, 'cost_conflict', 'DL7: 20/10 داخل فترة تعارض ← تحذير «تعارض» لا «بلا تكلفة»'); near(cNew.cost, 0, 'DL7: لا تكلفة مختارة (لا 3 ولا 4)'); near(cNew.profit, 0, 'DL7: لا ربح مُخمَّن');
  near(one(D('c14', '2026-10-14T12:00:00+03:00'), hConf).cost, 2, 'DL7: 14/10 قبل فترة التعارض ← 2 غير متأثر');
  near(one(D('c20', '2026-10-20T12:00:00+03:00'), hConf, { }).cost, 0, 'DL7: monthStart لا يتجاوز التعارض');
  const cMix = buildProductLines([D('d14', '2026-10-14T12:00:00+03:00'), D('d20', '2026-10-20T12:00:00+03:00')], [], { nameMapRows: names, historyRows: hConf, monthStart: '2026-10-01' })[0];
  near(cMix.cost, 2, 'DL7: تكلفة الطلب المسعَّر فقط (2) — لا تُنسب التكلفة المجهولة'); near(cMix.unitCost, 2, 'DL7: متوسط التكلفة على الوحدات المسعَّرة فقط (المقام = الوحدات داخل الإجمالي)'); eq(cMix.warning, 'cost_conflict', 'DL7: والتحذير يبقى (تعارض)');
  const cDecided = buildProductLines([D('e20', '2026-10-20T12:00:00+03:00')], [], { nameMapRows: names, historyRows: hConf, monthStart: '2026-10-01', costDecisions: { 'Retail||2026-10-15': 4 } })[0];
  near(cDecided.cost, 4, 'DL7: قرار المالك لفترة 15/10 يُطبَّق على /sales-delivery أيضاً');

  // 8) المرتجعات: تُعدّ كميات فقط ولا تغيّر التسعير ولا تُسعَّر بيوم الإرجاع
  const rets = [{ id: 'r1', status: 'returned', market: 'syria', items: [{ name: 'Retail', qty: 4 }], return_at: '2026-10-25T10:00:00+03:00', return_kind: 'after_delivery' }, { id: 'r2', status: 'returned', market: 'syria', items: [{ name: 'Retail', qty: 1 }], return_kind: 'unknown_timing' }];
  const withRet = buildProductLines([D('f14', '2026-10-14T12:00:00+03:00'), D('f20', '2026-10-20T12:00:00+03:00')], rets, { nameMapRows: names, historyRows: hMid, monthStart: '2026-10-01' })[0];
  near(withRet.returnedQty, 4, 'DL8: مرتجع موثوق 4 قطع'); near(withRet.returnedUnknownQty, 1, 'DL8: مرتجع توقيته مجهول 1 منفصل');
  near(withRet.cost, 2 + 3, 'DL8: المرتجعات لا تغيّر تكلفة المبيعات (14/10 ← 2، 20/10 ← 3)');
  const onlyRet = buildProductLines([], rets, { nameMapRows: names, historyRows: hMid, monthStart: '2026-10-01' })[0];
  near(onlyRet.cost, 0, 'DL8: مرتجع بلا مبيعات ← لا تكلفة'); near(onlyRet.unitCost, 0, 'DL8: ولا تكلفة وحدة'); eq(onlyRet.costMixed, false, 'DL8: ولا علامة اختلاط');

  // 9) من الطرف إلى الطرف عبر الشاشة: selectDeliveredInPeriod ← buildReport (يمرّر period.monthStart)
  const e2e = [
    o('Z14', 'delivered', { market: 'syria', items: [{ name: 'Retail', qty: 1 }], delivered_at: '2026-10-14T23:59:59+03:00', delivery_basis: 'carrier' }),
    o('Z15', 'delivered', { market: 'syria', items: [{ name: 'Retail', qty: 1 }], delivered_at: '2026-10-15T00:00:00+03:00', delivery_basis: 'carrier' }),
    o('Z20', 'delivered', { market: 'syria', items: [{ name: 'Retail', qty: 1 }], delivered_at: '2026-10-20T10:00:00+03:00', delivery_basis: 'carrier' }),
    o('ZL', 'delivered', { market: 'syria', items: [{ name: 'Retail', qty: 1 }], order_date: '2026-10-22T10:00:00+03:00', delivered_at: null, delivery_basis: 'unknown' }),   // بلا تسليم موثوق ← order_date
  ];
  const rep = buildReport({ rows: e2e, period: oct, refs: { nameMapRows: names, historyRows: hMid } });
  const pl = rep.products.find((p) => p.name === 'Retail');
  eq(oct.monthStart, '2026-10-01', 'DL9: الفترة تحمل monthStart');
  near(pl.qty, 4, 'DL9: 4 طلبات'); near(pl.cost, 2 + 3 + 3 + 2, 'DL9: 14/10 ← 2، 15/10 و20/10 ← 3، والبلا-تسليم-موثوق ← fallback بداية الشهر 2');
  near(pl.fallbackQty, 1, 'DL9: قطعة واحدة بتسعير fallback'); eq(pl.costMixed, true, 'DL9: costMixed'); near(pl.unitCost, 2.5, 'DL9: متوسط مرجّح = 10 ÷ 4');
  const ex = exportSheets(rep, {})['المنتجات المسلّمة'];
  ok(ex[0].some((h) => /تكلفة الوحدة/.test(h)) && ex[0].some((h) => /متوسط/.test(h)), 'DL9: ورقة Excel فيها تكلفة الوحدة وتسمية «متوسط مرجّح»');
  // 10) المراجعة النهائية لـ#128: التكلفة المتعارضة تظهر «تعارض — بانتظار قرار» لا «بلا تكلفة»؛ الناقصة فعلاً تبقى «بلا تكلفة»
  {
    const hConf10 = [H('Retail', '2026-10-01', 10, 2), H('Retail', '2026-10-15', 12, 3), H('RETAIL OLD', '2026-10-15', 12, 4)];
    eq(one(D('t20', '2026-10-20T12:00:00+03:00'), hConf10).warning, 'cost_conflict', 'DL10: داخل فترة تعارض ← cost_conflict');
    eq(one(D('t14', '2026-10-14T12:00:00+03:00'), [H('Retail', '2026-10-01', 10, 0)]).warning, 'no_cost', 'DL10: تكلفة صفر فعلاً (لا تعارض) ← no_cost كما كان');
    const both = buildProductLines([D('t1', '2026-10-20T12:00:00+03:00'), D('t2', '2026-10-25T12:00:00+03:00')], [], { nameMapRows: names, historyRows: hConf10, monthStart: '2026-10-01' })[0];
    eq(both.warning, 'cost_conflict', 'DL10: كل الطلبات متعارضة ← cost_conflict');
    eq(one(D('t3', '2026-10-20T12:00:00+03:00'), [H('Retail', '2026-10-01', 0, 2), H('Retail', '2026-10-15', 0, 3), H('RETAIL OLD', '2026-10-15', 0, 4)]).warning, 'no_price', 'DL10: بلا سعر يبقى الأولوية');
    eq(buildProductLines([D('t4', '2026-10-20T12:00:00+03:00')], [], { nameMapRows: names, historyRows: hConf10, monthStart: '2026-10-01', costDecisions: { 'Retail||2026-10-15': 4 } })[0].warning, null, 'DL10: بعد قرار المالك لا تحذير');
    const hNoPrice = [H('Retail', '2026-10-01', 0, 2), H('Retail', '2026-10-15', 12, 3), H('RETAIL OLD', '2026-10-15', 12, 4)];
    eq(buildProductLines([D('t5', '2026-10-05T12:00:00+03:00'), D('t6', '2026-10-20T12:00:00+03:00')], [], { nameMapRows: names, historyRows: hNoPrice, monthStart: '2026-10-01' })[0].warning, 'no_price', 'DL10: طلب بلا سعر ثم طلب متعارض ← يبقى «بلا سعر» (الأشد)');
  }
}
// D-179: تأكيد المالية للتسليم لا ينقل البيع بين أشهر العمولات/الرواتب افتراضياً (قرار مالك مؤجَّل)
{
  eq(FINANCE_CONFIRMED_AFFECTS_PAYROLL, false, 'FC1: الافتراضي = لا أثر على العمولات');
  const fc = o('FC', 'delivered', { order_date: '2026-09-10T10:00:00+03:00', delivered_at: '2026-10-03T12:00:00+03:00', delivery_basis: 'finance_confirmed' });
  eq(deliveryEntry(fc).basis, 'legacy_order_date', 'FC2: يُحتسب بتاريخ الطلب القديم');
  eq(deliveryEntry(fc).at, fc.order_date, 'FC2: التاريخ = order_date');
  eq(ids(selectDeliveredInPeriod([fc], sep).delivered), 'FC', 'FC3: يبقى بشهر الطلب (سبتمبر)');
  eq(selectDeliveredInPeriod([fc], oct).delivered.length, 0, 'FC3: ولا يدخل أكتوبر');
  eq(ids(selectDeliveredInPeriod([fc], { ...oct, financeConfirmed: true }).delivered), 'FC', 'FC4: بعد تفعيل القرار يدخل أكتوبر');
  eq(deliveryEntry(fc, { financeConfirmed: true }).basis, 'finance_confirmed', 'FC4: الأساس يبقى finance_confirmed');
  eq(deliveryEntry(fc, { includeLegacy: false }), null, 'FC5: بلا legacy لا يدخل');
  eq(selectDeliveredInPeriod([fc], { ...sep, includeLegacy: false }).legacyExcluded.length, 1, 'FC5: يظهر ضمن المستبعدين');
  const car = o('CR', 'delivered', { delivered_at: '2026-10-03T12:00:00+03:00', delivery_basis: 'carrier' });
  eq(deliveryEntry(car).basis, 'carrier', 'FC6: أدلة الشحن لا تتأثر');
  const st = o('ST', 'settled', { delivered_at: '2026-10-03T12:00:00+03:00', delivery_basis: 'finance_confirmed' });
  eq(selectDeliveredInPeriod([st], oct).delivered.length, 0, 'FC7: settled بتأكيد مالي فقط لا يدخل أكتوبر افتراضياً');
}
console.log(`\nنتيجة: ${pass}/${pass + fail}`);
process.exit(fail === 0 ? 0 : 1);
