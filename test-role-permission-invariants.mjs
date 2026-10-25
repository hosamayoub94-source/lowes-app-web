/* global process */
// Least-privilege invariants for the DEFAULT permissions of every role (src/data/permissions.js) plus the
// per-user extra/denied resolution. Guards against someone silently widening a role. run: node test-role-permission-invariants.mjs
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const out = path.join(root, `.tmp-role-inv-${process.pid}.mjs`);
await build({
  stdin: { contents: `export * as perms from './src/data/permissions.js'; export * as nav from './src/data/navigation.js'; export * as teams from './src/data/teams.js';`, resolveDir: root, loader: 'js' },
  bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent',
});
let m;
try { m = await import(pathToFileURL(out).href + `?t=${Date.now()}`); } finally { fs.unlinkSync(out); }
const { perms, nav, teams } = m;
const P = perms.PERMISSIONS; const R = teams.ROLES;

let pass = 0; let fail = 0;
const ok = (c, msg) => { if (c) pass++; else { fail++; console.log('FAIL:', msg); } };
const has = (role, p, extra = [], denied = []) => perms.resolvePermissions({ role, extra_permissions: extra, denied_permissions: denied }).has(p);

// Money / people / system capabilities that only specific roles may hold by default
const PAYROLL_HR = [P.MANAGE_PAYROLL, P.APPROVE_LEAVES, P.MANAGE_ATTENDANCE];
const FINANCE = [P.VIEW_FINANCE, P.MANAGE_PAYROLL];
const SYSTEM = [P.MANAGE_USERS, P.MANAGE_SETTINGS];

// ── employee: nothing by default ──
ok(perms.resolvePermissions({ role: R.EMPLOYEE }).size === 0, 'employee has ZERO default permissions');

// ── sales_manager: no payroll / bank / system by default ──
for (const p of [...FINANCE, ...SYSTEM, P.APPROVE_LEAVES, P.MANAGE_ATTENDANCE, P.MANAGE_CENTRAL_STOCK, P.MANAGE_SALES_STOCK, P.MANAGE_GUIDES])
  ok(!has(R.SALES_MANAGER, p), `sales_manager default lacks ${p}`);

// ── social_manager: no payroll / accounting / system / sales analytics ──
for (const p of [...FINANCE, ...SYSTEM, P.MANAGE_ORDERS, P.VIEW_ANALYTICS, P.MANAGE_PRODUCTS, P.VIEW_INVENTORY, P.MANAGE_KPI, P.APPROVE_LEAVES])
  ok(!has(R.SOCIAL_MANAGER, p), `social_manager default lacks ${p}`);

// ── media_buyer: no employee management / payroll / HR ──
for (const p of [...FINANCE, ...SYSTEM, ...PAYROLL_HR, P.VIEW_ALL_ATTENDANCE, P.MANAGE_KPI, P.MANAGE_PRODUCTS, P.VIEW_INVENTORY])
  ok(!has(R.MEDIA_BUYER, p), `media_buyer default lacks ${p}`);

// ── manager: wide, but NOT a system admin ──
for (const p of [...SYSTEM, P.VIEW_SYRIA_LEADS, P.VIEW_UAE_LEADS, P.VIEW_CREATOR_INTELLIGENCE, P.MANAGE_CREATOR_DATA, P.MANAGE_CREATOR_RESEARCH, P.MANAGE_CREATOR_CAMPAIGNS])
  ok(!has(R.MANAGER, p), `manager default lacks ${p}`);

