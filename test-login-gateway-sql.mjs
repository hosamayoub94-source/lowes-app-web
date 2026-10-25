/* global process */
// Runs the REAL docs/security/proposed/20261027_login_gateway.sql (+ rollback) on PGlite with pgcrypto and an auth.users stand-in.
// Proves: the secret store is invisible to API roles, the limiter blocks the (limit+1)th attempt per account and per source, windows reset,
// hashes are validated, only service_role can call it, and auth_password_matches compares bcrypt hashes without ever returning one.
// run: node test-login-gateway-sql.mjs
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { readFileSync } from 'node:fs';

let pass = 0; let fail = 0;
const ok = (c, m) => { if (c) pass += 1; else { fail += 1; console.error('FAIL', m); } };
const up = readFileSync('docs/security/proposed/20261027_login_gateway.sql', 'utf8');
const down = readFileSync('docs/security/proposed/20261027_login_gateway_rollback.sql', 'utf8');

const db = new PGlite({ extensions: { pgcrypto } });
await db.exec(`
  create extension if not exists pgcrypto;
  create role anon nologin; create role authenticated nologin; create role service_role nologin;
  grant usage on schema public to anon, authenticated, service_role;
  create schema auth;
  create table auth.users (id uuid primary key, encrypted_password text);
  insert into auth.users values ('00000000-0000-0000-0000-000000000001', crypt('lp:1234', gen_salt('bf', 10))),
                                ('00000000-0000-0000-0000-000000000002', ''),
                                ('00000000-0000-0000-0000-000000000003', null);
`);
await db.exec(up);

const as = async (role, sql) => {
  await db.exec('begin');
  try { await db.exec(`set local role ${role}`); const r = await db.query(sql); await db.exec('rollback'); return { ok: true, rows: r.rows }; }
  catch (e) { await db.exec('rollback'); return { ok: false, err: String(e.message || e) }; }
};
const H = (c) => c.repeat(64);

// ── secret store ──
const seeds = (await db.query('select name, length(secret) l from public.internal_secrets order by name')).rows;
const names = seeds.map((s) => s.name).join(',');
ok(names === 'auth_mode,auth_pw_pepper,pin_rate_pepper,pin_rl_account_max,pin_rl_source_max,pin_rl_window_s', `seeded rows: ${names}`);
ok(seeds.find((s) => s.name === 'pin_rate_pepper').l >= 32 && seeds.find((s) => s.name === 'auth_pw_pepper').l >= 32, 'peppers are >= 32 chars');
ok((await db.query("select secret from internal_secrets where name='auth_mode'")).rows[0].secret === 'compat', 'default mode is compat');
const peppers = (await db.query("select secret from internal_secrets where name like '%pepper'")).rows.map((r) => r.secret);
ok(peppers[0] !== peppers[1], 'the two peppers differ');
for (const role of ['anon', 'authenticated']) {
  ok(!(await as(role, 'select * from public.internal_secrets')).ok, `${role} cannot read internal_secrets`);
  ok(!(await as(role, "update public.internal_secrets set secret='derived' where name='auth_mode'")).ok, `${role} cannot flip auth_mode`);
}

