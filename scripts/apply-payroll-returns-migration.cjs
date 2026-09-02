// =============================================================
// Apply + verify the payroll returns/target-engine migration.
//   node scripts/apply-payroll-returns-migration.cjs
// Needs SUPABASE_SERVICE_ROLE in env (used as pooler password).
// The migration is additive & idempotent (ADD COLUMN IF NOT EXISTS) —
// safe to re-run, mutates no data.
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

const SQL = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '20260830_payroll_returns_engine.sql'), 'utf8');

const EXPECT = {
  payroll_runs: ['target_syria_usd', 'target_turkey_try', 'above_target_pct_syria', 'above_target_pct_turkey',
                 'rate_usd_try', 'rate_usd_syp', 'month_setup_confirmed_at', 'month_setup_confirmed_by',
                 'archived_at', 'finalized_by', 'finalized_at'],
  payroll_entries: ['team', 'salary_source', 'target_currency', 'target_local', 'sales_local', 'sales_avg_local',
                     'returns_count', 'returns_allowed', 'returns_excess', 'return_deduction_local',
                     'increase_local', 'adjusted_increase_local', 'shortfall_local', 'shortfall_deduction_usd'],
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

  await client.end();
  console.log(`\n${fails === 0 ? '🎉 ALL CHECKS PASSED' : `❌ ${fails} CHECK(S) FAILED`}`);
  process.exit(fails === 0 ? 0 : 1);
}
main().catch(e => { console.error(e); process.exit(1); });
