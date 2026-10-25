/* global process */
// Runs the REAL docs/security/proposed/20261026_cron_service_key_calls.sql on PGlite with mocked cron / vault / net schemas.
// run: node test-cron-service-key-sql.mjs
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

let pass = 0; let fail = 0;
const ok = (c, m) => { if (c) pass += 1; else { fail += 1; console.error('FAIL', m); } };
const up = readFileSync('docs/security/proposed/20261026_cron_service_key_calls.sql', 'utf8');
const VAULT_VALUE = 'vault-service-value-for-tests';

const db = new PGlite();
await db.exec(`
  create role anon nologin; create role authenticated nologin;
  create schema cron; create schema vault; create schema net;
  create table cron.job (jobid serial primary key, jobname text, schedule text, command text);
  create function cron.alter_job(job_id int, command text) returns void language sql as $$ update cron.job set command = alter_job.command where jobid = job_id $$;
  insert into cron.job(jobname, schedule, command) values
    ('lozy-kpi-coach-daily','0 6 * * *','OLD select net.http_post(public key)'),
    ('daily-analytics-snapshot','55 23 * * *','OLD select net.http_post(public key)'),
    ('shift-report-reminder','*/5 * * * *','OLD select net.http_post(no auth)'),
    ('track-yurtici-30min','*/30 * * * *','UNCHANGED');
  create table vault.secrets_t (name text, decrypted_secret text);
  create view vault.decrypted_secrets as select name, decrypted_secret from vault.secrets_t;
  insert into vault.secrets_t values ('app_service_role_key', '${VAULT_VALUE}');
  create table net.posts (url text, headers jsonb, body jsonb, timeout_ms int);
  create function net.http_post(url text, headers jsonb default '{}', body jsonb default '{}', timeout_milliseconds int default 5000) returns bigint language plpgsql as $$
    begin insert into net.posts values (url, headers, body, timeout_milliseconds); return 1; end $$;
  create function public.run_quiz_generation() returns void language sql as $$ select 1 $$;
`);
await db.exec(up);

const posts = async () => (await db.query('select * from net.posts')).rows;
const jobs = Object.fromEntries((await db.query('select jobname, command from cron.job')).rows.map((r) => [r.jobname, r.command]));

ok(jobs['lozy-kpi-coach-daily'] === "select public.run_cron_function('lozy-kpi-coach')", 'lozy job now calls the helper');
ok(jobs['daily-analytics-snapshot'] === "select public.run_cron_function('daily-analytics-snapshot')", 'analytics job now calls the helper');
ok(jobs['shift-report-reminder'] === "select public.run_cron_function('shift-report-reminder')", 'reminder job now calls the helper (was credential-less)');
ok(jobs['track-yurtici-30min'] === 'UNCHANGED', 'other jobs untouched');

await db.exec("select public.run_cron_function('lozy-kpi-coach')");
await db.exec('select public.run_quiz_generation()');
const p = await posts();
ok(p.length === 2, 'two posts made');
ok(p[0].url === 'https://fghdumrgimoeqsafdhhh.supabase.co/functions/v1/lozy-kpi-coach', 'url built from slug');
ok(p[0].headers.Authorization === `Bearer ${VAULT_VALUE}`, 'Authorization carries the vault service key');
ok(p[1].url.endsWith('/functions/v1/generate-quiz') && p[1].timeout_ms === 120000, 'run_quiz_generation delegates with a longer timeout');

// missing vault secret: warn and do nothing (never send an empty credential)
await db.exec("delete from vault.secrets_t where name = 'app_service_role_key'");
await db.exec('delete from net.posts');
await db.exec("select public.run_cron_function('lozy-kpi-coach')");
ok((await posts()).length === 0, 'no vault secret -> no request');
await db.exec(`insert into vault.secrets_t values ('app_service_role_key', '${VAULT_VALUE}')`);

// slug validation (no path/URL injection)
for (const bad of ['../x', 'a/b', 'A B', "x'; drop table net.posts; --", '', null]) {
  let err = null; try { await db.query('select public.run_cron_function($1)', [bad]); } catch (e) { err = String(e.message || e); }
  ok(err && /invalid function slug/.test(err), `rejects slug ${JSON.stringify(bad)}`);
}

// API roles cannot call the helper
for (const role of ['anon', 'authenticated']) {
  await db.exec('begin');
  let err = null;
  try { await db.exec(`set local role ${role}`); await db.exec("select public.run_cron_function('lozy-kpi-coach')"); } catch (e) { err = String(e.message || e); }
  await db.exec('rollback');
  ok(err && /permission denied/.test(err), `${role} cannot execute run_cron_function`);
}

console.log(`\n${pass} passed, ${fail} failed`);
await db.close();
process.exit(fail ? 1 : 0);
