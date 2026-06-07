// =============================================================
// Supabase Edge Function — run-campaigns-migration  (ONE-TIME)
// Runs the campaigns tracking DDL (idempotent) using the platform-provided
// SUPABASE_DB_URL. Gated by the service-role key so only an admin caller can
// trigger it. Hardcoded SQL — does NOT accept arbitrary statements.
//
// Deploy: supabase functions deploy run-campaigns-migration --no-verify-jwt
// Call:   POST { } with header x-admin-key: <service_role_key>
// Safe to delete after a successful run.
// =============================================================
import postgres from 'https://deno.land/x/postgresjs@v3.4.4/mod.js';

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-admin-key',
};

// Each statement run separately (postgres.js unsafe = raw, no params).
const STATEMENTS = [
  `ALTER TABLE ad_campaigns
     ADD COLUMN IF NOT EXISTS cost_usd    numeric(12,2) DEFAULT 0,
     ADD COLUMN IF NOT EXISTS assigned_to text[]        DEFAULT '{}',
     ADD COLUMN IF NOT EXISTS start_date  date,
     ADD COLUMN IF NOT EXISTS end_date    date`,
  `CREATE TABLE IF NOT EXISTS ad_daily_logs (
     id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
     campaign_id   uuid REFERENCES ad_campaigns(id) ON DELETE CASCADE,
     ad_id         uuid REFERENCES campaign_ads(id) ON DELETE CASCADE,
     employee_name text NOT NULL,
     log_date      date NOT NULL DEFAULT current_date,
     shift         text,
     messages      integer DEFAULT 0,
     purchases     integer DEFAULT 0,
     note          text,
     created_at    timestamptz DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS idx_adl_campaign ON ad_daily_logs(campaign_id)`,
  `CREATE INDEX IF NOT EXISTS idx_adl_ad       ON ad_daily_logs(ad_id)`,
  `CREATE INDEX IF NOT EXISTS idx_adl_date     ON ad_daily_logs(log_date DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_adl_emp      ON ad_daily_logs(employee_name)`,
  `ALTER TABLE ad_daily_logs ENABLE ROW LEVEL SECURITY`,
  `DROP POLICY IF EXISTS "ad_daily_logs_all" ON ad_daily_logs`,
  `CREATE POLICY "ad_daily_logs_all" ON ad_daily_logs FOR ALL USING (true) WITH CHECK (true)`,
  `GRANT ALL ON ad_daily_logs TO anon, authenticated`,
];

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const key = req.headers.get('x-admin-key') || '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!serviceKey || key !== serviceKey) {
    return json({ ok: false, error: 'forbidden' }, 403);
  }

  const dbUrl = Deno.env.get('SUPABASE_DB_URL');
  if (!dbUrl) return json({ ok: false, error: 'SUPABASE_DB_URL not available' }, 500);

  const sql = postgres(dbUrl, { prepare: false });
  const done: string[] = [];
  try {
    for (const stmt of STATEMENTS) {
      await sql.unsafe(stmt);
      done.push(stmt.slice(0, 48).replace(/\s+/g, ' ') + '…');
    }
    // Verify
    const cols = await sql`SELECT column_name FROM information_schema.columns WHERE table_name='ad_campaigns' AND column_name IN ('cost_usd','assigned_to')`;
    const tbl  = await sql`SELECT to_regclass('public.ad_daily_logs') AS t`;
    await sql.end();
    return json({ ok: true, ran: done.length, ad_campaigns_cols: cols.map((c: any) => c.column_name), ad_daily_logs: tbl[0]?.t }, 200);
  } catch (e) {
    try { await sql.end(); } catch { /* ignore */ }
    return json({ ok: false, error: String(e), ranSoFar: done }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
