// Payroll periods before October 2026 were closed OUTSIDE the app. They are historical,
// read-only records: the app must never recalculate, edit, approve, pay or reopen them.
// October 2026 is the first operational period (owner decision, 23 Oct 2026).
export const PAYROLL_OPERATIONAL_FROM = 202610;

export function isHistoricalPayrollPeriod(year, month) {
  const y = Number(year); const m = Number(month);
  if (!Number.isFinite(y) || !Number.isFinite(m) || y <= 0 || m <= 0) return false;
  return y * 100 + m < PAYROLL_OPERATIONAL_FROM;
}

export const HISTORICAL_PERIOD_MESSAGE =
  'هذه دورة تاريخية أُغلقت خارج التطبيق — للعرض والتدقيق فقط، ولا يمكن احتسابها أو تعديلها أو اعتمادها أو دفعها.';
