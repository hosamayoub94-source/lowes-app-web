// =============================================================
// Payroll Module — Type definitions & constants
// =============================================================

export const PAYROLL_STATUS = {
  DRAFT:     'draft',
  PROCESSING: 'processing',
  APPROVED:  'approved',
  PAID:      'paid',
  CANCELLED: 'cancelled',
};

export const PAYROLL_STATUS_LABELS = {
  [PAYROLL_STATUS.DRAFT]:      'مسودة',
  [PAYROLL_STATUS.PROCESSING]: 'قيد المعالجة',
  [PAYROLL_STATUS.APPROVED]:   'معتمد',
  [PAYROLL_STATUS.PAID]:       'مدفوع',
  [PAYROLL_STATUS.CANCELLED]:  'ملغي',
};

export const SALARY_TYPE = {
  FIXED:      'fixed',
  COMMISSION: 'commission',
  MIXED:      'mixed',
};

export const CURRENCY = {
  TRY: 'TRY',
  USD: 'USD',
  SYP: 'SYP',
};

export const CURRENCY_SYMBOLS = {
  [CURRENCY.TRY]: '₺',
  [CURRENCY.USD]: '$',
  [CURRENCY.SYP]: 'ل.س',
};

export const DEDUCTION_TYPES = {
  ABSENT:   'absent',
  ADVANCE:  'advance',
  PENALTY:  'penalty',
  OTHER:    'other',
};

export const BONUS_TYPES = {
  COMMISSION: 'commission',
  PERFORMANCE: 'performance',
  HOLIDAY:    'holiday',
  OTHER:      'other',
};

// How many ms between background refresh ticks
export const PAYROLL_REALTIME_INTERVAL_MS = 30_000;

// ── Helper functions ──────────────────────────────────────────────────────────

/**
 * Calculate net salary from a payroll entry.
 *
 * Backward compatible: pre-engine entries have allowances/commission/
 * absence columns = 0, so this reduces to the old
 * (base + bonus − deductions − advance) exactly.
 *
 *   net = base + allowances + commission + bonus
 *       − deductions − absence − advance
 */
export function calcNetSalary(entry) {
  const base       = Number(entry.base_salary_usd ?? 0);
  const allowances = Number(entry.allowances_usd ?? 0);
  const commission = Number(entry.commission_usd ?? 0);
  const bonus      = Number(entry.bonus_usd ?? 0);
  const deductions = Number(entry.deductions_usd ?? 0);
  const absence    = Number(entry.absence_deduction_usd ?? 0);
  const advance    = Number(entry.advance_deduction_usd ?? 0);
  return base + allowances + commission + bonus - deductions - absence - advance;
}

/** Total deductions (absence + other manual + advance) for display. */
export function calcTotalDeductions(entry) {
  return Number(entry.deductions_usd ?? 0)
    + Number(entry.absence_deduction_usd ?? 0)
    + Number(entry.advance_deduction_usd ?? 0);
}

/**
 * Format a currency amount with symbol.
 */
export function formatCurrency(amount, currency = CURRENCY.USD) {
  const sym = CURRENCY_SYMBOLS[currency] ?? '$';
  const n = Number(amount ?? 0).toFixed(2);
  return `${sym}${n}`;
}

/**
 * Returns total payroll cost for a run (sum of all net salaries).
 */
export function calcRunTotal(entries = []) {
  return entries.reduce((sum, e) => sum + calcNetSalary(e), 0);
}

/**
 * Months list for the period selector.
 */
export const MONTHS_AR = [
  'يناير','فبراير','مارس','أبريل','مايو','يونيو',
  'يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر',
];

export function periodLabel(year, month) {
  return `${MONTHS_AR[month - 1]} ${year}`;
}
