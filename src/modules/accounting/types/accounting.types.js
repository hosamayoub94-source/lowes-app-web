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
  CASH_TRY:  'cash_try',   // صندوق نقدي — ليرة تركية
  SHAM_SYP:  'sham_syp',   // شام كاش — ليرة سورية
  SHAM_USD:  'sham_usd',   // شام كاش — دولار
  BANK_USD:  'bank_usd',   // حساب بنكي USD
  BANK_TRY:  'bank_try',   // حساب بنكي TRY
};

export const PAYMENT_METHOD_LABELS = {
  [PAYMENT_METHOD.CASH]:      '💵 نقداً (عام)',
  [PAYMENT_METHOD.BANK]:      '🏦 تحويل بنكي',
  [PAYMENT_METHOD.SHAM_CASH]: '📱 شام كاش (عام)',
  [PAYMENT_METHOD.TRANSFER]:  '↔️ حوالة',
  [PAYMENT_METHOD.CARD]:      '💳 بطاقة',
  [PAYMENT_METHOD.CASH_SYP]:  '💰 كاش ل.س',
  [PAYMENT_METHOD.CASH_USD]:  '💵 كاش $',
  [PAYMENT_METHOD.CASH_TRY]:  '💵 كاش ₺',
  [PAYMENT_METHOD.SHAM_SYP]:  '📱 شام SYP',
  [PAYMENT_METHOD.SHAM_USD]:  '📱 شام USD',
  [PAYMENT_METHOD.BANK_USD]:  '🏦 بنك USD',
  [PAYMENT_METHOD.BANK_TRY]:  '🏦 بنك ₺',
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
    id: 'cash_try', label: '💵 كاش ₺', type: 'cash', currency: 'TRY',
    amtField: 'amount_try', color: '#ca8a04', bg: '#fefce8',
  },
  {
    id: 'bank_usd', label: '🏦 بنك USD', type: 'bank', currency: 'USD',
    amtField: 'amount_usd', color: '#0369a1', bg: '#f0f9ff',
  },
  {
    id: 'bank_try', label: '🏦 بنك ₺', type: 'bank', currency: 'TRY',
    amtField: 'amount_try', color: '#0891b2', bg: '#ecfeff',
  },
];

export const WALLET_CURRENCY_SYMBOL = { SYP: 'ل.س', USD: '$', TRY: '₺' };

// ── Transfer direction (stored in `category` — no schema change) ──────────────
export const TRANSFER_IN  = 'transfer_in';
export const TRANSFER_OUT = 'transfer_out';

// ── Books — الكتابان: تشغيلي (فادي/وسيم) · مركزي (الإدارة المالية) ─────────────
//   التسليم بينهما = تحويل بساقين (transfer_out بكتاب + transfer_in بالآخر)
//   يساوي صفراً على مستوى الشركة ويُستثنى من الربح/الخسارة.
export const BOOK = { OPERATIONAL: 'operational', CENTRAL: 'central' };
export const BOOK_LABELS = {
  [BOOK.OPERATIONAL]: 'الحساب التشغيلي',
  [BOOK.CENTRAL]:     'الإدارة المالية',
};

/** قيود كتاب معيّن. القيود القديمة بلا `book` تُعامل كـ central (افتراض الهجرة). */
export function filterByBook(entries = [], book) {
  return entries.filter(e => (e.book ?? BOOK.CENTRAL) === book);
}

/**
 * Map a legacy/generic payment_method to a specific wallet id by currency,
 * so old entries (payment_method = "cash"/"bank"/"sham_cash") still show up
 * in the right treasury wallet. Specific ids pass through unchanged.
 */
export function legacyWalletId(pm, currency) {
  switch (pm) {
    case 'cash':      return currency === 'SYP' ? 'cash_syp' : currency === 'TRY' ? 'cash_try' : 'cash_usd';
    case 'bank':
    case 'card':
    case 'transfer':  return currency === 'TRY' ? 'bank_try' : 'bank_usd';
    case 'sham_cash': return currency === 'SYP' ? 'sham_syp' : 'sham_usd';
    default:          return pm; // already a specific wallet id (or unknown)
  }
}

/**
 * Signed amount this entry contributes to a given wallet (in the wallet's
 * currency). Handles income/expense/advance/salary + transfer_in/out, and
 * legacy generic payment methods. Returns 0 if the entry isn't this wallet's.
 */
export function walletDelta(entry, wallet) {
  const amt = Number(entry[wallet.amtField]) || 0;
  if (!amt) return 0;
  const pm = entry.payment_method;
  const belongs = pm === wallet.id || legacyWalletId(pm, wallet.currency) === wallet.id;
  if (!belongs) return 0;
  if (entry.entry_type === ENTRY_TYPE.INCOME) return amt;
  if (entry.entry_type === ENTRY_TYPE.TRANSFER) return entry.category === TRANSFER_IN ? amt : -amt;
  return -amt; // expense / advance / salary
}

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

/**
 * يحوّل مبلغاً بعملة معيّنة إلى ما يعادله بالدولار (تقريبي).
 * rateMap = { TRY: وحدات لكل 1 دولار, SYP: ... } (سعر USD→العملة).
 * يعيد 0 إذا لا يوجد سعر للعملة (الأعمدة لكل عملة تبقى مصدر الحقيقة).
 */
export function convertToUsd(amount, currency, rateMap = {}) {
  const amt = Number(amount) || 0;
  if (!amt) return 0;
  if (currency === 'USD') return amt;
  const per = Number(rateMap[currency]) || 0;   // كم وحدة من العملة = 1 دولار
  return per > 0 ? amt / per : 0;
}
