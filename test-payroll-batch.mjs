import { runPayrollBatch } from './src/modules/payroll/services/payrollBatch.js';
import { getPayrollBlockingEntryIssues } from './src/modules/payroll/services/payrollValidation.js';

let pass = 0;
let fail = 0;
const ok = (condition, message) => {
  if (condition) pass += 1;
  else { fail += 1; console.error('❌', message); }
};
const equal = (actual, expected, message) =>
  ok(actual === expected, `${message} (expected ${expected}, got ${actual})`);

const employees = [
  { id: 'a', employee_name: 'Employee A' },
  { id: 'b', employee_name: 'Employee B' },
  { id: 'manual', employee_name: 'Manual entry' },
];

// A single calculation error must prevent EVERY database write.
{
  let persisted = 0;
  const result = await runPayrollBatch({
    employees,
    skipEmployeeIds: new Set(['manual']),
    calculateEntry: async (employee) => {
      if (employee.id === 'b') throw new Error('advance lookup failed');
      return { employee_id: employee.id, net_salary_usd: 100 };
    },
    persistEntry: async (entry) => { persisted += 1; return entry; },
  });
  equal(persisted, 0, 'calculation failure causes zero writes');
  equal(result.count, 0, 'blocked batch reports zero saved entries');
  equal(result.entries.length, 0, 'blocked batch returns no saved rows');
  ok(result.errors.some((message) => message.includes('Employee B') && message.includes('advance lookup failed')),
    'failure includes employee and source error');
  ok(result.errors.some((message) => message.includes('لم تُحفَظ أي قيود')),
    'failure explicitly explains no entries were saved');
}

// Successful calculation persists only the prepared non-null rows and skips manual entries.
{
  const persisted = [];
  const progress = [];
  const result = await runPayrollBatch({
    employees,
    skipEmployeeIds: new Set(['manual']),
    calculateEntry: async (employee) => {
      if (employee.id === 'a') return { employee_id: 'a', net_salary_usd: 120 };
      if (employee.id === 'b') return null; // not employed in this month
      throw new Error('manual employee must not be calculated');
    },
    persistEntry: async (entry) => { persisted.push(entry); return entry; },
    onProgress: (done, total) => progress.push([done, total]),
  });
  equal(persisted.length, 1, 'only one prepared row is persisted');
  equal(persisted[0].employee_id, 'a', 'manual and null rows are not persisted');
  equal(result.count, 1, 'success count matches saved rows');
  equal(result.totalNet, 120, 'success total matches saved net salary');
  equal(progress.length, employees.length, 'progress reports each employee including skipped employees');
}

// If persistence itself fails after one write, the error must disclose partial persistence.
{
  let attempts = 0;
  let message = '';
  try {
    await runPayrollBatch({
      employees: [{ id: 'a' }, { id: 'b' }],
      calculateEntry: async (employee) => ({ employee_id: employee.id, net_salary_usd: 50 }),
      persistEntry: async (entry) => {
        attempts += 1;
        if (entry.employee_id === 'b') throw new Error('database unavailable');
        return entry;
      },
    });
  } catch (error) { message = error.message; }
  equal(attempts, 2, 'both writes were attempted sequentially');
  ok(message.includes('بعد حفظ 1 قيداً') && message.includes('database unavailable'),
    'partial persistence failure is explicit');
}

// Approval gate blocks missing rates and counts an employee only once if issues overlap.
{
  const issues = getPayrollBlockingEntryIssues([
    { employee_id: 'a', base_salary_usd: 100, team: 'turkey', notes: '✅ valid' },
    { employee_id: 'b', base_salary_usd: 100, team: 'turkey', notes: '⚠️ سعر صرف ناقص' },
    { employee_id: 'c', base_salary_usd: 0, team: 'syria', notes: '⚠️ سعر صرف ناقص' },
    { employee_id: 'd', base_salary_usd: 100, team: null, commission_exempt: false, notes: null },
  ]);
  equal(issues.missingRateEntries.length, 2, 'missing exchange rates identify both affected employees');
  equal(issues.zeroSalaryEntries.length, 1, 'zero salary remains a blocker');
  equal(issues.noTeamEntries.length, 1, 'missing team remains a blocker');
  equal(issues.blockingEntries, 3, 'overlapping issues count each employee once');
}

console.log(`${fail === 0 ? '✅' : '⚠️'} Payroll batch: ${pass}/${pass + fail} checks passed`);
process.exit(fail === 0 ? 0 : 1);
