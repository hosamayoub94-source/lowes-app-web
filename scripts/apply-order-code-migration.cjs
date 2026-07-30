// =============================================================
// Apply + verify the sequential order-code migration.
//   node scripts/apply-order-code-migration.cjs
// Needs SUPABASE_SERVICE_ROLE in env (used as pooler password).
// Verification inserts are wrapped in BEGIN/ROLLBACK — nothing persists,
// so the live counters are NOT consumed by the test.
// =============================================================
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SERVICE_ROLE) { console.error('❌ SUPABASE_SERVICE_ROLE env var required.'); process.exit(1); }
const REF = 'fghdumrgimoeqsafdhhh';

const CONFIGS = [
  { host: 'aws-0-ap-northeast-1.pooler.supabase.com', port: 5432, database: 'postgres', user: `postgres.${REF}`, password: SERVICE_ROLE, ssl: { rejectUnauthorized: false } },
  { host: 'aws-0-ap-northeast-1.pooler.supabase.com', port: 6543, database: 'postgres', user: `postgres.${REF}`, password: SERVICE_ROLE, ssl: { rejectUnauthorized: false } },
  { host: `db.${REF}.supabase.co`, port: 5432, database: 'postgres', user: 'postgres', password: SERVICE_ROLE, ssl: { rejectUnauthorized: false } },
];

const SQL = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '20260622_order_code_sequential.sql'), 'utf8');

const EXPECT = { // team -> prefix (sanity)
  'turkey:lowes': 'TL-', 'turkey:strong': 'TS-', 'syria:lowes': 'SL-', 'syria:strong': 'SS-',
};

async function connect() {
  for (const cfg of CONFIGS) {
    const c = new Client({ ...cfg, connectionTimeoutMillis: 8000 });
    try { await c.connect(); console.log(`✅ Connected (${cfg.host}:${cfg.port})`); return c; }
    catch (e) { console.log(`⚠️  ${cfg.host}:${cfg.port} → ${e.message}`); try { await c.end(); } catch {} }
  }
  return null;
}

async function main() {
  const client = await connect();
  if (!client) { console.error('❌ Could not connect.'); process.exit(1); }
  let fails = 0;

  console.log('\n→ Applying migration…');
  await client.query(SQL);
  console.log('  ✅ applied');

  console.log('\n→ Seeded counters:');
  const counters = await client.query('SELECT team, prefix, seq FROM order_code_counters ORDER BY team');
  for (const r of counters.rows) {
    const ok = EXPECT[r.team] === r.prefix;
    if (!ok) fails++;
    console.log(`   ${ok ? '✅' : '❌'} ${r.team.padEnd(14)} prefix=${r.prefix.padEnd(4)} seq=${r.seq}`);
  }

  console.log('\n→ Trigger test (BEGIN…ROLLBACK, nothing persists):');
  const teams = [['turkey', 'lowes'], ['turkey', 'strong'], ['syria', 'lowes'], ['syria', 'strong']];
  for (const [market, brand] of teams) {
    await client.query('BEGIN');
    try {
      const before = await client.query('SELECT seq FROM order_code_counters WHERE team=$1', [`${market}:${brand}`]);
      const expSeq = Number(before.rows[0].seq) + 1;
      const expCode = `${EXPECT[`${market}:${brand}`]}${expSeq}`;
      const ins = await client.query(
        `INSERT INTO orders (market, brand, customer_name, order_id) VALUES ($1,$2,'__TRIGGER_TEST__','') RETURNING order_id`,
        [market, brand]
      );
      const got = ins.rows[0].order_id;
      const ok = got === expCode;
      if (!ok) fails++;
      console.log(`   ${ok ? '✅' : '❌'} ${market}:${brand.padEnd(6)} → ${got}   (expected ${expCode})`);
    } catch (e) {
      fails++; console.log(`   ❌ ${market}:${brand} insert errored: ${e.message}`);
    } finally {
      await client.query('ROLLBACK');
    }
  }

  console.log('\n→ Sequentiality test (two inserts in one tx, then rollback):');
  await client.query('BEGIN');
  try {
    const a = await client.query(`INSERT INTO orders (market, brand, customer_name) VALUES ('turkey','lowes','__T1__') RETURNING order_id`);
    const b = await client.query(`INSERT INTO orders (market, brand, customer_name) VALUES ('turkey','lowes','__T2__') RETURNING order_id`);
    const na = Number(a.rows[0].order_id.replace(/\D/g, ''));
    const nb = Number(b.rows[0].order_id.replace(/\D/g, ''));
    const ok = nb === na + 1;
    if (!ok) fails++;
    console.log(`   ${ok ? '✅' : '❌'} consecutive: ${a.rows[0].order_id} then ${b.rows[0].order_id} (Δ=${nb - na})`);
  } catch (e) { fails++; console.log(`   ❌ ${e.message}`); } finally { await client.query('ROLLBACK'); }

  console.log('\n→ Pass-through test (provided order_id must stay untouched):');
  await client.query('BEGIN');
  try {
    const r = await client.query(`INSERT INTO orders (market, brand, customer_name, order_id) VALUES ('turkey','lowes','__PT__','ARC-T-999999') RETURNING order_id`);
    const ok = r.rows[0].order_id === 'ARC-T-999999';
    if (!ok) fails++;
    console.log(`   ${ok ? '✅' : '❌'} provided code kept: ${r.rows[0].order_id}`);
  } catch (e) { fails++; console.log(`   ❌ ${e.message}`); } finally { await client.query('ROLLBACK'); }

  await client.end();
  console.log(`\n${fails === 0 ? '🎉 ALL CHECKS PASSED' : `❌ ${fails} CHECK(S) FAILED`}`);
  process.exit(fails === 0 ? 0 : 1);
}
main().catch(e => { console.error(e); process.exit(1); });
