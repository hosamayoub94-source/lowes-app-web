// Run from a scratch dir with node_modules containing @electric-sql/pglite@0.2.17 (NOT the project); set SEC_DOCS=<path to this folder>/
// Test of 20261024_audit_log_lockdown.sql (+ rollback) on an in-memory Postgres (pglite).
// Reproduces production's audit_log exactly as found read-only on 24 Oct 2026: columns, RLS enabled,
// policy allow_all_anon_aul (FOR ALL TO public USING true WITH CHECK true), full grants to anon/authenticated/service_role.
// Never connects to Supabase.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const DIR = process.env.SEC_DOCS;
const read = (f) => readFileSync(DIR + f, 'utf8').replace(/\r\n/g, '\n');
const db = new PGlite();
let pass = 0, fail = 0; const out = [];
process.on('uncaughtException', (e) => { console.log(out.slice(-6).join(String.fromCharCode(10))); const st=(e.stack||'').split(String.fromCharCode(10)).filter(l=>l.includes('run4.mjs')).slice(0,2).join(' | '); console.log('ABORT', e.message, st); process.exit(1); });
const rec = (ok, name, extra = '') => { ok ? pass++ : fail++; out.push(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + String(extra).slice(0, 120) : ''}`); };
const rb = async () => { try { await db.exec('rollback'); } catch { /* none */ } };
const exec = async (sql) => { try { return await db.exec(sql); } catch (e) { await rb(); throw e; } };
const q = async (sql) => { try { return (await db.query(sql)).rows; } catch (e) { await rb(); throw e; } };
const U = { EMP: '00000000-0000-0000-0000-00000000e001', HR: '00000000-0000-0000-0000-00000000e004', ADM: '00000000-0000-0000-0000-00000000e006' };
const WHO = { ANON: ['anon', null], EMPLOYEE: ['authenticated', U.EMP], HR_PAYROLL: ['authenticated', U.HR], ADMIN: ['authenticated', U.ADM], SERVICE_ROLE: ['service_role', null], OWNER_POSTGRES: ['postgres', null] };
const as = async (w) => { const [r, uid] = WHO[w]; await exec(`reset role; select set_config('request.jwt.claim.sub','${uid ?? ''}',false); ${r === 'postgres' ? '' : `set role ${r};`}`); };
const classify = (e) => { const m = e.message; if (/permission denied/.test(m)) return 'denied(privilege)'; if (/row-level security/.test(m)) return 'denied(RLS)'; if (/للإضافة فقط/.test(m)) return 'blocked(append-only trigger)'; if (/تسجيل التدقيق يتطلب/.test(m)) return 'rejected(not logged in)'; return 'error: ' + m.slice(0, 70); };
// run a statement; return result label
const attempt = async (sql) => { try { const r = await db.query(sql); return r.affectedRows > 0 ? `ALLOWED(${r.affectedRows} rows)` : (r.rows.length ? `ALLOWED(${r.rows.length} rows returned)` : '0 rows (RLS filter)'); } catch (e) { await rb(); return classify(e); } };
const md5 = (s) => createHash('md5').update(s, 'utf8').digest('hex');
const HASH = `select count(*)::int n, md5(string_agg(to_jsonb(a)::text, '|' order by a.id::text)) h from public.audit_log a`;
const ORIG = `select count(*)::int n, md5(string_agg(to_jsonb(a)::text, '|' order by a.id::text)) h from public.audit_log a where a.id::text like '99999999-%'`;

// ── production-like schema ──
await exec(`
grant temporary on database template1 to public;
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth; grant usage on schema auth to anon, authenticated, service_role;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
create table public.profiles (id uuid primary key, role_type text, is_active boolean default true);
create table public.payroll_access (profile_id uuid primary key, can_finalize boolean not null default false);
-- verbatim from production
create function public.is_admin_user() returns boolean language sql stable security definer set search_path to 'public' as $$
  SELECT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND COALESCE(p.is_active, true) AND p.role_type = 'admin'); $$;
create function public.payroll_has_access() returns boolean language sql stable security definer set search_path to 'public','pg_temp' as $$
  SELECT EXISTS (SELECT 1 FROM public.payroll_access pa JOIN public.profiles p ON p.id = pa.profile_id WHERE pa.profile_id = auth.uid() AND p.is_active = true); $$;
