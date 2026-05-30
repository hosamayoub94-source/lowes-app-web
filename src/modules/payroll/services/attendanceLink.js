// =============================================================
// Payroll ↔ Attendance Bridge
// Computes monthly attendance summary for one employee so the
// payroll module can auto-fill absent_days / working_days and
// calculate absence deductions.
//
// Works in both mock-attendance and real-Supabase modes.
// =============================================================

import { supabase } from '@services/supabase';

// Statuses that count as "employee was present"
const PRESENT_STATUSES = new Set(['present', 'late', 'on_break', 'checked_out']);

// Read mock-mode flag lazily to avoid circular imports at module load.
function _isMockAttendance() {
  try {
    const flag = String(import.meta.env.VITE_USE_MOCK_ATTENDANCE ?? '').toLowerCase();
    return flag !== 'false';
  } catch {
    return true;
  }
}

// ── Helpers ───────────────────────────────────────────────────

/**
 * Returns an array of "YYYY-MM-DD" strings for every Mon–Sat in month.
 * (Sundays are the weekly day off for this company.)
 */
function getWorkingDates(year, month) {
  const dates = [];
  const lastDay = new Date(year, month, 0).getDate(); // last calendar day
  for (let d = 1; d <= lastDay; d++) {
    const date = new Date(year, month - 1, d);
    if (date.getDay() !== 0) { // 0 = Sunday
      dates.push(date.toISOString().slice(0, 10));
    }
  }
  return dates;
}

// ── Main function ─────────────────────────────────────────────

/**
 * Fetch monthly attendance summary for one employee.
 *
 * @param {string} userId    - Profile UUID (employee_id from payroll entry)
 * @param {number} year      - e.g. 2026
 * @param {number} month     - 1-based month (1 = January)
 * @returns {Promise<{
 *   workingDays: number,   — total Mon-Sat days in month
 *   presentDays: number,   — days with a "present-equivalent" status
 *   absentDays:  number,   — workingDays - presentDays
 *   lateDays:    number,   — subset of present days where status = 'late'
 *   error?:      string    — set if something went wrong (partial data returned)
 * }>}
 */
export async function fetchMonthlyAttendanceSummary(userId, year, month) {
  const workingDates = getWorkingDates(year, month);
  const workingDays  = workingDates.length;

  const empty = (extra = {}) => ({
    workingDays, presentDays: 0, absentDays: workingDays, lateDays: 0, ...extra,
  });

  if (!userId) return empty({ error: 'معرف الموظف مجهول — تأكد من ربط الموظف بحساب' });

  try {
    if (_isMockAttendance()) {
      // ── Mock: read the same localStorage store the attendance service writes ──
      const MOCK_KEY = '__mock_attendance_records';
      let store = {};
      try { store = JSON.parse(localStorage.getItem(MOCK_KEY) || '{}'); } catch { /* ok */ }

      let presentDays = 0;
      let lateDays    = 0;
      for (const date of workingDates) {
        const rec = store[`${userId}::${date}`];
        if (rec && PRESENT_STATUSES.has(rec.status)) {
          presentDays++;
          if (rec.status === 'late') lateDays++;
        }
      }
      return { workingDays, presentDays, absentDays: workingDays - presentDays, lateDays };
    }

    // ── Supabase: query attendance_records for the month ──
    const from     = `${year}-${String(month).padStart(2, '0')}-01`;
    const nextYear  = month === 12 ? year + 1 : year;
    const nextMonth = month === 12 ? 1 : month + 1;
    const to        = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;

    const { data, error } = await supabase
      .from('attendance_records')
      .select('date, status')
      .eq('user_id', userId)
      .gte('date', from)
      .lt('date', to);

    if (error) throw error;

    let presentDays = 0;
    let lateDays    = 0;
    for (const rec of (data || [])) {
      if (PRESENT_STATUSES.has(rec.status)) {
        presentDays++;
        if (rec.status === 'late') lateDays++;
      }
    }
    return { workingDays, presentDays, absentDays: workingDays - presentDays, lateDays };

  } catch (err) {
    return empty({ error: err?.message || 'خطأ غير متوقع' });
  }
}

// ── Deduction calculator ──────────────────────────────────────

/**
 * Calculate the absence deduction amount.
 *   deduction = (base_salary / working_days) * absent_days
 *
 * Returns 0 if baseSalary or workingDays is falsy.
 */
export function calcAbsenceDeduction(baseSalary, workingDays, absentDays) {
  const base = Number(baseSalary) || 0;
  const days  = Number(workingDays) || 0;
  const abs   = Number(absentDays)  || 0;
  if (!base || !days) return 0;
  return Math.round((base / days) * abs * 100) / 100;
}
