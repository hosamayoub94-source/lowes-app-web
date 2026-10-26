/* eslint-env node */
// صلاحية use_prompt_studio: مستقلة، تفتح استوديو البرومبت (المسار + عنصر القائمة) فقط،
// ولا تكشف social-hub/studio/calendar ولا الحملات. تُمنح لكل مستخدم من شاشة المستخدمين.
// Run: node test-prompt-studio-permission.mjs
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('FAIL:', m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m}: got ${JSON.stringify(a)} want ${JSON.stringify(b)}`);

const root = process.cwd();
const out = path.join(root, '.tmp-prompt-studio-perm.mjs');
await build({
  stdin: { contents: `export * as Perm from './src/data/permissions.js'; export * as Nav from './src/data/navigation.js'; export { ROLES } from './src/data/teams.js';`, resolveDir: root, loader: 'js' },
  bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent',
});
let mod;
try { mod = await import(pathToFileURL(out).href); } finally { fs.unlinkSync(out); }
const { Perm, Nav, ROLES } = mod;
const KEY = 'use_prompt_studio';

// ── 1) الصلاحية معرَّفة ومسمّاة وقابلة للمنح من شاشة المستخدمين ──
eq(Perm.PERMISSIONS.USE_PROMPT_STUDIO, KEY, 'PERMISSIONS.USE_PROMPT_STUDIO');
ok(Perm.PERMISSION_LABELS[KEY], 'لها تسمية');
ok(Perm.PERMISSION_DESCRIPTIONS[KEY], 'لها وصف');
const grp = Perm.PERMISSION_GROUPS.filter((g) => g.permissions.includes(KEY));
eq(grp.length, 1, 'تظهر في مجموعة واحدة بالضبط في PermissionsEditor');
eq(grp[0].permissions, [KEY], 'المجموعة لا تضم صلاحيات أخرى (لا تُمنح مع غيرها تلقائياً)');
ok(!Perm.PERMISSION_GROUPS.some((g) => g.key === 'campaigns' && g.permissions.includes(KEY)), 'ليست ضمن مجموعة الحملات');

// ── 2) ليست افتراضية لأي دور: تُمنح لمستخدم محدد فقط ──
for (const [role, list] of Object.entries(Perm.ROLE_PERMISSIONS)) {
  if (role === ROLES.ADMIN) continue; // الأدمن يملك كل الصلاحيات بالتعريف
  ok(!list.includes(KEY), `الدور ${role} لا يملكها افتراضياً`);
}

// ── 3) عنصر القائمة ──
const ids = (session) => Nav.navItemsForRole(session.role, Perm.resolvePermissions(session), session.team).map((i) => i.id);
const joelleBase = { role: ROLES.EMPLOYEE, team: 'ميديا', extra_permissions: ['view_creator_intelligence', 'manage_creator_data', 'manage_creator_campaigns'], denied_permissions: [] };
const joelle = { ...joelleBase, extra_permissions: [...joelleBase.extra_permissions, KEY] };

ok(!ids(joelleBase).includes('prompt-studio'), 'موظف بلا الصلاحية: لا يرى «استوديو البرومبت»');
ok(ids(joelle).includes('prompt-studio'), 'موظف معه use_prompt_studio: يرى «استوديو البرومبت»');
const added = ids(joelle).filter((id) => !ids(joelleBase).includes(id));
eq(added, ['prompt-studio'], 'الصلاحية تكشف عنصراً واحداً فقط (لا social-hub/studio/calendar ولا الحملات)');
for (const id of ['social-hub', 'social-studio', 'social-calendar', 'campaigns']) ok(ids(joelle).includes(id) === ids(joelleBase).includes(id), `use_prompt_studio لا تغيّر ظهور ${id}`);
for (const id of ['social-hub', 'social-studio', 'social-calendar']) ok(!ids(joelle).includes(id), `موظف معه use_prompt_studio لا يرى ${id}`);
const pItem = Nav.NAV_ITEMS.find((i) => i.id === 'prompt-studio');
eq(pItem.label, 'استوديو البرومبت', 'تسمية العنصر');
ok([].concat(pItem.perm).includes(KEY), 'العنصر محروس بـuse_prompt_studio');
// عناصر السوشال الأخرى ما زالت على manage_campaigns فقط
for (const id of ['social-hub', 'social-studio', 'social-calendar']) {
  const it = Nav.NAV_ITEMS.find((i) => i.id === id);
  ok(it && [].concat(it.perm).includes('manage_campaigns') && ![].concat(it.perm).includes(KEY), `${id} لم يتغير (manage_campaigns فقط)`);
}
// denied_permissions تتغلب
ok(!ids({ ...joelle, denied_permissions: [KEY] }).includes('prompt-studio'), 'denied_permissions يسحب الوصول');

// ── 4) عدم كسر من يملك manage_campaigns اليوم (نورما/شام) ──
const sham = { role: ROLES.EMPLOYEE, team: 'ميديا', extra_permissions: ['view_campaign_cost', 'manage_campaigns'], denied_permissions: [] };
ok(ids(sham).includes('prompt-studio'), 'من يملك manage_campaigns يبقى يرى العنصر (لا كسر صامت)');

// ── 5) الأدوار الافتراضية ما زالت ترى العنصر ──
for (const role of [ROLES.ADMIN, ROLES.MANAGER, ROLES.SOCIAL_MANAGER, ROLES.MEDIA_BUYER, ROLES.MARKETING_MANAGER]) {
  ok(ids({ role, team: 'ميديا', extra_permissions: [], denied_permissions: [] }).includes('prompt-studio'), `الدور ${role} يرى العنصر`);
}
// (sales_manager يملك manage_campaigns افتراضياً — وصوله قائم من قبل ولا يتغير هنا)
for (const role of [ROLES.EMPLOYEE, ROLES.ACCOUNTANT, ROLES.HR_MANAGER, ROLES.WAREHOUSE_MANAGER]) {
  ok(!ids({ role, team: 'ميديا', extra_permissions: [], denied_permissions: [] }).includes('prompt-studio'), `الدور ${role} بلا صلاحية لا يرى العنصر`);
}

// ── 6) المسار /prompt-studio: نفس شرط القائمة بالضبط ──
const routes = fs.readFileSync('src/routes/AppRoutes.jsx', 'utf8');
const m = routes.match(/path=\{ROUTES\.PROMPT_STUDIO\}[\s\S]*?<ProtectedRoute\s+roles=\{\[([^\]]*)\]\}\s+perm=\{(\[[^\]]*\]|[^}]*)\}/);
ok(!!m, 'مسار PROMPT_STUDIO موجود ومحروس بـProtectedRoute roles+perm');
const routeRoles = (m?.[1] || '').match(/ROLES\.(\w+)/g)?.map((x) => ROLES[x.split('.')[1]]) || [];
const routePerms = (m?.[2] || '').match(/P\.(\w+)/g)?.map((x) => Perm.PERMISSIONS[x.split('.')[1]]) || [];
ok(routePerms.includes(KEY), 'المسار محروس بـuse_prompt_studio');
eq([...routeRoles].sort(), [...pItem.roles].sort(), 'أدوار المسار = أدوار القائمة');
eq([...routePerms].sort(), [].concat(pItem.perm).sort(), 'صلاحيات المسار = صلاحيات القائمة (لا عنصر ظاهر يعطي 404)');
// نفس منطق ProtectedRoute: الدور أو أيٌّ من الصلاحيات
const canOpen = (s) => { const held = Perm.resolvePermissions(s); return routeRoles.includes(s.role) || routePerms.some((p) => held.has(p)); };
ok(canOpen(joelle), 'المسار: موظف معه use_prompt_studio يفتحه');
ok(!canOpen(joelleBase), 'المسار: موظف بلا الصلاحية يُرَدّ');
ok(!canOpen({ ...joelle, denied_permissions: [KEY] }), 'المسار: denied يمنع');
ok(canOpen(sham), 'المسار: من يملك manage_campaigns يبقى يفتحه');
// الصلاحية لا تفتح مسارات السوشال/الحملات
for (const r of ['SOCIAL_HUB', 'SOCIAL_STUDIO', 'SOCIAL_CALENDAR', 'CAMPAIGNS']) {
  const norm = routes.split(String.fromCharCode(13)).join('');
  const at = norm.indexOf(`path={ROUTES.${r}}`);
  const seg = norm.slice(at, norm.indexOf('/>', at));
  ok(at > 0 && seg.includes('ProtectedRoute') && !seg.includes('USE_PROMPT_STUDIO'), `مسار ${r} لا يقبل use_prompt_studio`);
}
const guard = fs.readFileSync('src/routes/ProtectedRoute.jsx', 'utf8');
ok(/Array\.isArray\(perm\)/.test(guard), 'ProtectedRoute يقبل perm كقائمة');

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
