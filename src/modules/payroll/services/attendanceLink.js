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

// الجدول الحيّ الفعلي هو `attendance` (4300+ صف، مفتاحه employee_name —
// عمود employee_id فارغ للكل). حالاته عربية بإيموجي. `attendance_records`
// شبه فارغ (بقايا مخطط قديم keyed بـuser_id) — نُبقيه fallback فقط.
// (توحيد مصدر الحضور — تدقيق 2026-07-02.)
const norm = (s) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
const isPresentStatus = (s) => { const t = String(s || ''); return t.includes('حاضر') || t.includes('خروج') || t.includes('present') || t.includes('late'); };
const isLeaveStatus   = (s) => { const t = String(s || ''); return t.includes('إجازة') || t.includes('اجازة') || t.includes('leave') || t.includes('off'); };
const isLateStatus    = (s) => String(s || '').includes('late') || String(s || '').includes('متأخر');
const dayKey = (d) => String(d ?? '').replace(/-/g, '/').slice(0, 10); // «YYYY/MM/DD»

/**
 * ملخّص الحضور من الجدول الحيّ `attendance` (بالاسم). يعدّ التواريخ الفريدة
 * (قد يوجد صفّا «حاضر»+«خروج» لليوم نفسه). الإجازة يوم مُبرّر (لا غياب).
 */
async function summaryFromLiveAttendance(employeeName, year, month, workingDays) {
  const mm = String(month).padStart(2, '0');
  const { data, error } = await supabase
    .from('attendance')
    .select('date, status, was_late')
    .eq('employee_name', employeeName)
    .like('date', `${year}/${mm}/%`);
  if (error) throw error;
  if (!data || data.length === 0) return null; // لا سجلّ بالاسم → دع المتصل يقرّر

  const present = new Set(), leave = new Set(), late = new Set();
  for (const r of data) {
    const k = dayKey(r.date);
    if (isPresentStatus(r.status)) { present.add(k); if (r.was_late || isLateStatus(r.status)) late.add(k); }
    else if (isLeaveStatus(r.status)) leave.add(k);
  }
  const presentDays = present.size;
  const leaveDays   = leave.size;
  const absentDays  = Math.max(0, workingDays - presentDays - leaveDays);
  return { workingDays, presentDays, absentDays, lateDays: late.size, leaveDays, source: 'attendance' };
}

// Read mock-mode flag lazily to avoid circular imports at module load.
function _isMockAttendance() {
  try {
    const flag = String(import.meta.env.VITE_USE_MOCK_ATTENDANCE ?? '').toLowerCase();
    return flag === 'true';
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
      // صيغة محلية YYYY-MM-DD بدون تحويل UTC (toISOString يُزيح يوماً في توقيت +UTC مثل تركيا +3).
      dates.push(`${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
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
export async function fetchMonthlyAttendanceSummary(userId, year, month, employeeName = null) {
  const workingDates = getWorkingDates(year, month);
  const workingDays  = workingDates.length;

  const empty = (extra = {}) => ({
    workingDays, presentDays: 0, absentDays: workingDays, lateDays: 0, ...extra,
  });

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

    // ── المصدر الأساسي: الجدول الحيّ `attendance` (بالاسم) ──
    if (employeeName && String(employeeName).trim()) {
      const live = await summaryFromLiveAttendance(String(employeeName).trim(), year, month, workingDays);
      if (live) return live;
      // اسم غير مطابق (قد يكون بديلاً/تهجئة) — جرّب مطابقة مطبّعة موسّعة
      const mm = String(month).padStart(2, '0');
      const { data: all } = await supabase
        .from('attendance').select('employee_name, date, status, was_late')
        .like('date', `${year}/${mm}/%`);
      if (all && all.length) {
        const target = norm(employeeName);
        const rows = all.filter(r => norm(r.employee_name) === target);
        if (rows.length) {
          const present = new Set(), leave = new Set(), late = new Set();
          for (const r of rows) {
            const k = dayKey(r.date);
            if (isPresentStatus(r.status)) { present.add(k); if (r.was_late || isLateStatus(r.status)) late.add(k); }
            else if (isLeaveStatus(r.status)) leave.add(k);
          }
          return { workingDays, presentDays: present.size, absentDays: Math.max(0, workingDays - present.size - leave.size), lateDays: late.size, leaveDays: leave.size, source: 'attendance' };
        }
      }
      // لا سجلّ حضور لهذا الموظف هذا الشهر
      return { ...empty(), source: 'attendance', noData: true };
    }

    // ── Fallback: الجدول القديم attendance_records بالـuser_id (شبه فارغ) ──
    if (!userId) return empty({ error: 'لا اسم ولا معرف للموظف — تعذّر جلب الحضور' });
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
    return { workingDays, presentDays, absentDays: workingDays - presentDays, lateDays, source: 'attendance_records' };

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
