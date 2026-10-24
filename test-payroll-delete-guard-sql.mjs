/* global process */
// Runs the REAL migration docs/payroll/proposed/20261024_payroll_runs_delete_guard.sql (+ rollback) on an in-memory
// PostgreSQL (PGlite) with the payroll_runs/payroll_entries shape (entries cascade on run delete, as in production).
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

let pass = 0; let fail = 0;
const ok = (c, m) => { if (c) pass += 1; else { fail += 1; console.error('FAIL', m); } };
const migration = readFileSync('docs/payroll/proposed/20261024_payroll_runs_delete_guard.sql', 'utf8');
const rollback = readFileSync('docs/payroll/proposed/20261024_payroll_runs_delete_guard_rollback.sql', 'utf8');

const db = new PGlite();
await db.exec(`
  create table payroll_runs (id uuid primary key, period_year int, period_month int, status text not null default 'draft');
  create table payroll_entries (id serial primary key, run_id uuid not null references payroll_runs(id) on delete cascade, net numeric default 0);
  insert into payroll_runs values
    ('00000000-0000-0000-0000-0000000000a1', 2026, 9,  'draft'),       -- September 2026: historical DRAFT (the live case)
    ('00000000-0000-0000-0000-0000000000a2', 2026, 8,  'draft'),       -- August draft
    ('00000000-0000-0000-0000-0000000000a3', 2026, 7,  'paid'),        -- July paid
    ('00000000-0000-0000-0000-0000000000a4', 2026, 6,  'finalized'),   -- June finalized
    ('00000000-0000-0000-0000-0000000000b1', 2026, 10, 'draft'),       -- October draft (operational)
    ('00000000-0000-0000-0000-0000000000b2', 2026, 10, 'finalized'),   -- October approved
    ('00000000-0000-0000-0000-0000000000b3', 2026, 11, 'paid'),        -- November paid
    ('00000000-0000-0000-0000-0000000000b4', 2026, 12, 'draft'),       -- December draft
    ('00000000-0000-0000-0000-0000000000b5', 2027, 1,  'draft');       -- 2027 draft
  insert into payroll_entries (run_id, net) select id, 100 from payroll_runs;
`);
const tryQ = async (sql) => { try { await db.exec(sql); return null; } catch (e) { return String(e.message || e); } };
const count = async (sql) => (await db.query(sql)).rows[0].n;
const del = (id) => tryQ(`delete from payroll_runs where id='${id}'`);
const runs0 = await count('select count(*)::int n from payroll_runs');

// ── before the guard: the hole exists (proves the test is meaningful)
ok((await del('00000000-0000-0000-0000-0000000000a2')) === null, 'BEFORE the guard a historical draft can be deleted (the gap this migration closes)');
await db.exec(`insert into payroll_runs values ('00000000-0000-0000-0000-0000000000a2', 2026, 8, 'draft'); insert into payroll_entries (run_id, net) values ('00000000-0000-0000-0000-0000000000a2', 100);`);

ok(await tryQ(migration) === null, 'migration applies cleanly');

// ── historical runs: every status is refused, entries survive
for (const [id, label] of [['a1', 'September 2026 draft'], ['a2', 'August draft'], ['a3', 'July paid'], ['a4', 'June finalized']]) {
  const err = await del(`00000000-0000-0000-0000-0000000000${id}`);
  ok(err && /دورة تاريخية/.test(err), `historical ${label} cannot be deleted: ${err}`);
}
ok(await count(`select count(*)::int n from payroll_entries where run_id in ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000a3','00000000-0000-0000-0000-0000000000a4')`) === 4, 'historical entries are untouched (no cascade happened)');

// ── operational runs: only a DRAFT may go
for (const [id, label] of [['b2', 'October finalized'], ['b3', 'November paid']]) {
  const err = await del(`00000000-0000-0000-0000-0000000000${id}`);
  ok(err && /مسودة غير معتمدة/.test(err), `operational ${label} cannot be deleted: ${err}`);
}
ok((await del('00000000-0000-0000-0000-0000000000b1')) === null, 'October DRAFT can be deleted');
ok((await del('00000000-0000-0000-0000-0000000000b4')) === null, 'December DRAFT can be deleted');
ok((await del('00000000-0000-0000-0000-0000000000b5')) === null, '2027 DRAFT can be deleted');
ok(await count(`select count(*)::int n from payroll_entries where run_id in ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000b4','00000000-0000-0000-0000-0000000000b5')`) === 0, 'deleting an operational draft cascades its own entries');

// ── bulk statements cannot sneak a historical run through
const bulk = await tryQ(`delete from payroll_runs where status = 'draft'`);
ok(bulk && /دورة تاريخية/.test(bulk), 'a bulk "delete all drafts" is refused as a whole: ' + bulk);
ok(await count(`select count(*)::int n from payroll_runs where status='draft' and period_month < 10`) === 2, 'the historical drafts are still there after the bulk attempt');
ok(await count('select count(*)::int n from payroll_runs') === runs0 - 3, 'exactly the 3 operational drafts were removed (and nothing else)');

// updates are not this guard's business (status/other guards own them)
ok(await tryQ(`update payroll_runs set status='draft' where id='00000000-0000-0000-0000-0000000000b2'`) === null, 'the guard does not interfere with UPDATE');

// ── rollback
ok(await tryQ(rollback) === null, 'rollback applies cleanly');
ok((await del('00000000-0000-0000-0000-0000000000a1')) === null, 'after rollback the historical delete is possible again (rollback really removes the guard)');
ok(await count(`select count(*)::int n from pg_trigger where tgname='payroll_runs_delete_guard'`) === 0, 'trigger gone');

console.log(`payroll delete guard SQL (PGlite): ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
