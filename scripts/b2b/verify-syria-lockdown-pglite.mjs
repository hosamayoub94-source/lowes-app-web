/* eslint-env node */
// تحقق محلي (Postgres بالذاكرة PGlite — لا يلمس أي قاعدة حقيقية) من docs/b2b/proposed/20261013_syria_leads_lockdown.sql.
// يبني الجدول من migrations الحقيقية + الدفعة الحقيقية + صف إمارات وهمي، يثبت الحالة «قبل» (anon مفتوح)، ثم يطبّق المقترح ويختبر المصفوفة:
//   بلا جلسة (anon) · جلسة بلا صلاحية · صلاحية محجوبة · صلاحية عرض/تعديل (view_syria_leads) · أدمن · حساب معطّل · service_role — ثم الرجوع.
// usage:  npm i --no-save @electric-sql/pglite  &&  node scripts/b2b/verify-syria-lockdown-pglite.mjs
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';

const read = (f) => fs.readFileSync(f, 'utf8');
let fails = 0;
const ok = (n, c, extra = '') => { console.log(c ? 'ok  ' : 'FAIL', n, extra); if (!c) fails++; };
const db = new PGlite();

// ── بيئة تشبه Supabase: الأدوار + auth.uid() + profiles ──
await db.exec(`
  CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;
  CREATE SCHEMA auth;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  GRANT USAGE ON SCHEMA auth, public TO anon, authenticated;
  CREATE TABLE profiles (id uuid PRIMARY KEY, employee_name text, role_type text, is_active boolean DEFAULT true, extra_permissions jsonb DEFAULT '[]', denied_permissions jsonb DEFAULT '[]');
`);
for (const f of ['20260912_syria_b2b_leads.sql', '20260912020000_syria_leads_manual_entry.sql', '20260925151312_b2b_online_stores.sql', '20261008_b2b_leads_country.sql']) {
  await db.exec(read(`supabase/migrations/${f}`));
}
await db.exec(read('supabase/data/20260925_online_stores_batch1.sql'));
await db.exec(`
  INSERT INTO syria_b2b_leads (id, province, name, category, phone, email, priority, score) VALUES ('SYR-TST-1','Damascus','صيدلية وهمية','صيدلية','0999000001','fake@example.test','B',55);
  INSERT INTO syria_b2b_leads (id, province, name, country, lead_type, category, website, source_urls, last_verified_at, priority, score) VALUES ('UAE-TST-1','Dubai','Fake UAE Row','AE','online','متجر أونلاين — تجميل','https://fake-ae.example','https://example.com/1', now(), 'C', 30);
  GRANT SELECT, INSERT, UPDATE, DELETE ON syria_b2b_leads TO anon, authenticated;
  GRANT SELECT ON profiles TO anon, authenticated;
`);
const U = { admin: '00000000-0000-0000-0000-0000000000a1', noperm: '00000000-0000-0000-0000-0000000000b1', denied: '00000000-0000-0000-0000-0000000000c1',
  perm: '00000000-0000-0000-0000-0000000000d1', inactive: '00000000-0000-0000-0000-0000000000e1', uaeOnly: '00000000-0000-0000-0000-0000000000f1' };
await db.exec(`
  INSERT INTO profiles (id, employee_name, role_type, is_active, extra_permissions, denied_permissions) VALUES
   ('${U.admin}','Admin','admin',true,'[]','[]'),
   ('${U.noperm}','Employee no perm','employee',true,'[]','[]'),
   ('${U.denied}','Granted then denied','employee',true,'["view_syria_leads"]','["view_syria_leads"]'),
   ('${U.perm}','Employee with view_syria_leads','employee',true,'["view_syria_leads"]','[]'),
   ('${U.inactive}','Inactive with perm','employee',false,'["view_syria_leads"]','[]'),
   ('${U.uaeOnly}','UAE only','employee',true,'["view_uae_leads"]','[]');
`);
const SY = (await db.query(`SELECT count(*)::int n FROM syria_b2b_leads WHERE country='SY'`)).rows[0].n;
ok('baseline: real Syria batch + fake rows loaded', SY > 40, `SY=${SY}`);

