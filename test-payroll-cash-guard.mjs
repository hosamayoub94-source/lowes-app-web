/* global process */
import { readFileSync } from 'node:fs';
import { computeCashCoverage, COVERAGE } from './src/modules/payroll/utils/cashCoverage.js';
import { getPayrollStaleness } from './src/modules/payroll/services/payrollValidation.js';
import { calcPaidAmount } from './src/modules/payroll/utils/payBatch.js';
import { calcNetSalary } from './src/modules/payroll/types/payroll.types.js';

let pass = 0;
let fail = 0;
const ok = (condition, message) => {
  if (condition) pass += 1;
  else { fail += 1; console.error('FAIL', message); }
};
const rates = { USD: 1, TRY: 1 / 46.8, SYP: 1 / 131 };

// ── Ledger failure never reads as "covered" or as zero cash
{
  const c = computeCashCoverage({ ledgerError: 'network', balances: { USD: 99999 }, rates, paidUsd: 10 });
  ok(c.status === COVERAGE.LEDGER_ERROR && c.cashUsd === null, 'ledger error → ledger_error, no cash figure');
}
// ── Missing exchange rate: not silently zero
{
  const c = computeCashCoverage({ balances: { USD: 0, TRY: 50000, SYP: 0 }, rates: { USD: 1 }, paidUsd: 10 });
  ok(c.status === COVERAGE.RATE_MISSING && c.missingRates.includes('TRY'), 'TRY balance without rate → rate_missing');
  const c2 = computeCashCoverage({ rateError: 'boom', balances: { USD: 5000, TRY: 0, SYP: 0 }, rates, paidUsd: 10, payCurrency: 'SYP' });
  ok(c2.status === COVERAGE.RATE_MISSING && c2.missingRates.includes('SYP'), 'rate fetch failed + SYP payout → rate_missing');
  const c3 = computeCashCoverage({ rateError: 'boom', balances: { USD: 5000, TRY: 0, SYP: 0 }, rates, paidUsd: 10 });
  ok(c3.status === COVERAGE.OK, 'rate fetch failed but only USD involved → still judged in USD');
}
// ── Coverage judged in payout currency (SYP drawer empty must not show ✅)
{
  const c = computeCashCoverage({ balances: { USD: 10000, TRY: 0, SYP: 0 }, rates, paidUsd: 100, payCurrency: 'SYP' });
  ok(c.status === COVERAGE.INSUFFICIENT, 'SYP payout with 0 SYP cash → insufficient');
  ok(Math.abs(c.paidInCurrency - 13100) < 1e-6, 'paid converted at latest rate (131)');
  const c2 = computeCashCoverage({ balances: { USD: 50, TRY: 0, SYP: 0 }, rates, paidUsd: 100 });
  ok(c2.status === COVERAGE.INSUFFICIENT, 'USD short → insufficient');
  const c3 = computeCashCoverage({ balances: { USD: 100, TRY: 0, SYP: 0 }, rates, paidUsd: 100 });
  ok(c3.status === COVERAGE.OK, 'exact cash → ok');
}
// ── Currency selection is display only; half salary never changes the net due
{
  const entry = { base_salary_usd: 140, allowances_usd: 10, commission_usd: 5, deductions_usd: 0, absence_deduction_usd: 0, advance_deduction_usd: 0, bonus_usd: 0 };
  const due = calcNetSalary(entry);
  const half = calcPaidAmount(due, true);
  ok(half === due / 2 && calcNetSalary(entry) === due, 'half salary halves the payout only');
  const usd = computeCashCoverage({ balances: { USD: 1e6, TRY: 1e9, SYP: 1e9 }, rates, paidUsd: due, payCurrency: 'USD' });
  const tr = computeCashCoverage({ balances: { USD: 1e6, TRY: 1e9, SYP: 1e9 }, rates, paidUsd: due, payCurrency: 'TRY' });
  ok(Math.abs(tr.paidInCurrency * rates.TRY - usd.paidInCurrency) < 1e-9, 'TRY view converts back to the same USD amount');
}
// ── UI wiring: modal no longer swallows the ledger error; mark-paid needs typed confirmation
{
  const modal = readFileSync('./src/modules/payroll/components/PayrollBatchModal.jsx', 'utf8');
  ok(!/cashUsd >= paidUsd/.test(modal), 'modal no longer compares a silently-zero USD total');
  ok(/computeCashCoverage/.test(modal), 'modal uses the coverage guard');
  const dash = readFileSync('./src/modules/payroll/pages/PayrollDashboard.jsx', 'utf8');
  ok(/أؤكد الدفع/.test(dash) && /loadPayrollCashSnapshot/.test(dash), 'mark-paid checks cash and requires typed admin confirmation');
  ok(/inputsChecked && !staleness\.stale/.test(dash), 'approval blocked while stale or unchecked');
}

// ── Staleness gate
{
  const run = { month_setup_confirmed_at: '2026-10-22T12:54:06Z' };
  const entries = [
    { source: 'auto', computed_at: '2026-10-22T21:44:01Z' },
    { source: 'manual', computed_at: '2026-10-01T00:00:00Z' },
  ];
  const fresh = getPayrollStaleness({ entries, run, inputsUpdatedAt: { salarySettings: '2026-10-22T21:41:24Z', allowances: null, absenceReviews: null } });
  ok(!fresh.stale, `fresh calc passes (${fresh.reasons})`);
  const allowances = getPayrollStaleness({ entries, run, inputsUpdatedAt: { salarySettings: '2026-10-22T21:41:24Z', allowances: '2026-10-23T08:00:00Z', absenceReviews: null } });
  ok(allowances.stale && /البدلات/.test(allowances.reasons.join()), 'allowances changed after calc → stale (live Sept case)');
  const salary = getPayrollStaleness({ entries, run, inputsUpdatedAt: { salarySettings: '2026-10-23T00:00:00Z' } });
  ok(salary.stale, 'salary settings changed after calc → stale');
  const absence = getPayrollStaleness({ entries, run, inputsUpdatedAt: { absenceReviews: '2026-10-23T00:00:00Z' } });
  ok(absence.stale, 'absence decision after calc → stale');
  const setup = getPayrollStaleness({ entries, run: { month_setup_confirmed_at: '2026-10-23T00:00:00Z' }, inputsUpdatedAt: {} });
  ok(setup.stale, 'month setup after calc → stale');
  ok(getPayrollStaleness({ entries, run, inputsUpdatedAt: null }).stale, 'unverifiable inputs → stale');
  ok(getPayrollStaleness({ entries: [], run, inputsUpdatedAt: {} }).stale, 'never calculated → stale');
  ok(!getPayrollStaleness({ entries: [{ source: 'manual' }], run, inputsUpdatedAt: {} }).stale, 'all-manual run is not stale by recalculation');
}

console.log(`payroll cash/staleness: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
