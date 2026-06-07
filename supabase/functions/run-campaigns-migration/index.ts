// =============================================================
// run-campaigns-migration  (ONE-TIME, v2)
// Repoints ad_daily_logs.campaign_id FK to the canonical `campaigns` table
// (the screen now uses `campaigns`, not `ad_campaigns`). Idempotent.
// Gated by a one-time token. Disabled after use.
// =============================================================
import postgres from 'https://deno.land/x/postgresjs@v3.4.4/mod.js';

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-admin-key',
};

const STATEMENTS = [
  `ALTER TABLE ad_daily_logs DROP CONSTRAINT IF EXISTS ad_daily_logs_campaign_id_fkey`,
  `ALTER TABLE ad_daily_logs ADD CONSTRAINT ad_daily_logs_campaign_id_fkey
     FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE`,
];

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const ADMIN_TOKEN = 'lp-campaigns-mig-7Yx29QzPq';
  if ((req.headers.get('x-admin-key') || '') !== ADMIN_TOKEN) return json({ ok: false, error: 'forbidden' }, 403);
  const dbUrl = Deno.env.get('SUPABASE_DB_URL');
  if (!dbUrl) return json({ ok: false, error: 'no SUPABASE_DB_URL' }, 500);
  const sql = postgres(dbUrl, { prepare: false });
  try {
    for (const s of STATEMENTS) await sql.unsafe(s);
    const fk = await sql`SELECT confrelid::regclass::text AS ref FROM pg_constraint WHERE conname='ad_daily_logs_campaign_id_fkey'`;
    await sql.end();
    return json({ ok: true, fk_now_references: fk[0]?.ref }, 200);
  } catch (e) {
    try { await sql.end(); } catch { /* ignore */ }
    return json({ ok: false, error: String(e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