const as = async (who, fn) => {
  await db.exec(`RESET ROLE; SELECT set_config('request.jwt.claim.sub', '${who === 'anon' ? '' : U[who] || ''}', false); SET ROLE ${who === 'anon' ? 'anon' : 'authenticated'}`);
  try { return await fn(); } finally { await db.exec('RESET ROLE'); }
};
const q = (sql) => db.query(sql).then((r) => r.rows, (e) => ({ error: e.message }));
// a privilege error (anon after REVOKE) counts as "sees nothing"
const counts = () => q(`SELECT count(*) FILTER (WHERE country='SY')::int sy, count(*) FILTER (WHERE country<>'SY')::int other FROM syria_b2b_leads`).then((r) => (r.error ? { sy: 0, other: 0, denied: true } : r[0]));
const writes = async (id) => ({
  upd: (await q(`UPDATE syria_b2b_leads SET notes='probe' WHERE id='${id}' RETURNING id`)),
  ins: (await q(`INSERT INTO syria_b2b_leads (id, province, name) VALUES ('PROBE-${Math.floor(Math.random() * 1e6)}','Homs','probe') RETURNING id`)),
  del: (await q(`DELETE FROM syria_b2b_leads WHERE id='PROBE-NOPE' RETURNING id`)),
});

// ── قبل: يثبت الثغرة الحالية ──
const before = await as('anon', async () => ({ c: await counts(), w: await writes('SYR-TST-1') }));
ok('BEFORE: anon reads every Syria row (the hole)', before.c.sy === SY && before.c.other === 0, JSON.stringify(before.c));
ok('BEFORE: anon can update/insert (the hole)', Array.isArray(before.w.upd) && before.w.upd.length === 1 && Array.isArray(before.w.ins) && before.w.ins.length === 1);
await db.exec(`DELETE FROM syria_b2b_leads WHERE id LIKE 'PROBE-%'; UPDATE syria_b2b_leads SET notes = NULL WHERE id = 'SYR-TST-1'`);
const fp = async () => (await q(`SELECT md5(string_agg(t::text, '|' ORDER BY id)) h, count(*)::int n FROM syria_b2b_leads t`))[0];
const fpBefore = await fp();

// ── تطبيق المقترح ──
const mig = read('docs/b2b/proposed/20261013_syria_leads_lockdown.sql');
await db.exec(mig);
ok('migration applies and is idempotent', !(await db.exec(mig).then(() => null, (e) => e.message)));
ok('no row touched by the migration (fingerprint identical)', JSON.stringify(await fp()) === JSON.stringify(fpBefore));

// ── المصفوفة ──
const none = await as('anon', async () => ({ c: await counts(), w: await writes('SYR-TST-1'), fn: await q(`SELECT public.can_access_syria_leads() AS ok`) }));
ok('ANON (no session): sees zero rows', none.c.sy === 0 && none.c.other === 0, JSON.stringify(none.c));
ok('ANON: cannot update / insert / delete', [none.w.upd, none.w.ins, none.w.del].every((r) => r.error || r.length === 0), JSON.stringify(Object.fromEntries(Object.entries(none.w).map(([k, v]) => [k, v.error ? 'denied' : v.length]))));
ok('ANON: cannot even call the permission helper', !!none.fn.error);

for (const [who, label] of [['noperm', 'session WITHOUT permission'], ['denied', 'permission granted then DENIED'], ['inactive', 'INACTIVE account with permission'], ['uaeOnly', 'UAE-only permission (not Syria)']]) {
  const r = await as(who, async () => ({ c: await counts(), w: await writes('SYR-TST-1') }));
  ok(`${label}: sees zero rows`, r.c.sy === 0 && r.c.other === 0, JSON.stringify(r.c));
  ok(`${label}: cannot update / insert`, (r.w.upd.error || r.w.upd.length === 0) && !!r.w.ins.error);
}

