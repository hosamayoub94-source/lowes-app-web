/* global process */
// D-175: runs the REAL docs/security/proposed/20261030_d175_close_write_holes.sql (+ rollback) on PGlite against a schema that
// mimics production as read on 2026-10-30 (policies and table privileges of the 4 tables copied from pg_policies / role_table_grants).
// Proves: the holes exist BEFORE; after the migration anon/employees cannot write commission rules, FX rates or order history;
// legitimate writers still work (manager edits rules, admin inserts rates, any staff inserts history, cascade delete of an order,
// service_role); reads unchanged; rollback restores policies and privileges exactly; migration is idempotent.
// run: node test-d175-write-holes-sql.mjs
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

let pass = 0; let fail = 0;
const ok = (c, m) => { if (c) pass += 1; else { fail += 1; console.error('FAIL', m); } };
const read = (f) => readFileSync(`docs/security/proposed/${f}`, 'utf8');
const migration = read('20261030_d175_close_write_holes.sql');
const rollback = read('20261030_d175_close_write_holes_rollback.sql');
const verify = read('20261030_d175_verify_readonly.sql');

const U = { admin: '00000000-0000-0000-0000-00000000a001', manager: '00000000-0000-0000-0000-00000000a002', sales: '00000000-0000-0000-0000-00000000a003',
  emp: '00000000-0000-0000-0000-00000000a004', inactive: '00000000-0000-0000-0000-00000000a005' };

const db = new PGlite();
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  grant usage on schema public to anon, authenticated, service_role;
  create schema auth;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('app.uid', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated, service_role;
  create table profiles (id uuid primary key, role_type text, is_active boolean default true);
  insert into profiles values ('${U.admin}','admin',true),('${U.manager}','manager',true),('${U.sales}','sales_manager',true),('${U.emp}','employee',true),('${U.inactive}','employee',false);
  create function public.current_role_type() returns text language sql stable security definer as $$ select role_type from public.profiles where id = auth.uid() $$;
  create function public.auth_is_active_staff() returns boolean language sql stable security definer as $$ select exists (select 1 from public.profiles p where p.id = auth.uid() and coalesce(p.is_active, true)) $$;
  grant execute on all functions in schema public to public, anon, authenticated, service_role;

  create table orders (id uuid primary key default gen_random_uuid(), status text);
  create table order_status_history (id serial primary key, order_id uuid references orders(id) on delete cascade, from_status text, to_status text, changed_by text, source text, changed_at timestamptz default now());
  create table exchange_rates (id serial primary key, from_cur text, to_cur text, rate numeric, created_at timestamptz default now());
  create table commission_rules (id text primary key, try_per_usd numeric, syp_per_usd numeric, monthly_target_try numeric);
  create table monthly_commission_adjustments (id serial primary key, employee_name text, month text, adjustment_try numeric);
  alter table orders enable row level security; alter table order_status_history enable row level security; alter table exchange_rates enable row level security;
  alter table commission_rules enable row level security; alter table monthly_commission_adjustments enable row level security;

  -- production policies as read on 2026-10-30
  create policy orders_all on orders for all to public using (true) with check (true);
  create policy osh_all on order_status_history for all to public using (true) with check (true);
  create policy exrates_all on exchange_rates for all to public using (true) with check (true);
  create policy exchange_rates_select on exchange_rates for select to public using (true);
  create policy exchange_rates_insert on exchange_rates for insert to public with check (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role_type = 'admin'));
  create policy "admin write commission_rules" on commission_rules for all to public using (true);
  create policy "all read commission_rules" on commission_rules for select to public using (true);
  create policy "admin write adjustments" on monthly_commission_adjustments for all to public using (true);
  create policy "all read adjustments" on monthly_commission_adjustments for select to public using (true);

  -- production privileges as read on 2026-10-30
  grant all on orders to authenticated;
  grant delete, insert, references, select, trigger, truncate, update on order_status_history, exchange_rates, commission_rules, monthly_commission_adjustments to authenticated;
  grant delete, insert, select, update on commission_rules, monthly_commission_adjustments to anon;
  grant all on all tables in schema public to service_role;
  grant usage on all sequences in schema public to anon, authenticated, service_role;
  grant select on profiles to authenticated;

  insert into commission_rules values ('turkey', 47, 130, 65000), ('syria', 47, 130, 0);
  insert into monthly_commission_adjustments (employee_name, month, adjustment_try) values ('X', '2026-10', 5);
  insert into exchange_rates (from_cur, to_cur, rate) values ('USD', 'TRY', 50);
  insert into orders (id, status) values ('00000000-0000-0000-0000-0000000000c1', 'delivered');
  insert into order_status_history (order_id, to_status, source) values ('00000000-0000-0000-0000-0000000000c1', 'delivered', 'app');
