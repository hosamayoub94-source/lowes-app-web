// موظفو فريق «ميديا» (role=employee) لا يرون الطلبات/العملاء — قائمة، شريط سفلي، مسار.
// run: node test-media-sales-hidden.mjs
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const out = path.join(root, `.tmp-media-sales-${process.pid}.mjs`);
const entry = `
  export * as nav from './src/data/navigation.js';
  export * as access from './src/data/salesAccess.js';
  export * as perms from './src/data/permissions.js';
`;
await build({ stdin: { contents: entry, resolveDir: root, loader: 'js' }, bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent' });
let m;
try { m = await import(pathToFileURL(out).href + `?t=${Date.now()}`); } finally { fs.unlinkSync(out); }
const { nav, access, perms } = m;

let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) pass++; else { fail++; console.log('FAIL:', msg); } };
const HIDDEN = ['orders-syria', 'orders-turkey', 'orders-uae', 'customers'];
const ids = (role, permSet, team) => nav.navItemsForRole(role, permSet, team).map((i) => i.id);
const permsOf = (p) => perms.resolvePermissions({ role: p.role, extra_permissions: p.extra || [], denied_permissions: p.denied || [] });

// 1) موظف ميديا: لا طلبات ولا عملاء، والباقي كما هو
const joelle = { role: 'employee', team: 'ميديا', extra: ['view_creator_intelligence'] };
const jp = permsOf(joelle);
const jIds = ids('employee', jp, 'ميديا');
HIDDEN.forEach((h) => ok(!jIds.includes(h), `media employee must not see ${h}`));
['workspace', 'attendance', 'tasks', 'daily-report', 'creators'].forEach((k) => ok(jIds.includes(k), `media employee keeps ${k}`));

// 2) موظف من فريق آخر: يرى كل شيء كالسابق
['سوريا', 'تركيا', null, undefined, ''].forEach((t) => {
  const i = ids('employee', permsOf({ role: 'employee' }), t);
  HIDDEN.forEach((h) => ok(i.includes(h), `employee in team ${JSON.stringify(t)} still sees ${h}`));
});

// 3) أدوار الميديا الأخرى لا تتأثر (ميديا باير / مدير / مدير سوشال)
HIDDEN.forEach((h) => ok(ids('media_buyer', permsOf({ role: 'media_buyer' }), 'ميديا').includes(h), `media_buyer in ميديا still sees ${h}`));
ok(ids('manager', permsOf({ role: 'manager' }), 'ميديا').includes('orders-syria'), 'manager in ميديا unaffected');
ok(!ids('social_manager', permsOf({ role: 'social_manager' }), 'ميديا').includes('customers'), 'social_manager customers rule unchanged (already hidden)');
HIDDEN.forEach((h) => ok(ids('admin', permsOf({ role: 'admin' }), 'ميديا').includes(h), `admin in ميديا sees ${h}`));

// 4) مَن مُنِح manage_orders صراحةً يحتفظ بالشاشات
const granted = permsOf({ role: 'employee', extra: ['manage_orders'] });
HIDDEN.forEach((h) => ok(ids('employee', granted, 'ميديا').includes(h), `media employee with manage_orders keeps ${h}`));

// 5) الشريط السفلي لا يحوي طلبات/عملاء ويبقى 5 تبويبات
const tabs = nav.bottomTabsForRole('employee', jp, null, 'ميديا');
ok(tabs.length === 5, `bottom tabs = 5 (got ${tabs.length})`);
HIDDEN.forEach((h) => ok(!tabs.some((t) => t.id === h), `bottom tabs must not include ${h}`));
const tabsSy = nav.bottomTabsForRole('employee', permsOf({ role: 'employee' }), 'syria', 'سوريا');
ok(tabsSy.some((t) => t.id === 'orders-syria') && tabsSy.some((t) => t.id === 'customers'), 'syria employee bottom tabs unchanged');

// 6) المجموعات: مجموعة «sales» لا تحوي الطلبات/العملاء
const groups = nav.groupedNavForRole('employee', jp, 'ميديا');
const salesGroup = groups.find((g) => g.key === 'sales');
HIDDEN.forEach((h) => ok(!(salesGroup?.items || []).some((i) => i.id === h), `sidebar sales group must not include ${h}`));

// 7) الدالة المساعدة (تُستخدم بـProtectedRoute للمسارات)
ok(access.hidesSalesScreens('employee', 'ميديا', jp) === true, 'route guard: media employee blocked');
ok(access.hidesSalesScreens('employee', ' ميديا ', jp) === true, 'route guard: trims team');
ok(access.hidesSalesScreens('employee', 'سوريا', jp) === false, 'route guard: other team allowed');
ok(access.hidesSalesScreens('media_buyer', 'ميديا', jp) === false, 'route guard: media_buyer allowed');
ok(access.hidesSalesScreens('employee', 'ميديا', granted) === false, 'route guard: manage_orders allowed');
ok(access.hidesSalesScreens(null, 'ميديا') === false, 'route guard: no role -> false (auth handles it)');

// 8) المسارات الأربعة فعلاً محروسة بالكود
const routes = fs.readFileSync('src/routes/AppRoutes.jsx', 'utf8');
['ORDERS}', 'ORDERS_SYRIA}', 'ORDERS_TURKEY}', 'ORDERS_UAE}'].forEach((k) => {
  const line = routes.split('\n').find((l) => l.includes(`ROUTES.${k}`));
  ok(line && line.includes('blockMediaStaff'), `route ROUTES.${k} is guarded`);
});
const custIdx = routes.indexOf('path={ROUTES.CUSTOMERS}');
ok(custIdx > 0 && routes.slice(custIdx, custIdx + 300).includes('blockMediaStaff'), 'route ROUTES.CUSTOMERS is guarded');

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
