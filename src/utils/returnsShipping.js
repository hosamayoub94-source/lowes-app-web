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
  [/موتور|ميتور/i, 'الموتور'],
  [/يورت|yurti/i, 'Yurtiçi'],
  [/\bptt\b/i, 'PTT'],
  [/aras/i, 'Aras'],
  [/s[üu]rat/i, 'Sürat'],
  [/مندوب/i, 'مندوب توصيل (الإمارات)'],
];
/** اسم موحّد للعرض: اسم غير معروف يبقى كما هو بعد التنظيف؛ فارغ = «بلا شركة». */
export function carrierKey(raw) {
  const s = String(raw ?? '').replace(/\s+/g, ' ').trim();
  if (!s) return 'بلا شركة';
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
    const carrier = carrierKey(o.shipping_company);
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
  reliable: 'مرتجع موثوق',
  unknown_timing: 'مرتجع بتوقيت غير موثوق (جماعي/بلا تاريخ)',
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
    const kind = returnKind(o);
    if (!kind) continue;
    const pieces = piecesOf(o);
    for (const g of [byKind[kind], out.total]) {
      g.orders += 1; g.pieces += pieces;
      addCur(g.byCurrency, o.currency, num(o.amount));
      const u = usdOf(o.amount, o.currency, rateMap);
      if (u === null) g.usdMissing += 1; else g.usd = round2(g.usd + u);
    }
    if (o.status === 'returned') {
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

/** مفتاح مقارنة لاسم الشركة بالفلاتر. */
export const carrierMatches = (o, key) => !key || key === 'all' || carrierKey(o.shipping_company) === key || normName(o.shipping_company) === normName(key);
