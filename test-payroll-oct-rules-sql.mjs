/* global process */
// Runs the REAL migration docs/payroll/proposed/20261024_payroll_oct_rules.sql (and its rollback) on an
// in-memory PostgreSQL (PGlite) with a minimal copy of the production tables it touches.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

let pass = 0; let fail = 0;
const ok = (c, m) => { if (c) pass += 1; else { fail += 1; console.error('FAIL', m); } };
const migration = readFileSync('docs/payroll/proposed/20261024_payroll_oct_rules.sql', 'utf8');
const rollback = readFileSync('docs/payroll/proposed/20261024_payroll_oct_rules_rollback.sql', 'utf8');

const db = new PGlite();
await db.exec(`
  create role authenticated; create role anon;
  create table profiles (id uuid primary key, employee_name text, payroll_excluded boolean not null default false);
  create table payroll_runs (id uuid primary key, period_year int, period_month int, status text not null default 'draft',
                             employee_count int, total_net_usd numeric(12,2));
  create table payroll_entries (id uuid primary key default gen_random_uuid(), run_id uuid not null references payroll_runs(id) on delete cascade,
    employee_id uuid, source text default 'auto', base_salary_usd numeric default 0, allowances_usd numeric default 0,
    commission_usd numeric default 0, bonus_usd numeric default 0, deductions_usd numeric default 0,
    absence_deduction_usd numeric default 0, shortfall_deduction_usd numeric default 0, advance_deduction_usd numeric default 0,
    net_salary_usd numeric default 0, unique (run_id, employee_id));
  insert into profiles (id, employee_name, payroll_excluded) values
    ('a68d72e4-8c88-4554-a8c4-70f5ac813a20', 'hosam ayoub', true),
    ('c7f2b17b-9e41-421a-bb0b-eadbaee5afde', 'Reem alkshki', true),
    ('2320f139-c909-4604-8778-f22f00eb689d', 'Arwa Mohammed', true),
    ('4b022614-ffe5-4543-8867-2b73e5b1ba97', 'yousef alkshke', true),
    ('00000000-0000-0000-0000-0000000000e1', 'Emp One', false),
    ('00000000-0000-0000-0000-0000000000e2', 'Emp Two', false),
    ('00000000-0000-0000-0000-0000000000e3', 'Emp Three', false);
  insert into payroll_runs (id, period_year, period_month, status, employee_count, total_net_usd) values
    ('00000000-0000-0000-0000-00000000a001', 2026, 10, 'draft', 0, 0),      -- operational draft
    ('00000000-0000-0000-0000-00000000a002', 2026, 9,  'draft', 0, 0),      -- historical draft (must stay untouched)
    ('00000000-0000-0000-0000-00000000a003', 2026, 10, 'finalized', 7, 7);  -- closed run (trigger must not touch)
`);
const q = async (sql) => (await db.query(sql)).rows;
const tryQ = async (sql) => { try { await db.exec(sql); return null; } catch (e) { return String(e.message || e); } };
const OCT = '00000000-0000-0000-0000-00000000a001';
const SEP = '00000000-0000-0000-0000-00000000a002';
const hdr = async (id) => (await q(`select employee_count c, total_net_usd::float t from payroll_runs where id='${id}'`))[0];
const ins = (run, emp, net, extra = '') => `insert into payroll_entries (run_id, employee_id, source, base_salary_usd, net_salary_usd${extra ? ', ' + extra.split('|')[0] : ''}) values ('${run}', '${emp}', 'auto', ${net}, ${net}${extra ? ', ' + extra.split('|')[1] : ''});`;
const E1 = '00000000-0000-0000-0000-0000000000e1', E2 = '00000000-0000-0000-0000-0000000000e2', E3 = '00000000-0000-0000-0000-0000000000e3';

// ── apply ────────────────────────────────────────────────
ok(await tryQ(migration) === null, 'migration applies cleanly');

// 1) reasons
const reasons = await q(`select employee_name n, payroll_excluded_reason r from profiles where payroll_excluded order by 1`);
ok(reasons.length === 4 && reasons.every((x) => x.r), 'all 4 excluded profiles received a reason');
ok(reasons.find((x) => x.n === 'hosam ayoub').r === 'owner/no salary', 'owner reason is "owner/no salary"');
ok(/UAE sponsor/.test(reasons.find((x) => x.n === 'Reem alkshki').r) && /Reem \(UAE\)/.test(reasons.find((x) => x.n === 'Arwa Mohammed').r), 'Reem = UAE sponsor, Arwa = paid by Reem');
ok((await tryQ(`update profiles set payroll_excluded=true where id='${E1}'`)) !== null, 'excluding someone WITHOUT a reason is rejected');
ok((await tryQ(`update profiles set payroll_excluded=true, payroll_excluded_reason='   ' where id='${E1}'`)) !== null, 'a blank reason is rejected');
ok((await tryQ(`update profiles set payroll_excluded=true, payroll_excluded_reason='test' where id='${E3}'`)) === null, 'excluding WITH a reason is accepted');
await db.exec(`update profiles set payroll_excluded=false, payroll_excluded_reason=null where id='${E3}'`);

