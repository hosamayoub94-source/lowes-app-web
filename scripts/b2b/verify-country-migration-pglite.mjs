/* eslint-env node */
// D-119 — local verification of migration 20261008_b2b_leads_country.sql on an in-memory Postgres (PGlite). Touches NO real database.
// Builds syria_b2b_leads from the real earlier migrations + the real Syria online batch, adds fake physical rows,
// then proves: Syria data byte-identical (count + fingerprint, same query as supabase/tests/b2b_leads_country_verify.sql),
// every old row = 'SY', idempotent, RLS keeps the browser on Syria rows only, the rollback guard and a clean rollback.
// usage (from repo root):  npm i --no-save @electric-sql/pglite  &&  node scripts/b2b/verify-country-migration-pglite.mjs
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';

const read = (f) => fs.readFileSync(f, 'utf8');
let fails = 0;
const ok = (n, c, extra = '') => { console.log(c ? 'ok  ' : 'FAIL', n, extra); if (!c) fails++; };
const db = new PGlite();
await db.exec('CREATE ROLE anon; CREATE ROLE authenticated;');

for (const f of ['20260912_syria_b2b_leads.sql', '20260912020000_syria_leads_manual_entry.sql', '20260925151312_b2b_online_stores.sql']) {
  await db.exec(read(`supabase/migrations/${f}`));
}
await db.exec(read('supabase/data/20260925_online_stores_batch1.sql'));
// fake physical rows (clearly fake) incl. team-edited fields, so the fingerprint covers them too
await db.exec(`
  INSERT INTO syria_b2b_leads (id, province, city, name, category, phone, priority, score, status, notes, status_updated_by, status_updated_at, added_manually, added_by)
  VALUES ('SYR-TST-0001','Damascus','دمشق','صيدلية وهمية للاختبار','صيدلية','0999000001','B',55,'contacted','ملاحظة وهمية','Fake Staff', now(), true, 'Fake Staff'),
         ('SYR-TST-0002','Aleppo',null,'Fake Clinic','عيادة جلدية',null,'D',10,'not_contacted',null,null,null,false,null);
  GRANT SELECT, INSERT, UPDATE, DELETE ON syria_b2b_leads TO anon, authenticated;
`);

const verify = read('supabase/tests/b2b_leads_country_verify.sql');
const blockA = verify.slice(verify.indexOf('SELECT count(*) AS syria_rows'), verify.indexOf('-- ── B.'));
const fp = async () => (await db.query(blockA)).rows[0];
const before = await fp();
ok('baseline Syria rows', before.syria_rows > 40, JSON.stringify(before));

const mig = read('supabase/migrations/20261008_b2b_leads_country.sql');
await db.exec(mig);
const after = await fp();
ok('Syria count unchanged', Number(after.syria_rows) === Number(before.syria_rows));
ok('Syria fingerprint unchanged (every old column, every row)', after.syria_fingerprint === before.syria_fingerprint, after.syria_fingerprint);
const dist = (await db.query(`SELECT count(*) FILTER (WHERE country='SY')::int sy, count(*)::int total FROM syria_b2b_leads`)).rows[0];
ok('every existing row reads SY', dist.sy === dist.total, JSON.stringify(dist));
await db.exec(mig);
ok('migration is idempotent (2nd run)', (await fp()).syria_fingerprint === before.syria_fingerprint);