grant execute on function public.is_admin_user(), public.payroll_has_access() to anon, authenticated, service_role;
insert into profiles values ('${U.EMP}','employee',true), ('${U.HR}','hr_manager',true), ('${U.ADM}','admin',true);
insert into payroll_access values ('${U.HR}', false);

create table public.audit_log (id uuid primary key default gen_random_uuid(), actor text, action text, table_name text, record_id text,
  before_data jsonb, after_data jsonb, ip_address text, user_agent text, created_at timestamptz default now());
alter table public.audit_log enable row level security;
create policy allow_all_anon_aul on public.audit_log for all to public using (true) with check (true);
grant all on public.audit_log to anon, authenticated, service_role;
insert into public.audit_log (id, actor, action, table_name, record_id, before_data, after_data, created_at)
select ('99999999-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid, 'u' || g, case when g % 2 = 0 then 'update' else 'insert' end, 'requests', 'r' || g,
       case when g % 2 = 0 then jsonb_build_object('status','pending') end, jsonb_build_object('status','approved','n', g), '2026-05-01'::timestamptz + (g || ' hours')::interval
from generate_series(1, 22) g;
`);
const aclOf = async () => (await q(`select (select string_agg(x::text, ',' order by x::text) from unnest(relacl) x) a from pg_class where oid='public.audit_log'::regclass`))[0].a;
const polsOf = async () => JSON.stringify(await q(`select policyname, cmd, roles::text, qual, with_check from pg_policies where tablename='audit_log' order by 1`));
const state = async () => JSON.stringify({ acl: await aclOf(), pol: await polsOf(), trg: await q(`select tgname from pg_trigger where tgrelid='public.audit_log'::regclass and not tgisinternal order by 1`),
  fn: await q(`select proname, md5(pg_get_functiondef(oid)) m from pg_proc where proname in ('log_audit_event','audit_row_change','audit_log_append_only') order by 1`) });

const base = (await q(HASH))[0]; const baseOrig = (await q(ORIG))[0];
rec(base.n === 22, 'fixture: 22 rows like production', base.n);
const aclBefore = await aclOf(); const polBefore = await polsOf(); const stateBefore = await state();

// ── BEFORE: prove the vulnerability, each inside a transaction that is rolled back ──
const vuln = {};
for (const [k, sql] of Object.entries({
  'anon SELECT': `select * from public.audit_log`,
  'anon INSERT (forge)': `insert into public.audit_log (actor, action, table_name) values ('forged','delete','payroll_entries')`,
  'anon UPDATE': `update public.audit_log set actor = 'tampered'`,
  'anon DELETE': `delete from public.audit_log`,
  'authenticated(employee) DELETE': `delete from public.audit_log`,
})) {
  await as(k.startsWith('anon') ? 'ANON' : 'EMPLOYEE');
  await exec('begin');
  vuln[k] = await attempt(sql);
  await exec('rollback');
}
await as('OWNER_POSTGRES');
rec(Object.values(vuln).every((v) => /ALLOWED/.test(v)), 'BEFORE: anon/authenticated can read, forge, modify and delete (vulnerability reproduced)', JSON.stringify(vuln));
const afterVuln = (await q(HASH))[0];
rec(afterVuln.n === base.n && afterVuln.h === base.h, 'BEFORE tests rolled back: table identical to start');

// ── APPLY (twice: idempotent) ──
const SQL = read('20261024_audit_log_lockdown.sql');
await as('OWNER_POSTGRES');
await exec(SQL); rec(true, 'migration applies (1st)');
const s1 = await state();
await exec(SQL); rec(true, 'migration applies again (idempotent, 2nd)');
rec((await state()) === s1, 'state identical after 2nd application');
rec((await q(HASH))[0].h === base.h, 'migration did not touch any row (count+hash identical)');

// ── matrix ──
const OPS = {
  'SELECT': `select * from public.audit_log`,
  'INSERT (forge actor)': `insert into public.audit_log (actor, action, table_name) values ('forged','delete','payroll_entries')`,
  'UPDATE': `update public.audit_log set actor = 'tampered'`,
  'DELETE': `delete from public.audit_log`,
  'TRUNCATE': `truncate public.audit_log`,
  'RPC log_audit_event': `select public.log_audit_event('probe','x','1', null, '{"actor":"admin"}'::jsonb)`,
};
const matrix = {};
for (const w of Object.keys(WHO)) {
  matrix[w] = {};
  for (const [op, sql] of Object.entries(OPS)) {
    await as(w);
    await exec('begin');
    matrix[w][op] = await attempt(sql);
    await exec('rollback');
  }
}
await as('OWNER_POSTGRES');
const m = matrix;
for (const op of Object.keys(OPS)) rec(/denied|rejected/.test(m.ANON[op]), `ANON cannot ${op}`, m.ANON[op]);
rec(m.EMPLOYEE.SELECT === '0 rows (RLS filter)', 'EMPLOYEE (authenticated, not admin) reads 0 rows', m.EMPLOYEE.SELECT);
rec(m.HR_PAYROLL.SELECT === 'ALLOWED(22 rows returned)', 'HR with payroll_access can read the audit trail', m.HR_PAYROLL.SELECT);
rec(m.ADMIN.SELECT === 'ALLOWED(22 rows returned)', 'ADMIN can read the audit trail', m.ADMIN.SELECT);
for (const w of ['EMPLOYEE', 'HR_PAYROLL', 'ADMIN']) for (const op of ['INSERT (forge actor)', 'UPDATE', 'DELETE', 'TRUNCATE']) rec(/denied/.test(m[w][op]), `${w} cannot ${op} directly`, m[w][op]);
for (const op of ['UPDATE', 'DELETE', 'TRUNCATE']) { rec(/append-only/.test(m.OWNER_POSTGRES[op]), `OWNER/superuser path: ${op} blocked by append-only trigger`, m.OWNER_POSTGRES[op]); rec(/append-only/.test(m.SERVICE_ROLE[op]), `SERVICE_ROLE: ${op} blocked by append-only trigger`, m.SERVICE_ROLE[op]); }
rec(/ALLOWED/.test(m.SERVICE_ROLE['INSERT (forge actor)']), 'SERVICE_ROLE (server key) can still INSERT', m.SERVICE_ROLE['INSERT (forge actor)']);
rec((await q(HASH))[0].h === base.h, 'after the whole matrix (all in rolled-back transactions) table is identical (count+hash)');

// ── RPC: actor is always auth.uid(); ip/UA from request headers; cannot be passed ──
await as('ADMIN');
await exec(`select set_config('request.headers', '{"x-forwarded-for":"203.0.113.9, 10.0.0.1","user-agent":"Probe/1.0"}', false)`);
const id1 = (await q(`select public.log_audit_event('probe','requests','r7', '{"a":1}'::jsonb, '{"actor":"someone-else","a":2}'::jsonb) id`))[0].id;
await as('OWNER_POSTGRES');
const row1 = (await q(`select actor, action, table_name, record_id, before_data, after_data, ip_address, user_agent from audit_log where id='${id1}'`))[0];
rec(row1.actor === U.ADM, 'RPC stores actor = auth.uid() (there is no actor parameter to forge)', row1.actor);
rec(row1.action === 'app:probe', 'RPC marks client-asserted events with the app: prefix', row1.action);
rec(row1.ip_address === '203.0.113.9' && row1.user_agent === 'Probe/1.0', 'ip/user-agent come from request headers, not parameters', `${row1.ip_address} | ${row1.user_agent}`);
rec(row1.before_data.a === 1 && row1.after_data.a === 2, 'before/after saved');
await as('EMPLOYEE');
rec((await q(`select count(*)::int n from audit_log`))[0].n === 0, 'the new row is invisible to a non-admin employee');
// search_path shadowing attempt
await exec(`create temp table audit_log (id uuid, actor text, action text, table_name text, record_id text, before_data jsonb, after_data jsonb, ip_address text, user_agent text, created_at timestamptz)`);
await exec(`select public.log_audit_event('shadow','x')`);
const tmp = (await q(`select count(*)::int n from pg_temp.audit_log`))[0].n;
await exec(`drop table pg_temp.audit_log`);
await as('OWNER_POSTGRES');
rec(tmp === 0 && (await q(`select count(*)::int n from public.audit_log where action='app:shadow'`))[0].n === 1, 'search_path hijack with a temp table named audit_log fails (row went to public.audit_log)');
await as('EMPLOYEE');
await exec(`select public.log_audit_event('', 'x')`).then(() => rec(false, 'empty action rejected'), () => rec(true, 'empty action rejected'));
await exec("reset role; select set_config('request.headers','',false);");

// ── trigger helper on a demo table: before/after from OLD/NEW, user has NO right on audit_log ──
await as('OWNER_POSTGRES');
await exec(`create table public.t_demo (id uuid primary key default gen_random_uuid(), v int); grant select, insert, update, delete on public.t_demo to authenticated;
  create trigger t_demo_audit after insert or update or delete on public.t_demo for each row execute function public.audit_row_change();`);
await as('EMPLOYEE');
await exec(`insert into public.t_demo (id, v) values ('88888888-0000-0000-0000-000000000001', 1); update public.t_demo set v = 2; delete from public.t_demo;`);
await as('OWNER_POSTGRES');
const aud = await q(`select action, actor, before_data->>'v' b, after_data->>'v' a from audit_log where table_name='t_demo' order by created_at, action`);
rec(aud.length === 3 && aud.every((r) => r.actor === U.EMP), 'row trigger audits insert/update/delete with actor = auth.uid()', JSON.stringify(aud.map((r) => r.action)));
rec(aud.some((r) => r.action === 'update' && r.b === '1' && r.a === '2'), 'trigger captured before=1 / after=2 from OLD/NEW');
await as('EMPLOYEE');
rec(/denied/.test(await attempt(`select public.audit_row_change()`)), 'user cannot call the trigger function directly');
rec(/denied|must be owner/.test(await attempt(`alter table public.t_demo disable trigger t_demo_audit`)) || /error/.test(await attempt(`alter table public.t_demo disable trigger t_demo_audit`)), 'user cannot disable the audit trigger');
await as('OWNER_POSTGRES');

// ── old rows ──
const nowOrig = (await q(ORIG))[0];
rec(nowOrig.n === 22 && nowOrig.h === baseOrig.h, 'the original 22 audit rows are byte-identical (count + md5 of every column)', nowOrig.h);

// ── AFTER state dump ──
const polAfter = await q(`select policyname, cmd, roles::text, qual, with_check from pg_policies where tablename='audit_log' order by 1`);
const grantsAfter = await q(`select grantee, string_agg(privilege_type, ',' order by privilege_type) p from information_schema.role_table_grants where table_name='audit_log' and table_schema='public' and grantee in ('anon','authenticated','service_role','PUBLIC') group by 1 order by 1`);
const fnAcl = await q(`select proname, proacl::text, prosecdef, proconfig::text from pg_proc where proname in ('log_audit_event','audit_row_change','audit_log_append_only') order by 1`);

// ── ROLLBACK ──
await exec(`drop trigger t_demo_audit on public.t_demo`);
await exec(read('20261024_audit_log_lockdown_rollback.sql')); rec(true, 'rollback applies');
rec((await aclOf()) === aclBefore, 'rollback restores the exact original ACL', await aclOf());
rec((await polsOf()) === polBefore, 'rollback restores the exact original policy');
const left = (await q(`select (select count(*)::int from pg_trigger where tgrelid='public.audit_log'::regclass and not tgisinternal) t, (select count(*)::int from pg_proc where proname in ('log_audit_event','audit_row_change','audit_log_append_only')) f`))[0];
rec(left.t === 0 && left.f === 0, 'rollback removed the triggers and functions', JSON.stringify(left));
await as('ANON');
rec(/ALLOWED/.test(await attempt(`select * from public.audit_log`)), 'after rollback the old (insecure) behaviour is back — as documented');
await as('OWNER_POSTGRES');
rec((await q(ORIG))[0].h === baseOrig.h, 'rollback left the 22 original rows untouched');
await exec(SQL); rec(true, 're-apply after rollback works');
rec((await state()).includes('audit_log_no_update_delete'), 'locked again after re-apply');

console.log('=== MATRIX (each attempt ran inside a transaction that was rolled back) ===');
for (const [w, ops] of Object.entries(matrix)) { console.log(`\n[${w}]`); for (const [op, r] of Object.entries(ops)) console.log(`   ${op.padEnd(24)} ${r}`); }
console.log('\n=== BEFORE (vulnerability) ===\n' + Object.entries(vuln).map(([k, v]) => `   ${k.padEnd(34)} ${v}`).join('\n'));
console.log('\n=== AFTER: pg_policies for audit_log ===\n' + JSON.stringify(polAfter, null, 1));
console.log('\n=== AFTER: table grants ===\n' + grantsAfter.map((g) => `   ${g.grantee}: ${g.p}`).join('\n'));
console.log('\n=== AFTER: function ACL / security / search_path ===\n' + fnAcl.map((f) => `   ${f.proname}: acl=${f.proacl} secdef=${f.prosecdef} config=${f.proconfig}`).join('\n'));
console.log('\n=== CHECKS ===\n' + out.join('\n'));
console.log(`\nSUMMARY: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
