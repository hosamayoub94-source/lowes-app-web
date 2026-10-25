// D-157 — warehouse returns lifecycle tests.
// Runs the REAL migrations inside an in-memory Postgres (PGlite). It never
// touches Supabase or any real order. Install once (outside the repo):
//   npm i @electric-sql/pglite --prefix <some-dir>   then   PGLITE_DIR=<some-dir> node test-warehouse-returns.mjs
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

const here = path.dirname(fileURLToPath(import.meta.url));
let PGlite;
try {
  ({ PGlite } = await import('@electric-sql/pglite'));
} catch {
  if (!process.env.PGLITE_DIR) {
    console.error('PGlite missing: npm i @electric-sql/pglite --prefix <dir> and set PGLITE_DIR=<dir>');
    process.exit(2);
  }
  const req = createRequire(path.join(process.env.PGLITE_DIR, 'x.js'));
  ({ PGlite } = await import(pathToFileURL(req.resolve('@electric-sql/pglite')).href));
}

const mig = (f) => readFileSync(path.join(here, 'supabase', 'migrations', f), 'utf8');
const db = new PGlite();

await db.exec(`
  create role anon; create role authenticated;
  create table products (id uuid primary key default gen_random_uuid(), name text);
  create table orders (id uuid primary key default gen_random_uuid(), order_id text, status text);
  create table wh_warehouses (id uuid primary key default gen_random_uuid(), name text not null,
    type text not null default 'sales', owner_name text, market text, is_active boolean not null default true,
    created_at timestamptz not null default now());
  create table wh_stock (id uuid primary key default gen_random_uuid(),
    warehouse_id uuid not null references wh_warehouses(id), product_id uuid not null references products(id),
    quantity int not null default 0, updated_at timestamptz not null default now(),
    unique (warehouse_id, product_id));
  create table wh_movements (id uuid primary key default gen_random_uuid(),
    product_id uuid not null references products(id),
    from_warehouse_id uuid references wh_warehouses(id), to_warehouse_id uuid references wh_warehouses(id),
    quantity int not null, type text not null, reason text, performed_by text, order_id uuid,
    created_at timestamptz not null default now(), reverses_id uuid);
`);
await db.exec(mig('20261024_warehouse_order_stock_atomic.sql'));
await db.exec(mig('20261025_warehouse_return_actions.sql'));

const one = async (sql, p = []) => (await db.query(sql, p)).rows[0];
const all = async (sql, p = []) => (await db.query(sql, p)).rows;
const fails = async (fn, re) => {
  try { await fn(); } catch (e) { assert.match(String(e.message), re, `wrong error: ${e.message}`); return; }
  assert.fail('expected an error but the call succeeded');
};

const wh = (await one(`insert into wh_warehouses(name,market) values ('syria-sales','syria') returning id`)).id;
const prodA = (await one(`insert into products(name) values ('A') returning id`)).id;
const prodB = (await one(`insert into products(name) values ('B') returning id`)).id;
await db.query(`insert into wh_stock(warehouse_id,product_id,quantity) values ($1,$2,1000),($1,$3,500)`, [wh, prodA, prodB]);

const stock = async (p) => Number((await one(`select quantity q from wh_stock where warehouse_id=$1 and product_id=$2`, [wh, p])).q);
const moves = async (o) => Number((await one(`select count(*) c from wh_movements where order_id=$1`, [o])).c);
const newOrder = async (code) => (await one(`insert into orders(order_id,status) values ($1,'pending') returning id`, [code])).id;
const sync = (o, lines, out, by = 'tester') =>
  one(`select wh_sync_order_stock($1,$2,$3::jsonb,$4,$5,null) r`, [o, wh, JSON.stringify(lines), out, by]).then(x => x.r);
const reg = (o, items, stage) =>
  one(`select wh_register_order_return($1,$2,$3::jsonb,$4,'carrier','r') r`, [o, wh, JSON.stringify(items), stage]).then(x => x.r);
const caseOf = (o) => one(`select * from wh_return_cases where order_id=$1`, [o]);
const events = async (o) => Number((await one(`select count(*) c from wh_return_events where order_id=$1`, [o])).c);

let passed = 0;
const t = async (name, fn) => {
  try { await fn(); passed++; console.log('  ok  ', name); }
  catch (e) { console.error('  FAIL', name, '\n      ', e.message); process.exitCode = 1; }
};

const lines = (qa, qb = 0) => [{ productId: prodA, qty: qa }, ...(qb ? [{ productId: prodB, qty: qb }] : [])];