// 2) atomic header sync on the operational draft
await db.exec(ins(OCT, E1, 100) + ins(OCT, E2, 200.5));
let h = await hdr(OCT);
ok(h.c === 2 && h.t === 300.5, `header follows inserts (got ${h.c}/${h.t})`);
await db.exec(`update payroll_entries set net_salary_usd=150, base_salary_usd=150 where run_id='${OCT}' and employee_id='${E1}'`);
h = await hdr(OCT);
ok(h.c === 2 && h.t === 350.5, `header follows an update (got ${h.c}/${h.t})`);
await db.exec(`delete from payroll_entries where run_id='${OCT}' and employee_id='${E2}'`);
h = await hdr(OCT);
ok(h.c === 1 && h.t === 150, `header follows a delete (got ${h.c}/${h.t})`);
// a failing statement must leave NO half-updated header (atomic)
await tryQ(`begin; ${ins(OCT, E3, 40)} insert into payroll_entries (run_id, employee_id, source, net_salary_usd) values ('${OCT}', '${E3}', 'auto', 1); commit;`);
await db.exec('rollback').catch(() => {});
h = await hdr(OCT);
ok(h.c === 1 && h.t === 150, `a failed batch leaves the header untouched (got ${h.c}/${h.t})`);

// 3) historical and closed runs are never touched
await db.exec(ins(SEP, E1, 999));
h = await hdr(SEP);
ok(h.c === 0 && h.t === 0, `historical (Sept 2026) draft header untouched by the trigger (got ${h.c}/${h.t})`);
await db.exec(ins('00000000-0000-0000-0000-00000000a003', E1, 5));
h = await hdr('00000000-0000-0000-0000-00000000a003');
ok(h.c === 7 && h.t === 7, 'a finalized run header is never rewritten by the trigger');

// 4) gate: consistent run closes
await db.exec(`insert into payroll_entries (run_id, employee_id, source, base_salary_usd, allowances_usd, net_salary_usd, allowances_detail) values ('${OCT}', '${E2}', 'auto', 200, 57.25, 257.25, '[{"kind":"food","usd":57.25}]')`);
await db.exec(`insert into payroll_entries (run_id, employee_id, source, base_salary_usd, net_salary_usd) values ('${OCT}', '${E3}', 'manual', 25, 25)`);
h = await hdr(OCT);
ok(h.c === 3 && Math.abs(h.t - 432.25) < 0.001, `3 lines, 432.25 (got ${h.c}/${h.t})`);

const reset = async () => db.exec(`update payroll_runs set status='draft' where id='${OCT}'`).catch(() => {});
const close = () => tryQ(`update payroll_runs set status='finalized' where id='${OCT}'`);

// (a) header drift (simulate a disabled trigger / tampering)
await db.exec(`alter table payroll_entries disable trigger payroll_entries_sync_run_summary`);
await db.exec(`update payroll_entries set net_salary_usd=300, base_salary_usd=300 where run_id='${OCT}' and employee_id='${E1}'`);
await db.exec(`alter table payroll_entries enable trigger payroll_entries_sync_run_summary`);
let err = await close();
ok(err && /ملخص الدورة لا يطابق القيود/.test(err), 'gate (a): header ≠ entries blocks closing: ' + err);
await db.exec(`update payroll_entries set net_salary_usd=150, base_salary_usd=150 where run_id='${OCT}' and employee_id='${E1}'`); // trigger re-syncs
h = await hdr(OCT);
ok(h.c === 3 && Math.abs(h.t - 432.25) < 0.001, 'header resynced after the entry is corrected');

// (b) excluded person holds an entry
await db.exec(`insert into payroll_entries (run_id, employee_id, source, base_salary_usd, net_salary_usd) values ('${OCT}', 'a68d72e4-8c88-4554-a8c4-70f5ac813a20', 'manual', 10, 10)`);
err = await close();
ok(err && /مستبعدين من الرواتب \(hosam ayoub\)/.test(err), 'gate (b): an entry of an excluded person blocks closing: ' + err);
await db.exec(`delete from payroll_entries where employee_id='a68d72e4-8c88-4554-a8c4-70f5ac813a20'`);

// (c) net does not re-add
await db.exec(`update payroll_entries set net_salary_usd=999 where run_id='${OCT}' and employee_id='${E1}'`);
err = await close();
ok(err && /صافيه لا يساوي مجموع مكوناته/.test(err), 'gate (c): net ≠ components blocks closing: ' + err);
await db.exec(`update payroll_entries set net_salary_usd=150 where run_id='${OCT}' and employee_id='${E1}'`);

// (d) automatic entry whose allowances_usd disagrees with its breakdown
await db.exec(`update payroll_entries set allowances_usd=10, net_salary_usd=210 where run_id='${OCT}' and employee_id='${E2}'`);
err = await close();
ok(err && /بدلاته لا تطابق تفصيل البدلات/.test(err), 'gate (d): allowances ≠ breakdown blocks closing: ' + err);
await db.exec(`update payroll_entries set allowances_usd=57.25, net_salary_usd=257.25 where run_id='${OCT}' and employee_id='${E2}'`);

// all clean → closes
err = await close();
ok(err === null, 'a consistent run closes: ' + err);
ok((await q(`select status s from payroll_runs where id='${OCT}'`))[0].s === 'finalized', 'status is finalized');
await reset();

// historical draft is not policed by this gate (the app/DB lock owns that)
ok(await tryQ(`update payroll_runs set status='finalized' where id='${SEP}'`) === null, 'gate ignores historical periods');

// ── rollback ───────────────────────────────────────────
ok(await tryQ(rollback) === null, 'rollback applies cleanly');
const left = await q(`select (select count(*) from pg_trigger where tgname in ('payroll_entries_sync_run_summary','payroll_runs_zz_consistency_gate')) trg,
  (select count(*) from information_schema.columns where table_name='payroll_entries' and column_name='allowances_detail') col1,
  (select count(*) from information_schema.columns where table_name='profiles' and column_name='payroll_excluded_reason') col2`);
ok(left[0].trg === 0 && left[0].col1 === 0 && left[0].col2 === 0, 'rollback removes triggers and both columns');
ok((await q(`select count(*)::int n from payroll_entries`))[0].n >= 5, 'rollback keeps every entry row');

console.log(`payroll Oct rules SQL (PGlite): ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
