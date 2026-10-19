// Payroll batch orchestration separated from Supabase so the critical
// "calculate everything before writing anything" rule can be unit-tested
// with deterministic fake dependencies.
export async function runPayrollBatch({
  employees = [],
  skipEmployeeIds = new Set(),
  calculateEntry,
  persistEntry,
  onProgress,
}) {
  if (typeof calculateEntry !== 'function') throw new TypeError('calculateEntry is required');
  if (typeof persistEntry !== 'function') throw new TypeError('persistEntry is required');

  const prepared = [];
  const errors = [];
  let done = 0;
  const total = employees.length;

  // Phase 1: calculate all entries without database writes.
  for (const employee of employees) {
    if (skipEmployeeIds.has(employee.id)) {
      done += 1;
      onProgress?.(done, total);
      continue;
    }

    try {
      const entry = await calculateEntry(employee);
      // null means the employee was not employed in this payroll month.
      if (entry !== null) prepared.push(entry);
    } catch (error) {
      errors.push(`${employee.employee_name || employee.id}: ${error?.message || error}`);
    }

    done += 1;
    onProgress?.(done, total);
  }

  if (errors.length) {
    return {
      count: 0,
      totalNet: 0,
      entries: [],
      errors: [...errors, '⛔ لم تُحفَظ أي قيود من هذه الجولة؛ أصلح الأخطاء ثم أعد الحسبة.'],
    };
  }

  // Phase 2: persist only after every employee calculation succeeded.
  // Postgres writes are individual upserts, not a single transaction. Surface
  // a clear partial-save error if a later write fails after earlier writes.
  const entries = [];
  for (const entry of prepared) {
    try {
      entries.push(await persistEntry(entry));
    } catch (error) {
      if (entries.length > 0) {
        throw new Error(
          `فشل حفظ الرواتب بعد حفظ ${entries.length} قيداً. راجع القيود المحفوظة قبل إعادة المحاولة: ${error?.message || error}`,
        );
      }
      throw error;
    }
  }

  const totalNet = entries.reduce((sum, entry) => sum + (Number(entry.net_salary_usd) || 0), 0);
  return { count: entries.length, totalNet, entries, errors };
}
