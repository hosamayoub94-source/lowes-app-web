// =============================================================
// Accounting Ledger — Type definitions & constants
// =============================================================

export const ENTRY_TYPE = {
  INCOME:   'income',
  EXPENSE:  'expense',
  ADVANCE:  'advance',
  SALARY:   'salary',
  TRANSFER: 'transfer',
};

export const ENTRY_TYPE_LABELS = {
  [ENTRY_TYPE.INCOME]:   'دخل',
  [ENTRY_TYPE.EXPENSE]:  'مصروف',
  [ENTRY_TYPE.ADVANCE]:  'سلفة',
  [ENTRY_TYPE.SALARY]:   'راتب',
  [ENTRY_TYPE.TRANSFER]: 'تحويل',
};

export const ENTRY_TYPE_ICONS = {
  [ENTRY_TYPE.INCOME]:   '💚',
  [ENTRY_TYPE.EXPENSE]:  '🔴',
  [ENTRY_TYPE.ADVANCE]:  '💵',
  [ENTRY_TYPE.SALARY]:   '💰',
  [ENTRY_TYPE.TRANSFER]: '🔄',
};

export const PAYMENT_METHOD = {
  CASH:      'cash',
  BANK:      'bank',
  TRANSFER:  'transfer',
  CARD:      'card',
};

export const PAYMENT_METHOD_LABELS = {
  [PAYMENT_METHOD.CASH]:     'نقداً',
  [PAYMENT_METHOD.BANK]:     'تحويل بنكي',
  [PAYMENT_METHOD.TRANSFER]: 'حوالة',
  [PAYMENT_METHOD.CARD]:     'بطاقة',
};

export const ADVANCE_STATUS = {
  APPROVED:  'approved',
  REPAID:    'repaid',
  PARTIAL:   'partial',
};

export const CURRENCY = {
  TRY: 'TRY',
  USD: 'USD',
  SYP: 'SYP',
};

export const ACCOUNTING_REALTIME_INTERVAL_MS = 30_000;

// ── Helpers ────────────────────────────────────────────────────────────────

export function entryBalance(entry) {
  // Positive for income, negative for expense/advance/salary
  if (entry.entry_type === ENTRY_TYPE.INCOME) return Number(entry.amount_usd ?? 0);
  return -Number(entry.amount_usd ?? 0);
}

export function calcLedgerBalance(entries = []) {
  return entries.reduce((sum, e) => sum + entryBalance(e), 0);
}

export function totalByType(entries = [], type) {
  return entries
    .filter(e => e.entry_type === type)
    .reduce((s, e) => s + Number(e.amount_usd ?? 0), 0);
}

export function entryColorClass(type) {
  return {
    income:   'text-green-600',
    expense:  'text-red-500',
    advance:  'text-orange-500',
    salary:   'text-blue-600',
    transfer: 'text-purple-500',
  }[type] ?? 'text-text';
}
