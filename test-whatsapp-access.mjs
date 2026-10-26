/* eslint-env node */
// محادثات واتساب (/admin/whatsapp): لا يراها ولا يفتحها موظف عادي بلا صلاحية send_whatsapp.
// الأدمن/المدير/مدير المبيعات يبقون كما هم، والموظف الممنوح send_whatsapp يبقى يدخل.
// Run: node test-whatsapp-access.mjs
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('FAIL:', m); } };

const root = process.cwd();
const out = path.join(root, '.tmp-whatsapp-access.mjs');
await build({
  stdin: { contents: `export * as Perm from './src/data/permissions.js'; export * as Nav from './src/data/navigation.js'; export { ROLES } from './src/data/teams.js';`, resolveDir: root, loader: 'js' },
  bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent',
});
let mod;
try { mod = await import(pathToFileURL(out).href); } finally { fs.unlinkSync(out); }
const { Perm, Nav, ROLES } = mod;
const KEY = 'send_whatsapp';
const ids = (s) => Nav.navItemsForRole(s.role, Perm.resolvePermissions(s), s.team).map((i) => i.id);
const mk = (role, extra = [], denied = []) => ({ role, team: 'تركيا', extra_permissions: extra, denied_permissions: denied });

// ── القائمة ──
const item = Nav.NAV_ITEMS.find((i) => i.id === 'admin-whatsapp');
ok(item && [].concat(item.perm).includes(KEY), 'عنصر القائمة محروس بـsend_whatsapp');
ok(!item.roles.includes(ROLES.EMPLOYEE), 'دور «موظف» ليس ضمن roles العنصر');
ok(!ids(mk(ROLES.EMPLOYEE)).includes('admin-whatsapp'), 'موظف بلا الصلاحية: لا يرى «محادثات واتساب»');
ok(!ids(mk(ROLES.EMPLOYEE, ['manage_campaigns', 'view_creator_intelligence'])).includes('admin-whatsapp'), 'موظف بصلاحيات أخرى (حملات/صناع محتوى): لا يرى واتساب');
ok(ids(mk(ROLES.EMPLOYEE, [KEY])).includes('admin-whatsapp'), 'موظف ممنوح send_whatsapp: يرى العنصر');
ok(!ids(mk(ROLES.EMPLOYEE, [KEY], [KEY])).includes('admin-whatsapp'), 'denied_permissions يسحب الوصول');
for (const role of [ROLES.ADMIN, ROLES.MANAGER, ROLES.SALES_MANAGER]) ok(ids(mk(role)).includes('admin-whatsapp'), `الدور ${role} يبقى يراه`);

// ── المسار ──
const src = fs.readFileSync('src/routes/AppRoutes.jsx', 'utf8').split(String.fromCharCode(13)).join('');
const at = src.indexOf('path={ROUTES.ADMIN_WHATSAPP}');
const seg = src.slice(at, src.indexOf('/>', at));
ok(at > 0 && seg.includes('ProtectedRoute'), 'المسار محروس بـProtectedRoute');
ok(/perm=\{P\.SEND_WHATSAPP\}/.test(seg), 'المسار محروس بـsend_whatsapp');
ok(!seg.includes('ROLES.EMPLOYEE'), 'المسار لا يسمح لدور «موظف» بالدور');
const rolesExpr = (seg.match(/roles=\{([^}]*)\}/) || [])[1] || '';
const salesRoles = (src.match(/const SALES_ROLES\s*=\s*\[([^\]]*)\]/) || [])[1] || '';
const routeRoles = (rolesExpr.trim() === 'SALES_ROLES' ? salesRoles : rolesExpr).match(/ROLES\.(\w+)/g)?.map((x) => ROLES[x.split('.')[1]]) || [];
ok(routeRoles.length > 0 && !routeRoles.includes(ROLES.EMPLOYEE), 'أدوار المسار مستخرجة وليس فيها «موظف»');
for (const role of [ROLES.ADMIN, ROLES.MANAGER, ROLES.SALES_MANAGER]) ok(routeRoles.includes(role), `المسار يقبل الدور ${role}`);
const canOpen = (s) => routeRoles.includes(s.role) || Perm.resolvePermissions(s).has(KEY);
ok(!canOpen(mk(ROLES.EMPLOYEE)), 'المسار: موظف بلا الصلاحية يُرَدّ');
ok(canOpen(mk(ROLES.EMPLOYEE, [KEY])), 'المسار: موظف معه send_whatsapp يفتحه');
ok(!canOpen(mk(ROLES.EMPLOYEE, [KEY], [KEY])), 'المسار: denied يمنع');
ok(canOpen(mk(ROLES.SALES_MANAGER)), 'المسار: مدير المبيعات يفتحه');

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
