// Pure payroll-entry validation used by the approval gate and Node regression tests.
export function getPayrollBlockingEntryIssues(entries = []) {
  const zeroSalaryEntries = entries.filter(
    (entry) => (Number(entry.base_salary_usd) || 0) === 0,
  );
  const noTeamEntries = entries.filter(
    (entry) => (Number(entry.base_salary_usd) || 0) > 0
      && !entry.team
      && !entry.commission_exempt,
  );
  const missingRateEntries = entries.filter(
    (entry) => String(entry.notes || '').includes('سعر صرف ناقص'),
  );

  // Count employees once even if more than one issue applies to a row.
  const blockingRows = new Set([
    ...zeroSalaryEntries,
    ...noTeamEntries,
    ...missingRateEntries,
  ]);
  const blockingEmployeeIds = new Set(
    [...blockingRows].map((entry) => entry.employee_id || entry),
  );

  return {
    zeroSalaryEntries,
    noTeamEntries,
    missingRateEntries,
    blockingEntries: blockingEmployeeIds.size,
  };
}
