// =============================================================
// run-campaigns-migration — DISABLED.
// The additive campaigns DDL was applied. The FK repoint
// (ad_daily_logs.campaign_id -> campaigns) is pending owner authorization.
// This stub keeps the live endpoint inert (no SQL execution).
// =============================================================
Deno.serve(() =>
  new Response(JSON.stringify({ ok: false, error: 'gone', message: 'endpoint disabled' }), {
    status: 410,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  })
);
