// =============================================================
// run-campaigns-migration — DISABLED (one-time migration already applied).
// The campaigns tracking DDL was run successfully on 2026-06-07.
// This stub replaces the live endpoint so it can no longer execute any SQL.
// Safe to delete from the Supabase dashboard.
// =============================================================
Deno.serve(() =>
  new Response(JSON.stringify({ ok: false, error: 'gone', message: 'migration already applied; endpoint disabled' }), {
    status: 410,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  })
);