await t('preparing reserves the quantity exactly once', async () => {
  const o = await newOrder('T1'); const before = await stock(prodA);
  await sync(o, lines(2), true);
  assert.equal(await stock(prodA), before - 2);
  assert.equal(await moves(o), 1);
});

await t('repeating the same transition does not deduct twice', async () => {
  const o = await newOrder('T2'); const before = await stock(prodA);
  await sync(o, lines(3), true); await sync(o, lines(3), true); await sync(o, lines(3), true);
  assert.equal(await stock(prodA), before - 3);
  assert.equal(await moves(o), 1);
});

await t('leaving the deducted statuses without a return releases once', async () => {
  const o = await newOrder('T3'); const before = await stock(prodA);
  await sync(o, lines(2), true);
  await sync(o, lines(2), false); await sync(o, lines(2), false);
  assert.equal(await stock(prodA), before);
  assert.equal(await moves(o), 2);
});

await t('returning does not make the goods saleable (sync is blocked while a case is open)', async () => {
  const o = await newOrder('T4'); const before = await stock(prodA);
  await sync(o, lines(2), true);
  await reg(o, lines(2), 'in_transit');
  const r = await sync(o, lines(2), false);            // what a naive status writer would do
  assert.equal(r.skipped, 'return_case_open');
  assert.equal(await stock(prodA), before - 2);
  assert.equal(await moves(o), 1);
});

await t('received only creates/updates the return case', async () => {
  const o = await newOrder('T5'); const before = await stock(prodA);
  await sync(o, lines(2), true); const m = await moves(o);
  await reg(o, lines(2), 'in_transit');
  await reg(o, lines(2), 'received');
  assert.equal((await caseOf(o)).status, 'received');
  assert.equal(await stock(prodA), before - 2);
  assert.equal(await moves(o), m);
  assert.equal((await all(`select 1 from wh_return_cases where order_id=$1`, [o])).length, 1);
});

await t('registering the same return again is idempotent and never regresses', async () => {
  const o = await newOrder('T6');
  await sync(o, lines(1), true);
  await reg(o, lines(1), 'received'); await reg(o, lines(1), 'in_transit'); await reg(o, lines(1), 'received');
  assert.equal((await caseOf(o)).status, 'received');
  assert.equal(await events(o), 1);
});

await t('receiving twice via wh_receive_return is idempotent', async () => {
  const o = await newOrder('T7');
  await sync(o, lines(1), true); await reg(o, lines(1), 'in_transit');
  const a = (await one(`select wh_receive_return($1,'wasim','ok') r`, [o])).r;
  const b = (await one(`select wh_receive_return($1,'wasim','ok') r`, [o])).r;
  assert.equal(a.idempotent, false); assert.equal(b.idempotent, true);
  assert.equal(await events(o), 2);                      // registered + received
});

await t('restock before inspection is rejected', async () => {
  const o = await newOrder('T8'); const before = await stock(prodA);
  await sync(o, lines(2), true); await reg(o, lines(2), 'in_transit');
  await fails(() => one(`select wh_restock_return($1,'wasim',null)`, [o]), /قبل الفحص/);
  await one(`select wh_receive_return($1,'wasim',null)`, [o]);
  await fails(() => one(`select wh_restock_return($1,'wasim',null)`, [o]), /قبل الفحص/);
  assert.equal(await stock(prodA), before - 2);
});

await t('restock adds the quantity to the right warehouse exactly once', async () => {
  const o = await newOrder('T9'); const a0 = await stock(prodA), b0 = await stock(prodB);
  await sync(o, lines(2, 1), true);
  await reg(o, lines(2, 1), 'in_transit');
  await one(`select wh_receive_return($1,'wasim','وصل')`, [o]);
  await one(`select wh_inspect_return($1,'good','wasim','سليم')`, [o]);
  const r1 = (await one(`select wh_restock_return($1,'wasim','للبيع') r`, [o])).r;
  const r2 = (await one(`select wh_restock_return($1,'wasim','للبيع') r`, [o])).r;
  assert.equal(r1.idempotent, false); assert.equal(r2.idempotent, true);
  assert.equal(await stock(prodA), a0); assert.equal(await stock(prodB), b0);
  const rel = await all(`select quantity,to_warehouse_id,performed_by,order_id from wh_movements where order_id=$1 and type='release'`, [o]);
  assert.equal(rel.length, 2);
  assert.ok(rel.every(r => r.to_warehouse_id === wh && r.performed_by === 'wasim' && r.order_id === o));
  const c = await caseOf(o);
  assert.equal(c.status, 'restocked'); assert.equal(c.resolved_by, 'wasim'); assert.ok(c.resolved_at);
});

