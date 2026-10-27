// اختبار منطق الفترة بتاريخ التسليم — node test-delivery-accounting.mjs
import { periodBounds, selectDeliveredInPeriod, selectUndelivered, buildReport, buildProductLines, buildPayrollIndex, applyFilters, toUsd, NON_ACCOUNTING_STATUSES, exportSheets, describeLoadError } from './src/utils/deliveryAccounting.js';

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
  ok(Object.keys(sheets).length === 6, 'ست أوراق تصدير'); eq(sheets['الفترة'][1][1], 'delivery transition date', 'معيار الإدخال بالتصدير');
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
console.log(`\nنتيجة: ${pass}/${pass + fail}`);
process.exit(fail === 0 ? 0 : 1);