const err = async (sql) => { try { await db.exec(sql); return null; } catch (e) { return e.message; } };
ok('country CHECK refuses lower-case', !!(await err(`INSERT INTO syria_b2b_leads (id, province, name, country) VALUES ('X1','Dubai','x','ae')`)));
ok('presence accepts unverified', !(await err(`INSERT INTO syria_b2b_leads (id, province, name, country, lowes_presence) VALUES ('UAE-TST-1','Dubai','Fake UAE Row','AE','unverified')`)));
ok('presence still refuses junk', !!(await err(`INSERT INTO syria_b2b_leads (id, province, name, lowes_presence) VALUES ('X2','Damascus','x','maybe')`)));
ok('website stays unique across countries', !!(await err(`INSERT INTO syria_b2b_leads (id, province, name, country, website) SELECT 'UAE-TST-2','Dubai','dup','AE', website FROM syria_b2b_leads WHERE website IS NOT NULL LIMIT 1`)));
const def = (await db.query(`INSERT INTO syria_b2b_leads (id, province, name) VALUES ('SYR-TST-NEW','Homs','Fake Default Row') RETURNING country`)).rows[0];
ok('insert without country (old screen / weekly task) -> SY', def.country === 'SY');
await db.exec(`DELETE FROM syria_b2b_leads WHERE id = 'SYR-TST-NEW'`);

// RLS: the browser (anon / authenticated) sees and writes Syria rows only
for (const role of ['anon', 'authenticated']) {
  await db.exec(`SET ROLE ${role}`);
  const seen = (await db.query(`SELECT count(*) FILTER (WHERE country='SY')::int sy, count(*) FILTER (WHERE country<>'SY')::int other FROM syria_b2b_leads`)).rows[0];
  ok(`${role}: sees all Syria rows`, seen.sy === dist.total, JSON.stringify(seen));
  ok(`${role}: sees zero UAE rows`, seen.other === 0);
  ok(`${role}: cannot insert a UAE row`, !!(await err(`INSERT INTO syria_b2b_leads (id, province, name, country) VALUES ('UAE-X-${role}','Dubai','x','AE')`)));
  const upd = await db.query(`UPDATE syria_b2b_leads SET notes = 'hack' WHERE country = 'AE' RETURNING id`);
  ok(`${role}: cannot update a UAE row`, upd.rows.length === 0);
  ok(`${role}: cannot move a Syria row to AE`, !!(await err(`UPDATE syria_b2b_leads SET country = 'AE' WHERE id = 'SYR-TST-0002'`)));
  const sy = await db.query(`UPDATE syria_b2b_leads SET notes = notes WHERE id = 'SYR-TST-0001' RETURNING id`);
  ok(`${role}: Syria update path still works`, sy.rows.length === 1);
  await db.exec('RESET ROLE');
}
// a UAE row exists now, so fingerprint Syria rows only (block A + WHERE country = 'SY', as documented in the verify file)
const fpSy = async () => (await db.query(blockA.replace(/FROM syria_b2b_leads\s*\) t;/, "FROM syria_b2b_leads WHERE country = 'SY'\n) t;"))).rows[0];
ok('Syria fingerprint unchanged after RLS checks (UAE row present)', (await fpSy()).syria_fingerprint === before.syria_fingerprint);

// Rollback: refused while non-SY rows exist, then restores the exact original state
const rb = read('supabase/rollbacks/20261008_b2b_leads_country_rollback.sql');
ok('rollback refuses while UAE rows exist', /non-SY rows exist/.test((await err(rb)) || ''));
await db.exec(`DELETE FROM syria_b2b_leads WHERE country <> 'SY'`);
ok('rollback runs once UAE rows are removed', !(await err(rb)));
const cols = (await db.query(`SELECT count(*)::int n FROM information_schema.columns WHERE table_name='syria_b2b_leads' AND column_name='country'`)).rows[0].n;
const pol = (await db.query(`SELECT polname FROM pg_policy WHERE polrelid='syria_b2b_leads'::regclass`)).rows.map((x) => x.polname);
ok('rollback: column gone, original policy back', cols === 0 && pol.length === 1 && pol[0] === 'syria_leads_all', JSON.stringify(pol));
ok('rollback: Syria fingerprint identical to the start', (await fp()).syria_fingerprint === before.syria_fingerprint);

console.log(fails ? `\n${fails} FAILED` : '\nall migration checks passed');
process.exit(fails ? 1 : 0);
