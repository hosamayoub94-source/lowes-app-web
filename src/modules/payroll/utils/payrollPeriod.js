// Open-month vs closed-month rules for payroll (owner rule 24/10/2026).
//
// A payroll month that has not ended yet is only ever a PROVISIONAL calculation:
//   • base salary is the full monthly salary (never cut because the month is unfinished),
//   • the target-shortfall deduction is zero (a low figure today is not a final failure),
//   • commission/surplus is shown as provisional and NOT added to the net,
//   • only absence days that already happened AND were approved for deduction count,
//   • it can be neither approved nor paid.
// Only a calculation made on/after the first day of the next month is FINAL.
//
// Pure (no Supabase / React) so every rule is regression-tested in Node. `now` is injectable.

export const PROVISIONAL_BANNER = 'كشف مؤقت — الشهر لم يُغلق بعد — غير صالح للاعتماد النهائي أو الدفع النهائي';
export const PROVISIONAL_MARK = '🟡 حسبة مؤقتة';
export const FINAL_MARK = '🟢 حسبة نهائية';

const pad2 = (n) => String(n).padStart(2, '0');

/** Local calendar date of `now` as YYYY-MM-DD (no UTC shift: the app runs on the user's clock). */
export function localDateStr(now = new Date()) {
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

export function monthLastDay(year, month) {
  return new Date(year, month, 0).getDate();
}

export function monthEndStr(year, month) {
  return `${year}-${pad2(month)}-${pad2(monthLastDay(year, month))}`;
}

/** First day of the month AFTER (year, month), as YYYY-MM-DD. */
export function nextMonthStartStr(year, month) {
  const ny = month === 12 ? year + 1 : year;
  const nm = month === 12 ? 1 : month + 1;
  return `${ny}-${pad2(nm)}-01`;
}

/** True while the month has not ended yet (today is on or before its last day). */
export function isOpenPeriod(year, month, now = new Date()) {
  return localDateStr(now) < nextMonthStartStr(year, month);
}

export function calcKindFor(year, month, now = new Date()) {
  return isOpenPeriod(year, month, now) ? 'provisional' : 'final';
}

/**
 * The last day whose events count: today while the month is open, else the month's last day.
 * Attendance / absence beyond this date is the future and is never counted.
 */
export function asOfDateFor(year, month, now = new Date()) {
  const today = localDateStr(now);
  const end = monthEndStr(year, month);
  return today < end ? today : end;
}

/**
 * Was this stored entry calculated while its month was still open? (computed_at is the instant the engine ran.)
 * Manual entries are the owner's own figures and are not treated as provisional.
 */
export function isProvisionalEntry(entry, year, month) {
  if (!entry || entry.source === 'manual') return false;
  const t = Date.parse(entry.computed_at);
  if (!Number.isFinite(t)) return true; // unknown time ⇒ cannot prove it is final
  return String(new Date(t).toISOString()).slice(0, 10) < nextMonthStartStr(year, month);
}

/**
 * Why a run may NOT be approved / paid because of provisional data — or null when it is clear.
 * Both gates use this: the dashboard buttons and the store actions.
 */
export function provisionalBlockReason({ run, entries = [], now = new Date() } = {}) {
  const year = Number(run?.period_year);
  const month = Number(run?.period_month);
  if (!year || !month) return null;
  if (isOpenPeriod(year, month, now)) {
    return `${PROVISIONAL_BANNER}. الشهر ينتهي ${monthEndStr(year, month)}؛ بعد إغلاقه أعد تشغيل الدورة لتصير الحسبة نهائية.`;
  }
  const stale = (entries || []).filter((e) => isProvisionalEntry(e, year, month));
  if (stale.length) {
    return `${stale.length} قيد احتُسب قبل إغلاق الشهر (حسبة مؤقتة) — أعد تشغيل الدورة بعد إغلاق الشهر لتصير نهائية.`;
  }
  return null;
}

/** Provisional commission = the surplus over target × pct (display only, never part of the net). */
export function provisionalCommissionLocal(entry) {
  const adj = Number(entry?.adjusted_increase_local) || 0;
  const pct = Number(entry?.commission_pct) || 0;
  return Math.round(adj * pct) / 100;
}
