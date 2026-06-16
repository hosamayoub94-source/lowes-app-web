// =============================================================
// منطق نقيّ — كشف حساب تراكمي لقناة/مصدر (account statement).
//   كل الحركات مرتّبة زمنياً + رصيد جارٍ تراكمي لكل عملة (له/عليه).
//   الدخل (+) · المصروف/الراتب/السلفة (−). التحويلات تُستثنى (ليست بيعاً/شراءً).
//   ملاحظة: هذا كشف عبر كامل الزمن (تراكمي) — وليس مقيّداً بالشهر.
// =============================================================
import { ENTRY_TYPE } from '../types/accounting.types.js';
import { CCY, blank } from './sourceBreakdown.logic.js';

const OUT_TYPES = new Set([ENTRY_TYPE.EXPENSE, ENTRY_TYPE.SALARY, ENTRY_TYPE.ADVANCE]);

/** هل ينتمي القيد لهذه القناة؟ (channel_id أولاً، وإلا تطابق الـ category نصّاً). */
export function entryMatchesChannel(entry, { channelId = null, category = null } = {}) {
  if (channelId && entry.channel_id) return entry.channel_id === channelId;
  if (category) return (entry.category && String(entry.category).trim()) === String(category).trim();
  return false;
}

/**
 * كشف حساب قناة: حركات مرتّبة زمنياً + رصيد جارٍ تراكمي لكل عملة.
 * @param {Array} entries  كل القيود (غير مفلترة بالشهر — الكشف تراكمي).
 * @param {{channelId?:string, category?:string}} sel
 * @returns {{ lines: Array, opening, closing, totalIn, totalOut, count }}
 */
export function computeChannelStatement(entries = [], sel = {}) {
  const mine = entries
    .filter(e => entryMatchesChannel(e, sel))
    .filter(e => e.entry_type === ENTRY_TYPE.INCOME || OUT_TYPES.has(e.entry_type))
    .slice()
    .sort((a, b) => {
      const da = a.entry_date ?? '', db = b.entry_date ?? '';
      if (da !== db) return da < db ? -1 : 1;
      // ثبات الترتيب عند تساوي التاريخ: حسب created_at ثم id.
      const ca = a.created_at ?? '', cb = b.created_at ?? '';
      if (ca !== cb) return ca < cb ? -1 : 1;
      return String(a.id ?? '').localeCompare(String(b.id ?? ''));
    });

  const running = blank();
  const totalIn = blank();
  const totalOut = blank();
  const lines = mine.map(e => {
    const isIn = e.entry_type === ENTRY_TYPE.INCOME;
    const delta = blank();
    for (const c of CCY) {
      const v = Number(e[c.key]) || 0;
      delta[c.key] = isIn ? v : -v;
      running[c.key] += delta[c.key];
      if (isIn) totalIn[c.key] += v; else totalOut[c.key] += v;
    }
    return {
      id: e.id,
      date: e.entry_date ?? '',
      description: e.description ?? '',
      category: e.category ?? '',
      direction: isIn ? 'in' : 'out',
      delta,
      balance: { ...running }, // الرصيد الجاري بعد هذه الحركة
    };
  });

  return {
    lines,
    opening: blank(),          // الرصيد الافتتاحي = صفر (الكشف من البداية)
    closing: { ...running },   // الرصيد الختامي (له/عليه)
    totalIn,
    totalOut,
    count: lines.length,
  };
}
