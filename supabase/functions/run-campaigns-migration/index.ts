// =============================================================
// run-campaigns-migration — DISABLED (inert stub).
// Additive campaigns DDL applied. The ad_daily_logs FK repoint to `campaigns`
// is pending: run it via Supabase SQL Editor (see
// src/modules/campaigns/supabase/repoint_logs_fk.sql) or grant a permission rule.
// =============================================================
Deno.serve(() =>
  new Response(JSON.stringify({ ok: false, error: 'gone', message: 'endpoint disabled' }), {
    status: 410,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  })
);