`);

// run SQL as a role (+ signed-in user); returns {err, rows}. Always rolled back so tests stay independent.
const as = async (role, uid, sql) => {
  await db.exec('begin');
  try {
    await db.exec(`set local role ${role}`);
    if (uid) await db.exec(`set local app.uid = '${uid}'`);
    const r = await db.query(sql);
    await db.exec('rollback');
    return { err: null, rows: r.rows, n: r.rows.length };
  } catch (e) { await db.exec('rollback'); return { err: String(e.message || e), rows: [], n: 0 }; }
};
const denied = (r) => !!r.err && /permission denied|row-level security/i.test(r.err);
const wrote = (r) => !r.err && r.n > 0;                 // statement used RETURNING: wrote ≥ 1 row
const blocked = (r) => denied(r) || (!r.err && r.n === 0); // either an error or 0 rows touched

const snapshot = async () => {
  const pol = (await db.query(`select tablename, policyname, cmd, roles::text r, coalesce(qual,'-') q, coalesce(with_check,'-') c from pg_policies where schemaname='public' and tablename in ('order_status_history','exchange_rates','commission_rules','monthly_commission_adjustments') order by 1,2`)).rows.map((x) => Object.values(x).join('|'));
  const priv = (await db.query(`select c.relname t, r.rolname g, p.priv, has_table_privilege(r.rolname, c.oid, p.priv) h
      from pg_class c cross join (values ('anon'),('authenticated')) r(rolname) cross join (values ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')) p(priv)
     where c.relnamespace='public'::regnamespace and c.relname in ('order_status_history','exchange_rates','commission_rules','monthly_commission_adjustments') order by 1,2,3`)).rows.map((x) => `${x.t}|${x.g}|${x.priv}|${x.h}`);
  return JSON.stringify({ pol, priv });
};

// ── BEFORE: the holes exist (proves the test is meaningful)
const snap0 = await snapshot();
ok(wrote(await as('anon', null, `update commission_rules set try_per_usd = 1 where id='turkey' returning id`)), 'BEFORE: anon can change commission rates');
ok(wrote(await as('anon', null, `insert into monthly_commission_adjustments (employee_name, month, adjustment_try) values ('Y','2026-10',9999) returning id`)), 'BEFORE: anon can add commission adjustments');
ok(wrote(await as('authenticated', U.emp, `insert into exchange_rates (from_cur,to_cur,rate) values ('USD','TRY',1) returning id`)), 'BEFORE: an ordinary employee can insert a rate');
ok(wrote(await as('authenticated', U.emp, `update exchange_rates set rate = 1 returning id`)), 'BEFORE: an ordinary employee can rewrite rates');
ok(wrote(await as('authenticated', U.emp, `update order_status_history set changed_at = '2020-01-01' returning id`)), 'BEFORE: an ordinary employee can rewrite delivery dates');
ok(wrote(await as('authenticated', U.emp, `delete from order_status_history returning id`)), 'BEFORE: an ordinary employee can delete history');

// ── apply
ok((await db.exec(migration).then(() => null, (e) => String(e.message))) === null, 'migration applies cleanly');
ok((await db.exec(migration).then(() => null, (e) => String(e.message))) === null, 'migration is idempotent (second run is clean)');

// order_status_history
ok(wrote(await as('authenticated', U.emp, `insert into order_status_history (order_id,to_status,source) values ('00000000-0000-0000-0000-0000000000c1','returned','app') returning id`)), 'employee can still INSERT history (app flow)');
ok(wrote(await as('authenticated', U.emp, `select id from order_status_history`)), 'employee can still READ history (timeline)');
ok(denied(await as('authenticated', U.emp, `update order_status_history set changed_at = '2020-01-01' returning id`)), 'employee can no longer UPDATE history');
ok(denied(await as('authenticated', U.emp, `delete from order_status_history returning id`)), 'employee can no longer DELETE history');
ok(denied(await as('authenticated', U.admin, `delete from order_status_history returning id`)), 'even admin cannot rewrite history through the API');
ok(denied(await as('authenticated', U.emp, `truncate order_status_history`)), 'employee cannot TRUNCATE history');
ok(blocked(await as('authenticated', U.inactive, `insert into order_status_history (order_id,to_status,source) values ('00000000-0000-0000-0000-0000000000c1','x','app') returning id`)), 'deactivated staff cannot insert history');
ok(denied(await as('anon', null, `select id from order_status_history`)), 'anon has no access to history');
await db.exec('begin'); await db.exec(`set local role authenticated`); await db.exec(`set local app.uid='${U.manager}'`);
await db.exec(`delete from orders where id='00000000-0000-0000-0000-0000000000c1'`);
const cascaded = (await db.query(`select count(*)::int n from order_status_history where order_id='00000000-0000-0000-0000-0000000000c1'`)).rows[0].n;
await db.exec('rollback');
ok(cascaded === 0, 'ON DELETE CASCADE from orders still removes its history (referential actions are not blocked by the revoked DELETE)');
ok(wrote(await as('service_role', null, `delete from order_status_history returning id`)), 'service_role (edge functions) keeps full access to history');

// exchange_rates
ok(wrote(await as('authenticated', U.admin, `insert into exchange_rates (from_cur,to_cur,rate) values ('USD','TRY',51) returning id`)), 'admin can still insert a rate');
ok(denied(await as('authenticated', U.emp, `insert into exchange_rates (from_cur,to_cur,rate) values ('USD','TRY',1) returning id`)), 'employee can no longer insert a rate');
ok(denied(await as('authenticated', U.manager, `insert into exchange_rates (from_cur,to_cur,rate) values ('USD','TRY',1) returning id`)), 'manager cannot insert a rate (existing admin-only insert policy now effective)');
ok(denied(await as('authenticated', U.admin, `update exchange_rates set rate = 1 returning id`)), 'rates are append-only: even admin cannot UPDATE');
ok(denied(await as('authenticated', U.admin, `delete from exchange_rates returning id`)), 'rates are append-only: even admin cannot DELETE');
ok(denied(await as('authenticated', U.emp, `truncate exchange_rates`)), 'employee cannot TRUNCATE rates');
ok(denied(await as('anon', null, `select id from exchange_rates`)), 'anon has no table grant on exchange_rates (as in production; unchanged by this migration)');
ok(denied(await as('anon', null, `insert into exchange_rates (from_cur,to_cur,rate) values ('USD','TRY',1) returning id`)), 'anon cannot insert rates');
ok(wrote(await as('authenticated', U.emp, `select id from exchange_rates`)), 'staff can still READ rates');

// commission_rules
for (const [who, uid] of [['manager', U.manager], ['sales_manager', U.sales], ['admin', U.admin]]) {
  ok(wrote(await as('authenticated', uid, `update commission_rules set monthly_target_try = 70000 where id='turkey' returning id`)), `${who} can still edit commission rules (editor behaviour preserved)`);
}
ok(wrote(await as('authenticated', U.manager, `insert into commission_rules values ('uae', 47, 130, 0) returning id`)), 'manager can still insert a rules row (the editor upserts)');
ok(blocked(await as('authenticated', U.emp, `update commission_rules set try_per_usd = 1 returning id`)), 'employee cannot edit commission rules');
ok(denied(await as('authenticated', U.emp, `insert into commission_rules values ('uae', 1, 1, 1) returning id`)), 'employee cannot insert commission rules');
ok(denied(await as('anon', null, `update commission_rules set try_per_usd = 1 returning id`)), 'anon cannot edit commission rules');
ok(denied(await as('anon', null, `delete from commission_rules returning id`)), 'anon cannot delete commission rules');
ok(denied(await as('authenticated', U.admin, `delete from commission_rules returning id`)), 'nobody deletes rules through the API');
ok(denied(await as('authenticated', U.emp, `truncate commission_rules`)), 'employee cannot TRUNCATE commission rules');
ok(wrote(await as('anon', null, `select id from commission_rules`)), 'anon READ of commission rules unchanged (payroll/manual sessions; batch B1 later)');
ok(wrote(await as('authenticated', U.emp, `select id from commission_rules`)), 'staff can still READ commission rules');

// monthly_commission_adjustments
ok(wrote(await as('authenticated', U.admin, `insert into monthly_commission_adjustments (employee_name,month,adjustment_try) values ('Z','2026-10',1) returning id`)), 'admin can insert an adjustment');
ok(denied(await as('authenticated', U.manager, `insert into monthly_commission_adjustments (employee_name,month,adjustment_try) values ('Z','2026-10',1) returning id`)), 'manager cannot insert an adjustment');
ok(blocked(await as('authenticated', U.emp, `update monthly_commission_adjustments set adjustment_try = 9999 returning id`)), 'employee cannot change an adjustment');
ok(denied(await as('anon', null, `insert into monthly_commission_adjustments (employee_name,month,adjustment_try) values ('Y','2026-10',9999) returning id`)), 'anon cannot add an adjustment');
ok(denied(await as('anon', null, `update monthly_commission_adjustments set adjustment_try = 0 returning id`)), 'anon cannot change an adjustment');
ok(wrote(await as('authenticated', U.emp, `select id from monthly_commission_adjustments`)), 'staff can still READ adjustments');

// no remaining open write policy / privilege on the 4 tables
const open = (await db.query(`select tablename, policyname from pg_policies where schemaname='public' and tablename in ('order_status_history','exchange_rates','commission_rules','monthly_commission_adjustments') and cmd in ('ALL','INSERT','UPDATE','DELETE') and (qual='true' or with_check='true')`)).rows;
ok(open.length === 0, `no open (true) write policy remains: ${JSON.stringify(open)}`);
const trunc = (await db.query(`select c.relname t from pg_class c where c.relnamespace='public'::regnamespace and c.relname in ('order_status_history','exchange_rates','commission_rules','monthly_commission_adjustments') and (has_table_privilege('authenticated', c.oid, 'TRUNCATE') or has_table_privilege('anon', c.oid, 'TRUNCATE'))`)).rows;
ok(trunc.length === 0, 'TRUNCATE revoked from anon and authenticated on all four');
ok((await db.query(verify)).rows.length > 0, 'the read-only verification query runs and returns rows');

// ── rollback: exact restore + the holes are back
const snap1 = await snapshot();
ok(snap1 !== snap0, 'migration changed the policies/privileges');
ok((await db.exec(rollback).then(() => null, (e) => String(e.message))) === null, 'rollback applies cleanly');
ok((await snapshot()) === snap0, 'rollback restores the original policies and privileges exactly');
ok(wrote(await as('anon', null, `update commission_rules set try_per_usd = 1 where id='turkey' returning id`)), 'after rollback the original behaviour is back (proves rollback is real)');

console.log(`\nD-175 SQL: ${pass}/${pass + fail}`);
process.exit(fail === 0 ? 0 : 1);
