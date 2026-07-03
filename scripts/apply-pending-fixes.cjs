// =============================================================
// apply-pending-fixes.cjs — RLS CRM unlock + orders indexes
// Usage: double-click run-pending-fixes.bat  (or: node scripts/apply-pending-fixes.cjs)
// =============================================================
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// ── Load .env ─────────────────────────────────────────────────
const envPath = path.join(__dirname, '..', '.env');
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.+)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SERVICE_ROLE) { console.error('No service_role key in .env'); process.exit(1); }

const REF = 'fghdumrgimoeqsafdhhh';
const CONFIGS = [
  { host: 'aws-0-ap-northeast-1.pooler.supabase.com', port: 5432, database: 'postgres', user: `postgres.${REF}`, password: SERVICE_ROLE, ssl: { rejectUnauthorized: false } },
  { host: 'aws-0-ap-northeast-1.pooler.supabase.com', port: 6543, database: 'postgres', user: `postgres.${REF}`, password: SERVICE_ROLE, ssl: { rejectUnauthorized: false } },
  { host: `db.${REF}.supabase.co`, port: 5432, database: 'postgres', user: 'postgres', password: SERVICE_ROLE, ssl: { rejectUnauthorized: false } },
];

// ── SQL ───────────────────────────────────────────────────────
const RLS_SQL = `
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'pipelines','pipeline_stages','deals','leads','customers',
    'followups','deal_activities','customer_contacts',
    'warehouses','categories'
  ] LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema='public' AND table_name=t) THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO anon, authenticated;', t);
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', t||'_select_all', t);
      EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT USING (true);', t||'_select_all', t);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', t||'_write_all', t);
      EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL USING (true) WITH CHECK (true);', t||'_write_all', t);
    END IF;
  END LOOP;
END $$;
`;

const INDEX_SQLS = [
  `CREATE INDEX IF NOT EXISTS idx_orders_market_created ON public.orders (market, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders (status)`,
  `CREATE INDEX IF NOT EXISTS idx_orders_handler ON public.orders (handler_name)`,
  `CREATE INDEX IF NOT EXISTS idx_orders_orderdate_status ON public.orders (order_date, status)`,
  `CREATE INDEX IF NOT EXISTS idx_orders_sync_failed ON public.orders (sync_status) WHERE sync_status = 'failed'`,
];

// ── Runner ────────────────────────────────────────────────────
async function tryConnect() {
  for (const cfg of CONFIGS) {
    const client = new Client({ ...cfg, connectionTimeoutMillis: 10000 });
    try {
      await client.connect();
      const r = await client.query('SELECT current_user');
      console.log(`Connected as: ${r.rows[0].current_user} (${cfg.host}:${cfg.port})`);
      return client;
    } catch (e) {
      console.log(`  ${cfg.host}:${cfg.port} - ${e.message}`);
      try { await client.end(); } catch {}
    }
  }
  return null;
}

async function main() {
  console.log('\n=== LOWES Pending Fixes ===\n');

  const client = await tryConnect();
  if (!client) {
    console.error('\nCould not connect. Check your internet or Supabase status.');
    process.exit(1);
  }

  // 1) RLS CRM fix
  console.log('\n[1/2] Unlocking CRM tables for PIN users...');
  try {
    await client.query(RLS_SQL);
    console.log('  >> CRM tables unlocked!');
  } catch (e) {
    console.error('  >> Failed:', e.message);
  }

  // Verify
  try {
    const v = await client.query(`
      SELECT (SELECT count(*) FROM pipelines) AS pipelines,
             (SELECT count(*) FROM pipeline_stages) AS stages,
             (SELECT count(*) FROM leads) AS leads
    `);
    console.log('  >> Verify:', JSON.stringify(v.rows[0]));
  } catch (e) {
    console.log('  >> Verify skipped:', e.message);
  }

  // 2) Orders indexes
  console.log('\n[2/2] Creating orders performance indexes...');
  for (const sql of INDEX_SQLS) {
    const name = sql.match(/idx_orders_\w+/)?.[0] || '?';
    try {
      await client.query(sql);
      console.log(`  >> ${name} created`);
    } catch (e) {
      if (e.message.includes('already exists')) {
        console.log(`  >> ${name} (already exists)`);
      } else {
        console.error(`  >> ${name} FAILED: ${e.message}`);
      }
    }
  }

  await client.end();
  console.log('\n=== All done! ===\n');
}

main().catch(e => { console.error(e); process.exit(1); });