// ── limiter ──
const lim = (role, a, s, w = 600, al = 3, sl = 5) => as(role, `select public.consume_pin_attempt_rate_limit('${a}','${s}',${w},${al},${sl}) ok`);
await db.exec('grant select on all tables in schema public to service_role');
{
  const res = [];
  for (let i = 0; i < 5; i++) res.push((await db.query(`select public.consume_pin_attempt_rate_limit('${H('a')}','${H('1')}',600,3,100) ok`)).rows[0].ok);
  ok(JSON.stringify(res) === JSON.stringify([true, true, true, false, false]), 'account limit 3: 4th and 5th attempts blocked');
  const other = (await db.query(`select public.consume_pin_attempt_rate_limit('${H('b')}','${H('1')}',600,3,100) ok`)).rows[0].ok;
  ok(other === true, 'a different account from the same source is not blocked by the first account');
}
{
  const out = [];
  for (let i = 0; i < 7; i++) {
    const acct = (i.toString(16)).padStart(64, 'e');
    out.push((await db.query(`select public.consume_pin_attempt_rate_limit('${acct}','${H('4')}',600,1000,5) ok`)).rows[0].ok);
  }
  ok(JSON.stringify(out) === JSON.stringify([true, true, true, true, true, false, false]), 'source limit 5 across different accounts: 6th attempt blocked');
}
ok((await lim('anon', H('a'), H('1'))).ok === false, 'anon cannot call the limiter');
ok((await lim('authenticated', H('a'), H('1'))).ok === false, 'authenticated cannot call the limiter');
ok((await lim('service_role', H('d'), H('5'))).ok === true, 'service_role can call it');
for (const [label, sql] of [['short hash', "select public.consume_pin_attempt_rate_limit('abc','abc',600,3,5)"],
  ['uppercase / non-hex', `select public.consume_pin_attempt_rate_limit('${'Z'.repeat(64)}','${H('1')}',600,3,5)`],
  ['window 0', `select public.consume_pin_attempt_rate_limit('${H('1')}','${H('1')}',0,3,5)`],
  ['limit 0', `select public.consume_pin_attempt_rate_limit('${H('1')}','${H('1')}',600,0,5)`],
  ['null hash', `select public.consume_pin_attempt_rate_limit(null,'${H('1')}',600,3,5)`]]) {
  let err = null; try { await db.query(sql); } catch (e) { err = String(e.message); }
  ok(!!err, `limiter rejects ${label}`);
}
// window reset: rewind the stored window and the counter starts again
await db.exec(`update private.pin_login_rate_limit_buckets set window_start = window_start - interval '2 hours' where scope='account' and key_hash='${H('a')}'`);
ok((await db.query(`select public.consume_pin_attempt_rate_limit('${H('a')}','${H('9')}',600,3,100) ok`)).rows[0].ok === true, 'a new window starts counting from 1 again');
ok((await db.query("select count(*)::int n from private.pin_login_rate_limit_buckets where key_hash !~ '^[0-9a-f]{64}$'")).rows[0].n === 0, 'only 64-hex hashes are stored (no names / addresses)');
ok(!(await as('authenticated', 'select * from private.pin_login_rate_limit_buckets')).ok, 'authenticated cannot read the bucket table');

// ── auth_password_matches ──
const m = (u, c, role = 'service_role') => as(role, `select public.auth_password_matches('${u}','${c}') v`);
const U1 = '00000000-0000-0000-0000-000000000001'; const U2 = '00000000-0000-0000-0000-000000000002'; const U3 = '00000000-0000-0000-0000-000000000003';
ok((await m(U1, 'lp:1234')).rows[0].v === true, 'matches the right password');
ok((await m(U1, 'lp:1235')).rows[0].v === false, 'rejects a near miss');
ok((await m(U1, '')).rows[0].v === false, 'rejects empty');
ok((await m(U2, 'lp:1234')).rows[0].v === false && (await m(U3, 'x')).rows[0].v === false, 'empty / null stored hash never matches');
ok((await m('00000000-0000-0000-0000-0000000000ff', 'x')).rows[0].v === false, 'unknown user -> false');
ok(!(await m(U1, 'lp:1234', 'anon')).ok && !(await m(U1, 'lp:1234', 'authenticated')).ok, 'only service_role may call auth_password_matches (it is an oracle)');

// ── rollback ──
await db.exec(down);
const left = (await db.query("select (select count(*) from pg_proc where proname in ('consume_pin_attempt_rate_limit','auth_password_matches'))::int f, (select to_regclass('public.internal_secrets') is not null) t, (select to_regclass('private.pin_login_rate_limit_buckets') is not null) b")).rows[0];
ok(left.f === 0 && !left.t && !left.b, 'rollback removes functions and tables');

console.log(`\n${pass} passed, ${fail} failed`);
await db.close();
process.exit(fail ? 1 : 0);
