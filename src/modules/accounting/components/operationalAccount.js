// =============================================================
// الحساب التشغيلي (فادي ووسيم) — منطق نقيّ
//   حركتان فقط: استلام (دخل) · مصروف. لا رواتب/سلف/تحويلات.
//   الرصيد = Σ الاستلامات − Σ المصاريف (تراكمي) = الكاش الموجود لديهم،
//   وهو ما تُسوّيه «الإدارة المالية» آخر الشهر (سحب الرصيد / توريد).
// =============================================================
import { ENTRY_TYPE } from '../types/accounting.types.js';

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

export const OP_EXPENSE_SOURCES = [
  OP_CAT.SHIPPING, OP_CAT.WAGES, OP_CAT.PURCHASES, OP_CAT.HANDOVER, OP_CAT.OTHER_EXP,
];
export const OP_INCOME_SOURCES = [
  OP_CAT.GOODS_SOLD, OP_CAT.SUPPLY, OP_CAT.OTHER_INC,
];
export const OP_ALL_SOURCES = [...OP_INCOME_SOURCES, ...OP_EXPENSE_SOURCES];

// قيد تشغيلي = دخل أو مصروف فقط (نستبعد الرواتب/السلف/التحويلات من هذا القسم).
export function isOperational(e) {
  return e.entry_type === ENTRY_TYPE.INCOME || e.entry_type === ENTRY_TYPE.EXPENSE;
}

export function filterOperational(entries = []) {
  return entries.filter(isOperational);
}

/** الرصيد التراكمي لكل عملة = استلامات − مصاريف. */
export function computeOperationalBalance(entries = []) {
  const bal = { amount_usd: 0, amount_try: 0, amount_syp: 0 };
  for (const e of entries) {
    const sign = e.entry_type === ENTRY_TYPE.INCOME ? 1
               : e.entry_type === ENTRY_TYPE.EXPENSE ? -1 : 0;
    if (!sign) continue;
    bal.amount_usd += sign * (Number(e.amount_usd) || 0);
    bal.amount_try += sign * (Number(e.amount_try) || 0);
    bal.amount_syp += sign * (Number(e.amount_syp) || 0);
  }
  return bal;
}