const perm = await as('perm', async () => {
  const c = await counts();
  const upd = await q(`UPDATE syria_b2b_leads SET status='contacted', notes='team edit' WHERE id='SYR-TST-1' RETURNING id`);
  const ins = await q(`INSERT INTO syria_b2b_leads (id, province, name) VALUES ('SYR-PERM-1','Homs','Added by team') RETURNING country`);
  const insAE = await q(`INSERT INTO syria_b2b_leads (id, province, name, country) VALUES ('UAE-PERM-X','Dubai','x','AE') RETURNING id`);
  const moveAE = await q(`UPDATE syria_b2b_leads SET country='AE' WHERE id='SYR-TST-1' RETURNING id`);
  const touchAE = await q(`UPDATE syria_b2b_leads SET notes='hack' WHERE id='UAE-TST-1' RETURNING id`);
  const del = await q(`DELETE FROM syria_b2b_leads WHERE id='SYR-PERM-1' RETURNING id`);
  return { c, upd, ins, insAE, moveAE, touchAE, del };
});
ok('PERMISSION (view_syria_leads): sees all Syria rows, zero UAE rows', perm.c.sy >= SY && perm.c.other === 0, JSON.stringify(perm.c));
ok('PERMISSION: team edit works (status/notes)', Array.isArray(perm.upd) && perm.upd.length === 1);
ok('PERMISSION: can add a Syria lead', Array.isArray(perm.ins) && perm.ins[0]?.country === 'SY');
ok('PERMISSION: cannot insert a UAE row / move a row to UAE / touch a UAE row', !!perm.insAE.error && !!perm.moveAE.error && (perm.touchAE.error || perm.touchAE.length === 0));
ok('PERMISSION: cannot DELETE (admin only)', perm.del.error || perm.del.length === 0);

const adm = await as('admin', async () => ({ c: await counts(), del: await q(`DELETE FROM syria_b2b_leads WHERE id='SYR-PERM-1' RETURNING id`), touchAE: await q(`UPDATE syria_b2b_leads SET notes='x' WHERE id='UAE-TST-1' RETURNING id`) }));
ok('ADMIN: sees Syria rows', adm.c.sy >= SY && adm.c.other === 0, JSON.stringify(adm.c));
ok('ADMIN: can delete a Syria row', Array.isArray(adm.del) && adm.del.length === 1);
ok('ADMIN: still cannot touch UAE rows directly (only through the b2b-leads function)', adm.touchAE.error || adm.touchAE.length === 0);

// service_role / owner (دالة b2b-leads والمهام الخارجية) يتجاوز RLS: هنا المستخدم الأساسي superuser بلا SET ROLE
const svc = await counts();
ok('SERVICE/owner path unaffected (sees all rows incl. UAE)', svc.sy >= SY && svc.other === 1, JSON.stringify(svc));
ok('anon has no table privilege left (defence in depth)', (await q(`SELECT has_table_privilege('anon','public.syria_b2b_leads','SELECT') s, has_table_privilege('anon','public.syria_b2b_leads','UPDATE') u, has_table_privilege('anon','public.syria_b2b_leads','DELETE') d`))[0] && Object.values((await q(`SELECT has_table_privilege('anon','public.syria_b2b_leads','SELECT') s, has_table_privilege('anon','public.syria_b2b_leads','UPDATE') u, has_table_privilege('anon','public.syria_b2b_leads','DELETE') d`))[0]).every((v) => v === false));

// ── الرجوع ──
await db.exec(read('docs/b2b/proposed/20261013_syria_leads_lockdown_rollback.sql'));
const back = await as('anon', async () => counts());
ok('ROLLBACK restores the previous (open) behaviour exactly', back.sy >= SY && back.other === 0);
await db.exec(mig);
ok('re-apply after rollback works', (await as('anon', async () => counts())).sy === 0);

console.log(fails ? `\n${fails} FAILED` : '\nall checks passed');
process.exit(fails ? 1 : 0);
