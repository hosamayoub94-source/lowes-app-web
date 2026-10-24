// Pure payroll-entry validation used by the approval gate and Node regression tests.

// The run header (payroll_runs.employee_count / total_net_usd) must describe exactly the entries
// it holds. Compared in whole cents so float noise never blocks a correct run.
export function checkRunSummary({ runCount, runNet, entries = [] } = {}) {
  const lines = (entries || []).length;
  const cents = (entries || []).reduce((s, e) => s + Math.round((Number(e.net_salary_usd) || 0) * 100), 0);
  const headerCount = Number(runCount);
  const headerCents = Math.round((Number(runNet) || 0) * 100);
  const countOk = Number.isFinite(headerCount) && headerCount === lines;
  const netOk = headerCents === cents;
  return {
    ok: countOk && netOk,
    entries: { count: lines, net: cents / 100 },
    header: { count: Number.isFinite(headerCount) ? headerCount : null, net: headerCents / 100 },
    message: countOk && netOk ? 'مطابق'
      : `الملخص يقول ${Number.isFinite(headerCount) ? headerCount : '؟'} موظف / $${(headerCents / 100).toFixed(2)} بينما القيود ${lines} موظف / $${(cents / 100).toFixed(2)}`,
  };
}

// A run is stale when any payroll input changed after the OLDEST auto-computed
// entry: salary settings, recurring allowances, approved/rejected absence
// decisions, or the month setup itself. Manual entries are frozen by design and
// do not count. Unknown input timestamps (fetch failed) are treated as stale —
// approval must never rest on a calculation we could not verify as current.
export function getPayrollStaleness({ entries = [], run = null, inputsUpdatedAt = null } = {}) {
  const autoEntries = entries.filter((entry) => entry.source !== 'manual');
  const reasons = [];
  if (autoEntries.length === 0) return { stale: entries.length === 0, reasons: entries.length === 0 ? ['لم تُشغَّل الحسبة بعد.'] : [] };
  const calcTimes = autoEntries.map((entry) => Date.parse(entry.computed_at)).filter(Number.isFinite);
  if (calcTimes.length < autoEntries.length) reasons.push('قيود آلية بلا وقت حسبة — أعد تشغيل الدورة.');
  const oldestCalc = calcTimes.length ? Math.min(...calcTimes) : -Infinity;
  const newer = (value) => value && Date.parse(value) > oldestCalc;

  if (newer(run?.month_setup_confirmed_at)) reasons.push('إعداد الشهر عُدِّل بعد آخر حسبة.');
  if (inputsUpdatedAt === null) {
    reasons.push('تعذّر التحقق من تاريخ تعديل إعدادات الرواتب.');
  } else {
    if (newer(inputsUpdatedAt.salarySettings)) reasons.push('إعدادات رواتب الموظفين عُدِّلت بعد آخر حسبة.');
    if (newer(inputsUpdatedAt.allowances)) reasons.push('البدلات عُدِّلت بعد آخر حسبة.');
    if (newer(inputsUpdatedAt.absenceReviews)) reasons.push('قرارات الغياب تغيّرت بعد آخر حسبة.');
  }
  return { stale: reasons.length > 0, reasons };
}
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

  // A negative payslip is allowed by an earlier owner decision (full target is never pro-rated), but it
  // must never pass silently: surfaced as a WARNING, not counted in blockingEntries.
  const negativeNetEntries = entries.filter((entry) => (Number(entry.net_salary_usd) || 0) < 0);

  return {
    zeroSalaryEntries,
    noTeamEntries,
    missingRateEntries,
    negativeNetEntries,
    blockingEntries: blockingEmployeeIds.size,
  };
}
