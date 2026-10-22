// Month keys built from LOCAL calendar fields. `Date#toISOString()` converts to
// UTC first, so in UTC+3 (Syria/Turkey) `new Date(2026, 9, 1)` — local midnight
// on 1 Oct — serialises as 2026-09-30T21:00Z and `.slice(0, 7)` yields "2026-09".
// That shifted every month in the HR month <select> back by one.
export function localMonthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

// Last `count` months, newest first: [{ val: 'YYYY-MM', year, monthIndex }]
export function recentMonthKeys(now = new Date(), count = 6) {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    return { val: localMonthKey(d), year: d.getFullYear(), monthIndex: d.getMonth() };
  });
}
