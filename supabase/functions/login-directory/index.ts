// =============================================================
// Supabase Edge Function -- login-directory (login screen name list, no session needed). Logic in handler.ts.
// Deploy: supabase functions deploy login-directory --no-verify-jwt --project-ref fghdumrgimoeqsafdhhh
// =============================================================
import { createClient } from 'npm:@supabase/supabase-js@2';
import { handleLoginDirectory } from './handler.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const json = (body: unknown, status: number, extra: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json', ...extra } });
  if (req.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405, { Allow: 'POST, OPTIONS' });

  try {
    const body = await req.json().catch(() => ({}));
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      (Deno.env.get('SB_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { status, body: out } = await handleLoginDirectory(
      { admin, log: (m: string) => console.error('[login-directory]', m) },
      body,
    );
    return json(out, status, { 'Cache-Control': 'no-store' });
  } catch (err) {
    console.error('[login-directory] request failed', err instanceof Error ? err.name : 'unknown_error');
    return json({ ok: false, error: 'server_error' }, 500);
  }
});
