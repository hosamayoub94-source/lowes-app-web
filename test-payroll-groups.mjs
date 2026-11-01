/* global process */
import { UAE_PAID_SHARES, uaePaidTotalUsd, MANAGEMENT_EMPLOYEE_IDS, groupOfEntry, filterEntriesByGroup, summarizeGroups, PAYROLL_GROUPS } from './src/modules/payroll/utils/payrollGroups.js';
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
// الإدارة: وسيم (فريقه سوريا) وأماني (بلا فريق) وفادي (عام) ← الإدارة بغض النظر عن فريق الملف
const [AM, WA, FA] = [...MANAGEMENT_EMPLOYEE_IDS];
eq(groupOfEntry(E('w', 'سوريا', 177, { employee_id: WA })), 'admin', 'وسيم ← الإدارة لا سوريا');
eq(groupOfEntry(E('a', '', 402, { employee_id: AM })), 'admin', 'أماني ← الإدارة');
eq(groupOfEntry(E('f', 'عام', 302, { employee_id: FA })), 'admin', 'فادي ← الإدارة');
eq(groupOfEntry(E('z', 'سوريا', 1, { employee_id: 'someone-else' })), 'syria', 'غيرهم لا يتأثر');
eq(groupOfEntry(entries[3]), 'social', 'ميديا ← سوشال ميديا');
eq(groupOfEntry(entries[4]), 'other', 'عام ← أخرى');
eq(groupOfEntry(entries[5]), 'other', 'بلا فريق ← أخرى');
eq(groupOfEntry(entries[6]), 'uae', 'الإمارات');
eq(groupOfEntry(entries[7]), 'turkey', 'فريق الحسبة عند غياب فريق الملف');
eq(filterEntriesByGroup(entries, 'all').length, entries.length, 'الكل = كل القيود');

const sm = summarizeGroups([...entries, E('w', 'سوريا', 177, { employee_id: WA }), E('a', '', 402, { employee_id: AM })]);
eq(sm.all.count, 11, 'عدد الكل');
eq(PAYROLL_GROUPS.filter((g) => g.key !== 'all').reduce((n, g) => n + sm[g.key].count, 0), 11, 'مجموع المجموعات = الكل (لا يسقط ولا يتكرر أحد)');
eq(PAYROLL_GROUPS.filter((g) => g.key !== 'all').reduce((n, g) => n + (sm[g.key].totals.USD || 0), 0).toFixed(2), sm.all.totals.USD.toFixed(2), 'مجموع صافي المجموعات = إجمالي الكل');
eq(sm.syria.totals.USD, 155.5, 'صافي سوريا (100 + 50.5 + 5) بدون وسيم');
eq(sm.syria.count, 3, 'عدد سوريا');
eq(sm.admin.count, 2, 'عدد الإدارة');
eq(sm.admin.totals.USD, 579, 'صافي الإدارة');

// عملتان
const mixed = [E('a', 'تركيا', 10, { currency: 'TRY' }), E('b', 'تركيا', 20, { currency: 'USD' })];
eq(summarizeGroups(mixed).turkey.totals, { TRY: 10, USD: 20 }, 'عملات منفصلة');
eq(UAE_PAID_SHARES.length, 2, 'الإمارات: Arwa وSham');
eq(uaePaidTotalUsd(), 245, 'ما على الإمارات = 140 + 105');
eq(new Set(UAE_PAID_SHARES.map((x) => x.employee_id)).size, 2, 'معرّفان مختلفان');
console.log(`payroll groups: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
