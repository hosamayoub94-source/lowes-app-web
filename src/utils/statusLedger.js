// =============================================================
// statusLedger — «الوضع الحالي» مقابل «ما حدث خلال الفترة» للمرتجعات وعدم الاستلام والتسويات (دوال صرفة)
// اختبار: node test-delivery-accounting.mjs
//
// قرار حسام (D-161، 27 تشرين الأول 2026) — لا نافذة 60/120 يوماً:
//  • الوضع الحالي = orders.status الآن (returning / not_received) بلا أي نافذة زمنية. لا يُنسب للشهر، ولا يدخل
//    مبيعات ولا عمولات ولا رواتب.
//  • ما حدث خلال الفترة = أحداث order_status_history (to_status، changed_at داخل الفترة). حدث «جماعي»
//    (≥ 30 حدثاً بنفس الدقيقة ونفس الحالة) توقيته غير موثوق ← «توقيت غير معروف» ولا يُنسب لشهر.
//  • مرتجع (returned) حالياً بلا حدث إرجاع غير جماعي ← «توقيت غير معروف». راجع/لم يُستلم حالياً بلا حدث موثوق لحالته ← غير معروف أيضاً.
//  • التسويات: أحداث to_status='settled' داخل الفترة (تاريخ التسوية)، لا order_date. settled بلا أي حدث تسوية ← غير معروف التوقيت.
//  • settled لا يدخل مبيعاً ولا عمولة ولا راتباً (التسليم يُحدَّد بمحدِّد التسليم وحده؛ هذا الملف لا يضيف مبيعات).
// =============================================================
import { piecesOf } from './returnsShipping.js';

export const LEDGER_STATUSES = ['returning', 'not_received', 'returned', 'settled'];
export const BULK_MIN = 30;
const ts = (v) => { const t = Date.parse(v); return Number.isFinite(t) ? t : null; };
const minuteKey = (v) => `${new Date(ts(v)).toISOString().slice(0, 16)}`;

/** مجموعة مفاتيح status|دقيقة التي فيها ≥ 30 حدثاً (تحديث جماعي). */
export function bulkMinutes(events) {
  const c = new Map();
  for (const e of events || []) { if (ts(e.changed_at) === null) continue; const k = `${e.to_status}|${minuteKey(e.changed_at)}`; c.set(k, (c.get(k) || 0) + 1); }
  return new Set([...c.entries()].filter(([, n]) => n >= BULK_MIN).map(([k]) => k));
}

const byOrderDesc = (events) => {
  const m = new Map();
  for (const e of events || []) { if (!m.has(e.order_id)) m.set(e.order_id, []); m.get(e.order_id).push(e); }
  for (const arr of m.values()) arr.sort((a, b) => ts(b.changed_at) - ts(a.changed_at));
  return m;
};

/**
 * @param {{events:Array, orders:Array, paths?:Map|object}} ledger  events = أحداث الحالات الأربع (كل الأزمنة)، orders = صفوف orders المعنية (الحالية + أصحاب أحداث الفترة)
 * @param {{from:string,to:string}} period
 */