await t('damaged never adds stock and cannot be restocked afterwards', async () => {
  const o = await newOrder('T10'); const before = await stock(prodA);
  await sync(o, lines(2), true); await reg(o, lines(2), 'in_transit');
  await one(`select wh_receive_return($1,'wasim',null)`, [o]);
  await one(`select wh_inspect_return($1,'damaged','wasim','مكسور')`, [o]);
  await fails(() => one(`select wh_restock_return($1,'wasim',null)`, [o]), /ليست سليمة/);
  await fails(() => one(`select wh_mark_return_damaged($1,'wasim','  ')`, [o]), /سبب التلف/);
  await one(`select wh_mark_return_damaged($1,'wasim','مكسور بالشحن')`, [o]);
  assert.equal(await stock(prodA), before - 2);
  await fails(() => one(`select wh_restock_return($1,'wasim',null)`, [o]), /قبل الفحص/);
  assert.equal((await caseOf(o)).status, 'damaged');
});

await t('quarantine needs a reason, keeps stock out, and can be restocked later', async () => {
  const o = await newOrder('T11'); const before = await stock(prodA);
  await sync(o, lines(1), true); await reg(o, lines(1), 'received');
  await one(`select wh_inspect_return($1,'suspect','wasim','غلاف مفتوح')`, [o]);
  await fails(() => one(`select wh_quarantine_return($1,'wasim','')`, [o]), /سبب الحجر/);
  await one(`select wh_quarantine_return($1,'wasim','فحص مخبري')`, [o]);
  assert.equal(await stock(prodA), before - 1);
  await one(`select wh_restock_return($1,'wasim','اجتاز الفحص')`, [o]);
  assert.equal(await stock(prodA), before);
  assert.equal((await caseOf(o)).status, 'restocked');
});

await t('arbitrary transitions are rejected', async () => {
  const o = await newOrder('T12');
  await sync(o, lines(1), true); await reg(o, lines(1), 'in_transit');
  await fails(() => one(`select wh_inspect_return($1,'good','wasim',null)`, [o]), /انتقال غير مسموح/);
  await fails(() => one(`select wh_quarantine_return($1,'wasim','x')`, [o]), /انتقال غير مسموح/);
  await fails(() => one(`select wh_inspect_return($1,'weird','wasim',null)`, [o]), /نتيجة الفحص/);
  await fails(() => one(`select wh_receive_return($1,' ',null)`, [o]), /المسؤول/);
  await fails(() => one(`select wh_receive_return(gen_random_uuid(),'wasim',null)`), /لا توجد حالة مرتجع/);
  await one(`select wh_receive_return($1,'wasim',null)`, [o]);
  await one(`select wh_inspect_return($1,'good','wasim',null)`, [o]);
  await fails(() => one(`select wh_receive_return($1,'wasim',null)`, [o]), /انتقال غير مسموح/);
});

await t('deducting more than the balance is rejected and changes nothing', async () => {
  const o = await newOrder('T13'); const before = await stock(prodA);
  await fails(() => sync(o, lines(before + 1), true), /insufficient stock/);
  assert.equal(await stock(prodA), before); assert.equal(await moves(o), 0);
  await fails(() => one(`select wh_apply_stock_delta($1,$2,$3)`, [wh, prodA, -(before + 1)]), /negative/);
});

await t('restock is refused when the reservation is smaller than the return', async () => {
  const o = await newOrder('T14'); const before = await stock(prodA);
  await sync(o, lines(1), true);
  await reg(o, lines(5), 'received');                    // carrier reports more than was reserved
  await one(`select wh_inspect_return($1,'good','wasim',null)`, [o]);
  await fails(() => one(`select wh_restock_return($1,'wasim',null)`, [o]), /الحجز المسجّل/);
  assert.equal(await stock(prodA), before - 1);
  assert.equal((await caseOf(o)).status, 'inspected');
});

await t('API roles cannot write the case tables or call the internal step', async () => {
  const g = await all(`select grantee, privilege_type from information_schema.role_table_grants
                       where table_name in ('wh_return_cases','wh_return_events') and grantee in ('anon','authenticated')`);
  assert.deepEqual(g.filter(x => x.privilege_type !== 'SELECT'), []);
  assert.ok(g.every(x => x.grantee === 'authenticated'));
  const exe = await all(`select has_function_privilege('anon','wh_restock_return(uuid,text,text)','execute') a,
                                has_function_privilege('authenticated','wh_restock_return(uuid,text,text)','execute') b,
                                has_function_privilege('authenticated','wh__return_step(uuid,text,text,text,text)','execute') c`);
  assert.deepEqual(exe[0], { a: false, b: true, c: false });
});

console.log(`\n${passed} passed${process.exitCode ? ', some FAILED' : ''}`);
