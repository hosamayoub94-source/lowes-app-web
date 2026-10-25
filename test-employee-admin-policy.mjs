/* global process */
// Role hierarchy of the employee-management Edge Functions (manage-employee, admin-reset-pin).
// Finding F-04: a manager could create/promote/reset the PIN of an ADMIN. run: node test-employee-admin-policy.mjs
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const out = path.join(root, `.tmp-emp-policy-${process.pid}.mjs`);
await build({ entryPoints: ['supabase/functions/_shared/employeeAdminPolicy.js'], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent' });
let m;
try { m = await import(pathToFileURL(out).href + `?t=${Date.now()}`); } finally { fs.unlinkSync(out); }
const { canGrantRole, canManageTargetAccount } = m;

let pass = 0; let fail = 0;
const ok = (c, msg) => { if (c) pass++; else { fail++; console.log('FAIL:', msg); } };

// same table as manage-employee/index.ts
const DIST = ['field_rep', 'marketer', 'supervisor', 'supervisor_manager', 'area_agent'];
const CAN_CREATE = { admin: '*', manager: '*', social_manager: ['employee'], sales_manager: DIST, supervisor_manager: ['supervisor'], supervisor: ['marketer'] };

// ── grant ──
ok(canGrantRole('admin', 'admin', CAN_CREATE.admin), 'admin may grant admin');
ok(!canGrantRole('manager', 'admin', CAN_CREATE.manager), 'manager may NOT grant admin (was allowed before the fix)');
ok(canGrantRole('manager', 'employee', CAN_CREATE.manager), 'manager may still create employees');
ok(canGrantRole('manager', 'sales_manager', CAN_CREATE.manager), 'manager may still create sales_manager');
ok(!canGrantRole('sales_manager', 'admin', CAN_CREATE.sales_manager), 'sales_manager may not grant admin');
ok(!canGrantRole('sales_manager', 'manager', CAN_CREATE.sales_manager), 'sales_manager may not grant manager');
ok(canGrantRole('sales_manager', 'marketer', CAN_CREATE.sales_manager), 'sales_manager may grant distribution roles');
ok(!canGrantRole('social_manager', 'manager', CAN_CREATE.social_manager), 'social_manager may only create employees');
ok(canGrantRole('social_manager', 'employee', CAN_CREATE.social_manager), 'social_manager may create employees');
ok(!canGrantRole('supervisor', 'admin', CAN_CREATE.supervisor), 'supervisor may not grant admin');
ok(!canGrantRole(null, 'employee', '*'), 'no requester → denied');
ok(!canGrantRole('manager', '', '*'), 'empty role → denied');

// ── manage existing account ──
const adminT = { role_type: 'admin', team: null };
const mgrT = { role_type: 'manager', team: 'سوريا' };
const empT = { role_type: 'employee', team: 'ميديا' };
const empOther = { role_type: 'employee', team: 'تركيا' };
for (const action of ['edit/reset_pin/deactivate/move_group/delete']) {
  ok(canManageTargetAccount('admin', adminT, '*').ok, `admin manages admin (${action})`);
  ok(!canManageTargetAccount('manager', adminT, '*').ok, `manager must NOT manage admin (${action})`);
  ok(!canManageTargetAccount('sales_manager', adminT, DIST).ok, 'sales_manager must not manage admin');
  ok(!canManageTargetAccount('social_manager', adminT, ['employee'], true).ok, 'social_manager must not manage admin');
}
ok(canManageTargetAccount('manager', mgrT, '*').ok, 'manager still manages managers (unchanged, flagged P2 in audit)');
ok(canManageTargetAccount('manager', empT, '*').ok, 'manager manages employees');
ok(canManageTargetAccount('social_manager', empT, ['employee'], true).ok, 'social_manager manages media employees');
ok(!canManageTargetAccount('social_manager', empOther, ['employee'], true).ok, 'social_manager cannot manage non-media employees');
ok(!canManageTargetAccount('social_manager', mgrT, ['employee'], true).ok, 'social_manager cannot manage managers');
ok(!canManageTargetAccount('sales_manager', mgrT, DIST).ok, 'sales_manager cannot manage managers');
ok(canManageTargetAccount('sales_manager', { role_type: 'marketer' }, DIST).ok, 'sales_manager manages marketers');
ok(canManageTargetAccount('manager', null, '*').error === 'not_found', 'missing target → not_found');
ok(!canManageTargetAccount(null, empT, '*').ok, 'no requester → denied');

// ── wiring: the functions must really use the policy (guards against someone reverting the call sites) ──
const me = fs.readFileSync('supabase/functions/manage-employee/index.ts', 'utf8');
const rp = fs.readFileSync('supabase/functions/admin-reset-pin/index.ts', 'utf8');
ok(/import \{[^}]*canGrantRole[^}]*\} from '\.\.\/_shared\/employeeAdminPolicy\.js'/.test(me), 'manage-employee imports the policy');
ok((me.match(/canGrantRole\(requesterRole/g) || []).length === 2, 'manage-employee gates BOTH add and edit with canGrantRole');
ok(/return canManageTargetAccount\(requesterRole, t, allowed, isSocial\)/.test(me), 'assertCanManageTarget delegates to the policy');
ok(/const delGuard = await assertCanManageTarget/.test(me), 'delete now goes through the target guard');
ok(!/allowed !== '\*' && !allowed\.includes\(role/.test(me), 'old unguarded role checks are gone');
ok(/action === 'reset_pin'\) \{\s*\n\s*return json\(\{ ok: false, error: 'moved'/.test(me), 'manage-employee reset_pin stays retired (PIN changes only via pin-change)');
ok(!/\.update\(\{ pin:/.test(me), 'manage-employee never writes profiles.pin');
ok(/status: 410/.test(rp) && !/createClient|\.update\(|\.from\(/.test(rp), 'admin-reset-pin stays a retired stub that touches nothing');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