export function buildStatusViews(ledger, { from, to } = {}) {
  const t0 = ts(from), t1 = ts(to);
  const events = ledger?.events || [];
  const orders = new Map((ledger?.orders || []).map((o) => [o.id, o]));
  const bulk = bulkMinutes(events);
  const isBulk = (e) => bulk.has(`${e.to_status}|${minuteKey(e.changed_at)}`);
  const evs = byOrderDesc(events);
  const pathOf = (id) => (ledger?.paths instanceof Map ? ledger.paths.get(id) : ledger?.paths?.[id]) || [];

  const current = { returning: [], not_received: [] };
  const unknown = [];
  for (const o of orders.values()) {
    if (o.deleted_at) continue;
    if (o.status === 'returning' || o.status === 'not_received') {
      const mine = (evs.get(o.id) || []).filter((e) => e.to_status === o.status);
      const reliable = mine.find((e) => !isBulk(e));
      const row = { ...o, status_since: reliable ? reliable.changed_at : null, pieces: piecesOf(o) };
      current[o.status].push(row);
      if (!reliable) unknown.push({ ...row, return_kind: 'unknown_timing', unknown_status: o.status, unknown_reason: mine.length ? 'bulk_event' : 'no_history' });
    } else if (o.status === 'returned') {
      const mine = (evs.get(o.id) || []).filter((e) => e.to_status === 'returned');
      const last = mine[0];
      if (!last || isBulk(last)) unknown.push({ ...o, pieces: piecesOf(o), return_kind: 'unknown_timing', unknown_reason: last ? 'bulk_event' : 'no_history' });
    }
  }

  // أحداث الفترة (راجع/لم يُستلم): أحدث حدث غير جماعي لكل طلب داخل الفترة
  const period = { returning: [], not_received: [] };
  const seen = { returning: new Set(), not_received: new Set() };
  let bulkEventsInPeriod = 0;
  const inPeriod = events.filter((e) => { const t = ts(e.changed_at); return t !== null && t >= t0 && t < t1; }).sort((a, b) => ts(b.changed_at) - ts(a.changed_at));
  for (const e of inPeriod) {
    if (e.to_status !== 'returning' && e.to_status !== 'not_received') continue;
    if (isBulk(e)) { bulkEventsInPeriod += 1; continue; }
    if (seen[e.to_status].has(e.order_id)) continue;
    const o = orders.get(e.order_id);
    if (!o || o.deleted_at) continue;
    seen[e.to_status].add(e.order_id);
    period[e.to_status].push({ ...o, event_status: e.to_status, event_at: e.changed_at, return_kind: e.to_status, pieces: piecesOf(o), current_status: o.status });
  }

  // التسويات: حدث settled داخل الفترة (تاريخ التسوية) — أحدث حدث لكل طلب
  const settlements = [];
  const sSeen = new Set();
  for (const e of inPeriod) {
    if (e.to_status !== 'settled' || sSeen.has(e.order_id)) continue;
    sSeen.add(e.order_id);
    const o = orders.get(e.order_id);
    if (!o || o.deleted_at) continue;
    settlements.push(settlementRow(o, e.changed_at, pathOf(e.order_id)));
  }
  // طلبات settled حالياً بلا أي حدث تسوية: توقيت غير معروف (لا تُنسب لشهر)
  const settledEverIds = new Set(events.filter((e) => e.to_status === 'settled').map((e) => e.order_id));
  const settlementsUnknown = [...orders.values()].filter((o) => o.status === 'settled' && !o.deleted_at && !settledEverIds.has(o.id)).map((o) => settlementRow(o, null, pathOf(o.id)));

  return { current, period, unknown, settlements, settlementsUnknown, bulkEventsInPeriod };
}

export const SETTLEMENT_KINDS = {
  not_received_settled: 'لم يُستلم ثم سُوّي',
  delivered_settled: 'مسلَّم ثم سُوّي',
  other_path: 'مسار آخر',
  no_path: 'سُوّي بلا مسار حالات',
};
/** سطر تسوية: path = [{to_status, changed_at}] لكل تاريخ الطلب. delivered_before = حدث تسليم قبل التسوية. */
export function settlementRow(o, settledAt, path) {
  const sorted = [...(path || [])].sort((a, b) => ts(a.changed_at) - ts(b.changed_at));
  const cut = settledAt ? sorted.filter((p) => ts(p.changed_at) < ts(settledAt) || (p.to_status === 'settled' && p.changed_at === settledAt)) : sorted;
  const names = cut.map((p) => p.to_status);
  const before = names.filter((n, i) => !(n === 'settled' && i === names.length - 1));
  const deliveredBefore = before.includes('delivered');
  let kind = 'other_path';
  if (!names.length) kind = 'no_path';
  else if (deliveredBefore) kind = 'delivered_settled';
  else if (before.includes('not_received')) kind = 'not_received_settled';
  const num = (v) => Number(v) || 0;
  return {
    ...o, settled_at: settledAt, settlement_kind: kind, path: names.length ? names.join(' › ') : '—', delivered_before: deliveredBefore,
    collected_known: num(o.paid_amount) > 0, shipping_documented: num(o.delivery_cost) > 0, pieces: piecesOf(o),
  };
}
