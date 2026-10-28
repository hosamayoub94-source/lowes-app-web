// =============================================================
// returnsShipping — تحليل المرتجعات والشحن والتسويات (دوال صرفة، بلا Supabase)
// اختبار: node test-delivery-accounting.mjs
//
// المرحلة 1 (D-161): من البيانات الموجودة فقط — بلا Migration ولا تغيير بيانات تاريخية.
// قاعدة العرض: المجهول يظهر «غير موثّق» ولا يظهر صفراً.
//  • تكلفة الشحن «موثّقة» فقط إن كانت delivery_cost > 0؛ غير ذلك = غير موثّقة (لا صفر).
//  • الدافع: customer/company يُعتمدان فقط مع تكلفة موثّقة؛ shipping_payer الافتراضي 'company' لا يُعتبر دليلاً.
//  • تكلفة العميل (يدفعها العميل عند التسليم) لا تُخلط بتكلفة الشركة ولا بإيراد المنتجات ولا بـorders.amount.
//  • المرتجع «موثوق» فقط إن كان status=returned وله return_at غير جماعي (return_bulk_suspect=false).
//  • أسماء الشركات تُوحَّد للعرض والفلترة فقط (لا كتابة بالبيانات) — التوحيد الحقيقي في جلسة منفصلة.
// =============================================================
import { normName } from './profitabilityCalc.js';

const num = (v) => Number(v) || 0;
const round2 = (v) => Math.round(v * 100) / 100;
const usdOf = (amount, currency, rateMap) => {
  const cur = String(currency || 'USD').toUpperCase();
  if (cur === 'USD') return num(amount);
  const r = rateMap?.[cur];
  return r > 0 ? num(amount) * r : null;
};
const addCur = (by, cur, v) => { const c = String(cur || 'USD').toUpperCase(); by[c] = round2((by[c] || 0) + v); };

// ───────────── شركات الشحن (عرض فقط) ─────────────
const CARRIER_RULES = [
  [/unpaid|paid|مدفوع|غير ?مدفوع/i, 'غير مصنّف (حقل دفع بدل الناقل)'],
  [/بابل|babel/i, 'بابل'],
  [/كرم|karam/i, 'الكرم'],
  [/قدموس|qadmous/i, 'قدموس'],
  [/[إا]يزلا|izla|isla/i, 'إيزلا'],
  [/مسارات/i, 'مسارات'],
  [/صل[ةه]/i, 'صلة'],
  [/فاتح/i, 'فاتح كارغو'],
  [/جرمانا/i, 'توصيل جرمانا'],
  [/مشوار/i, 'مشوار'],
  [/العودة/i, 'العودة'],
  [/موتور|ميتور/i, 'الموتور'],
  [/يورت|yurti/i, 'Yurtiçi'],
  [/\bptt\b/i, 'PTT'],
  [/aras/i, 'Aras'],
  [/s[üu]rat/i, 'Sürat'],
  [/مندوب/i, 'مندوب توصيل (الإمارات)'],
];
/** اسم موحّد للعرض: اسم غير معروف يبقى كما هو بعد التنظيف؛ فارغ = «بلا شركة». */
export function carrierKey(raw, market) {
  const s = String(raw ?? '').replace(/\s+/g, ' ').trim();
  if (!s) return 'بلا شركة';
  // سوريا: «الموتور» بكل صيغه القديمة = «مشوار» (توصيل الشام وريفها)؛ موتور إسطنبول (تركيا) يبقى «الموتور»
  if (market === 'syria' && /مشوار|موتور|ميتور/i.test(s)) return 'مشوار';
  for (const [re, name] of CARRIER_RULES) if (re.test(s)) return name;
  return s;
}

// ───────────── القطع ─────────────
/** قطع الطلب من items (كمية صالحة 1..500؛ غيرها تُعدّ 1 كما بمنطق المنتجات). */
export function piecesOf(o) {
  let n = 0;
  for (const it of Array.isArray(o?.items) ? o.items : []) {
    if (!String(it?.name ?? '').trim()) continue;
    const q = Number(it.qty);
    n += Number.isFinite(q) && q > 0 && q <= 500 ? q : 1;
  }
  return n;
}

// ───────────── الشحن ─────────────
export const hasDocumentedCost = (o) => num(o?.delivery_cost) > 0;
/** customer | company | unknown (unknown = تكلفة غير موثّقة، مهما كان الافتراضي). */
export function shippingPayerKind(o) {
  if (!hasDocumentedCost(o)) return 'unknown';
  return o.shipping_payer === 'customer' ? 'customer' : 'company';
}
export const PAYER_LABELS = { customer: 'على العميل', company: 'علينا', unknown: 'غير موثّق' };

