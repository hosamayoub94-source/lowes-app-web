// =============================================================
// Date helpers — Arabic-locale formatting + the small helpers
// the legacy index_v4.html used (todayS, currMonth, fmtDate).
// =============================================================

const AR_LOCALE = 'ar-EG';

/** ISO-style today (YYYY-MM-DD) — same shape as legacy todayS(). */
export function todayS() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Slash-style today (YYYY/MM/DD) — matches real attendance table date format. */
export function todaySlash() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}/${m}/${day}`;
}

/** YYYY-MM for the current month. */
export function currMonth() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${d.getFullYear()}-${m}`;
}

/** Arabic short date — e.g. "30 أبريل 2026". */
export function fmtDate(input) {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(AR_LOCALE, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/** Arabic time HH:mm. */
export function fmtTime(input) {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString(AR_LOCALE, { hour: '2-digit', minute: '2-digit' });
}

/** Day of week in Arabic. */
export function dayOfWeek(input = new Date()) {
  const d = input instanceof Date ? input : new Date(input);
  return d.toLocaleDateString(AR_LOCALE, { weekday: 'long' });
}

/** Difference in days (b - a). */
export function diffDays(a, b) {
  const ms = (new Date(b)).getTime() - (new Date(a)).getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

// ── يوم الوردية (لا اليوم التقويمي) ─────────────────────────
// نفس قاعدة تسجيل الحضور (AttendanceScreen.doCheckIn): يوم العمل يبدأ
// 06:00 صباحاً — أي وقت قبلها هو تتمة وردية الليلة الماضية، فالوردية
// 18:00→01:00 لا تنتهي عند 00:00. تُستخدم للويدجت والتقرير اليومي.
export const SHIFT_DAY_START_HOUR = 6;

/** تاريخ يوم الوردية الحالي كـDate (منتصف ليل ذلك اليوم). */
export function shiftDate(now = new Date()) {
  const d = new Date(now);
  if (d.getHours() < SHIFT_DAY_START_HOUR) d.setDate(d.getDate() - 1);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** يوم الوردية بصيغة YYYY-MM-DD (daily_reports.report_date). */
export function shiftDateISO(now = new Date()) {
  const d = shiftDate(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** يوم الوردية بصيغة YYYY/MM/DD (attendance.date). */
export function shiftDateSlash(now = new Date()) {
  return shiftDateISO(now).replace(/-/g, '/');
}
