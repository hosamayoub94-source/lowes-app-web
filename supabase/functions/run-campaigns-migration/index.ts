// =============================================================
// run-campaigns-migration — DISABLED (inert stub).
// The ad_daily_logs FK repoint to `campaigns` must be applied by the owner:
// run src/modules/campaigns/supabase/repoint_logs_fk.sql in Supabase SQL Editor.
// =============================================================
Deno.serve(() =>
  new Response(JSON.stringify({ ok: false, error: 'gone', message: 'endpoint disabled' }), {
    status: 410,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  })
);