/**
 * ملخص الشحن حسب (شركة × دافع). orders = المسلَّمة + المرتجعة + عدم الاستلام (ما يُحلَّل).
 * الصفوف: {carrier, payer, orders, documentedOrders, byCurrency, usd, usdMissing}
 * totals: لكل دافع (customer/company) مجاميع التكلفة الموثّقة فقط + عدد الطلبات بلا تكلفة موثّقة.
 */
export function shippingSummary(orders, rateMap) {
  const m = new Map();
  const totals = { customer: { orders: 0, byCurrency: {}, usd: 0, usdMissing: 0 }, company: { orders: 0, byCurrency: {}, usd: 0, usdMissing: 0 }, unknownOrders: 0, orders: 0 };
  for (const o of orders || []) {
    const carrier = carrierKey(o.shipping_company, o.market);
    const payer = shippingPayerKind(o);
    const k = `${carrier}|${payer}`;
    const g = m.get(k) || { carrier, payer, orders: 0, byCurrency: {}, usd: 0, usdMissing: 0 };
    g.orders += 1; totals.orders += 1;
    if (payer === 'unknown') totals.unknownOrders += 1;
    else {
      const c = num(o.delivery_cost);
      addCur(g.byCurrency, o.currency, c);
      addCur(totals[payer].byCurrency, o.currency, c);
      totals[payer].orders += 1;
      const u = usdOf(c, o.currency, rateMap);
      if (u === null) { g.usdMissing += 1; totals[payer].usdMissing += 1; } else { g.usd = round2(g.usd + u); totals[payer].usd = round2(totals[payer].usd + u); }
    }
    m.set(k, g);
  }
  const rows = [...m.values()].sort((a, b) => (a.carrier === b.carrier ? (a.payer < b.payer ? -1 : 1) : b.orders - a.orders));
  return { rows, totals };
}

// ───────────── المرتجعات ─────────────
export const RETURN_KIND_LABELS = {
  reliable: 'تم الاسترجاع (موثوق)',
  unknown_timing: 'تم الاسترجاع بتوقيت غير موثوق (جماعي/بلا تاريخ)',
  returning: 'راجع للمركز',
  not_received: 'لم يُستلم',
};
/** نوع المرتجع. null = ليس مرتجعاً/عدم استلام. */
export function returnKind(o) {
  if (o?.status === 'returned') return o.return_at && !o.return_bulk_suspect ? 'reliable' : 'unknown_timing';
  if (o?.status === 'returning') return 'returning';
  if (o?.status === 'not_received') return 'not_received';
  return null;
}

const emptyVal = () => ({ orders: 0, pieces: 0, byCurrency: {}, usd: 0, usdMissing: 0 });
/**
 * تحليل المرتجعات: لكل نوع {orders, pieces, byCurrency, usd}. القيمة = orders.amount الفعلية (لا تحليلية).
 * deliveredBeforeReturn: عدد المرتجعات النهائية التي لها تسليم سابق بالسجل (قد يتأثر بتذبذب سجل الحالات → conflict).
 * restock: موثّق (حركة «استرداد للمخزون») أم غير موثّق. تكلفة الشحن (ذهاب/إياب) تُلخَّص من shippingSummary لا هنا.
 */
export function returnsAnalysis(rows, rateMap) {
  const byKind = { reliable: emptyVal(), unknown_timing: emptyVal(), returning: emptyVal(), not_received: emptyVal() };
  const out = { byKind, total: emptyVal(), deliveredBeforeReturn: 0, historyConflict: 0, restockDocumented: 0, restockUndocumented: 0, costUndocumented: 0, rows: [] };
  for (const o of rows || []) {
    const kind = o.return_kind || returnKind(o);
    if (!kind || !byKind[kind]) continue;
    const pieces = piecesOf(o);
    for (const g of [byKind[kind], out.total]) {
      g.orders += 1; g.pieces += pieces;
      addCur(g.byCurrency, o.currency, num(o.amount));
      const u = usdOf(o.amount, o.currency, rateMap);
      if (u === null) g.usdMissing += 1; else g.usd = round2(g.usd + u);
    }
    // تسليم سابق/استرداد المخزون معلومتان من profitability_orders فقط: لا تُحسبان لصفوف لا تحملهما (سجل الحالات/orders)
    if (o.status === 'returned' && 'restock_qty' in o) {
      if (o.delivered_before_return) out.deliveredBeforeReturn += 1;
      if (num(o.restock_qty) > 0) out.restockDocumented += 1; else out.restockUndocumented += 1;
    }
    if (o.history_conflict) out.historyConflict += 1;
    if (!hasDocumentedCost(o)) out.costUndocumented += 1;
    out.rows.push({ ...o, return_kind: kind, pieces });
  }
  return out;
}

