/* global process */
// Runs the REAL migrations docs/security/proposed/20261025_*.sql (+ rollbacks) on in-memory PostgreSQL (PGlite)
// with a profiles/auth shape matching production. No network, no production access.
// run: node test-profiles-guard-and-auth-ban-sql.mjs
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

let pass = 0; let fail = 0;
const ok = (c, m) => { if (c) pass += 1; else { fail += 1; console.error('FAIL', m); } };
const read = (f) => readFileSync(`docs/security/proposed/${f}`, 'utf8');
const guardUp = read('20261025_profiles_guard_extend.sql');
const guardDown = read('20261025_profiles_guard_extend_rollback.sql');
const banUp = read('20261025_auth_ban_on_deactivate.sql');
const banDown = read('20261025_auth_ban_on_deactivate_rollback.sql');

const A = '00000000-0000-0000-0000-00000000000a'; // admin
const E = '00000000-0000-0000-0000-00000000000e'; // employee
const I = '00000000-0000-0000-0000-0000000000f1'; // already inactive
const M = '00000000-0000-0000-0000-0000000000b1'; // manager

async function fresh() {
  const db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin;
    create schema auth;
    create table auth.users (id uuid primary key, banned_until timestamptz);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create table public.profiles (
      id uuid primary key, employee_name text unique not null, role_type text not null default 'employee', team text,
      is_active boolean default true, extra_permissions jsonb, denied_permissions jsonb, auth_id uuid, employment_status text,
      resigned_at timestamptz, resign_reason text, pin text, password text, qr_token text, base_salary_usd numeric,
      housing_allowance_usd numeric, transport_allowance_usd numeric, salary_currency text, commission_pct numeric,
      payroll_commission_exempt boolean, order_role text, order_market text, manager_scope text, wallet_balance numeric,
      late_tolerance_minutes int default 0, pre_approved_leaves int default 0,
      sales_confirmed_usd numeric default 0, sales_confirmed_syp numeric default 0, sales_confirmed_try numeric default 0,
      sales_provisional_usd numeric default 0, sales_provisional_syp numeric default 0, sales_provisional_try numeric default 0,
      total_points int default 0, bio text);
    create function public.current_role_type() returns text language sql stable security definer as $$
      select role_type from public.profiles where id = auth.uid() $$;
    create function public._profile_name_exists(_name text) returns boolean language sql stable security definer as $$
      select exists (select 1 from public.profiles p where p.employee_name = _name) $$;
    create function public.guard_profiles_write() returns trigger language plpgsql as $$ begin return new; end $$;
    alter table public.profiles enable row level security;
    create policy allow_all on public.profiles for all to public using (true) with check (true);
    grant usage on schema public to anon, authenticated, service_role;
    grant usage on schema auth to anon, authenticated;
    grant select, insert, update, delete on public.profiles to anon, authenticated, service_role;
    grant execute on all functions in schema public to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
    insert into auth.users(id) values ('${A}'),('${E}'),('${I}'),('${M}');
    insert into public.profiles(id, employee_name, role_type, is_active) values
      ('${A}','Admin One','admin',true), ('${E}','Emp One','employee',true), ('${I}','Gone One','employee',false), ('${M}','Mgr One','manager',true);
  `);
  // install the PRODUCTION baseline guard (the rollback file is the exact production body) + its trigger
  await db.exec(guardDown);
  await db.exec(`create trigger trg_guard_profiles_write before insert or delete or update on public.profiles
                   for each row execute function public.guard_profiles_write();`);
  return db;
}

// run one statement as a given db role / jwt subject, in a transaction we always roll back
async function as(db, role, sub, sql) {
  await db.exec('begin');
  try {
    await db.exec(`select set_config('request.jwt.claim.sub', '${sub ?? ''}', true)`);
    await db.exec(`set local role ${role}`);
    await db.exec(sql);
    await db.exec('rollback');
    return null;
  } catch (e) {
    await db.exec('rollback');
    return String(e.message || e);
  }
}
const blocked = (r) => r && /only an admin|permission denied/.test(r);

// ── 1) BASELINE (production body): documents the live gap ─────────────────────────────
{
  const db = await fresh();
  ok(blocked(await as(db, 'anon', null, `update public.profiles set role_type='admin' where id='${E}'`)), 'baseline: anon cannot change role');
  ok(blocked(await as(db, 'authenticated', E, `update public.profiles set role_type='admin' where id='${E}'`)), 'baseline: employee cannot self-promote');
  ok(blocked(await as(db, 'authenticated', M, `update public.profiles set role_type='admin' where id='${E}'`)), 'baseline: manager cannot promote through REST');
  ok(blocked(await as(db, 'anon', null, `update public.profiles set base_salary_usd=1 where id='${E}'`)), 'baseline: anon cannot change salary');
  ok(await as(db, 'anon', null, `update public.profiles set late_tolerance_minutes=999 where id='${E}'`) === null, 'baseline GAP reproduced: anon CAN change late_tolerance_minutes');
  ok(await as(db, 'anon', null, `update public.profiles set sales_confirmed_usd=99999 where id='${E}'`) === null, 'baseline GAP reproduced: anon CAN change sales_confirmed_usd');
  ok(await as(db, 'anon', null, `update public.profiles set employee_name='Hijacked' where id='${A}'`) === null, 'baseline GAP reproduced: anon CAN rename the admin');
}

// ── 2) MIGRATION 1: guard extension ───────────────────────────────────────────────────
{
  const db = await fresh();
  await db.exec(guardUp);
  const roles = [['anon', null], ['authenticated', E], ['authenticated', M]];
  for (const [r, sub] of roles) {
    const tag = `${r}${sub ? ':' + (sub === E ? 'employee' : 'manager') : ''}`;
    for (const col of ['late_tolerance_minutes=999', 'pre_approved_leaves=99', 'sales_confirmed_usd=1', 'sales_confirmed_syp=1', 'sales_confirmed_try=1',
      'sales_provisional_usd=1', 'sales_provisional_syp=1', 'sales_provisional_try=1', "employee_name='Hijacked'", "team='x'", "role_type='admin'", 'base_salary_usd=1', "pin='0000'", "extra_permissions='[\"manage_payroll\"]'::jsonb", 'is_active=false']) {
      ok(blocked(await as(db, r, sub, `update public.profiles set ${col} where id='${E}'`)), `after: ${tag} blocked from ${col}`);
    }
    // legitimate flows keep working
    ok(await as(db, r, sub, `update public.profiles set bio='hello' where id='${E}'`) === null, `after: ${tag} can still edit bio`);
    ok(await as(db, r, sub, `update public.profiles set total_points=total_points+10 where id='${E}'`) === null, `after: ${tag} can still add task points`);
    ok(await as(db, r, sub, `update public.profiles set bio=bio where id='${E}'`) === null, `after: ${tag} no-op update passes`);
  }
  // admin session + server roles unaffected
  for (const col of ['late_tolerance_minutes=5', "employee_name='Renamed'", "role_type='manager'", 'sales_confirmed_usd=5', "team='سوريا'"]) {
    ok(await as(db, 'authenticated', A, `update public.profiles set ${col} where id='${E}'`) === null, `after: admin session can set ${col}`);
    ok(await as(db, 'service_role', null, `update public.profiles set ${col} where id='${E}'`) === null, `after: service_role can set ${col}`);
  }
  // upsert escalation still blocked
  ok(blocked(await as(db, 'anon', null, `insert into public.profiles(id, employee_name, role_type) values ('00000000-0000-0000-0000-0000000000c1','Emp One','admin') on conflict (employee_name) do update set role_type='admin'`)), 'after: upsert-based escalation blocked');
  ok(blocked(await as(db, 'anon', null, `insert into public.profiles(id, employee_name, role_type) values ('00000000-0000-0000-0000-0000000000c2','Brand New','admin')`)), 'after: anon cannot create a new admin profile');
  // rollback restores baseline
  await db.exec(guardDown);
  ok(await as(db, 'anon', null, `update public.profiles set late_tolerance_minutes=1 where id='${E}'`) === null, 'rollback restores the previous behaviour');
}

// ── 3) MIGRATION 2: auth ban follows is_active ────────────────────────────────────────
{
  const db = await fresh();
  await db.exec(banUp); // includes backfill
  const ban = async (id) => (await db.query(`select banned_until is not null as b, banned_until = 'infinity' as inf from auth.users where id='${id}'`)).rows[0];
  ok((await ban(I)).inf === true, 'backfill: already-inactive profile gets banned');
  ok((await ban(E)).b === false && (await ban(A)).b === false && (await ban(M)).b === false, 'backfill: active profiles untouched');
  await db.exec(`update public.profiles set is_active=false where id='${E}'`);
  ok((await ban(E)).inf === true, 'deactivate -> auth identity banned');
  await db.exec(`update public.profiles set is_active=true where id='${E}'`);
  ok((await ban(E)).b === false, 'reactivate -> ban lifted');
  await db.exec(`update public.profiles set bio='x' where id='${M}'`);
  ok((await ban(M)).b === false, 'unrelated update does not touch auth');
  await db.exec(`update public.profiles set is_active=true where id='${A}'`); // no change in value
  ok((await ban(A)).b === false, 'is_active unchanged -> no ban');
  // untouched pre-existing manual ban is not lifted by an unrelated reactivation of a different user
  await db.exec(`update auth.users set banned_until = now() + interval '1 day' where id='${M}'`);
  await db.exec(`update public.profiles set is_active=false where id='${M}'`);
  await db.exec(`update public.profiles set is_active=true where id='${M}'`);
  ok((await ban(M)).b === false, 'reactivation clears the ban for that user');
  // ordinary roles cannot call the function directly
  ok(blocked(await as(db, 'anon', null, 'select public.sync_auth_ban_with_active()')) || /permission denied|trigger/.test(String(await as(db, 'anon', null, 'select public.sync_auth_ban_with_active()'))), 'anon cannot execute the ban function');
  await db.exec(banDown);
  const fnLeft = (await db.query(`select count(*)::int n from pg_proc where proname='sync_auth_ban_with_active'`)).rows[0].n;
  const trgLeft = (await db.query(`select count(*)::int n from pg_trigger where tgname='trg_sync_auth_ban_with_active'`)).rows[0].n;
  ok(fnLeft === 0 && trgLeft === 0, 'rollback removes trigger and function');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
