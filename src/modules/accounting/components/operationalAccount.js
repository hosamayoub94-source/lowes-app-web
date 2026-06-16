// =============================================================
// الحساب التشغيلي (فادي ووسيم) — منطق نقيّ
//   جدول القيود يعرض: استلام (دخل) · مصروف (لا رواتب/سلف).
//   الرصيد التراكمي يحسب أيضاً التحويلات (تسليم/توريد بين الكتابين):
//     الرصيد = Σ استلامات − Σ مصاريف + Σ تحويل وارد − Σ تحويل صادر.
//   هذا ما تُسوّيه «الإدارة المالية» (سحب/توريد) كتحويل بساقين يساوي صفراً.
// =============================================================
import { ENTRY_TYPE, TRANSFER_IN, TRANSFER_OUT, BOOK, filterByBook } from '../types/accounting.types.js';

// تصنيفات/مصادر جاهزة (المالك يقدر يضيف غيرها بالكتابة)
export const OP_CAT = {
  SHIPPING:  'شحن',
  WAGES:     'أجور',
  PURCHASES: 'مشتريات',
  GOODS_SOLD:'قيمة بضاعة مباعة',
  SUPPLY:    'توريد من الإدارة المالية',  // الإدارة المالية تموّلهم  → استلام
  HANDOVER:  'تسليم للإدارة المالية',     // يسلّمون الرصيد للإدارة   → مصروف
  OTHER_EXP: 'مصاريف أخرى',
  OTHER_INC: 'استلامات أخرى',
};

// ملاحظة: HANDOVER/SUPPLY ليسا بنديْ مصروف/استلام سريع — التسليم/التوريد
// صار تحويلاً بساقين عبر زرّ «رفع/تسليم الرصيد» (createTransfer). إبقاؤهما هنا
// كان يسمح بتسجيل التسليم كمصروف عادي → ازدواج وتضخيم للمصاريف. أبقيناهما
// تسميتين للتحويلات فقط (تُستهلكان عبر OP_CAT في عرض التحويلات).
export const OP_EXPENSE_SOURCES = [
  OP_CAT.SHIPPING, OP_CAT.WAGES, OP_CAT.PURCHASES, OP_CAT.OTHER_EXP,
];
export const OP_INCOME_SOURCES = [
  OP_CAT.GOODS_SOLD, OP_CAT.OTHER_INC,
];
export const OP_ALL_SOURCES = [...OP_INCOME_SOURCES, ...OP_EXPENSE_SOURCES];

// قيد تشغيلي = دخل أو مصروف فقط (نستبعد الرواتب/السلف/التحويلات من هذا القسم).
export function isOperational(e) {
  return e.entry_type === ENTRY_TYPE.INCOME || e.entry_type === ENTRY_TYPE.EXPENSE;
}

export function filterOperational(entries = []) {
  return entries.filter(isOperational);
}

/**
 * الرصيد التراكمي لكل عملة:
 *   استلام (+) · مصروف (−) · تحويل وارد (+) · تحويل صادر (−).
 * التحويلات تجعل التسليم بين الكتابين يُنقص رصيد المُسلِّم ويزيد المُستلِم.
 */
export function computeOperationalBalance(entries = []) {
  const bal = { amount_usd: 0, amount_try: 0, amount_syp: 0 };
  for (const e of entries) {
    const sign = e.entry_type === ENTRY_TYPE.INCOME   ?  1
               : e.entry_type === ENTRY_TYPE.EXPENSE  ? -1
               : e.entry_type === ENTRY_TYPE.TRANSFER ? (e.category === TRANSFER_IN ? 1 : e.category === TRANSFER_OUT ? -1 : 0)
               : 0;
    if (!sign) continue;
    bal.amount_usd += sign * (Number(e.amount_usd) || 0);
    bal.amount_try += sign * (Number(e.amount_try) || 0);
    bal.amount_syp += sign * (Number(e.amount_syp) || 0);
  }
  return bal;
}

/** رصيد كتاب معيّن (تشغيلي/مركزي) — مراعٍ للتحويلات. */
export function computeBookBalance(entries = [], book = BOOK.OPERATIONAL) {
  return computeOperationalBalance(filterByBook(entries, book));
}
