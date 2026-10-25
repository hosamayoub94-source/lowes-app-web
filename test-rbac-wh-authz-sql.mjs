/* global process */
// Runs the REAL migrations docs/security/proposed/20261026_rbac_primitives.sql + 20261026_wh_functions_authz.sql (+ rollback)
// on in-memory PostgreSQL (PGlite). Baseline = the production function bodies (the rollback file) so the "before" is real.
// run: node test-rbac-wh-authz-sql.mjs
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

let pass = 0; let fail = 0;
const ok = (c, m) => { if (c) pass += 1; else { fail += 1; console.error('FAIL', m); } };
const read = (f) => readFileSync(`docs/security/proposed/${f}`, 'utf8');
const prim = read('20261026_rbac_primitives.sql');
const whUp = read('20261026_wh_functions_authz.sql');
const whDown = read('20261026_wh_functions_authz_rollback.sql');

const U = (n) => `00000000-0000-0000-0000-0000000000${String(n).padStart(2, '0')}`;
const ADMIN = U(1); const EMP = U(2); const WHM = U(3); const MGR = U(4); const EMP_X = U(5); const GONE = U(6); const SALES = U(7);
const W1 = U(91); const W2 = U(92); const P1 = U(81); const ORD = U(71);

async function fresh({ withNew }) {
  const db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create table public.profiles (id uuid primary key, employee_name text, role_type text not null default 'employee', is_active boolean default true,
      extra_permissions jsonb, denied_permissions jsonb);
    create table public.wh_stock (warehouse_id uuid, product_id uuid, quantity int not null default 0, updated_at timestamptz, primary key (warehouse_id, product_id));
    create table public.wh_movements (id bigserial primary key, product_id uuid, from_warehouse_id uuid, to_warehouse_id uuid, quantity int, type text, reason text, performed_by text, order_id uuid);
    create table public.wh_return_cases (id uuid primary key default gen_random_uuid(), order_id uuid unique, warehouse_id uuid, status text, items jsonb, reason text, received_at timestamptz, received_by text, updated_at timestamptz);
    create table public.wh_return_events (id bigserial primary key, case_id uuid, order_id uuid, from_status text, to_status text, performed_by text, notes text);
    grant usage on schema public, auth to anon, authenticated, service_role;
    insert into public.profiles(id, employee_name, role_type, is_active, extra_permissions, denied_permissions) values
      ('${ADMIN}','a','admin',true,null,null), ('${EMP}','e','employee',true,'[]','[]'), ('${WHM}','w','warehouse_manager',true,'[]','[]'),
      ('${MGR}','m','manager',true,'[]','["manage_sales_stock"]'), ('${EMP_X}','x','employee',true,'["manage_sales_stock"]','[]'),
      ('${GONE}','g','warehouse_manager',false,'[]','[]'), ('${SALES}','s','sales_manager',true,'[]','[]');
    insert into public.wh_stock values ('${W1}','${P1}',100,now()), ('${W2}','${P1}',0,now());
  `);
  await db.exec(whDown); // production baseline
  await db.exec('grant execute on all functions in schema public to public, anon, authenticated, service_role');
  if (withNew) { await db.exec(prim); await db.exec(whUp); }
  return db;
}
async function as(db, role, sub, sql) {
  await db.exec('begin');
  try {
    await db.exec(`select set_config('request.jwt.claim.sub', '${sub ?? ''}', true)`);
    if (role) await db.exec(`select set_config('request.jwt.claims', '{"role":"${role}"}', true)`);
    if (role) await db.exec(`set local role ${role}`);
    await db.exec(sql);
    await db.exec('rollback');
    return null;
  } catch (e) { await db.exec('rollback'); return String(e.message || e); }
}
const denied = (r) => !!r && /authentication required|insufficient privilege|permission denied/.test(r);
const qty = async (db, w) => (await db.query(`select quantity q from wh_stock where warehouse_id='${w}' and product_id='${P1}'`)).rows[0].q;

const APPLY = `select wh_apply_stock_delta('${W1}','${P1}',5)`;
const TRANSFER = `select wh_transfer_stock('${W1}','${W2}','${P1}',3)`;
const SYNC = `select wh_sync_order_stock('${ORD}','${W1}','[{"productId":"${P1}","qty":2}]'::jsonb,true,'t',null)`;
const RET = `select wh_register_order_return('${ORD}','${W1}','[]'::jsonb,'in_transit','t','r')`;

// ── 1) BASELINE (production bodies): the live hole ───────────────────────────────────
{
  const db = await fresh({ withNew: false });
  ok(await as(db, 'anon', null, APPLY) === null, 'baseline GAP: anon can change stock');
  ok(await as(db, 'anon', null, TRANSFER) === null, 'baseline GAP: anon can transfer stock');
  ok(await as(db, 'anon', null, SYNC) === null, 'baseline GAP: anon can reserve order stock');
  ok(await as(db, 'anon', null, RET) === null, 'baseline GAP: anon can open a return case');
}

// ── 2) AFTER the migration ───────────────────────────────────────────────────────────
{
  const db = await fresh({ withNew: true });
  for (const [name, sql] of [['apply', APPLY], ['transfer', TRANSFER], ['sync', SYNC], ['return', RET]]) {
    ok(denied(await as(db, 'anon', null, sql)), `anon denied: ${name}`);
    ok(denied(await as(db, 'authenticated', null, sql)), `JWT without a subject denied: ${name}`);
    ok(denied(await as(db, 'authenticated', GONE, sql)), `inactive user denied: ${name}`);
    ok(denied(await as(db, 'authenticated', U(99), sql)), `unknown user denied: ${name}`);
  }
  // permission-gated: apply/transfer
  for (const [who, sub, allowed] of [['employee', EMP, false], ['sales_manager', SALES, false], ['warehouse_manager', WHM, true], ['admin', ADMIN, true],
    ['employee+manage_sales_stock', EMP_X, true], ['manager with manage_sales_stock denied (still has central)', MGR, true]]) {
    const a = await as(db, 'authenticated', sub, APPLY);
    const t = await as(db, 'authenticated', sub, TRANSFER);
    ok(allowed ? a === null : denied(a), `${who}: apply ${allowed ? 'allowed' : 'denied'}`);
    ok(allowed ? t === null : denied(t), `${who}: transfer ${allowed ? 'allowed' : 'denied'}`);
  }
  // order flows: any active signed-in user
  for (const sub of [EMP, SALES, WHM, ADMIN]) {
    ok(await as(db, 'authenticated', sub, SYNC) === null, `active user ${sub.slice(-2)} can sync order stock`);
    ok(await as(db, 'authenticated', sub, RET) === null, `active user ${sub.slice(-2)} can register a return`);
  }
  // service role + direct DB still work
  for (const [label, role] of [['service_role', 'service_role'], ['db (no role)', null]]) {
    for (const [name, sql] of [['apply', APPLY], ['transfer', TRANSFER], ['sync', SYNC], ['return', RET]])
      ok(await as(db, role, null, sql) === null, `${label}: ${name} allowed`);
  }
  // the internal helper is not callable by API roles
  ok(denied(await as(db, 'authenticated', ADMIN, `select _wh_apply_stock_delta_internal('${W1}','${P1}',1)`)), 'internal helper not executable by authenticated');
  ok(denied(await as(db, 'service_role', null, `select _wh_apply_stock_delta_internal('${W1}','${P1}',1)`)), 'internal helper not executable by service_role directly');

  // functional equivalence with the production behaviour (committed run as service_role)
  await db.exec(`select set_config('request.jwt.claims','{"role":"service_role"}',false)`);
  await db.exec(`select wh_apply_stock_delta('${W1}','${P1}',10)`);
  ok(await qty(db, W1) === 110, 'apply adds');
  await db.exec(`select wh_transfer_stock('${W1}','${W2}','${P1}',40)`);
  ok(await qty(db, W1) === 70 && await qty(db, W2) === 40, 'transfer moves');
  const e1 = await as(db, 'service_role', null, `select wh_transfer_stock('${W1}','${W2}','${P1}',9999)`);
  ok(/insufficient stock: have 70, need 9999/.test(e1 || ''), 'insufficient-stock message unchanged (client regex depends on it)');
  const e2 = await as(db, 'service_role', null, `select wh_apply_stock_delta('${W2}','${P1}',-9999)`);
  ok(/stock cannot become negative/.test(e2 || ''), 'negative stock still refused');
  ok(/source and destination are the same/.test(await as(db, 'service_role', null, `select wh_transfer_stock('${W1}','${W1}','${P1}',1)`) || ''), 'same-warehouse transfer refused');
  await db.exec(SYNC);
  ok(await qty(db, W1) === 68, 'order reservation takes 2');
  await db.exec(`select wh_sync_order_stock('${ORD}','${W1}','[]'::jsonb,false,'t','x')`);
  ok(await qty(db, W1) === 70, 'releasing restores stock');
  const moves = (await db.query(`select type, quantity from wh_movements where order_id='${ORD}' order by id`)).rows.map((r) => `${r.type}:${r.quantity}`).join(',');
  ok(moves === 'reserve:2,release:2', 'movements logged as before');
  await db.exec(RET);
  ok((await db.query(`select status from wh_return_cases where order_id='${ORD}'`)).rows[0].status === 'in_transit', 'return case opened');
}

// ── 3) app_has_permission == the JS permission model, for every role × permission × extra/denied ─
{
  const out = path.join(process.cwd(), `.tmp-rbac-${process.pid}.mjs`);
  await build({ stdin: { contents: `export * from './supabase/functions/_shared/rolePermissions.js'; export * as app from './src/data/permissions.js';`, resolveDir: process.cwd(), loader: 'js' },
    bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent' });
  let m; try { m = await import(pathToFileURL(out).href + `?t=${Date.now()}`); } finally { fs.unlinkSync(out); }
  const db = await fresh({ withNew: true });
  const roles = ['admin', 'manager', 'sales_manager', 'social_manager', 'media_buyer', 'employee', 'accountant', 'hr_manager', 'warehouse_manager', 'marketing_manager', 'unknown_role'];
  const perms = m.app.ALL_PERMISSIONS;
  // table seeds equal the JS defaults
  const seeded = (await db.query('select role, permission from app_role_permissions order by 1,2')).rows.map((r) => `${r.role}:${r.permission}`);
  const expected = Object.entries(m.ROLE_DEFAULT_PERMISSIONS).flatMap(([r, ps]) => ps.map((p) => `${r}:${p}`)).sort();
  ok(JSON.stringify(seeded) === JSON.stringify(expected), 'DB seed == _shared/rolePermissions.js');
  for (const r of Object.keys(m.ROLE_DEFAULT_PERMISSIONS)) {
    const js = [...m.app.resolvePermissions({ role: r })].sort().join(',');
    ok(js === [...m.effectivePermissions(r, [], [])].sort().join(',') || r === 'admin', `shared defaults == permissions.js for ${r}`);
  }
  let checked = 0; let bad = 0;
  for (const role of roles) {
    for (const [extra, denied2] of [[[], []], [[perms[0], perms[3], perms[10]], []], [[], [perms[1], perms[4]]], [[perms[2]], [perms[2]]]]) {
      await db.exec(`update public.profiles set role_type='${role}', extra_permissions='${JSON.stringify(extra)}', denied_permissions='${JSON.stringify(denied2)}' where id='${EMP}'`);
      await db.exec('begin'); await db.exec(`select set_config('request.jwt.claim.sub','${EMP}',true)`);
      for (const p of perms) {
        const dbv = (await db.query(`select app_has_permission('${p}') v`)).rows[0].v;
        const jsv = m.app.resolvePermissions({ role, extra_permissions: extra, denied_permissions: denied2 }).has(p);
        checked++; if (dbv !== jsv) { bad++; console.error('MISMATCH', role, p, dbv, jsv); }
      }
      await db.exec('rollback');
    }
  }
  ok(bad === 0, `app_has_permission matches the JS model (${checked} combinations)`);
}

// ── 4) rollback restores production behaviour ─────────────────────────────────────────
{
  const db = await fresh({ withNew: true });
  await db.exec(whDown);
  await db.exec('grant execute on all functions in schema public to public, anon, authenticated, service_role');
  ok(await as(db, 'anon', null, APPLY) === null, 'rollback: anon can call again (previous behaviour)');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
