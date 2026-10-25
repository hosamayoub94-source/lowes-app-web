// =============================================================
// Tasks — calendar-safe date helpers (pure, no imports).
//
// Why this file exists: `tasks.due_date` is timestamptz but is written
// from a date input, so the stored instant is UTC midnight of the chosen
// day. Parsing it with `new Date(due) < new Date()` makes a task due
// "today" overdue from 03:00 in Istanbul/Damascus (UTC+3), and
// `date.toISOString().slice(0,7)` picks the PREVIOUS month for local
// midnight on the 1st. Everything here works on date KEYS ('YYYY-MM-DD',
// 'YYYY-MM') built from LOCAL calendar parts, never from toISOString().
// =============================================================

const DAY_MS = 86_400_000;
const pad = (n) => String(n).padStart(2, '0');

/** Local calendar day of a Date as 'YYYY-MM-DD'. */
export function ymd(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Today's key in the viewer's local timezone. */
export function todayKey(now = new Date()) {
  return ymd(now);
}

/**
 * Calendar day a task is due, as 'YYYY-MM-DD' (or null).
 * Strings are date-only values (or UTC-midnight instants written from a
 * date input) → the first 10 chars ARE the chosen day.
 */
export function dueKey(due) {
  if (!due) return null;
  if (due instanceof Date) return Number.isNaN(due.getTime()) ? null : ymd(due);
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(due));
  return m ? m[1] : null;
}

/** Local calendar day of an instant (completed_at, updated_at…). */
export function instantKey(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : ymd(d);
}

const keyToUtc = (key) => {
  const [y, m, d] = key.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};

/** Whole days from keyA to keyB (B - A). */
export function diffDays(keyA, keyB) {
  if (!keyA || !keyB) return null;
  return Math.round((keyToUtc(keyB) - keyToUtc(keyA)) / DAY_MS);
}

/** Days past due as a positive integer, 0 when not past due. */
export function daysOverdue(due, today = todayKey()) {
  const k = dueKey(due);
  if (!k) return 0;
  const d = diffDays(k, today);
  return d > 0 ? d : 0;
}

export const AGE_BUCKETS = ['1-3', '4-7', '8-14', '15+'];

/** Bucket label for an overdue age in days (>=1), else null. */
export function ageBucket(days) {
  if (!days || days < 1) return null;
  if (days <= 3) return '1-3';
  if (days <= 7) return '4-7';
  if (days <= 14) return '8-14';
  return '15+';
}

/** 'YYYY-MM' of a local Date. */
export function monthKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

/** Last N months (current first) as [{ val:'YYYY-MM', label }]. */
export function monthOptions(now = new Date(), count = 12, locale = 'ar-SA-u-nu-latn-ca-gregory') {
  const out = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({
      val: monthKey(d),
      label: d.toLocaleDateString(locale, { year: 'numeric', month: 'long' }),
    });
  }
  return out;
}

/**
 * Range for a 'YYYY-MM' value.
 *  fromKey/toKey — inclusive date keys (for date columns)
 *  fromIso/toIso — [from, to) instants for timestamptz columns, built from
 *                  the LOCAL month boundaries (use .gte(fromIso).lt(toIso)).
 */
export function monthRange(val) {
  const [y, m] = val.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const next = new Date(y, m, 1);
  const last = new Date(y, m, 0);
  return {
    fromKey: ymd(first),
    toKey: ymd(last),
    fromIso: first.toISOString(),
    toIso: next.toISOString(),
  };
}
