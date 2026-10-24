// Who may delete a payroll run, and which runs may ever be deleted — one pure policy shared by the
// dashboard (hides the button), the store and the service (refuse the call). The database has its own
// BEFORE DELETE guard (docs/payroll/proposed/20261024_payroll_runs_delete_guard.sql) as the last line.
//
// A run is deletable only when ALL hold:
//   1. it is an OPERATIONAL period (October 2026 or later) — earlier periods were closed outside the app
//   2. it is still a DRAFT (never approved, paid, or otherwise closed)
//   3. the person is one of the two owners allowed to delete (owner decision 30 Aug 2026)
import { isHistoricalPayrollPeriod, HISTORICAL_PERIOD_MESSAGE } from './historicalPeriod.js';

export const DELETE_RUN_ALLOWED_NAMES = Object.freeze(['hosam ayoub', 'amany alkshki']);
export const NOT_DRAFT_MESSAGE = 'لا تُحذف إلا مسودة غير معتمدة — الدورة المعتمدة أو المدفوعة تُعاد فتحها ولا تُحذف.';
export const NOT_ALLOWED_USER_MESSAGE = 'حذف الدورات مقصور على حسام وأماني فقط.';
export const DELETE_HISTORICAL_MESSAGE = 'لا يمكن حذف دورة تاريخية (قبل تشرين الأول 2026) — هي سجل للعرض والتدقيق فقط.';

export function isDeleteAllowedUser(name) {
  return DELETE_RUN_ALLOWED_NAMES.includes(String(name ?? '').trim().toLowerCase());
}

// `userName` undefined = state rules only (store/service layers know the run, not the person; the
// dashboard enforces WHO, the database enforces the state rules again).
export function checkRunDeletable(run, userName) {
  if (!run) return { allowed: false, code: 'no_run', message: 'الدورة غير موجودة.' };
  if (isHistoricalPayrollPeriod(run.period_year, run.period_month)) {
    return { allowed: false, code: 'historical', message: DELETE_HISTORICAL_MESSAGE, detail: HISTORICAL_PERIOD_MESSAGE };
  }
  if (run.status !== 'draft') return { allowed: false, code: 'not_draft', message: NOT_DRAFT_MESSAGE };
  if (userName !== undefined && !isDeleteAllowedUser(userName)) {
    return { allowed: false, code: 'user', message: NOT_ALLOWED_USER_MESSAGE };
  }
  return { allowed: true, code: 'ok', message: '' };
}
