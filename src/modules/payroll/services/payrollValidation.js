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
// salesDrift (from detectSalesDrift) adds the delivery data itself: undefined = not checked,
// null = checked but unverifiable (treated as stale).
export function getPayrollStaleness({ entries = [], run = null, inputsUpdatedAt = null, salesDrift } = {}) {
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
  if (salesDrift === null) reasons.push('تعذّر التحقق من أن مبيعات التسليمات لم تتغيّر بعد آخر حسبة.');
  else if (salesDrift?.stale) {
    const list = salesDrift.rows.slice(0, 5).map((r) => `${r.name}: ${r.storedCount}→${r.liveCount} طلب، ${r.storedLocal}→${r.liveLocal} ${r.currency}`).join('؛ ');
    reasons.push(`مبيعات التسليمات تغيّرت بعد آخر حسبة (${salesDrift.rows.length} موظف — ${list}${salesDrift.rows.length > 5 ? '…' : ''}).`);
  }
  return { stale: reasons.length > 0, reasons };
}

// Sales drift: stored sales of each auto entry (sales_local in the team currency + order count) vs the
// same figure recomputed now from the shared delivery source (computeLiveTeamSales). A finance delivery
// confirmation, carrier evidence or status change added after the calculation shows up here although no
// payroll input table changed. Compared in whole cents; entries without a sales team are skipped.
export function detectSalesDrift({ entries = [], live = new Map(), names = new Map() } = {}) {
  const rows = [];
  for (const e of entries) {
    if (e.source === 'manual' || !['syria', 'turkey'].includes(e.team)) continue;
    const now = live.get(e.employee_id) || { value: 0, count: 0 };
    const storedCents = Math.round((Number(e.sales_local) || 0) * 100);
    const liveCents = Math.round((Number(now.value) || 0) * 100);
    const storedCount = Number(e.sales_orders_count) || 0;
    const liveCount = Number(now.count) || 0;
    if (storedCents === liveCents && storedCount === liveCount) continue;
    rows.push({
      employee_id: e.employee_id, name: names.get(e.employee_id) || e.employee_name || e.employee_id,
      currency: e.target_currency || (e.team === 'turkey' ? 'TRY' : 'USD'),
      storedLocal: storedCents / 100, liveLocal: liveCents / 100, storedCount, liveCount,
    });
  }
  return { stale: rows.length > 0, rows };
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
