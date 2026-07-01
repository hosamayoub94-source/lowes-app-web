// =============================================================
// Apply + verify the payroll-engine migration.
//   node scripts/apply-payroll-engine-migration.cjs
// Needs SUPABASE_SERVICE_ROLE in env (used as pooler password).
// The migration is additive & idempotent (ADD COLUMN IF NOT EXISTS
// + GRANT) — safe to re-run, mutates no data.
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

const SQL = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '20260701_payroll_engine.sql'), 'utf8');

// Columns we expect to exist after applying
const EXPECT = {
  profiles: ['salary_currency', 'seller_alias'],
  payroll_entries: ['currency', 'allowances_usd', 'commission_usd', 'commission_pct',
                    'sales_total_usd', 'sales_orders_count', 'absence_deduction_usd', 'source', 'computed_at'],
  payroll_runs: ['currency'],
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

  console.log('\n→ Verifying columns exist:');
  for (const [table, cols] of Object.entries(EXPECT)) {
    const { rows } = await client.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema='public' AND table_name=$1`, [table]);
    const have = new Set(rows.map(r => r.column_name));
    for (const col of cols) {
      const ok = have.has(col);
      if (!ok) fails++;
      console.log(`   ${ok ? '✅' : '❌'} ${table}.${col}`);
    }
  }

  console.log('\n→ Verifying profiles column grants (anon must SELECT new cols):');
  const grantRes = await client.query(
    `SELECT column_name, privilege_type, grantee
       FROM information_schema.column_privileges
      WHERE table_schema='public' AND table_name='profiles'
        AND column_name IN ('salary_currency','seller_alias')
        AND grantee IN ('anon','authenticated')
      ORDER BY column_name, grantee, privilege_type`);
  for (const r of grantRes.rows) {
    console.log(`   ✅ ${r.column_name} → ${r.privilege_type} to ${r.grantee}`);
  }
  const anonSel = grantRes.rows.filter(r => r.grantee === 'anon' && r.privilege_type === 'SELECT').length;
  if (anonSel < 2) { fails++; console.log('   ❌ anon SELECT grant missing on one or more new columns'); }

  await client.end();
  console.log(`\n${fails === 0 ? '🎉 ALL CHECKS PASSED' : `❌ ${fails} CHECK(S) FAILED`}`);
  process.exit(fails === 0 ? 0 : 1);
}
main().catch(e => { console.error(e); process.exit(1); });
