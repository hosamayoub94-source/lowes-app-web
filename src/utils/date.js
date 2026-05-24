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
