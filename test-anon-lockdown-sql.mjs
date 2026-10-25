/* global process */
// Runs the REAL docs/security/proposed/20261027_anon_lockdown_*.sql on PGlite, against a schema that mimics production's
// grants (anon + authenticated can do everything; profiles.pin/password/... only partially granted at column level).
// Proves: anon loses everything except the pre-login allowlist, authenticated is untouched, restore is exact, no table is forgotten.
// run: node test-anon-lockdown-sql.mjs
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

let pass = 0; let fail = 0;
const ok = (c, m) => { if (c) pass += 1; else { fail += 1; console.error('FAIL', m); } };
const read = (f) => readFileSync(`docs/security/proposed/${f}`, 'utf8');
const toolkit = read('20261027_anon_lockdown_toolkit.sql');
const files = { b0: read('20261027_anon_lockdown_b0_special.sql'), b1: read('20261027_anon_lockdown_b1.sql'), b2: read('20261027_anon_lockdown_b2.sql'),
  b3: read('20261027_anon_lockdown_b3.sql'), b4: read('20261027_anon_lockdown_b4.sql') };

// every table named in a batch file
const batchTables = (sql) => [...sql.matchAll(/array\[([^\]]*)\]/g)].flatMap((m) => [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]));
const all = Object.fromEntries(Object.entries(files).map(([k, v]) => [k, batchTables(v)]));
const allTables = [...new Set(Object.values(all).flat())];
const plain = allTables.filter((t) => !['profiles', 'orders', 'activity_logs', 'mlm_join_requests', 'customer_stats'].includes(t));

const db = new PGlite();
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin;
  grant usage on schema public to anon, authenticated, service_role;
  create table profiles (id uuid primary key default gen_random_uuid(), employee_name text, role_type text, team text, manager_scope text, avatar_url text,
    is_active boolean, order_role text, order_market text, extra_permissions jsonb, denied_permissions jsonb,
    base_salary_usd numeric, phone text, pin text, password text, face_descriptor jsonb, wallet_balance numeric);
  create table orders (id uuid primary key default gen_random_uuid(), order_id text, status text, market text, archived boolean, deleted_at timestamptz,
    shipping_company text, tracking_number text, customer_name text, updated_at timestamptz, phone_1 text, address text, amount numeric, items jsonb);
  create table activity_logs (id serial primary key, action_type text, user_name text, note text);
  create table mlm_join_requests (id serial primary key, name text, phone text, referred_by text, status text);
  create view customer_stats as select phone_1, count(*) n from orders group by phone_1;
  ${plain.map((t) => `create table "${t}" (id serial primary key, v text);`).join('\n')}
  create function public.get_customer_orders_by_key(p_key text) returns setof orders language sql security definer as $$ select * from orders where phone_1 = p_key $$;
  -- production-like grants: everything for anon + authenticated
  grant all on all tables in schema public to anon, authenticated, service_role;
  grant all on all sequences in schema public to anon, authenticated, service_role;
  grant execute on all functions in schema public to public, anon, authenticated, service_role;
  insert into profiles(employee_name, role_type, base_salary_usd, phone, pin) values ('E', 'employee', 123, '0999', '1234');
  insert into orders(order_id, status, market, customer_name, phone_1, address, amount) values ('LS-1', 'new', 'turkey', 'Cust', '0555', 'addr', 100);
`);

const snapshot = async () => {
  const rows = (await db.query(`select c.relname t,
      has_table_privilege('anon', c.oid, 'SELECT') s, has_table_privilege('anon', c.oid, 'INSERT') i, has_table_privilege('anon', c.oid, 'UPDATE') u, has_table_privilege('anon', c.oid, 'DELETE') d,
      has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE') auth_all
    from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','v') and c.relname <> 'security_grant_backup' order by 1`)).rows;
  return rows;
};
const before = await snapshot();
ok(before.every((r) => r.s && r.i && r.u && r.d), 'precondition: anon can do everything everywhere (production today)');

const as = async (role, sql) => {
  await db.exec('begin');
  try { await db.exec(`set local role ${role}`); await db.exec(sql); await db.exec('rollback'); return null; }
  catch (e) { await db.exec('rollback'); return String(e.message || e); }
};

await db.exec(toolkit);
for (const k of ['b1', 'b2', 'b3', 'b4']) {
  const n = (await db.query(`select public.security_revoke_anon('${k}', array[${all[k].map((x) => `'${x}'`).join(',')}]) n`)).rows[0].n;
  ok(n === all[k].length, `${k}: revoked ${n}/${all[k].length} relations`);
  const probe = all[k].find((x) => x !== 'customer_stats') ?? all[k][0];
  ok(/permission denied/.test(await as('anon', `select * from "${probe}"`) || ''), `${k}: anon cannot read ${probe}`);
  ok(/permission denied/.test(await as('anon', `insert into "${probe}"(v) values ('x')`) || ''), `${k}: anon cannot write ${probe}`);
}
await db.exec(files.b0);

