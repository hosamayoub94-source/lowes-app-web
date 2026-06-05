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
  SHAM_CASH: 'sham_cash',
  TRANSFER:  'transfer',
  CARD:      'card',
  // Specific wallet accounts
  CASH_SYP:  'cash_syp',   // صندوق نقدي — ليرة سورية
  CASH_USD:  'cash_usd',   // صندوق نقدي — دولار
  SHAM_SYP:  'sham_syp',   // شام كاش — ليرة سورية
  SHAM_USD:  'sham_usd',   // شام كاش — دولار
  BANK_USD:  'bank_usd',   // حساب بنكي USD
};

export const PAYMENT_METHOD_LABELS = {
  [PAYMENT_METHOD.CASH]:      '💵 نقداً (عام)',
  [PAYMENT_METHOD.BANK]:      '🏦 تحويل بنكي',
  [PAYMENT_METHOD.SHAM_CASH]: '📱 شام كاش (عام)',
  [PAYMENT_METHOD.TRANSFER]:  '↔️ حوالة',
  [PAYMENT_METHOD.CARD]:      '💳 بطاقة',
  [PAYMENT_METHOD.CASH_SYP]:  '💰 كاش ل.س',
  [PAYMENT_METHOD.CASH_USD]:  '💵 كاش $',
  [PAYMENT_METHOD.SHAM_SYP]:  '📱 شام SYP',
  [PAYMENT_METHOD.SHAM_USD]:  '📱 شام USD',
  [PAYMENT_METHOD.BANK_USD]:  '🏦 بنك USD',
};

// ── Wallet Groups for Treasury Panel ──────────────────────────────────────
export const WALLETS = [
  {
    id: 'cash_syp', label: '💰 كاش ل.س', type: 'cash', currency: 'SYP',
    amtField: 'amount_syp', color: '#16a34a', bg: '#f0fdf4',
  },
  {
    id: 'cash_usd', label: '💵 كاش $', type: 'cash', currency: 'USD',
    amtField: 'amount_usd', color: '#1d4ed8', bg: '#eff6ff',
  },
  {
    id: 'sham_syp', label: '📱 شام SYP', type: 'sham', currency: 'SYP',
    amtField: 'amount_syp', color: '#7c3aed', bg: '#f5f3ff',
  },
  {
    id: 'sham_usd', label: '📱 شام USD', type: 'sham', currency: 'USD',
    amtField: 'amount_usd', color: '#be185d', bg: '#fdf2f8',
  },
  {
    id: 'bank_usd', label: '🏦 بنك USD', type: 'bank', currency: 'USD',
    amtField: 'amount_usd', color: '#0369a1', bg: '#f0f9ff',
  },
];

export const WALLET_CURRENCY_SYMBOL = { SYP: 'ل.س', USD: '$', TRY: '₺' };

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