// ── management positions stay narrow ──
ok(!has(R.ACCOUNTANT, P.MANAGE_ORDERS) && !has(R.ACCOUNTANT, P.MANAGE_USERS) && !has(R.ACCOUNTANT, P.APPROVE_LEAVES), 'accountant: finance/payroll only');
ok(!has(R.HR_MANAGER, P.VIEW_FINANCE) && !has(R.HR_MANAGER, P.MANAGE_USERS) && !has(R.HR_MANAGER, P.MANAGE_ORDERS), 'hr_manager: no finance / users / orders');
ok(!has(R.WAREHOUSE_MANAGER, P.MANAGE_PAYROLL) && !has(R.WAREHOUSE_MANAGER, P.VIEW_FINANCE) && !has(R.WAREHOUSE_MANAGER, P.MANAGE_USERS), 'warehouse_manager: stock only');
ok(!has(R.MARKETING_MANAGER, P.MANAGE_PAYROLL) && !has(R.MARKETING_MANAGER, P.VIEW_FINANCE) && !has(R.MARKETING_MANAGER, P.MANAGE_USERS), 'marketing_manager: no payroll/finance/users');

// ── admin: everything, and cannot be stripped by denied_permissions (documented behaviour) ──
ok(Object.values(P).every((p) => has(R.ADMIN, p)), 'admin holds every permission');
ok(Object.values(P).every((p) => has(R.ADMIN, p, [], Object.values(P))), 'admin ignores denied_permissions');

// ── unknown / legacy role strings get nothing ──
for (const legacy of ['headsup', 'supervisor', 'marketer', 'field_rep', 'store', '', null, undefined])
  ok(perms.resolvePermissions({ role: legacy }).size === 0, `unknown role "${legacy}" has no permissions`);
ok(perms.resolvePermissions(null).size === 0 && perms.resolvePermissions(undefined).size === 0, 'no session → no permissions');

// ── extra / denied resolution ──
ok(has(R.EMPLOYEE, P.SEND_WHATSAPP, [P.SEND_WHATSAPP]), 'extra grants a permission');
ok(!has(R.MANAGER, P.MANAGE_PAYROLL, [], [P.MANAGE_PAYROLL]), 'denied removes a role default');
ok(!has(R.EMPLOYEE, P.MANAGE_PAYROLL, [P.MANAGE_PAYROLL], [P.MANAGE_PAYROLL]), 'denied wins over extra');
ok(!has(R.EMPLOYEE, P.MANAGE_USERS), 'employee without extra lacks manage_users');
ok(perms.resolvePermissions({ role: R.EMPLOYEE, extra_permissions: 'manage_payroll' }).size === 0, 'non-array extra_permissions is ignored (no string-coercion grant)');

// ── Joelle-shaped user: media-team employee with creator permissions only ──
const joelle = { role: R.EMPLOYEE, extra_permissions: [P.VIEW_CREATOR_INTELLIGENCE, P.MANAGE_CREATOR_DATA, P.MANAGE_CREATOR_CAMPAIGNS] };
const jp = perms.resolvePermissions(joelle);
const jnav = nav.navItemsForRole(R.EMPLOYEE, jp, 'ميديا').map((i) => i.id);
for (const id of ['orders-syria', 'orders-turkey', 'orders-uae', 'customers', 'payroll', 'accounting', 'ledger', 'admin', 'hr', 'profitability', 'manager-board', 'analytics'])
  ok(!jnav.includes(id), `media employee does not see "${id}"`);
ok(jnav.includes('creators'), 'creator permission reveals the creators screen');
ok(!jp.has(P.MANAGE_CAMPAIGNS), 'creator permissions do not imply manage_campaigns');

// ── nav: sensitive screens are never listed for the lower roles by default ──
const navIds = (role) => nav.navItemsForRole(role, perms.resolvePermissions({ role })).map((i) => i.id);
for (const role of [R.EMPLOYEE, R.SOCIAL_MANAGER, R.MEDIA_BUYER]) {
  for (const id of ['payroll', 'ledger', 'admin', 'admin-projects', 'hr']) ok(!navIds(role).includes(id), `${role} default nav lacks ${id}`);
}
for (const role of [R.SALES_MANAGER, R.MANAGER]) {
  for (const id of ['ledger', 'admin', 'admin-projects']) ok(!navIds(role).includes(id), `${role} default nav lacks ${id}`);
}
ok(!navIds(R.SALES_MANAGER).includes('payroll'), 'sales_manager default nav lacks payroll');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
