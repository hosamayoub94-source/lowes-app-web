/* global process */
import { groupOfEntry, filterEntriesByGroup, summarizeGroups, PAYROLL_GROUPS } from './src/modules/payroll/utils/payrollGroups.js';
let pass = 0; let fail = 0;
const eq = (a, b, m) => { if (JSON.stringify(a) === JSON.stringify(b)) pass += 1; else { fail += 1; console.error('FAIL', m, JSON.stringify(a), '≠', JSON.stringify(b)); } };

const E = (id, profile_team, net, extra = {}) => ({ id, profile_team, net_salary_usd: net, currency: 'USD', ...extra });
const entries = [
  E('s1', 'سوريا', 100), E('s2', 'سوريا', 50.5, { team: 'syria' }), E('t1', 'تركيا', 200), E('m1', 'ميديا', 70),
  E('x1', 'عام', 300), E('x2', '', 10), E('u1', 'الإمارات', 40),
  E('c1', '', 60, { team: 'turkey' }),           // بلا فريق بملفه لكن حُسب كتركيا ← تركيا
  E('c2', undefined, 5, { team: 'syria' }),
];

eq(groupOfEntry(entries[0]), 'syria', 'سوريا');
eq(groupOfEntry(entries[3]), 'social', 'ميديا ← سوشال ميديا');
eq(groupOfEntry(entries[4]), 'other', 'عام ← أخرى');
eq(groupOfEntry(entries[5]), 'other', 'بلا فريق ← أخرى');
eq(groupOfEntry(entries[6]), 'uae', 'الإمارات');
eq(groupOfEntry(entries[7]), 'turkey', 'فريق الحسبة عند غياب فريق الملف');
eq(filterEntriesByGroup(entries, 'all').length, entries.length, 'الكل = كل القيود');

const sm = summarizeGroups(entries);
eq(sm.all.count, 9, 'عدد الكل');
eq(PAYROLL_GROUPS.filter((g) => g.key !== 'all').reduce((n, g) => n + sm[g.key].count, 0), 9, 'مجموع المجموعات = الكل (لا يسقط ولا يتكرر أحد)');
eq(PAYROLL_GROUPS.filter((g) => g.key !== 'all').reduce((n, g) => n + (sm[g.key].totals.USD || 0), 0).toFixed(2), sm.all.totals.USD.toFixed(2), 'مجموع صافي المجموعات = إجمالي الكل');
eq(sm.syria.totals.USD, 155.5, 'صافي سوريا (100 + 50.5 + 5)');
eq(sm.syria.count, 3, 'عدد سوريا');

// عملتان
const mixed = [E('a', 'تركيا', 10, { currency: 'TRY' }), E('b', 'تركيا', 20, { currency: 'USD' })];
eq(summarizeGroups(mixed).turkey.totals, { TRY: 10, USD: 20 }, 'عملات منفصلة');
console.log(`payroll groups: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