const after = await snapshot();
const byName = Object.fromEntries(after.map((r) => [r.t, r]));
// 1) nothing left open to anon except the allowlist
for (const t of plain) { const r = byName[t]; ok(!r.s && !r.i && !r.u && !r.d, `anon has NO privilege on ${t}`); }
ok(!byName.customer_stats.s, 'anon cannot read customer_stats (order data by phone)');
// 2) authenticated untouched everywhere
ok(after.filter((r) => r.t !== 'customer_stats').every((r) => r.auth_all), 'authenticated keeps full table privileges everywhere (RLS decides)');
// 3) allowlist works
ok(await as('anon', 'select id, employee_name, role_type, team, manager_scope, avatar_url, is_active, order_role, order_market, extra_permissions, denied_permissions from profiles') === null, 'login picker query works');
ok(await as('anon', `insert into activity_logs(action_type, user_name) values ('login_failed','x') returning id`) === null, 'login-event insert (insert().select(id)) works');
ok(await as('anon', `insert into mlm_join_requests(name, phone, status) values ('n','p','pending')`) === null, 'public join form insert works');
ok(await as('anon', `select order_id, status, shipping_company, tracking_number, customer_name, market, updated_at from orders where order_id = 'LS-1'`) === null, 'public tracking page query works');
ok(await as('anon', `select order_id, status from orders where market = 'turkey' and archived is not true and deleted_at is null limit 3000`) === null, 'Apps Script tracker query works');
// 4) everything else for anon is denied
for (const [label, sql] of [
  ['salary column', 'select base_salary_usd from profiles'], ['phone column', 'select phone from profiles'], ['select *', 'select * from profiles'],
  ['pin', 'select pin from profiles'], ['face data', 'select face_descriptor from profiles'], ['wallet', 'select wallet_balance from profiles'],
  ['profile update', `update profiles set team = 'x'`], ['profile insert', `insert into profiles(employee_name) values ('hax')`], ['profile delete', 'delete from profiles'],
  ['order phone', 'select phone_1 from orders'], ['order address', 'select address from orders'], ['order amount', 'select amount from orders'], ['order items', 'select items from orders'],
  ['orders select *', 'select * from orders'], ['order update', `update orders set status = 'x'`], ['order insert', `insert into orders(order_id) values ('x')`], ['order delete', 'delete from orders'],
  ['audit read', 'select action_type from activity_logs'], ['audit update', `update activity_logs set note = 'x'`], ['audit delete', 'delete from activity_logs'],
  ['join requests read', 'select * from mlm_join_requests'], ['join requests update', `update mlm_join_requests set status = 'approved'`],
  ['customer lookup rpc', `select * from get_customer_orders_by_key('0555')`],
]) ok(/permission denied/.test(await as('anon', sql) || ''), `anon denied: ${label}`);
ok(await as('authenticated', `select * from get_customer_orders_by_key('0555')`) === null, 'authenticated still has the customer lookup rpc');
ok(await as('authenticated', 'select base_salary_usd from profiles') === null, 'authenticated unchanged: salary column still readable (phase 2b: RLS)');
ok(await as('service_role', 'select * from orders') === null, 'service_role unchanged');

// 5) exact restore
for (const k of ['b4', 'b3', 'b2', 'b1', 'b0']) await db.exec(`select public.security_restore_anon('${k}')`);
// the allowlist grants of b0 are additive on top of the restore; compare everything the restore must bring back
const restored = await snapshot();
ok(JSON.stringify(restored) === JSON.stringify(before), 'restore brings back exactly the original privilege matrix');
ok(await as('anon', 'select base_salary_usd from profiles') === null, 'after restore anon can read salaries again (the production state we started from)');

// 6) coverage: the live audit (2026-10-25) found 107 tables + customer_stats exposed to anon besides the 4 special ones
ok(allTables.length === 112, `batches cover ${allTables.length} relations (111 listed by the live audit + the customer_stats view)`);



// 7) column-level-only grants (production's profiles table is granted per column) are removed AND restored exactly
await db.exec(`create table colonly (a text, b text, c text); grant select (a), update (b) on colonly to anon; grant select (a, b, c) on colonly to authenticated;`);
ok(await as('anon', 'select a from colonly') === null, 'column-only grant works before');
await db.exec("select public.security_revoke_anon('tc', array['colonly'])");
ok(/permission denied/.test(await as('anon', 'select a from colonly') || ''), 'column-level SELECT revoked');
ok(/permission denied/.test(await as('anon', "update colonly set b = 'x'") || ''), 'column-level UPDATE revoked');
ok(await as('authenticated', 'select a, b, c from colonly') === null, 'authenticated column grants untouched');
await db.exec("select public.security_restore_anon('tc')");
ok(await as('anon', 'select a from colonly') === null && /permission denied/.test(await as('anon', 'select b from colonly') || ''), 'restore re-grants exactly the original columns (a yes, b no)');

// 8) batch u1: unused sensitive tables lose BOTH anon and authenticated; everything else keeps authenticated
const u1Sql = read('20261027_unused_sensitive_tables.sql');
const u1 = [...u1Sql.matchAll(/array\[([^\]]*)\]/g)][0][1].split(',').map((x) => x.replace(/['\s]/g, ''));
ok(u1.length === 17, 'u1 lists 17 tables');
await db.exec(u1.map((x) => `create table if not exists "${x}" (id serial primary key, v text); grant all on "${x}" to anon, authenticated, service_role;`).join(' '));
const before2 = await snapshot();
await db.exec(u1Sql);
for (const x of u1) {
  ok(/permission denied/.test(await as('anon', `select * from "${x}"`) || ''), `u1: anon denied ${x}`);
  ok(/permission denied/.test(await as('authenticated', `select * from "${x}"`) || ''), `u1: authenticated denied ${x}`);
  ok(await as('service_role', `select * from "${x}"`) === null, `u1: service_role still reads ${x}`);
}
ok(await as('authenticated', 'select * from orders') === null, 'u1: other tables untouched for authenticated');
await db.exec("select public.security_restore_role('u1', 'anon'); select public.security_restore_role('u1', 'authenticated');");
ok(JSON.stringify(await snapshot()) === JSON.stringify(before2), 'u1 restore brings back exactly the previous privilege matrix');
ok(await as('authenticated', `select * from "${u1[0]}"`) === null && await as('anon', `select * from "${u1[0]}"`) === null, 'u1: restore gives both roles their access back');

console.log(`
${pass} passed, ${fail} failed`);
await db.close();
process.exit(fail ? 1 : 0);
