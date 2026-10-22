/* global process */
// Regression: the HR month <select> showed "أكتوبر" but carried value 2026-09
// when the runtime timezone was ahead of UTC (Syria/Turkey, UTC+3).
// Run under several TZ values; the label and value must always agree.
import { readFileSync } from 'node:fs';
import { localMonthKey, recentMonthKeys } from './src/utils/monthKey.js';

let pass = 0;
let fail = 0;
const ok = (condition, message) => {
  if (condition) pass += 1;
  else { fail += 1; console.error('FAIL', message, '(TZ=' + (process.env.TZ || 'default') + ')'); }
};

const now = new Date(2026, 9, 23, 12, 0, 0); // 23 Oct 2026, local noon
const opts = recentMonthKeys(now, 6);
ok(opts[0].val === '2026-10', `newest option is 2026-10, got ${opts[0].val}`);
ok(opts[0].monthIndex === 9 && opts[0].year === 2026, 'label fields describe October 2026');
ok(opts.map((o) => o.val).join() === '2026-10,2026-09,2026-08,2026-07,2026-06,2026-05', `six consecutive months: ${opts.map((o) => o.val)}`);
for (const o of opts) ok(o.val === `${o.year}-${String(o.monthIndex + 1).padStart(2, '0')}`, `value matches its own label: ${o.val}`);

// year rollover
const jan = recentMonthKeys(new Date(2027, 0, 5), 3).map((o) => o.val).join();
ok(jan === '2027-01,2026-12,2026-11', `year rollover: ${jan}`);
ok(localMonthKey(new Date(2026, 9, 1, 0, 0, 0)) === '2026-10', 'local midnight on the 1st stays in its own month');
ok(localMonthKey(new Date(2026, 11, 31, 23, 59, 59)) === '2026-12', 'last second of the month stays in its month');

// The source must not reintroduce the UTC-slice pattern for month options.
for (const file of ['./src/screens/HRDashboard.jsx', './src/screens/TaskReportScreen.jsx']) {
  const src = readFileSync(file, 'utf8');
  ok(!/new Date\(now\.getFullYear\(\), now\.getMonth\(\) - i, 1\)[\s\S]{0,120}toISOString/.test(src), `${file} builds month keys without toISOString`);
}
ok(/recentMonthKeys/.test(readFileSync('./src/screens/HRDashboard.jsx', 'utf8')), 'HRDashboard uses the shared month helper');

console.log(`month key: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
