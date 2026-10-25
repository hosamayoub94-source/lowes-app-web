// =============================================================
// Supabase Edge Function — admin-reset-pin (RETIRED)
//
// D-090 · step 2 (27 Sep 2026): PIN changes moved to the pin-change Edge
// Function — the single path that verifies the caller server-side and keeps
// profiles.pin and the Supabase Auth password in sync (all-or-nothing).
// This function had no caller in the app (verified at the R-21 fix and again
// for step 2); it now refuses every request and writes nothing.
//
// History: R-21 (14 Sep 2026) closed a live unauthenticated PIN-reset hole
// here. The earlier implementation lives in git history.
//
// Deploy: verify_jwt = true (نفس الإعداد المنشور قبل هذه النسخة):
//   supabase functions deploy admin-reset-pin --project-ref fghdumrgimoeqsafdhhh
// =============================================================
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve((req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  return new Response(
    JSON.stringify({ ok: false, error: 'moved', message: 'PIN changes use the pin-change function' }),
    { status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});
