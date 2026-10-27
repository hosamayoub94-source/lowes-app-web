// اختبار منطق الفترة بتاريخ التسليم — node test-delivery-accounting.mjs
import fs from 'node:fs';
import { periodBounds, selectDeliveredInPeriod, selectUndelivered, buildReport, buildProductLines, buildPayrollIndex, applyFilters, toUsd, NON_ACCOUNTING_STATUSES, exportSheets, describeLoadError } from './src/utils/deliveryAccounting.js';
import { buildStatusViews, bulkMinutes } from './src/utils/statusLedger.js';
import { carrierKey, piecesOf, shippingPayerKind, shippingSummary, returnKind, returnsAnalysis, settlementRows } from './src/utils/returnsShipping.js';

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
  ok(Object.keys(sheets).length === 10, 'عشر أوراق تصدير (ست + المرتجعات + الشحن + التسويات + الوضع الحالي)'); eq(sheets['الفترة'][1][1], 'delivery transition date', 'معيار الإدخال بالتصدير');
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
console.log(`\nنتيجة: ${pass}/${pass + fail}`);
process.exit(fail === 0 ? 0 : 1);