// ───────────── التسويات (settled) ─────────────
export const SETTLEMENT_KIND_LABELS = {
  not_received_settled: 'لم يُستلم ثم سُوّي',
  delivered_settled: 'مسلَّم ثم سُوّي',
  no_path: 'سُوّي بلا مسار حالات',
  other_path: 'مسار آخر',
};
/**
 * سطور التسويات. paths: Map(id → مصفوفة حالات بالترتيب) أو كائن. التسوية لا تُثبت تحصيل أجرة الشحن:
 * المبلغ المحصّل يظهر فقط إن كان paid_amount > 0، وإلا «غير موثّق».
 */
export function settlementRows(settled, paths) {
  const get = (id) => (paths instanceof Map ? paths.get(id) : paths?.[id]) || [];
  return (settled || []).filter((o) => o.status === 'settled').map((o) => {
    const p = get(o.id);
    const before = p.slice(0, Math.max(0, p.lastIndexOf('settled')));
    let kind = 'other_path';
    if (!p.length) kind = 'no_path';
    else if (before.includes('delivered')) kind = 'delivered_settled';
    else if (before.includes('not_received')) kind = 'not_received_settled';
    return {
      ...o, settlement_kind: kind, path: p.length ? p.join(' › ') : '—',
      collected_known: num(o.paid_amount) > 0, shipping_documented: hasDocumentedCost(o),
    };
  });
}

/**
 * بطاقة أداء شركات الشحن للفترة (لكل شركة × سوق): مسلَّم، مرتجع نهائي، لم يُستلم (أحداث الفترة)،
 * نسبة الإرجاع = مرتجع/(مسلَّم+مرتجع)، متوسط أيام التسليم (من تاريخ الطلب إلى تسليمه الموثّق — يُستثنى التسليم بتاريخ تقديري legacy)،
 * وتكلفة الشحنة الناجحة = «علينا» ÷ المسلَّم لكل عملة (إن وُجدت تعرفة/تكلفة موثّقة). لا أرقام مختلَقة: ما لا يُحسب يبقى null.
 * @param {{delivered:Array, returns:Array, notReceived:Array, weBearByCarrier?:Map}} p  weBearByCarrier: اسم الشركة → خريطة عملة→مبلغ
 */
export function carrierScorecard({ delivered = [], returns = [], notReceived = [], weBearByCarrier = new Map() } = {}) {
  const m = new Map();
  const slot = (o) => {
    const carrier = carrierKey(o.shipping_company, o.market);
    const k = `${carrier}|${o.market}`;
    if (!m.has(k)) m.set(k, { key: k, carrier, market: o.market, delivered: 0, returned: 0, notReceived: 0, daysSum: 0, daysN: 0, returnRate: null, avgDays: null, costPerDelivered: null });
    return m.get(k);
  };
  for (const o of delivered) {
    const g = slot(o); g.delivered += 1;
    if (o.delivery_source !== 'legacy_order_date') {
      const a = Date.parse(o.order_date), b = Date.parse(o.delivery_at);
      if (Number.isFinite(a) && Number.isFinite(b) && b >= a) { g.daysSum += (b - a) / 86400000; g.daysN += 1; }
    }
  }
  for (const o of returns) slot(o).returned += 1;
  for (const o of notReceived) slot(o).notReceived += 1;
  const rows = [...m.values()];
  for (const g of rows) {
    const total = g.delivered + g.returned;
    g.returnRate = total > 0 ? round2((g.returned / total) * 100) : null;
    g.avgDays = g.daysN > 0 ? round2(g.daysSum / g.daysN) : null;
    // ما ندفعه مُجمَّع بالشركة (لا بالسوق) فيُقسم على مسلَّم الشركة كلها ليبقى الرقم متسقاً
    const we = weBearByCarrier.get(g.carrier);
    const carrierDelivered = rows.filter((x) => x.carrier === g.carrier).reduce((n, x) => n + x.delivered, 0);
    if (we && carrierDelivered > 0 && Object.keys(we).length) {
      g.costPerDelivered = {};
      for (const [c, v] of Object.entries(we)) g.costPerDelivered[c] = round2(v / carrierDelivered);
    }
    delete g.daysSum; delete g.daysN;
  }
  return rows.sort((a, b) => (b.delivered + b.returned) - (a.delivered + a.returned));
}

/** مفتاح مقارنة لاسم الشركة بالفلاتر. */
export const carrierMatches = (o, key) => !key || key === 'all' || carrierKey(o.shipping_company, o.market) === key || normName(o.shipping_company) === normName(key);
