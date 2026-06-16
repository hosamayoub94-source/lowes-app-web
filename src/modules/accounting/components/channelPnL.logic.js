// =============================================================
// منطق نقيّ — الربح/الخسارة لكل قناة (مصدر/جهة) — قابل للاختبار بلا React.
//   • الدخل → وارد · المصروف/الراتب/السلفة → صادر · التحويلات تُستثنى.
//   • التجميع حسب channel_id (وإلا category كاحتياط).
//   • لكل قناة: in/out/net لكل عملة + صافي موحّد بالدولار (تقريبي عبر rateMap).
// =============================================================
import { ENTRY_TYPE, convertToUsd } from '../types/accounting.types.js';
import { CCY, blank } from './sourceBreakdown.logic.js';

const OUT_TYPES = new Set([ENTRY_TYPE.EXPENSE, ENTRY_TYPE.SALARY, ENTRY_TYPE.ADVANCE]);
const CUR_OF = { amount_usd: 'USD', amount_try: 'TRY', amount_syp: 'SYP' };

function usdOf(amounts, rateMap) {
  return CCY.reduce((s, c) => s + convertToUsd(amounts[c.key], CUR_OF[c.key], rateMap), 0);
}

/**
 * @param {Array} entries
 * @param {{channels?: Array, rates?: Object}} opts  rates = { TRY, SYP } وحدات لكل 1$
 * @returns {{rows, totals, grand}}
 */
export function computeChannelPnL(entries = [], { channels = [], rates = {} } = {}) {
  const chById = new Map(channels.map(c => [c.id, c]));
  const map = {};
  const totals = { in: blank(), out: blank() };

  for (const e of entries) {
    const isIn  = e.entry_type === ENTRY_TYPE.INCOME;
    const isOut = OUT_TYPES.has(e.entry_type);
    if (!isIn && !isOut) continue;                       // التحويلات وغيرها تُستثنى
    const ch   = e.channel_id ? chById.get(e.channel_id) : null;
    const key  = e.channel_id || (e.category && String(e.category).trim()) || 'غير محدّد';
    const name = ch ? ch.name_ar : ((e.category && String(e.category).trim()) || 'غير محدّد');
    if (!map[key]) map[key] = { key, name, channel: ch || null, in: blank(), out: blank(), count: 0 };
    map[key].count += 1;
    const bucket = isIn ? map[key].in : map[key].out;
    const totB   = isIn ? totals.in : totals.out;
    for (const c of CCY) {
      const v = Number(e[c.key]) || 0;
      bucket[c.key] += v;
      totB[c.key]   += v;
    }
  }

  const rows = Object.values(map).map(r => {
    const net = {
      amount_usd: r.in.amount_usd - r.out.amount_usd,
      amount_try: r.in.amount_try - r.out.amount_try,
      amount_syp: r.in.amount_syp - r.out.amount_syp,
    };
    return { ...r, net, usdIn: usdOf(r.in, rates), usdOut: usdOf(r.out, rates), usdNet: usdOf(net, rates) };
  }).sort((a, b) => (b.usdNet - a.usdNet) || (b.count - a.count));

  const grand = {
    in: totals.in, out: totals.out,
    usdIn:  usdOf(totals.in,  rates),
    usdOut: usdOf(totals.out, rates),
  };
  grand.usdNet = grand.usdIn - grand.usdOut;

  return { rows, totals, grand };
}

/** صافي قناة لعملة معيّنة. */
export function channelNet(row, ccyKey) {
  return (row.in[ccyKey] || 0) - (row.out[ccyKey] || 0);
}
