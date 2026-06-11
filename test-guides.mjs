// تست الدوال النقيّة للأدلة — node test-guides.mjs
import { guidesForUser, groupGuidesBySection, guidesForRoute } from './src/services/guidesLogic.js';

let p = 0, f = 0;
const ok = (n, c) => { c ? (p++, console.log('  ✓', n)) : (f++, console.error('  ✗ FAIL:', n)); };

const G = [
  { key: 'a', section_key: 'sales', permission: null, routes: ['/orders/syria'], sort_order: 10 },
  { key: 'b', section_key: 'admin', permission: 'VIEW_FINANCE', routes: ['/accounting'], sort_order: 70 },
  { key: 'c', section_key: 'sales', permission: 'MANAGE_CAMPAIGNS', routes: ['/campaigns'], sort_order: 90 },
];
const ORDER = ['core', 'sales', 'inventory', 'self', 'hr', 'reports', 'social', 'admin'];
const LABELS = { sales: 'المبيعات', admin: 'الإدارة' };

const emp = guidesForUser(G, new Set());
ok('null permission مرئي للجميع', emp.some(g => g.key === 'a'));
ok('المحظور لا يظهر بلا صلاحية', !emp.some(g => g.key === 'b'));

const mgr = guidesForUser(G, new Set(['VIEW_FINANCE', 'MANAGE_CAMPAIGNS']));
ok('صاحب الصلاحية يرى المحمي', mgr.length === 3);

const grp = groupGuidesBySection(G, { order: ORDER, labels: LABELS });
ok('sales قبل admin', grp.findIndex(s => s.key === 'sales') < grp.findIndex(s => s.key === 'admin'));
ok('قسم sales فيه دليلان', grp.find(s => s.key === 'sales').items.length === 2);
ok('تسمية القسم تُطبَّق', grp.find(s => s.key === 'sales').label === 'المبيعات');

const r = guidesForRoute(G, '/accounting');
ok('دليل المسار الحالي أولاً', r[0].key === 'b');

const snap = JSON.stringify(G);
guidesForUser(G, new Set()); groupGuidesBySection(G, { order: ORDER }); guidesForRoute(G, '/x');
ok('الدوال نقيّة (لم تُعدّل المدخل)', JSON.stringify(G) === snap);

console.log(`\n${f === 0 ? '✅' : '❌'} pass ${p} / fail ${f}`);
process.exit(f === 0 ? 0 : 1);
