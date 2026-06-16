// =============================================================
// منطق نقيّ لتجميع الوارد/الصادر لكل «جهة / مصدر» — قابل للاختبار بلا React.
// =============================================================
import { ENTRY_TYPE } from '../types/accounting.types.js';

export const CCY = [
  { key: 'amount_usd', sym: '$',   maxFrac: 2 },
  { key: 'amount_try', sym: '₺',   maxFrac: 0 },
  { key: 'amount_syp', sym: 'ل.س', maxFrac: 0 },
];

const OUT_TYPES = new Set([ENTRY_TYPE.EXPENSE, ENTRY_TYPE.SALARY, ENTRY_TYPE.ADVANCE]);

export function blank() { return { amount_usd: 0, amount_try: 0, amount_syp: 0 }; }

/**
 * يجمّع القيود حسب الجهة (category).
 *   • الدخل → وارد (in) · المصروف/الراتب/السلفة → صادر (out).
 *   • التحويلات (transfer) وأي نوع آخر تُتجاهل.
 * @returns {{ rows: Array<{source,in,out,mag}>, totals: {in,out} }}
 */
export function computeSourceBreakdown(entries = []) {
  const map = {};
  const totals = { in: blank(), out: blank() };
  for (const e of entries) {
    const isIn  = e.entry_type === ENTRY_TYPE.INCOME;
    const isOut = OUT_TYPES.has(e.entry_type);
    if (!isIn && !isOut) continue;
    const key = (e.category && String(e.category).trim()) || 'غير محدّد';
    if (!map[key]) map[key] = { source: key, in: blank(), out: blank(), count: 0 };
    map[key].count += 1;
    const bucket = isIn ? map[key].in : map[key].out;
    const totB   = isIn ? totals.in : totals.out;
    for (const c of CCY) {
      const v = Number(e[c.key]) || 0;
      bucket[c.key] += v;
      totB[c.key]   += v;
    }
  }
  // الترتيب: الأكثر حركةً أولاً (عدد القيود) — بمعزل عن حجم العملة (الـSYP بأرقام ضخمة
  // لا يطغى)، ثم مجموع الحركة كمرجّح ثانوي.
  const rows = Object.values(map)
    .map(r => ({ ...r, mag: CCY.reduce((s, c) => s + r.in[c.key] + r.out[c.key], 0) }))
    .sort((a, b) => (b.count - a.count) || (b.mag - a.mag));
  return { rows, totals };
}

/** صافي جهة لعملة معيّنة. */
export function netFor(row, ccyKey) {
  return (row.in[ccyKey] || 0) - (row.out[ccyKey] || 0);
}
